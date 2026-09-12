using Microsoft.EntityFrameworkCore;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Location> Locations => Set<Location>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<TblPoint> Points => Set<TblPoint>();
    public DbSet<TblLine> Lines => Set<TblLine>();
    public DbSet<TblPolygon> Polygons => Set<TblPolygon>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();
    public DbSet<Map> Maps => Set<Map>();
    public DbSet<MapShare> MapShares => Set<MapShare>();
    public DbSet<GeoRestriction> GeoRestrictions => Set<GeoRestriction>();
    public DbSet<PoiCategory> PoiCategories => Set<PoiCategory>();
    public DbSet<Poi> Pois => Set<Poi>();
    public DbSet<PoiWorkingHour> PoiWorkingHours => Set<PoiWorkingHour>();
    public DbSet<PoiScheduleException> PoiScheduleExceptions => Set<PoiScheduleException>();
    public DbSet<TransitRoute> TransitRoutes => Set<TransitRoute>();
    public DbSet<TransitStop> TransitStops => Set<TransitStop>();

    // Sabit izin tanımı id'leri — sadece bu dosyadaki HasData seed'i için, kod tarafındaki
    // kontroller PermissionCodes (string) üzerinden çalışıyor, bu id'lere bağımlı değil.
    private const int PermManageAdminId = 1;
    private const int PermDrawPointId = 2;
    private const int PermDrawLineId = 3;
    private const int PermDrawPolygonId = 4;
    private const int PermUseAnalysisToolId = 5;
    private const int PermManageCategoriesId = 6;
    private const int PermDeleteCategoriesId = 7;
    private const int PermManageMultipleMapsId = 8;
    private const int PermManageGeoRestrictionsId = 9;
    private const int PermShareMapId = 10;
    private const int PermManagePoiId = 11;
    private const int PermManagePoiCategoriesId = 12;
    private const int PermViewPoiId = 13;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Geometry kolonları için PostGIS eklentisinin veritabanında açık olduğundan emin ol
        // (migration bunu otomatik "CREATE EXTENSION IF NOT EXISTS postgis" olarak ekleyecek)
        modelBuilder.HasPostgresExtension("postgis");

        // Gün 6 notu: tablo/kolon isimlerinin tamamı artık Program.cs'teki
        // UseSnakeCaseNamingConvention() ile OTOMATİK küçük harfe (snake_case) çevriliyor
        // (Id -> id, Username -> username, RoleId -> role_id, TblPoint -> tbl_point vb.).
        // Aşağıda SADECE bu otomatik dönüşümle EŞLEŞMEYEN, bilinçli olarak farklı isim
        // istenen kolonlar için elle HasColumnName kaldı — geri kalan onlarca eski manuel
        // eşleme (is_deleted, username, role_id...) kaldırıldı çünkü artık gereksiz
        // (convention zaten aynı ismi üretiyor), tutmak sadece "hangisi bilinçli override,
        // hangisi otomatik" ayrımını bulanıklaştırırdı.

        modelBuilder.Entity<User>(entity =>
        {
            entity.Property(u => u.RoleId).HasDefaultValue(Role.DefaultUserRoleId);

            // Aynı kullanıcı adıyla iki kayıt olmasın diye veritabanı seviyesinde de garanti
            entity.HasIndex(u => u.Username).IsUnique();

            // Bir rol silinmeye çalışılırken (kullanıcısı varsa RoleService zaten engelliyor,
            // ama DB seviyesinde de bir güvenlik ağı olsun diye) kullanıcıları etkilemesin.
            entity.HasOne(u => u.Role)
                  .WithMany()
                  .HasForeignKey(u => u.RoleId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasIndex(r => r.Name).IsUnique();

            // Sistemin ilk kurulumunda otomatik oluşan roller — "Kullanıcı" (id=1, herkesin
            // varsayılanı), "Admin" (id=2, ilk kayıt olan kullanıcı buna düşer) ve "Operatör"
            // (id=3 — hoca ödevi: "Sisteme 3 temel rol tanımlayın: Admin, Operatör,
            // Kullanıcı"). Üçü de IsBuiltIn=true olduğu için silinemiyor ama adı/rengi/
            // izinleri admin panelinden tamamen değiştirilebiliyor. İzinleri artık burada
            // değil, aşağıdaki RolePermission seed'inde (bkz. bu metodun sonu).
            entity.HasData(
                new Role
                {
                    Id = Role.DefaultUserRoleId,
                    Name = "Kullanıcı",
                    Color = "#6b7280",
                    IsBuiltIn = true,
                    CreatedDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                },
                new Role
                {
                    Id = Role.DefaultAdminRoleId,
                    Name = "Admin",
                    Color = "#9333ea",
                    IsBuiltIn = true,
                    CreatedDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                },
                new Role
                {
                    Id = Role.DefaultOperatorRoleId,
                    Name = "Operatör",
                    Color = "#0ea5e9",
                    IsBuiltIn = true,
                    CreatedDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                }
            );
        });

        // Hocanın birebir istediği tablo isimleri: tbl_point, tbl_line, tbl_polygon.
        // (Naming convention'dan bağımsız — DbSet property adı "Points/Lines/Polygons"
        // olduğu için convention "points" üretirdi, bu ToTable çağrıları onu eziyor.)
        modelBuilder.Entity<TblPoint>().ToTable("tbl_point");
        modelBuilder.Entity<TblLine>().ToTable("tbl_line");
        modelBuilder.Entity<TblPolygon>().ToTable("tbl_polygon");

        // Gün 5 ödevi: izleme kolonları. CreatedDate property'si bilinçli olarak
        // "inserted_date" kolonuna eşleniyor (diğer Inserted* alanlarıyla tutarlı isim) —
        // bu, naming convention'ın CreatedDate'ten otomatik üreteceği "created_date"ten
        // FARKLI olduğu için tek tek elle override edilmesi gereken tek kolon bu.
        foreach (var entityType in new[] { typeof(TblPoint), typeof(TblLine), typeof(TblPolygon) })
        {
            modelBuilder.Entity(entityType).Property("CreatedDate").HasColumnName("inserted_date");
        }

        // Kategori silinirse üzerindeki nokta/çizgi/alanlar silinmesin, sadece
        // "kategorisiz" kalsın (CategoryId null'a düşsün).
        modelBuilder.Entity<TblPoint>()
            .HasOne<Category>()
            .WithMany()
            .HasForeignKey(p => p.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<TblLine>()
            .HasOne<Category>()
            .WithMany()
            .HasForeignKey(l => l.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<TblPolygon>()
            .HasOne<Category>()
            .WithMany()
            .HasForeignKey(pg => pg.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        // InsertedUserId → User FK, ama kullanıcı silinirse çizimleri kalıcı silinmesin
        // (SetNull) — "kaydı kim ekledi" bilgisi kaybolur ama nokta/çizgi/alan kalır.
        modelBuilder.Entity<TblPoint>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(p => p.InsertedUserId)
            .OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<TblLine>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(l => l.InsertedUserId)
            .OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<TblPolygon>()
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(pg => pg.InsertedUserId)
            .OnDelete(DeleteBehavior.SetNull);

        // ---- Gün 6: dinamik yetkilendirme (Permission / RolePermission / UserPermission) ----

        // Yetki TANIMLARI — sabit bir seed. Code alanı programatik kontroller için stabil
        // kalmalı (bkz. PermissionCodes.cs), Name/Description admin panelinden okunan
        // açıklayıcı metin. Hangi rollerin/kullanıcıların bu izinlere sahip olduğu BURADA
        // değil, RolePermission/UserPermission tablolarında tutuluyor (bkz. bölüm 6'daki
        // handoff notu: mevcut rollerin CanXxx değerlerini role_permissions'a taşıyan veri
        // göçü, migration dosyasına elle eklenen bir SQL adımıyla yapılacak).
        modelBuilder.Entity<Permission>().HasData(
            new Permission { Id = PermManageAdminId, Code = PermissionCodes.ManageAdmin, Name = "Yönetim Paneli", Description = "Admin panelini görüntüleme ve yönetme. Bu izne sahip roller/kullanıcılar diğer tüm izin kontrollerini otomatik geçer." },
            new Permission { Id = PermDrawPointId, Code = PermissionCodes.DrawPoint, Name = "Nokta Ekleme", Description = "Haritada nokta çizip kaydedebilme." },
            new Permission { Id = PermDrawLineId, Code = PermissionCodes.DrawLine, Name = "Çizgi Ekleme", Description = "Haritada çizgi çizip kaydedebilme." },
            new Permission { Id = PermDrawPolygonId, Code = PermissionCodes.DrawPolygon, Name = "Alan Ekleme", Description = "Haritada poligon (alan) çizip kaydedebilme." },
            new Permission { Id = PermUseAnalysisToolId, Code = PermissionCodes.UseAnalysisTool, Name = "Envanter Analizi", Description = "Envanter kesişim analiz aracını kullanabilme." },
            new Permission { Id = PermManageCategoriesId, Code = PermissionCodes.ManageCategories, Name = "Kategori Yönetimi", Description = "Kategori oluşturma ve düzenleme (isim/renk)." },
            new Permission { Id = PermDeleteCategoriesId, Code = PermissionCodes.DeleteCategories, Name = "Kategori Silme", Description = "Var olan bir kategoriyi silebilme." },
            // Görev #78: "ve paylaşabilme" ifadesi ÇIKARILDI — paylaşma artık ayrı bir izin
            // (PermissionCodes.ShareMap), bu ikisi birbirinden bağımsız açılıp kapatılabiliyor.
            new Permission { Id = PermManageMultipleMapsId, Code = PermissionCodes.ManageMultipleMaps, Name = "Çoklu Harita Yönetimi", Description = "Birden fazla harita oluşturabilme, çoğaltabilme ve isimlendirebilme." },
            new Permission { Id = PermManageGeoRestrictionsId, Code = PermissionCodes.ManageGeoRestrictions, Name = "Coğrafi Yetki Tanımlama", Description = "Bir rol veya kullanıcı için haritada coğrafi sınır (poligon) tanımlayabilme." },
            new Permission { Id = PermShareMapId, Code = PermissionCodes.ShareMap, Name = "Harita Paylaşma", Description = "Kendi haritalarını başka kullanıcılarla veya rollerle paylaşabilme (davet gönderme/role paylaşma). Var olan bir paylaşımı yönetme (duraklatma/kaldırma/ayar) bu izne bağlı DEĞİL, ManageMultipleMaps'e bağlı kalıyor." },
            new Permission { Id = PermManagePoiId, Code = PermissionCodes.ManagePoi, Name = "POI Ekleme ve Düzenleme", Description = "Haritada POI oluşturma ve kendi POI'lerini düzenleme." },
            new Permission { Id = PermManagePoiCategoriesId, Code = PermissionCodes.ManagePoiCategories, Name = "POI Kategori Yönetimi", Description = "POI kategorilerini (hiyerarşik) oluşturma/düzenleme/silme." },
            new Permission { Id = PermViewPoiId, Code = PermissionCodes.ViewPoi, Name = "POI Görüntüleme", Description = "Erişilebilen haritalardaki POI katmanını görüntüleme." }
        );

        modelBuilder.Entity<RolePermission>(entity =>
        {
            // Aynı role aynı izin iki kere eklenmesin.
            entity.HasIndex(rp => new { rp.RoleId, rp.PermissionId }).IsUnique();
            entity.HasOne<Role>().WithMany().HasForeignKey(rp => rp.RoleId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Permission>().WithMany().HasForeignKey(rp => rp.PermissionId).OnDelete(DeleteBehavior.Cascade);

            // ÖNEMLİ: seed rollerin (Kullanıcı/Admin) izinlerini eskiden Role üzerindeki
            // CanXxx boolean'larının VARSAYILAN değerleriyle (bkz. eski Role.cs) burada da
            // sabit veri olarak tanımlıyoruz. Bunun tek nedeni "kilitlenmeyi" önlemek: bu
            // migration uygulandığında role_permissions tablosu boş başlar, eğer Admin
            // rolüne ManageAdmin izni migration'ın KENDİSİ vermezse, admin paneline giriş
            // yapıp izinleri panelden yeniden işaretleyecek KİMSE kalmaz. Eğer Barış bu
            // rollerin izinlerini panelden daha önce varsayılandan farklı bir şekilde
            // özelleştirdiyse, bu migration'dan sonra o özelleştirme sıfırlanıp varsayılana
            // döner — admin panelinden (Roller sekmesi) tek tek yeniden işaretlemesi yeterli.
            entity.HasData(
                new RolePermission { Id = 1, RoleId = Role.DefaultUserRoleId, PermissionId = PermDrawPointId },
                new RolePermission { Id = 2, RoleId = Role.DefaultUserRoleId, PermissionId = PermDrawLineId },
                new RolePermission { Id = 3, RoleId = Role.DefaultUserRoleId, PermissionId = PermDrawPolygonId },
                new RolePermission { Id = 4, RoleId = Role.DefaultUserRoleId, PermissionId = PermUseAnalysisToolId },
                new RolePermission { Id = 5, RoleId = Role.DefaultAdminRoleId, PermissionId = PermManageAdminId },
                new RolePermission { Id = 6, RoleId = Role.DefaultAdminRoleId, PermissionId = PermDrawPointId },
                new RolePermission { Id = 7, RoleId = Role.DefaultAdminRoleId, PermissionId = PermDrawLineId },
                new RolePermission { Id = 8, RoleId = Role.DefaultAdminRoleId, PermissionId = PermDrawPolygonId },
                new RolePermission { Id = 9, RoleId = Role.DefaultAdminRoleId, PermissionId = PermUseAnalysisToolId },
                new RolePermission { Id = 10, RoleId = Role.DefaultAdminRoleId, PermissionId = PermManageCategoriesId },
                new RolePermission { Id = 11, RoleId = Role.DefaultAdminRoleId, PermissionId = PermDeleteCategoriesId },
                // Yeni izin admin'e varsayılan verilmezse, panelden bunu kendine yeniden
                // atayacak KİMSE kalmaz (aynı "kilitlenmeyi önle" mantığı, yukarıdaki yoruma bkz.).
                new RolePermission { Id = 12, RoleId = Role.DefaultAdminRoleId, PermissionId = PermManageMultipleMapsId },
                new RolePermission { Id = 13, RoleId = Role.DefaultAdminRoleId, PermissionId = PermManageGeoRestrictionsId },
                // Görev #78: eskiden ManageMultipleMaps paylaşmayı da kapsıyordu, o yüzden
                // Admin'in paylaşma yeteneği kaybolmasın diye ShareMap'i de aynı şekilde
                // varsayılan olarak Admin'e veriyoruz (aynı "kilitlenmeyi önle" mantığı).
                new RolePermission { Id = 14, RoleId = Role.DefaultAdminRoleId, PermissionId = PermShareMapId },
                // Hoca ödevi (POI/Rol/Operatör): Operatör rolü varsayılan olarak POI
                // ekleyebilsin. Admin'e de aynı "kilitlenmeyi önle" mantığıyla hem POI
                // ekleme hem kategori yönetimi izni açıkça veriliyor (ManageAdmin bypass'ı
                // zaten bunu kapsıyor ama panelden görünür/tutarlı olması için).
                new RolePermission { Id = 15, RoleId = Role.DefaultOperatorRoleId, PermissionId = PermManagePoiId },
                new RolePermission { Id = 16, RoleId = Role.DefaultAdminRoleId, PermissionId = PermManagePoiId },
                new RolePermission { Id = 17, RoleId = Role.DefaultAdminRoleId, PermissionId = PermManagePoiCategoriesId },
                // POI görüntüleme Faz 2 öncesinde tüm yerleşik rollerde açıktı; geçiş bu
                // davranışı sessizce sıkılaştırmasın diye üç role de açıkça seed edilir.
                // Negatif kimlikler migration öncesinde kullanıcı tarafından eklenmiş pozitif
                // role_permissions kayıtlarıyla primary-key çakışmasını önler.
                new RolePermission { Id = -1, RoleId = Role.DefaultUserRoleId, PermissionId = PermViewPoiId },
                new RolePermission { Id = -2, RoleId = Role.DefaultAdminRoleId, PermissionId = PermViewPoiId },
                new RolePermission { Id = -3, RoleId = Role.DefaultOperatorRoleId, PermissionId = PermViewPoiId }
            );
        });

        modelBuilder.Entity<UserPermission>(entity =>
        {
            entity.HasIndex(up => new { up.UserId, up.PermissionId }).IsUnique();
            entity.HasOne<User>().WithMany().HasForeignKey(up => up.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<Permission>().WithMany().HasForeignKey(up => up.PermissionId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- Faz 1a: "Birden fazla harita" (kullanıcının kendi fikri) ----

        modelBuilder.Entity<Map>(entity =>
        {
            entity.HasIndex(m => m.OwnerUserId);
            // Kullanıcı (gerçekten) hard-silinirse haritaları da gitsin — geometriler
            // Map FK'sinde SetNull olduğu için (aşağıda) bu durumda yetim kalıp korunuyor,
            // sadece hangi haritaya ait oldukları bilgisi kayboluyor. Pratikte kullanıcılar
            // hep soft-delete (IsDeleted) olduğu için bu yol neredeyse hiç işlemeyecek.
            entity.HasOne(m => m.OwnerUser).WithMany().HasForeignKey(m => m.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
        });

        // Geometrilerin MapId FK'si — InsertedUserId ile AYNI mantık (SetNull): bir harita
        // silinirse üzerindeki çizimler kalıcı silinmesin, sadece "haritasız" (MapId=null)
        // kalsın. Map silme özelliği henüz yazılmadı (Faz 1a'nın kapsamı sadece
        // oluşturma/çoğaltma/isim değiştirme), ama FK'nin geleceğe hazır olması gerekiyor.
        modelBuilder.Entity<TblPoint>()
            .HasOne<Map>()
            .WithMany()
            .HasForeignKey(p => p.MapId)
            .OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<TblLine>()
            .HasOne<Map>()
            .WithMany()
            .HasForeignKey(l => l.MapId)
            .OnDelete(DeleteBehavior.SetNull);
        modelBuilder.Entity<TblPolygon>()
            .HasOne<Map>()
            .WithMany()
            .HasForeignKey(pg => pg.MapId)
            .OnDelete(DeleteBehavior.SetNull);

        // ---- Faz 2: harita paylaşımı (kullanıcının kendi fikri) ----

        modelBuilder.Entity<MapShare>(entity =>
        {
            // Faz 3.2: InvitedUserId artık nullable (rol satırlarında boş) — bu yüzden eski
            // TEK unique index yerine iki FİLTRELİ unique index: aynı haritada aynı kişi
            // (InvitedUserId doluyken) ya da aynı rol (RoleId doluyken) yalnızca bir kez
            // görünebilir. Yeniden davet/paylaşımda satır güncellenir (bkz.
            // MapShareService.InviteAsync/ShareWithRoleAsync), yeni satır açılmaz.
            entity.HasIndex(s => new { s.MapId, s.InvitedUserId }).IsUnique().HasFilter("invited_user_id IS NOT NULL");
            entity.HasIndex(s => new { s.MapId, s.RoleId }).IsUnique().HasFilter("role_id IS NOT NULL");

            // GeoRestriction'daki ile birebir aynı desen: tam olarak biri (kişi YA DA rol) dolu olmalı.
            entity.ToTable(t => t.HasCheckConstraint(
                "ck_map_shares_one_target",
                "(invited_user_id IS NOT NULL AND role_id IS NULL) OR (invited_user_id IS NULL AND role_id IS NOT NULL)"));

            // Harita silinirse (ileride bir silme özelliği eklenirse) üzerindeki davetler de gitsin —
            // geometrilerdeki gibi "yetim" bırakmanın (SetNull) burada bir anlamı yok, MapId olmadan
            // bir MapShare satırının hiçbir işlevi kalmaz.
            entity.HasOne(s => s.Map).WithMany().HasForeignKey(s => s.MapId).OnDelete(DeleteBehavior.Cascade);

            // Davet edilen kullanıcı (gerçekten) hard-silinirse ona ait davetler de gitsin.
            entity.HasOne(s => s.InvitedUser).WithMany().HasForeignKey(s => s.InvitedUserId).OnDelete(DeleteBehavior.Cascade);

            // Rol silinirse üzerindeki rol-paylaşımları da gitsin.
            entity.HasOne(s => s.Role).WithMany().HasForeignKey(s => s.RoleId).OnDelete(DeleteBehavior.Cascade);

            // Faz 3.1: bu üçü C# tarafında "= true" ile başlıyor ama EF Core migration'ı
            // yeni kolon eklerken var olan satırlar için CLR'nin varsayılanını (bool için
            // false) kullanır, property initializer'ı DEĞİL — burada HasDefaultValue(true)
            // AÇIKÇA belirtilmezse migration mevcut TÜM paylaşımları aniden "duraklatılmış/
            // çizemez/silemez" yapar. CanEditOthers'ın varsayılanı zaten false olduğu için
            // (CLR default'uyla aynı) onun için ayrıca bir şey gerekmiyor.
            entity.Property(s => s.CanView).HasDefaultValue(true);
            entity.Property(s => s.CanDraw).HasDefaultValue(true);
            entity.Property(s => s.CanDelete).HasDefaultValue(true);
        });

        // ---- Hocanın görevi: Coğrafi Yetki Tanımlama Modülü ----

        modelBuilder.Entity<GeoRestriction>(entity =>
        {
            // v2: artık bir role/kullanıcıya BİRDEN FAZLA alan tanımlanabiliyor (kullanıcının
            // isteği) — bu yüzden eskiden buradaki UNIQUE index'ler kaldırıldı, sadece sorgu
            // performansı için normal (unique olmayan) index bırakıldı.
            entity.HasIndex(g => g.RoleId);
            entity.HasIndex(g => g.UserId);
            // Görev #7: harita-özel kısıtları hızlı sorgulamak için (GetEffectiveAreasAsync
            // artık her çizim isteğinde mapId'ye göre filtreliyor).
            entity.HasIndex(g => g.MapId);

            // Tam olarak biri dolu olmalı — servis katmanı zaten bunu public API'nin şekliyle
            // garanti ediyor (AddForRoleAsync/AddForUserAsync ayrı metodlar), ama DB seviyesinde
            // de bir güvenlik ağı olsun. MapId bu kuralın DIŞINDA — RoleId/UserId'den bağımsız
            // olarak null ya da dolu olabilir (bkz. GeoRestriction.cs yorumu).
            entity.ToTable(t => t.HasCheckConstraint(
                "ck_geo_restrictions_one_target",
                "(role_id IS NOT NULL AND user_id IS NULL) OR (role_id IS NULL AND user_id IS NOT NULL)"));

            entity.HasOne<Role>().WithMany().HasForeignKey(g => g.RoleId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<User>().WithMany().HasForeignKey(g => g.UserId).OnDelete(DeleteBehavior.Cascade);
            // Harita kalıcı silinirse (PermanentDeleteAsync) ona özel kısıtlar da anlamsızlaşır,
            // birlikte temizlensin (Cascade) — soft-delete'te (normal Delete) bu FK tetiklenmiyor
            // zaten (satır DB'de duruyor), bu yüzden çöp kutusundaki bir haritanın kısıtları
            // geri getirilince aynen duruyor olacak, kalıcı silinince gidiyor.
            entity.HasOne<Map>().WithMany().HasForeignKey(g => g.MapId).OnDelete(DeleteBehavior.Cascade);
        });

        // Not: IsDeleted için kasıtlı olarak global query filter EKLEMEDİK — çöp kutusu
        // ekranı silinmiş kayıtları listeleyebilmeli. Servis katmanı (bkz. GeometryService)
        // normal listeleme/kesişim sorgularında IsDeleted olanları zaten manuel filtreliyor.

        // ---- Hocanın görevi: Rol ve Veritabanı Yapılandırması (POI) ----

        // Hoca'nın birebir istediği tablo isimleri: poi, poi_category.
        modelBuilder.Entity<Poi>().ToTable("poi");
        modelBuilder.Entity<PoiCategory>().ToTable("poi_category");
        modelBuilder.Entity<PoiWorkingHour>().ToTable("poi_working_hour");
        modelBuilder.Entity<PoiScheduleException>().ToTable("poi_schedule_exception");

        modelBuilder.Entity<PoiCategory>(entity =>
        {
            entity.HasIndex(c => c.ParentId);
            entity.Property(c => c.Description).HasMaxLength(500);
            entity.Property(c => c.SortOrder).HasDefaultValue(0);
            // 16: karmaşık (ZWJ dizili) emoji birden fazla UTF-16 kod birimi kaplayabilir
            // (ör. aile emojisi), 8 çok dar kalıyordu.
            entity.Property(c => c.Icon).HasMaxLength(16);
            // Bir üst kategori silinirse altındakiler silinmesin, sadece en üst seviyeye
            // (ParentId=null) çıksın — Category/CategoryId'deki "kategorisiz kalsın" ile
            // AYNI felsefe (dependent'ları asla sessizce yok etme).
            entity.HasOne<PoiCategory>().WithMany().HasForeignKey(c => c.ParentId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Poi>(entity =>
        {
            entity.HasIndex(p => p.CategoryId);
            entity.HasIndex(p => p.UserId);
            entity.HasIndex(p => p.MapId);
            entity.Property(p => p.Note).HasMaxLength(2000);
            entity.Property(p => p.Province).HasMaxLength(120);
            entity.Property(p => p.District).HasMaxLength(120);
            entity.Property(p => p.Icon).HasMaxLength(16);
            // Kategori silinirse POI kategorisiz kalsın (Category/CategoryId ile aynı desen).
            entity.HasOne<PoiCategory>().WithMany().HasForeignKey(p => p.CategoryId).OnDelete(DeleteBehavior.SetNull);
            // Kullanıcı silinirse POI kalsın, sadece "kim ekledi" bilgisi kaybolsun
            // (InsertedUserId/tbl_point ile AYNI desen).
            entity.HasOne<User>().WithMany().HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.SetNull);
            // Harita kalıcı silinirse POI kaybolmaz; adminin yeniden atayabilmesi için
            // MapId null'a düşer ve normal harita listelerinden çıkar.
            entity.HasOne(p => p.Map).WithMany().HasForeignKey(p => p.MapId).OnDelete(DeleteBehavior.SetNull);
        });

        // ---- Hoca ödevi: Akıllı Ulaşım Modülü, Durak ve Güzergah Yönetimi ----
        modelBuilder.Entity<TransitRoute>().ToTable("route");
        modelBuilder.Entity<TransitStop>().ToTable("stop");

        modelBuilder.Entity<TransitRoute>(entity =>
        {
            entity.Property(r => r.Name).HasMaxLength(120);
            entity.Property(r => r.Color).HasMaxLength(7);
            entity.Property(r => r.Province).HasMaxLength(100);
            entity.Property(r => r.District).HasMaxLength(100);
            entity.Property(r => r.Neighborhood).HasMaxLength(100);
            entity.HasOne<User>().WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.SetNull);
            // Hoca ödevi (27 Ağustos, OSRM): RouteGeometry sütun tipi diğer geometrilerle
            // (Point/LineString) AYNI "geometry" tipi — SRID'i ayrıca zorlamıyoruz, WKTReader
            // zaten servis katmanında SRID=4326 damgalıyor (bkz. IOsrmService/TransitRouteService).
        });

        modelBuilder.Entity<TransitStop>(entity =>
        {
            entity.HasIndex(s => s.RouteId);
            entity.HasIndex(s => s.UserId);
            entity.Property(s => s.Name).HasMaxLength(150);
            // Hoca ödevi: "Her bir durak bir güzergaha ait olacak şekilde 1-N ilişki kurun" —
            // RouteId NOT NULL, bu yüzden Restrict (bkz. TransitStop.cs yorumu — güzergah
            // 'silinirken' servis katmanı zaten önce durakları soft-delete ediyor, gerçek bir
            // SQL DELETE hiç tetiklenmiyor ki bu kısıt pratikte hiç devreye girmesin).
            entity.HasOne(s => s.Route).WithMany(r => r.Stops).HasForeignKey(s => s.RouteId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<User>().WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<PoiWorkingHour>(entity =>
        {
            entity.HasIndex(h => new { h.PoiId, h.DayOfWeek }).IsUnique();
            entity.Property(h => h.StartTime).HasColumnType("time without time zone");
            entity.Property(h => h.EndTime).HasColumnType("time without time zone");
            entity.Property(h => h.Is24Hours).HasColumnName("is_24_hours");
            entity.HasOne(h => h.Poi)
                .WithMany(p => p.WorkingHourSchedule)
                .HasForeignKey(h => h.PoiId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PoiScheduleException>(entity =>
        {
            entity.HasIndex(e => new { e.PoiId, e.Date, e.RepeatsAnnually }).IsUnique();
            entity.Property(e => e.Date).HasColumnType("date");
            entity.Property(e => e.StartTime).HasColumnType("time without time zone");
            entity.Property(e => e.EndTime).HasColumnType("time without time zone");
            entity.Property(e => e.Note).HasMaxLength(200);
            entity.Property(e => e.Is24Hours).HasColumnName("is_24_hours");
            entity.HasOne(e => e.Poi)
                .WithMany(p => p.ScheduleExceptions)
                .HasForeignKey(e => e.PoiId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}

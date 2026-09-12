namespace BasarsoftStaj.Domain.Entities;

// Yetki kontrol kodları için tek merkezi kaynak. Permission.Code alanı admin panelinden
// teorik olarak değiştirilemez (sadece Name/Description serbest metin) — kod tarafındaki
// [Authorize]-benzeri kontroller string literal yerine bu sabitleri kullanmalı, yoksa bir
// yazım hatası sessizce hiçbir zaman true dönmeyen bir izin kontrolüne yol açar.
public static class PermissionCodes
{
    // Bu koda sahip bir rol/kullanıcı: admin panelini görebilir/yönetebilir VE diğer
    // tüm izin kontrollerini otomatik geçer (PermissionControllerBase.RequirePermissionAsync
    // içindeki bypass mantığı, eski CanManageAdmin davranışının birebir devamı).
    public const string ManageAdmin = "ManageAdmin";

    public const string DrawPoint = "DrawPoint";
    public const string DrawLine = "DrawLine";
    public const string DrawPolygon = "DrawPolygon";
    public const string UseAnalysisTool = "UseAnalysisTool";
    public const string ManageCategories = "ManageCategories";
    public const string DeleteCategories = "DeleteCategories";

    // "Birden fazla harita" özelliği (kullanıcının kendi fikri — Faz 1a). Bu izne sahip
    // olmayan bir kullanıcının hâlâ TEK (varsayılan) haritası vardır, sadece yenisini
    // oluşturamaz/çoğaltamaz/başka birinin haritasını paylaşamaz.
    public const string ManageMultipleMaps = "ManageMultipleMaps";

    // Hocanın görevi: "Coğrafi Yetki Tanımlama Modülü" — bu izne sahip roller/kullanıcılar
    // admin panelinde bir rol/kullanıcı için coğrafi sınır (poligon) tanımlayabilir. Ayrı bir
    // izin kodu (ManageAdmin'e bağlı kalmak yerine) bilinçli tercih — hocanın "yetkisi yoksa
    // butonu hiç gösterme" notu ancak böyle somut/test edilebilir olur.
    public const string ManageGeoRestrictions = "ManageGeoRestrictions";

    // Görev #78 (backlog, "admin: harita paylaşım politikası ayarları — ör. adminlere
    // paylaşımı kısıtlama"): eskiden harita paylaşma (davet gönderme/role paylaşma)
    // ManageMultipleMaps iznine bağlıydı — "çoklu harita yönetme" ile "paylaşma" farklı
    // yetenekler olduğu için AYRI bir izin. Admin artık bir rolün çoklu harita
    // yönetebilmesine dokunmadan sadece paylaşma yeteneğini açıp kapatabiliyor (mevcut
    // dinamik izin sistemi/admin panel UI'ı üzerinden — yeni bir ekran gerekmedi, bkz.
    // AppDbContext.OnModelCreating seed'i ve MapShareController).
    public const string ShareMap = "ShareMap";

    // Hoca ödevi (POI/Rol/Operatör): "Operatör için haritada POI ekleme aracı (Point)
    // oluşturun." — bu izin Operatör rolüne veriliyor, haritada yeni POI ekleyebilmeyi
    // kontrol ediyor. POI'leri GÖRÜNTÜLEME (harita üzerinde, tıklayınca bilgi paneli) bu
    // izinden bağımsız — herkese açık, sadece EKLEME kısıtlı.
    public const string ManagePoi = "ManagePoi";

    // POI katmanını haritada görüntüleyebilme. Geriye dönük uyumluluk için üç yerleşik
    // role de seed edilir; özel roller bu izni admin panelinden açıkça alır.
    public const string ViewPoi = "ViewPoi";

    // Aynı ödev: "Admin Paneli: ... kategori yönetimi (Yeni kategori ekleme/düzenleme) bu
    // panelden yapılabilsin." — mevcut ManageCategories/DeleteCategories'ten AYRI (o, farklı
    // bir kategori tablosunu — Category — yönetiyor), POI'nin kendi hiyerarşik kategori
    // tablosu (PoiCategory) için.
    public const string ManagePoiCategories = "ManagePoiCategories";

    // Hoca ödevi (Akıllı Ulaşım Modülü): "Operatör için haritada 'Durak Ekle' aracı ...
    // Güzergah Yönetimi paneli ... Sürükle-Bırak ile durak sıralaması." — güzergah/durak
    // oluşturma-düzenleme-silme-sıralama tek bu izne bağlı (ManagePoi'den BİLİNÇLİ AYRI:
    // hoca notu "bu roldekiler POI/çizim eklemesin" diyor, yani ayrı bir izin olmalı ki
    // Ulaşım Operatörü rolüne ManagePoi/DrawPoint verilmeden sadece bu verilebilsin).
    public const string ManageRoutes = "ManageRoutes";

    // Güzergah/durak katmanını haritada görüntüleyebilme — ViewPoi ile AYNI fikir (ekleme
    // ayrı, görüntüleme ayrı bir izin).
    public const string ViewRoutes = "ViewRoutes";

    // Hiçbir Permission satırının Code'u bu olamaz — "sadece ManageAdmin geçebilsin, başka
    // hiçbir izin bunu karşılamasın" anlamına gelen endpoint'lerde (Admin/Role/Trash
    // controller'ların "yönetim yetkisi gerekiyor" kontrollerinde) RequirePermissionAsync'e
    // bilinçli olarak bu sabit geçiliyor.
    public const string None = "__none__";
}

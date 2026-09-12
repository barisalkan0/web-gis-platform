using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using Microsoft.Extensions.Configuration;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class GeometryService<TEntity, TGeometry> : IGeometryService<TEntity, TGeometry>
    where TEntity : class, IGeometryFeature<TGeometry>, new()
    where TGeometry : Geometry
{
    private const int Srid = 4326; // WGS84 - frontend EPSG:3857'den 4326'ya çevirip WKT gönderiyor

    private static readonly WKTReader WktReader = new();
    private static readonly WKTWriter WktWriter = new();

    private readonly IRepository<TEntity> _repository;
    private readonly IGeoRestrictionService _geoRestrictionService;
    private readonly IMapShareService _mapShareService;
    private readonly IAuditLogService _auditLogService;
    private readonly IGeoServerFeatureService _geoServerFeatureService;
    private readonly IConfiguration _configuration;
    private readonly IRepository<Map> _mapRepository;
    private readonly IRepository<User> _userRepository;

    // Somut tip adı ("point"/"line"/"polygon") audit log Action koduna gömülmek için —
    // generic sınıf tek bir yerde 3 kez (TEntity=TblPoint/TblLine/TblPolygon) DI'a kayıtlı,
    // hangi somut tip olduğunu çalışma zamanında entity adından çıkarıyoruz.
    private static readonly string EntityLabel = typeof(TEntity).Name switch
    {
        "TblPoint" => "point",
        "TblLine" => "line",
        "TblPolygon" => "polygon",
        _ => typeof(TEntity).Name.ToLowerInvariant(),
    };

    // Hoca ödevi (GeoServer entegrasyonu): GeoServer'da yayınlanacak katman adları —
    // workspace'siz, tablo adlarıyla BİREBİR aynı (bkz. docs/geoserver-kurulum.md, "Layer
    // Ekleme" adımı — katmanı publish ederken ismini DEĞİŞTİRME, bu sabitlerle eşleşmeli).
    private static readonly string GeoServerLayerName = typeof(TEntity).Name switch
    {
        "TblPoint" => "tbl_point",
        "TblLine" => "tbl_line",
        "TblPolygon" => "tbl_polygon",
        _ => typeof(TEntity).Name.ToLowerInvariant(),
    };

    public GeometryService(
        IRepository<TEntity> repository,
        IGeoRestrictionService geoRestrictionService,
        IMapShareService mapShareService,
        IAuditLogService auditLogService,
        IGeoServerFeatureService geoServerFeatureService,
        IConfiguration configuration,
        IRepository<Map> mapRepository,
        IRepository<User> userRepository)
    {
        _repository = repository;
        _geoRestrictionService = geoRestrictionService;
        _mapShareService = mapShareService;
        _auditLogService = auditLogService;
        _geoServerFeatureService = geoServerFeatureService;
        _configuration = configuration;
        _mapRepository = mapRepository;
        _userRepository = userRepository;
    }

    // Kullanıcının kendi isteği: "haritanın en başında sabitli olarak herkesin çizimlerinin
    // bir arada olduğu bir harita olsun" — "Ortak Görünüm". GeoServer yolunu KASITLI OLARAK
    // kullanmıyoruz (repository'den doğrudan okuyoruz): CQL_FILTER mekanizması hep TEK bir
    // mapId'ye göre kuruluydu, "tüm haritalar" için onu yeniden tasarlamak (GeoServerCqlFilter
    // Builder'ı mapId'siz bir moda kavuşturmak) bu turun kapsamı dışında bırakıldı — admin
    // sayısı/veri hacmi bu okulun projesi ölçeğinde repository taramasını rahatça kaldırır.
    public async Task<IEnumerable<GeometryDto>> GetAllForAdminAsync()
    {
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var items = await _repository.GetAllAsync();
        return items
            .Where(i => !i.IsDeleted)
            .Select(i =>
            {
                var dto = ToDto(i);
                dto.MapId = i.MapId;
                dto.OwnerUsername = i.InsertedUserId != null && users.TryGetValue(i.InsertedUserId.Value, out var username) ? username : null;
                return dto;
            });
    }

    // Kullanıcının kendi isteği: "son değiştirme tarihi ve saati yazsın" — bir haritaya
    // çizim eklenince/düzenlenince/silinince o haritanın ModifiedDate'i güncellenir.
    // mapId null gelebilir (ör. eski kayıtlar) — bu durumda sessizce hiçbir şey yapmaz.
    private async Task TouchMapModifiedAsync(int? mapId)
    {
        if (mapId == null) return;
        var map = await _mapRepository.GetByIdAsync(mapId.Value);
        if (map == null) return;
        map.ModifiedDate = DateTime.UtcNow;
        await _mapRepository.SaveChangesAsync();
    }

    // Hoca ödevi (GeoServer entegrasyonu): "Web uygulamasında gösterdiğiniz çizimleri artık
    // doğrudan GeoServer servisleri (WMS/WFS) üzerinden çekin" — bu metot (haritada
    // GÖSTERİLEN nokta/çizgi/alan listesi) artık repository yerine GeoServer'ın WFS
    // GetFeature servisine gidiyor. Eski .Where() zincirindeki AYNI görünürlük kuralı
    // (silinmemiş + aktif harita + özel görünürlük) artık CQL_FILTER olarak GeoServer'a
    // gönderiliyor — bkz. GetAllFromGeoServerAsync. appsettings.json'da GeoServer:Enabled=
    // false yapılırsa (GeoServer o an ayakta değilse, ör. hızlı bir yerel debug için) eski
    // doğrudan-repository davranışına düşer; varsayılan (ayar hiç yoksa da) HER ZAMAN
    // GeoServer kullanılıyor, hocanın istediği tam olarak bu.
    //
    // BİLİNÇLİ KAPSAM DIŞI BIRAKMA: Create/Update/Delete (yazma uçları) hâlâ doğrudan
    // repository/EF Core üzerinden veritabanına yazıyor — GeoServer WFS-T (transactional
    // WFS) ile yazma çok daha büyük ve kırılgan bir iş, ödev metni de "veri getirme"den
    // (okuma) bahsediyor, yazmadan değil. GeoServer'ın PostGIS store'u tabloyu CANLI okuduğu
    // için EF Core ile yazılan yeni bir kayıt bir sonraki WFS isteğinde ANINDA görünür, ekstra
    // senkronizasyon gerekmiyor. GetIntersectingIdsAsync/WktAsync (Envanter Analizi) da
    // repository'de kaldı — bunlar "gösterme" değil sunucu-taraflı geometrik hesaplama.
    public async Task<IEnumerable<GeometryDto>> GetAllAsync(int mapId, int? userId, bool isOwner)
    {
        if (IsGeoServerEnabled())
        {
            return await GetAllFromGeoServerAsync(mapId, userId, isOwner);
        }

        var items = await _repository.GetAllAsync();
        return items
            .Where(i => !i.IsDeleted && i.MapId == mapId)
            // Faz 3: "sadece bana görünsün" — sahip her şeyi görür, sahip değilse sadece
            // kendi özel kayıtlarını + tüm herkese-açık kayıtları görür.
            .Where(i => !i.IsPrivate || isOwner || (userId != null && i.InsertedUserId == userId))
            .Select(ToDto);
    }

    private bool IsGeoServerEnabled()
    {
        var setting = _configuration["GeoServer:Enabled"];
        return string.IsNullOrWhiteSpace(setting) || !string.Equals(setting, "false", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<IEnumerable<GeometryDto>> GetAllFromGeoServerAsync(int mapId, int? userId, bool isOwner)
    {
        // GetAllAsync'in repository koluyla AYNI görünürlük mantığının ECQL karşılığı.
        // NOT: bu filtreyi GeoServer'a göndermek sadece bir OPTİMİZASYON (ağdan daha az veri
        // çeker) — TEK güvenlik katmanı DEĞİL, bkz. aşağıdaki .Where() zinciri.
        // (2. tur GeoServer ödevi: bu filtre string'i artık GeoServerCqlFilterBuilder'da tek
        // yerde — GeoServerConfigController'daki WMS/heatmap yolu da AYNI metodu çağırıyor.)
        var filter = GeoServerCqlFilterBuilder.BuildVisibilityFilter(mapId, userId, isOwner);

        var features = await _geoServerFeatureService.GetFeaturesAsync(GeoServerLayerName, filter);

        // BUG FİX (kullanıcının kendi tespiti: "artı butonuna basıp yeni harita oluşturdum
        // ama varsayılan haritamdaki çizimlerin hepsi duruyordu, sıfır çizim istiyordum"):
        // CQL_FILTER GeoServer tarafında herhangi bir sebeple (katman şeması uyuşmazlığı,
        // sürüm/CQL ayrıştırma farkı, vb.) etkisiz kalırsa yukarıdaki istek TÜM haritaların
        // TÜM kayıtlarını dönebiliyordu — backend bunu hiç süzmeden frontend'e geçiriyordu.
        // Artık repository yolundaki (GetAllAsync'in .Where() zinciri) İLE BİREBİR AYNI
        // kontrolü burada da C# tarafında TEKRAR uyguluyoruz — dış sisteme (GeoServer)
        // güvenmek yerine doğrulamak. GeoServer'ın CQL_FILTER'ı zaten doğru çalışıyorsa bu
        // ikinci filtre no-op'tur (hiçbir şeyi değiştirmez), yanlış çalışıyorsa da tek
        // güvenlik ağıdır.
        var filtered = features
            .Where(f => !f.IsDeleted && f.MapId == mapId)
            .Where(f => !f.IsPrivate || isOwner || (userId != null && f.InsertedUserId == userId));

        return filtered.Select(f => new GeometryDto
        {
            Id = f.Id,
            Wkt = f.Wkt,
            Place = f.Place,
            Province = f.Province,
            Name = f.Name,
            Color = f.Color,
            CategoryId = f.CategoryId,
            CreatedDate = f.CreatedDate,
            ModifiedDate = f.ModifiedDate,
            IsActive = f.IsActive,
            InsertedUserId = f.InsertedUserId,
            IsPrivate = f.IsPrivate,
        });
    }

    public async Task<(int? MapId, int? AuthorId)> GetOwnershipInfoAsync(int id)
    {
        var entity = await _repository.GetByIdAsync(id);
        return entity == null ? (null, null) : (entity.MapId, entity.InsertedUserId);
    }

    // Faz 3: sahip OLMAYAN bir kullanıcı, haritada kendisine tanımlanmış renk kısıtlamasını
    // (MapShare.AllowedColors) aşıyorsa reddeder. Sahipler ve kısıtlaması olmayan/hiç
    // paylaşımı olmayan kullanıcılar (GetShareForUserAsync null döner) serbest.
    private async Task<string?> CheckColorRestrictionAsync(int? mapId, int? userId, string? color)
    {
        if (mapId == null || userId == null || string.IsNullOrWhiteSpace(color)) return null;

        var settings = await _mapShareService.GetShareForUserAsync(mapId.Value, userId.Value);
        if (settings?.AllowedColors == null) return null;

        var allowed = settings.AllowedColors.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (allowed.Length == 0) return null;

        var isAllowed = allowed.Any(c => string.Equals(c, color.Trim(), StringComparison.OrdinalIgnoreCase));
        return isAllowed ? null : $"Bu haritada sadece şu renkleri kullanabilirsin: {string.Join(", ", allowed)}.";
    }

    public async Task<(bool Success, GeometryDto? Result, string? Error)> CreateAsync(CreateGeometryDto dto, int? userId, string? actorUsername = null)
    {
        if (!TryParseWkt(dto.Wkt, out var geometry, out var error))
        {
            return (false, null, error);
        }

        // Hocanın Coğrafi Yetki Tanımlama görevi (v2: birden fazla alan olabilir — kullanıcının
        // isteği): kullanıcının (kendine özel ya da rolünden gelen) alanları varsa, çizim bu
        // alanlardan EN AZ BİRİNİN TAMAMEN içinde kalmalı — Contains, sadece merkez/köşe değil
        // şeklin TÜMÜNÜ kontrol eder (bkz. IGeoRestrictionService). Görev #7: artık dto.MapId
        // de veriliyor — harita sahibinin BU HARİTAYA özel tanımladığı kısıt varsa admin'in
        // global kısıtından ÖNCE o geçerli (bkz. GetEffectiveAreasAsync öncelik sırası).
        var restrictedAreas = await _geoRestrictionService.GetEffectiveAreasAsync(userId, dto.MapId);
        if (restrictedAreas.Count > 0 && !restrictedAreas.Any(a => a.Contains(geometry)))
        {
            return (false, null, "Bu şekil, senin için tanımlanmış coğrafi alanların dışında. Kaydedilemedi.");
        }

        var colorError = await CheckColorRestrictionAsync(dto.MapId, userId, dto.Color);
        if (colorError != null)
        {
            return (false, null, colorError);
        }

        var entity = new TEntity
        {
            Geometry = geometry,
            Name = string.IsNullOrWhiteSpace(dto.Name) ? null : dto.Name.Trim(),
            Color = string.IsNullOrWhiteSpace(dto.Color) ? null : dto.Color.Trim(),
            CategoryId = dto.CategoryId,
            InsertedUserId = userId,
            MapId = dto.MapId,
            IsPrivate = dto.IsPrivate,
        };

        await _repository.AddAsync(entity);
        await _repository.SaveChangesAsync();
        await TouchMapModifiedAsync(dto.MapId);

        if (actorUsername != null)
        {
            await _auditLogService.LogAsync(actorUsername, $"geometry.{EntityLabel}.create",
                $"Yeni bir {EntityLabel} çizimi eklendi{(entity.Name != null ? $" ('{entity.Name}')" : "")}{(entity.IsPrivate ? " [özel]" : "")}.", dto.MapId);
        }

        return (true, ToDto(entity), null);
    }

    public async Task<bool> UpdatePlaceAsync(int id, UpdatePlaceDto dto)
    {
        var entity = await _repository.GetByIdAsync(id);
        if (entity == null || entity.IsDeleted) return false;

        entity.Place = dto.Place;
        entity.Province = dto.Province;
        entity.ModifiedDate = DateTime.UtcNow;
        await _repository.SaveChangesAsync();
        return true;
    }

    public async Task<(bool Success, string? Error)> UpdateAttributesAsync(int id, UpdateAttributesDto dto, int? userId = null, string? actorUsername = null)
    {
        var entity = await _repository.GetByIdAsync(id);
        if (entity == null || entity.IsDeleted) return (false, "Kayıt bulunamadı.");

        var colorError = await CheckColorRestrictionAsync(entity.MapId, userId, dto.Color);
        if (colorError != null)
        {
            return (false, colorError);
        }

        entity.Name = string.IsNullOrWhiteSpace(dto.Name) ? null : dto.Name.Trim();
        entity.Color = string.IsNullOrWhiteSpace(dto.Color) ? null : dto.Color.Trim();
        entity.CategoryId = dto.CategoryId;
        entity.IsPrivate = dto.IsPrivate;
        entity.ModifiedDate = DateTime.UtcNow;
        await _repository.SaveChangesAsync();
        await TouchMapModifiedAsync(entity.MapId);

        if (actorUsername != null)
        {
            await _auditLogService.LogAsync(actorUsername, $"geometry.{EntityLabel}.update_attributes",
                $"Bir {EntityLabel} çiziminin öznitelikleri güncellendi{(entity.Name != null ? $" ('{entity.Name}')" : "")}.", entity.MapId);
        }
        return (true, null);
    }

    // Bilgi kartındaki "Düzenle" → köşe noktaları sürüklenip Kaydet'e basılınca frontend
    // güncel geometriyi WKT'ye çevirip buraya gönderiyor. CreateAsync'teki aynı
    // TryParseWkt'yi kullanıyoruz ki tip kontrolü (nokta WKT'si bir çizgiye yazılamasın
    // gibi) tutarlı olsun.
    public async Task<(bool Success, string? Error)> UpdateGeometryAsync(int id, UpdateGeometryDto dto, int? userId, string? actorUsername = null)
    {
        var entity = await _repository.GetByIdAsync(id);
        if (entity == null || entity.IsDeleted)
        {
            return (false, "Kayıt bulunamadı.");
        }

        if (!TryParseWkt(dto.Wkt, out var geometry, out var error))
        {
            return (false, error);
        }

        // CreateAsync'teki AYNI kontrol — yoksa biri alanın içinde çizip sonra köşe
        // noktalarını sürükleyerek dışarı taşıyıp kısıtı bypass edebilirdi. entity.MapId
        // kullanılıyor (dto'da mapId yok, kayıt zaten hangi haritadaysa o geçerli).
        var restrictedAreas = await _geoRestrictionService.GetEffectiveAreasAsync(userId, entity.MapId);
        if (restrictedAreas.Count > 0 && !restrictedAreas.Any(a => a.Contains(geometry)))
        {
            return (false, "Bu şekil, senin için tanımlanmış coğrafi alanların dışına taşınamaz.");
        }

        entity.Geometry = geometry;
        entity.ModifiedDate = DateTime.UtcNow;
        await _repository.SaveChangesAsync();
        await TouchMapModifiedAsync(entity.MapId);

        if (actorUsername != null)
        {
            await _auditLogService.LogAsync(actorUsername, $"geometry.{EntityLabel}.update_geometry",
                $"Bir {EntityLabel} çiziminin konumu/şekli güncellendi{(entity.Name != null ? $" ('{entity.Name}')" : "")}.", entity.MapId);
        }
        return (true, null);
    }

    // Hocanın "geri dönüştürme/çöp kutusu" fikrine hazır olsun diye kalıcı silmek yerine
    // IsDeleted = true yapıyoruz. GetAllAsync zaten silinenleri listeden çıkarıyor,
    // yani mevcut davranış (silinen şey listede/haritada görünmez) aynen korunuyor —
    // sadece artık geri getirilebilir hale geliyor (ileride çöp kutusu ekranıyla).
    public async Task<bool> SoftDeleteAsync(int id, string? actorUsername = null)
    {
        var entity = await _repository.GetByIdAsync(id);
        if (entity == null || entity.IsDeleted) return false;

        entity.IsDeleted = true;
        await _repository.SaveChangesAsync();
        await TouchMapModifiedAsync(entity.MapId);

        if (actorUsername != null)
        {
            await _auditLogService.LogAsync(actorUsername, $"geometry.{EntityLabel}.delete",
                $"Bir {EntityLabel} çizimi silindi{(entity.Name != null ? $" ('{entity.Name}')" : "")}.", entity.MapId);
        }
        return true;
    }

    // BUG FİX (kullanıcının kendi tespiti — "toplam 7 diyor ama sadece 1 nokta 1 çizgi
    // görüyorum"): bu iki metot mapId/IsPrivate/isOwner FİLTRESİ OLMADAN TÜM veritabanını
    // (tüm haritalar, tüm kullanıcılar) tarıyordu — çoklu harita (Faz 1a) ve özel çizim
    // (Faz 3) özellikleri eklendiğinde buraya taşınmayı unutmuşuz. Artık GetAllAsync ile
    // AYNI görünürlük kuralı: sadece aktif haritadaki, ve (sahip DEĞİLSEN) sadece
    // herkese-açık + kendi özel kayıtların sayılıyor — ekranda GÖRDÜĞÜN kadarı.
    public async Task<List<int>> GetIntersectingIdsAsync(Geometry polygon, int mapId, int? userId, bool isOwner)
    {
        var items = await _repository.GetAllAsync();
        return items
            .Where(i => !i.IsDeleted && i.MapId == mapId && i.Geometry.Intersects(polygon))
            .Where(i => !i.IsPrivate || isOwner || (userId != null && i.InsertedUserId == userId))
            .Select(i => i.Id)
            .ToList();
    }

    public async Task<List<string>> GetIntersectingWktAsync(Geometry polygon, int mapId, int? userId, bool isOwner)
    {
        var items = await _repository.GetAllAsync();
        return items
            .Where(i => !i.IsDeleted && i.MapId == mapId && i.Geometry.Intersects(polygon))
            .Where(i => !i.IsPrivate || isOwner || (userId != null && i.InsertedUserId == userId))
            .Select(i => WktWriter.Write(i.Geometry))
            .ToList();
    }

    public async Task<IEnumerable<GeometryDto>> GetDeletedAsync()
    {
        var items = await _repository.GetAllAsync();
        return items.Where(i => i.IsDeleted).Select(ToDto);
    }

    public async Task<bool> RestoreAsync(int id)
    {
        var entity = await _repository.GetByIdAsync(id);
        if (entity == null || !entity.IsDeleted) return false;

        entity.IsDeleted = false;
        await _repository.SaveChangesAsync();
        return true;
    }

    // Sadece zaten çöp kutusunda olan (IsDeleted=true) bir kayıt kalıcı silinebilir —
    // "önce çöp kutusuna at, sonra istenirse boşalt" akışını garanti altına alıyor.
    public async Task<bool> PermanentDeleteAsync(int id)
    {
        var entity = await _repository.GetByIdAsync(id);
        if (entity == null || !entity.IsDeleted) return false;

        var removed = await _repository.DeleteAsync(id);
        if (removed) await _repository.SaveChangesAsync();
        return removed;
    }

    public async Task<int> EmptyTrashAsync()
    {
        var items = await _repository.GetAllAsync();
        var deletedIds = items.Where(i => i.IsDeleted).Select(i => i.Id).ToList();

        foreach (var id in deletedIds)
        {
            await _repository.DeleteAsync(id);
        }

        if (deletedIds.Count > 0)
        {
            await _repository.SaveChangesAsync();
        }

        return deletedIds.Count;
    }

    private static GeometryDto ToDto(TEntity entity) => new()
    {
        Id = entity.Id,
        Wkt = WktWriter.Write(entity.Geometry),
        Place = entity.Place,
        Province = entity.Province,
        Name = entity.Name,
        Color = entity.Color,
        CategoryId = entity.CategoryId,
        CreatedDate = entity.CreatedDate,
        ModifiedDate = entity.ModifiedDate,
        IsActive = entity.IsActive,
        InsertedUserId = entity.InsertedUserId,
        IsPrivate = entity.IsPrivate,
    };

    // WKT metnini istenen geometri tipine çevirir, tip uyuşmazsa/bozuksa hata mesajı döner
    private static bool TryParseWkt(string wkt, out TGeometry geometry, out string error)
    {
        try
        {
            var parsed = WktReader.Read(wkt);
            parsed.SRID = Srid;

            if (parsed is TGeometry typed)
            {
                geometry = typed;
                error = string.Empty;
                return true;
            }

            geometry = null!;
            error = $"Gönderilen WKT bir {typeof(TGeometry).Name} değil.";
            return false;
        }
        catch (Exception)
        {
            geometry = null!;
            error = "Geçersiz WKT verisi.";
            return false;
        }
    }
}

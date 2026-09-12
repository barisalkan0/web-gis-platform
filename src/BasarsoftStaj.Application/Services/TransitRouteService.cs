using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

// Hoca ödevi (Akıllı Ulaşım Modülü): "Güzergah Yönetimi: Menüye 'Güzergah Yönetimi' paneli
// ekleyin. Yeni güzergah ekleme (isim ve renk belirleme), listeleme ve düzenleme yapılabilsin."
public class TransitRouteService : ITransitRouteService
{
    private static readonly System.Text.RegularExpressions.Regex HexColorPattern = new("^#[0-9a-fA-F]{6}$");
    private const int Srid = 4326;
    private static readonly WKTReader WktReader = new();
    private static readonly WKTWriter WktWriter = new();

    private readonly IRepository<TransitRoute> _repository;
    private readonly IRepository<TransitStop> _stopRepository;
    private readonly IAuditLogService _auditLogService;
    private readonly IOsrmService _osrmService;

    public TransitRouteService(IRepository<TransitRoute> repository, IRepository<TransitStop> stopRepository, IAuditLogService auditLogService, IOsrmService osrmService)
    {
        _repository = repository;
        _stopRepository = stopRepository;
        _auditLogService = auditLogService;
        _osrmService = osrmService;
    }

    public async Task<IEnumerable<TransitRouteDto>> GetAllAsync()
    {
        var items = (await _repository.GetAllAsync()).Where(r => !r.IsDeleted).ToList();
        var stopCounts = (await _stopRepository.GetAllAsync())
            .Where(s => !s.IsDeleted)
            .GroupBy(s => s.RouteId)
            .ToDictionary(g => g.Key, g => g.Count());
        return items.OrderBy(r => r.Name).Select(r => ToDto(r, stopCounts));
    }

    public async Task<(bool Success, TransitRouteDto? Result, string? Error)> CreateAsync(CreateTransitRouteDto dto, int? userId, string actorUsername)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return (false, null, "Güzergah adı boş olamaz.");
        if (dto.Name.Trim().Length > 120) return (false, null, "Güzergah adı en fazla 120 karakter olabilir.");
        if (string.IsNullOrWhiteSpace(dto.Color) || !HexColorPattern.IsMatch(dto.Color.Trim()))
            return (false, null, "Güzergah rengi #rrggbb biçiminde bir hex kod olmalıdır.");

        var route = new TransitRoute
        {
            Name = dto.Name.Trim(),
            Color = dto.Color.Trim(),
            UserId = userId,
            Province = string.IsNullOrWhiteSpace(dto.Province) ? null : dto.Province.Trim(),
            District = string.IsNullOrWhiteSpace(dto.District) ? null : dto.District.Trim(),
            Neighborhood = string.IsNullOrWhiteSpace(dto.Neighborhood) ? null : dto.Neighborhood.Trim(),
        };
        await _repository.AddAsync(route);
        await _repository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "transit_route.create", $"'{route.Name}' güzergahı oluşturuldu.");
        return (true, ToDto(route, new Dictionary<int, int>()), null);
    }

    public async Task<(bool Success, TransitRouteDto? Result, string? Error)> UpdateAsync(int id, UpdateTransitRouteDto dto, string actorUsername)
    {
        var route = await _repository.GetByIdAsync(id);
        if (route == null || route.IsDeleted) return (false, null, "Güzergah bulunamadı.");

        if (!string.IsNullOrWhiteSpace(dto.Name))
        {
            if (dto.Name.Trim().Length > 120) return (false, null, "Güzergah adı en fazla 120 karakter olabilir.");
            route.Name = dto.Name.Trim();
        }
        if (!string.IsNullOrWhiteSpace(dto.Color))
        {
            if (!HexColorPattern.IsMatch(dto.Color.Trim())) return (false, null, "Güzergah rengi #rrggbb biçiminde bir hex kod olmalıdır.");
            route.Color = dto.Color.Trim();
        }
        // dto.Province/District null ise "değiştirme", boş string ("") ise "temizle" — bu
        // yüzden !string.IsNullOrWhiteSpace yerine != null kontrolü yapıyoruz.
        if (dto.Province != null) route.Province = string.IsNullOrWhiteSpace(dto.Province) ? null : dto.Province.Trim();
        if (dto.District != null) route.District = string.IsNullOrWhiteSpace(dto.District) ? null : dto.District.Trim();
        if (dto.Neighborhood != null) route.Neighborhood = string.IsNullOrWhiteSpace(dto.Neighborhood) ? null : dto.Neighborhood.Trim();

        await _repository.SaveChangesAsync();
        await _auditLogService.LogAsync(actorUsername, "transit_route.update", $"'{route.Name}' güzergahı güncellendi.");

        var stopCounts = (await _stopRepository.GetAllAsync())
            .Where(s => !s.IsDeleted && s.RouteId == route.Id)
            .GroupBy(s => s.RouteId)
            .ToDictionary(g => g.Key, g => g.Count());
        return (true, ToDto(route, stopCounts), null);
    }

    public async Task<(bool Success, string? Error)> DeleteAsync(int id, string actorUsername)
    {
        var route = await _repository.GetByIdAsync(id);
        if (route == null || route.IsDeleted) return (false, "Güzergah bulunamadı.");

        // RouteId NOT NULL olduğu için (bkz. TransitStop.cs) "yetim" durak asla var olamaz —
        // güzergah silinince ona bağlı duraklar da (gerçek silme yok, is_deleted=true) birlikte
        // kaldırılır.
        var stops = (await _stopRepository.GetAllAsync()).Where(s => !s.IsDeleted && s.RouteId == id).ToList();
        foreach (var stop in stops) stop.IsDeleted = true;

        route.IsDeleted = true;
        await _repository.SaveChangesAsync();
        await _auditLogService.LogAsync(actorUsername, "transit_route.delete", $"'{route.Name}' güzergahı ve {stops.Count} durağı silindi.");
        return (true, null);
    }

    // Kullanıcının kendi isteği: "duraklatma şeyi de olsun duraklatınca görünmesinler."
    public async Task<(bool Success, string? Error)> SetPausedAsync(int id, bool isPaused, string actorUsername)
    {
        var route = await _repository.GetByIdAsync(id);
        if (route == null || route.IsDeleted) return (false, "Güzergah bulunamadı.");

        route.IsPaused = isPaused;
        await _repository.SaveChangesAsync();

        var actionLabel = isPaused ? "duraklatıldı" : "devam ettirildi";
        await _auditLogService.LogAsync(actorUsername, "transit_route.pause", $"'{route.Name}' güzergahı {actionLabel}.");
        return (true, null);
    }

    // Kullanıcının kendi isteği: "aralarındaki çizgileri tutup kırabiliyor olalım
    // bükebilelim" — admin haritada hattı elle düzenleyip burayı çağırınca kaydedilir.
    //
    // Kullanıcının kendi isteği (27 Ağustos ödevi sonrası): "otomatik hesaplanan yolda mesela
    // yol çalışması varsa veya daha başka yoldan gidilecekse basitçe ayar yapılabilsin" — bir
    // güzergahın OSRM rotası (RouteGeometry) varken admin haritada o hattı elle düzenleyip
    // buraya YENİ bir hat (wkt dolu) kaydederse, elle düzenlenen hat ARTIK GÖSTERİLEN/GEÇERLİ
    // hat olmalı. Render önceliği RouteGeometry > Path > düz çizgi olduğu için (bkz.
    // MapPage.jsx fetchStops), RouteGeometry'yi TEMİZLEMEZSEK admin'in elle yaptığı düzeltme
    // haritada hiç görünmez (OSRM'in eski rotası önde kalır). Bu yüzden elle YENİ bir hat
    // kaydedilince RouteGeometry de sıfırlanır — bu aynı zamanda bir sonraki durak sırası
    // değişikliğinde TransitStopService.RegenerateRouteIfNeededAsync'in (SADECE RouteGeometry
    // != null iken çalışır) admin'in elle yaptığı düzeltmenin ÜZERİNE sessizce yazmasını da
    // engeller — admin tekrar "Rota Oluştur"a basmadan OSRM bu güzergaha bir daha dokunmaz.
    //
    // ÖNEMLİ (kullanıcının düzeltmesi): wkt NULL ise (yani "Sıfırla" — sadece o an ekranda
    // sürüklenen/oynanan hat iptal ediliyor) RouteGeometry'ye ASLA dokunulmaz. İlk halde
    // "Sıfırla" RouteGeometry'yi de temizliyordu ve bu, hesabı zaten hesap edilmiş bir OSRM
    // rotasını "Sıfırla" ile düz çizgiye döndürüyordu — kullanıcının "sıfırla deyince sadece
    // oynadığımız şeyi sıfırlasın, yolları hesaplasın her zaman" tespitiyle DÜZELTİLDİ. Path
    // null'lanınca render önceliği zaten RouteGeometry'ye (varsa) geri döner; RouteGeometry de
    // yoksa MapPage.jsx (resetRoutePathToStraight) düz çizgide bırakmak yerine otomatik olarak
    // OSRM'den yeni bir rota ister.
    public async Task<(bool Success, string? Error)> SetPathAsync(int id, string? wkt, string actorUsername)
    {
        var route = await _repository.GetByIdAsync(id);
        if (route == null || route.IsDeleted) return (false, "Güzergah bulunamadı.");

        if (string.IsNullOrWhiteSpace(wkt))
        {
            route.Path = null;
        }
        else
        {
            Geometry parsed;
            try
            {
                parsed = WktReader.Read(wkt);
                parsed.SRID = Srid;
            }
            catch
            {
                return (false, "Geçersiz hat verisi.");
            }
            if (parsed is not LineString line) return (false, "Güzergah hattı bir çizgi olmalıdır.");
            route.Path = line;
            route.RouteGeometry = null;
            route.RouteGeneratedAt = null;
        }

        await _repository.SaveChangesAsync();
        await _auditLogService.LogAsync(actorUsername, "transit_route.path", $"'{route.Name}' güzergahının hattı {(route.Path == null ? "sıfırlandı" : "elle düzenlendi (OSRM rotasının yerine geçti)")}.");
        return (true, null);
    }

    // Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): "Güzergah üzerine 'Rota
    // Oluştur' butonu ekleyin ... Güzergah üzerindeki durak sırası değiştiğinde OSRM'e yeni
    // istek atılarak rota otomatik güncellenmelidir." — bu metod hem admin'in "Rota Oluştur"
    // butonundan (TransitRouteController), hem de durak sırası/seti değiştiğinde
    // TransitStopService'ten (best-effort, sessiz) çağrılıyor.
    public async Task<(bool Success, TransitRouteDto? Result, string? Error)> GenerateRouteAsync(int id, string actorUsername)
    {
        var route = await _repository.GetByIdAsync(id);
        if (route == null || route.IsDeleted) return (false, null, "Güzergah bulunamadı.");

        var waypoints = await GetActiveStopWaypointsAsync(id);
        if (waypoints.Count < 2)
            return (false, null, "Rota oluşturmak için en az 2 aktif (duraklatılmamış) durak gerekiyor.");

        var (success, osrmLine, error) = await _osrmService.GetRouteAsync(waypoints);
        if (!success || osrmLine == null)
            return (false, null, error ?? "OSRM rota hesaplayamadı.");

        route.RouteGeometry = osrmLine;
        route.RouteGeneratedAt = DateTime.UtcNow;
        await _repository.SaveChangesAsync();
        await _auditLogService.LogAsync(actorUsername, "transit_route.generate_route", $"'{route.Name}' güzergahı için OSRM rotası oluşturuldu ({waypoints.Count} durak).");

        var stopCounts = (await _stopRepository.GetAllAsync())
            .Where(s => !s.IsDeleted && s.RouteId == route.Id)
            .GroupBy(s => s.RouteId)
            .ToDictionary(g => g.Key, g => g.Count());
        return (true, ToDto(route, stopCounts), null);
    }

    // TransitStopService'in de (durak sırası/seti değişince otomatik yeniden üretim için)
    // kullanabileceği ortak yardımcı: bir güzergahın aktif duraklarını SortOrder'a göre
    // sıralayıp (lon, lat) listesine çevirir.
    private async Task<List<(double Lon, double Lat)>> GetActiveStopWaypointsAsync(int routeId)
    {
        var stops = (await _stopRepository.GetAllAsync())
            .Where(s => !s.IsDeleted && !s.IsPaused && s.RouteId == routeId)
            .OrderBy(s => s.SortOrder)
            .ToList();
        return stops.Select(s => (s.Geometry.X, s.Geometry.Y)).ToList();
    }

    private static TransitRouteDto ToDto(TransitRoute r, Dictionary<int, int> stopCounts) => new()
    {
        Id = r.Id,
        Name = r.Name,
        Color = r.Color,
        CreatedDate = r.CreatedDate,
        StopCount = stopCounts.TryGetValue(r.Id, out var count) ? count : 0,
        IsPaused = r.IsPaused,
        PathWkt = r.Path != null ? WktWriter.Write(r.Path) : null,
        Province = r.Province,
        District = r.District,
        Neighborhood = r.Neighborhood,
        RouteGeometryWkt = r.RouteGeometry != null ? WktWriter.Write(r.RouteGeometry) : null,
        RouteGeneratedAt = r.RouteGeneratedAt,
    };
}

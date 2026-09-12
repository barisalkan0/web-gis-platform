using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

// Hoca ödevi (Akıllı Ulaşım Modülü): "Durak Ekleme: Operatör için haritada 'Durak Ekle'
// (Point) aracı oluşturun ... Haritada seçilen bir nokta doğrudan güzergaha durak olarak
// eklenebilmelidir." — PoiService ile AYNI WKT/SRID deseni (bkz. yorum orada).
public class TransitStopService : ITransitStopService
{
    private const int Srid = 4326;
    private static readonly WKTReader WktReader = new();
    private static readonly WKTWriter WktWriter = new();

    private readonly IRepository<TransitStop> _repository;
    private readonly IRepository<TransitRoute> _routeRepository;
    private readonly IRepository<User> _userRepository;
    private readonly IAuditLogService _auditLogService;
    private readonly IOsrmService _osrmService;

    public TransitStopService(
        IRepository<TransitStop> repository,
        IRepository<TransitRoute> routeRepository,
        IRepository<User> userRepository,
        IAuditLogService auditLogService,
        IOsrmService osrmService)
    {
        _repository = repository;
        _routeRepository = routeRepository;
        _userRepository = userRepository;
        _auditLogService = auditLogService;
        _osrmService = osrmService;
    }

    public async Task<IEnumerable<TransitStopDto>> GetAllAsync()
    {
        var items = (await _repository.GetAllAsync()).Where(s => !s.IsDeleted).ToList();
        var routes = (await _routeRepository.GetAllAsync()).ToDictionary(r => r.Id, r => r);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        return items.OrderBy(s => s.RouteId).ThenBy(s => s.SortOrder).Select(s => ToDto(s, routes, users));
    }

    public async Task<IEnumerable<TransitStopDto>> GetByRouteAsync(int routeId)
    {
        var items = (await _repository.GetAllAsync()).Where(s => !s.IsDeleted && s.RouteId == routeId).ToList();
        var routes = (await _routeRepository.GetAllAsync()).ToDictionary(r => r.Id, r => r);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        return items.OrderBy(s => s.SortOrder).Select(s => ToDto(s, routes, users));
    }

    public async Task<(bool Success, TransitStopDto? Result, string? Error)> CreateAsync(CreateTransitStopDto dto, int? userId, string actorUsername)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return (false, null, "Durak adı boş olamaz.");
        if (dto.Name.Trim().Length > 150) return (false, null, "Durak adı en fazla 150 karakter olabilir.");

        var route = await _routeRepository.GetByIdAsync(dto.RouteId);
        if (route == null || route.IsDeleted) return (false, null, "Seçilen güzergah bulunamadı.");

        Geometry parsed;
        try
        {
            parsed = WktReader.Read(dto.Wkt);
            parsed.SRID = Srid;
        }
        catch
        {
            return (false, null, "Geçersiz konum verisi.");
        }
        if (parsed is not Point point) return (false, null, "Durak konumu bir nokta olmalıdır.");

        var siblingCount = (await _repository.GetAllAsync()).Count(s => !s.IsDeleted && s.RouteId == dto.RouteId);
        var stop = new TransitStop
        {
            Geometry = point,
            Name = dto.Name.Trim(),
            RouteId = dto.RouteId,
            SortOrder = siblingCount,
            UserId = userId,
        };
        await _repository.AddAsync(stop);
        // Kullanıcının kendi tespiti (test hesabından "Zafer6" eklenince): elle bükülmüş bir
        // route.Path varsa, o eğri SADECE eklenme anındaki durak dizisine göre çizilmişti —
        // yeni bir durak eklendiğinde o eğri artık yeni durağı hiç göstermiyor ("çizgi
        // çekmedi"). Bunu sessizce bayat bırakmak yerine AÇIKÇA sıfırlıyoruz; hat, durakların
        // güncel sırasından düz çizgiyle yeniden kurulacak (frontend fetchStops). Bu davranış
        // "admin kaydettiyse bitti" ilkesiyle çelişmiyor — kaydedilen eğri SİLİNMİYOR, sadece
        // artık geçersiz olduğu için mevcut duraklara göre yeniden hesaplanıyor; admin isterse
        // hattı tekrar düzenleyip yeni durağı da kapsayacak şekilde bükebilir.
        var pathCleared = ClearRoutePathIfSet(route);
        await _repository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "transit_stop.create", $"'{stop.Name}' durağı '{route.Name}' güzergahına eklendi.");
        if (pathCleared)
        {
            await _auditLogService.LogAsync(actorUsername, "transit_route.path_auto_reset", $"'{route.Name}' güzergahının elle çizilmiş hattı, durak listesi değiştiği için otomatik sıfırlandı.");
        }
        await RegenerateRouteIfNeededAsync(route, actorUsername);

        var routes = (await _routeRepository.GetAllAsync()).ToDictionary(r => r.Id, r => r);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        return (true, ToDto(stop, routes, users), null);
    }

    public async Task<(bool Success, TransitStopDto? Result, string? Error)> UpdateAsync(int id, UpdateTransitStopDto dto, string actorUsername)
    {
        var stop = await _repository.GetByIdAsync(id);
        if (stop == null || stop.IsDeleted) return (false, null, "Durak bulunamadı.");

        if (!string.IsNullOrWhiteSpace(dto.Name))
        {
            if (dto.Name.Trim().Length > 150) return (false, null, "Durak adı en fazla 150 karakter olabilir.");
            stop.Name = dto.Name.Trim();
        }

        if (dto.Wkt != null)
        {
            Geometry parsed;
            try
            {
                parsed = WktReader.Read(dto.Wkt);
                parsed.SRID = Srid;
            }
            catch
            {
                return (false, null, "Geçersiz konum verisi.");
            }
            if (parsed is not Point point) return (false, null, "Durak konumu bir nokta olmalıdır.");
            stop.Geometry = point;
        }

        // Kullanıcının kendi tespiti (ekran görüntüsüyle): "durağı tutup sürükleyince çizgiyi
        // de peşinden getirmesi lazım ama yolu takip ederek bunu yapmıyor." — hat düzenleme
        // (bkz. MapPage.jsx [editingRoutePathId] Modify effect'i) sırasında bir durağı
        // sürüklemek TAM OLARAK bu akıştan (Wkt dolu, RouteId AYNI) geçiyor. stop.RouteId'yi
        // (RouteId değişimi varsa) aşağıda EZMEDEN ÖNCE, "bu durağın ESKİ/mevcut güzergahının
        // OSRM rotası var mı" bilgisini burada yakalıyoruz — varsa, durak taşındıktan sonra
        // OSRM'e yeni bir istek atılıp rota o yeni konumdan geçecek şekilde otomatik
        // güncellenecek (bkz. aşağıdaki RegenerateRouteIfNeededAsync çağrısı).
        var sameRouteMove = dto.Wkt != null && (dto.RouteId == null || dto.RouteId.Value == stop.RouteId);

        if (dto.RouteId != null && dto.RouteId.Value != stop.RouteId)
        {
            var newRoute = await _routeRepository.GetByIdAsync(dto.RouteId.Value);
            if (newRoute == null || newRoute.IsDeleted) return (false, null, "Seçilen güzergah bulunamadı.");
            var oldRoute = await _routeRepository.GetByIdAsync(stop.RouteId);
            // Eski güzergahtaki kardeşlerin sırasını normalize et, yeni güzergahın SONUNA ekle
            // (PoiCategoryService.UpdateAsync'teki parent-taşıma deseniyle AYNI mantık).
            var oldSiblings = (await _repository.GetAllAsync())
                .Where(s => s.Id != id && !s.IsDeleted && s.RouteId == stop.RouteId)
                .OrderBy(s => s.SortOrder)
                .ToList();
            NormalizeSiblings(oldSiblings);
            var newSiblingCount = (await _repository.GetAllAsync()).Count(s => s.Id != id && !s.IsDeleted && s.RouteId == dto.RouteId.Value);
            stop.RouteId = dto.RouteId.Value;
            stop.SortOrder = newSiblingCount;
            // Her iki güzergahın da durak seti değişti — ikisinin de manuel Path'i varsa
            // sıfırla (bkz. CreateAsync'teki AYNI gerekçe).
            if (oldRoute != null) ClearRoutePathIfSet(oldRoute);
            ClearRoutePathIfSet(newRoute);
            await _repository.SaveChangesAsync();
            if (oldRoute != null) await RegenerateRouteIfNeededAsync(oldRoute, actorUsername);
            await RegenerateRouteIfNeededAsync(newRoute, actorUsername);
        }
        // NOT: sadece dto.Wkt değişip RouteId AYNI kalıyorsa (bir durağın kendi konumunu
        // taşıma akışı — bkz. MapPage.jsx hat bükme ekranındaki "durağı taşı" özelliği)
        // route.Path'i BİLEREK sıfırlamıyoruz: o akışın kendisi zaten route.Path'in yeni
        // hâlini "Kaydet" ile ayrıca PATCH ediyor (persistRoutePath). Burada da sıfırlarsak
        // admin'in düzenleme oturumu ortasında henüz kaydetmediği eğri anlamsızca kaybolurdu.

        await _repository.SaveChangesAsync();
        await _auditLogService.LogAsync(actorUsername, "transit_stop.update", $"'{stop.Name}' durağı güncellendi.");

        if (sameRouteMove)
        {
            var route = await _routeRepository.GetByIdAsync(stop.RouteId);
            await RegenerateRouteIfNeededAsync(route, actorUsername);
        }

        var routes = (await _routeRepository.GetAllAsync()).ToDictionary(r => r.Id, r => r);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        return (true, ToDto(stop, routes, users), null);
    }

    public async Task<(bool Success, string? Error)> DeleteAsync(int id, string actorUsername)
    {
        var stop = await _repository.GetByIdAsync(id);
        if (stop == null || stop.IsDeleted) return (false, "Durak bulunamadı.");

        stop.IsDeleted = true;
        await _repository.SaveChangesAsync();

        var remaining = (await _repository.GetAllAsync())
            .Where(s => s.Id != id && !s.IsDeleted && s.RouteId == stop.RouteId)
            .OrderBy(s => s.SortOrder)
            .ToList();
        NormalizeSiblings(remaining);
        var route = await _routeRepository.GetByIdAsync(stop.RouteId);
        if (route != null) ClearRoutePathIfSet(route); // bkz. CreateAsync'teki AYNI gerekçe
        await _repository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "transit_stop.delete", $"'{stop.Name}' durağı silindi.");
        await RegenerateRouteIfNeededAsync(route, actorUsername);
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> ReorderAsync(int routeId, List<int> stopIds, string actorUsername)
    {
        var route = await _routeRepository.GetByIdAsync(routeId);
        if (route == null || route.IsDeleted) return (false, "Güzergah bulunamadı.");

        var siblings = (await _repository.GetAllAsync()).Where(s => !s.IsDeleted && s.RouteId == routeId).ToList();
        if (stopIds.Count != siblings.Count || stopIds.Distinct().Count() != stopIds.Count || stopIds.Any(id => siblings.All(s => s.Id != id)))
            return (false, "Sıralama listesi bu güzergahın duraklarıyla tam olarak eşleşmiyor.");

        var byId = siblings.ToDictionary(s => s.Id, s => s);
        for (var i = 0; i < stopIds.Count; i++) byId[stopIds[i]].SortOrder = i;

        await _repository.SaveChangesAsync();
        await _auditLogService.LogAsync(actorUsername, "transit_stop.reorder", $"'{route.Name}' güzergahındaki durak sırası değiştirildi.");
        await RegenerateRouteIfNeededAsync(route, actorUsername);
        return (true, null);
    }

    // Kullanıcının kendi isteği: "durağı duraklatınca otomatik sonrakiyle birleşsin" —
    // SortOrder'a dokunmuyoruz, sadece IsPaused set ediliyor; hat kurma mantığı (frontend
    // fetchStops) duraklatılmış durakları filtreleyip önceki/sonraki aktif durağı birleştiriyor.
    public async Task<(bool Success, string? Error)> SetPausedAsync(int id, bool isPaused, string actorUsername)
    {
        var stop = await _repository.GetByIdAsync(id);
        if (stop == null || stop.IsDeleted) return (false, "Durak bulunamadı.");

        stop.IsPaused = isPaused;
        await _repository.SaveChangesAsync();

        var actionLabel = isPaused ? "duraklatıldı" : "devam ettirildi";
        await _auditLogService.LogAsync(actorUsername, "transit_stop.pause", $"'{stop.Name}' durağı {actionLabel}.");
        // Duraklatma/devam ettirme de aktif durak setini değiştirir (bkz. class-level yorum:
        // "hat kurma mantığı duraklatılmış durakları filtreleyip önceki/sonraki aktif durağı
        // birleştiriyor") — OSRM rotası da AYNI mantıkla otomatik güncellenmeli.
        var route = await _routeRepository.GetByIdAsync(stop.RouteId);
        await RegenerateRouteIfNeededAsync(route, actorUsername);
        return (true, null);
    }

    private static void NormalizeSiblings(IEnumerable<TransitStop> siblings)
    {
        var index = 0;
        foreach (var sibling in siblings) sibling.SortOrder = index++;
    }

    // Kullanıcının kendi isteği: durak seti (ekleme/silme/güzergah değiştirme) her
    // değiştiğinde, o güzergahın elle çizilmiş Path'i varsa sıfırlanır — bkz. CreateAsync
    // yorumundaki tam gerekçe. Değişiklik olduysa true döner (audit log için).
    private static bool ClearRoutePathIfSet(TransitRoute route)
    {
        if (route.Path == null) return false;
        route.Path = null;
        return true;
    }

    // Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): "Güzergah üzerindeki durak
    // sırası değiştiğinde OSRM'e yeni istek atılarak rota otomatik güncellenmelidir." — SADECE
    // daha önce bir kez "Rota Oluştur" ile OSRM rotası üretilmiş güzergahlarda devreye girer
    // (route.RouteGeometry != null): hiç OSRM rotası istemeyen bir güzergahı durak eklerken
    // sessizce OSRM'e bağımlı hale getirmek istenmeyen bir yan etki olurdu. BEST-EFFORT: OSRM
    // ayakta değilse/rota bulunamazsa durak işlemini asla başarısız kılmaz, sadece eski
    // RouteGeometry olduğu gibi kalır ve audit log'a bir uyarı düşülür.
    private async Task RegenerateRouteIfNeededAsync(TransitRoute? route, string actorUsername)
    {
        if (route == null || route.RouteGeometry == null) return;

        var stops = (await _repository.GetAllAsync())
            .Where(s => !s.IsDeleted && !s.IsPaused && s.RouteId == route.Id)
            .OrderBy(s => s.SortOrder)
            .ToList();

        if (stops.Count < 2)
        {
            // Rota artık tek/hiç aktif durakla kurulamaz — eski OSRM rotasını temizle ki
            // haritada yanlış/bayat bir çizgi kalmasın.
            route.RouteGeometry = null;
            route.RouteGeneratedAt = null;
            await _repository.SaveChangesAsync();
            await _auditLogService.LogAsync(actorUsername, "transit_route.generate_route_auto_clear", $"'{route.Name}' güzergahının OSRM rotası, aktif durak sayısı 2'nin altına düştüğü için sıfırlandı.");
            return;
        }

        var waypoints = stops.Select(s => (s.Geometry.X, s.Geometry.Y)).ToList();
        var (success, osrmLine, error) = await _osrmService.GetRouteAsync(waypoints);
        if (!success || osrmLine == null)
        {
            await _auditLogService.LogAsync(actorUsername, "transit_route.generate_route_auto_failed", $"'{route.Name}' güzergahının OSRM rotası durak değişikliği sonrası otomatik güncellenemedi: {error}");
            return;
        }

        route.RouteGeometry = osrmLine;
        route.RouteGeneratedAt = DateTime.UtcNow;
        await _repository.SaveChangesAsync();
        await _auditLogService.LogAsync(actorUsername, "transit_route.generate_route_auto", $"'{route.Name}' güzergahının OSRM rotası, durak değişikliği sonrası otomatik güncellendi.");
    }

    private static TransitStopDto ToDto(TransitStop s, Dictionary<int, TransitRoute> routes, Dictionary<int, string> users)
    {
        var route = routes.TryGetValue(s.RouteId, out var r) ? r : null;
        return new TransitStopDto
        {
            Id = s.Id,
            Wkt = WktWriter.Write(s.Geometry),
            Name = s.Name,
            RouteId = s.RouteId,
            RouteName = route?.Name ?? "Bilinmiyor",
            RouteColor = route?.Color ?? "#6b7280",
            SortOrder = s.SortOrder,
            CreatedDate = s.CreatedDate,
            UserId = s.UserId,
            AddedByUsername = s.UserId != null && users.TryGetValue(s.UserId.Value, out var username) ? username : null,
            IsPaused = s.IsPaused,
        };
    }
}

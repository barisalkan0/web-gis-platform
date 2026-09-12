using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class GeoRestrictionService : IGeoRestrictionService
{
    private const int Srid = 4326; // Diğer tüm geometrilerle aynı (bkz. GeometryService)

    private static readonly WKTReader WktReader = new();
    private static readonly WKTWriter WktWriter = new();

    private readonly IRepository<GeoRestriction> _repository;
    private readonly IRepository<User> _userRepository;
    private readonly IAuditLogService _auditLogService;

    public GeoRestrictionService(
        IRepository<GeoRestriction> repository,
        IRepository<User> userRepository,
        IAuditLogService auditLogService)
    {
        _repository = repository;
        _userRepository = userRepository;
        _auditLogService = auditLogService;
    }

    // ---- Hocanın görevi: GLOBAL (admin tanımlı, MapId=null) alanlar ----

    public async Task<IEnumerable<GeoRestrictionDto>> GetForRoleAsync(int roleId)
    {
        var rows = (await _repository.GetAllAsync()).Where(g => g.RoleId == roleId && g.MapId == null).OrderBy(g => g.CreatedDate).ToList();
        return rows.Select(ToDto);
    }

    public async Task<IEnumerable<GeoRestrictionDto>> GetForUserAsync(int userId)
    {
        var rows = (await _repository.GetAllAsync()).Where(g => g.UserId == userId && g.MapId == null).OrderBy(g => g.CreatedDate).ToList();
        return rows.Select(ToDto);
    }

    public Task<(bool Success, GeoRestrictionDto? Result, string? Error)> AddForRoleAsync(int roleId, CreateGeoRestrictionDto dto, string actorUsername) =>
        AddAsync(roleId: roleId, userId: null, mapId: null, dto, actorUsername, targetLabel: $"'{roleId}' id'li rol");

    public Task<(bool Success, GeoRestrictionDto? Result, string? Error)> AddForUserAsync(int userId, CreateGeoRestrictionDto dto, string actorUsername) =>
        AddAsync(roleId: null, userId: userId, mapId: null, dto, actorUsername, targetLabel: $"'{userId}' id'li kullanıcı");

    // ---- Görev #7 (kullanıcının kendi isteği): HARİTA SAHİBİNİN kendi haritasına özel
    // (MapId dolu) alanları — admin izni GEREKTİRMİYOR, controller'da yetki kontrolü
    // "bu haritanın sahibi mi" şeklinde (bkz. GeoRestrictionController). ----

    public async Task<IEnumerable<GeoRestrictionDto>> GetForMapRoleAsync(int mapId, int roleId)
    {
        var rows = (await _repository.GetAllAsync())
            .Where(g => g.RoleId == roleId && g.MapId == mapId)
            .OrderBy(g => g.CreatedDate)
            .ToList();
        return rows.Select(ToDto);
    }

    public async Task<IEnumerable<GeoRestrictionDto>> GetForMapUserAsync(int mapId, int userId)
    {
        var rows = (await _repository.GetAllAsync())
            .Where(g => g.UserId == userId && g.MapId == mapId)
            .OrderBy(g => g.CreatedDate)
            .ToList();
        return rows.Select(ToDto);
    }

    public Task<(bool Success, GeoRestrictionDto? Result, string? Error)> AddForMapRoleAsync(int mapId, int roleId, CreateGeoRestrictionDto dto, string actorUsername) =>
        AddAsync(roleId: roleId, userId: null, mapId: mapId, dto, actorUsername, targetLabel: $"'{roleId}' id'li rol");

    public Task<(bool Success, GeoRestrictionDto? Result, string? Error)> AddForMapUserAsync(int mapId, int userId, CreateGeoRestrictionDto dto, string actorUsername) =>
        AddAsync(roleId: null, userId: userId, mapId: mapId, dto, actorUsername, targetLabel: $"'{userId}' id'li kullanıcı");

    // Kullanıcının kendi isteği: "buradan tamamen yönetilebilmeli" — Harita Ayarları'ndaki
    // Paylaşılanlar kartlarının her biri için tek tek istek atmak yerine, o haritanın TÜM
    // kısıt satırlarını (role + user) bir kerede döner.
    public async Task<IEnumerable<GeoRestrictionDto>> GetAllForMapAsync(int mapId)
    {
        var rows = (await _repository.GetAllAsync())
            .Where(g => g.MapId == mapId)
            .OrderBy(g => g.CreatedDate)
            .ToList();
        return rows.Select(ToDto);
    }

    // "istediğimiz zaman duraklatabilelim istediğimize" — o (mapId, target) grubundaki TÜM
    // satırları TEK seferde duraklatır/devam ettirir (kullanıcı tek tek poligon değil,
    // "bu kişiyi/rolü duraklat" diye düşünüyor — bkz. kullanıcıyla netleşen tasarım).
    public Task<(bool Success, string? Error)> SetPausedForMapRoleAsync(int mapId, int roleId, bool isPaused, string actorUsername) =>
        SetPausedAsync(g => g.RoleId == roleId && g.MapId == mapId, isPaused, actorUsername, mapId, $"'{roleId}' id'li rol");

    public Task<(bool Success, string? Error)> SetPausedForMapUserAsync(int mapId, int userId, bool isPaused, string actorUsername) =>
        SetPausedAsync(g => g.UserId == userId && g.MapId == mapId, isPaused, actorUsername, mapId, $"'{userId}' id'li kullanıcı");

    private async Task<(bool Success, string? Error)> SetPausedAsync(
        Func<GeoRestriction, bool> predicate, bool isPaused, string actorUsername, int mapId, string targetLabel)
    {
        var rows = (await _repository.GetAllAsync()).Where(predicate).ToList();
        if (rows.Count == 0) return (false, "Bu kişi/rol için tanımlanmış bir kısıt yok.");

        foreach (var row in rows)
        {
            row.IsPaused = isPaused;
            row.ModifiedDate = DateTime.UtcNow;
        }
        await _repository.SaveChangesAsync();

        var actionLabel = isPaused ? "duraklatıldı" : "devam ettirildi";
        await _auditLogService.LogAsync(actorUsername, "georestriction.pause", $"{targetLabel} için haritaya özel çizim kısıtlaması {actionLabel}.", mapId);
        return (true, null);
    }

    private async Task<(bool Success, GeoRestrictionDto? Result, string? Error)> AddAsync(
        int? roleId, int? userId, int? mapId, CreateGeoRestrictionDto dto, string actorUsername, string targetLabel)
    {
        if (!TryParseArea(dto.Wkt, out var geometry, out var error))
        {
            return (false, null, error);
        }

        var row = new GeoRestriction
        {
            RoleId = roleId,
            UserId = userId,
            MapId = mapId,
            Area = geometry,
            Name = string.IsNullOrWhiteSpace(dto.Name) ? null : dto.Name.Trim(),
            Kind = dto.Kind == GeoRestrictionKind.Place ? GeoRestrictionKind.Place : GeoRestrictionKind.Freeform,
        };
        await _repository.AddAsync(row);
        await _repository.SaveChangesAsync();

        var label = row.Name != null ? $"'{row.Name}'" : "yeni bir";
        var scopeLabel = mapId != null ? "haritaya özel" : "global";
        await _auditLogService.LogAsync(actorUsername, "georestriction.add", $"{targetLabel} için {scopeLabel} {label} coğrafi alan eklendi.", mapId);
        return (true, ToDto(row), null);
    }

    public async Task<GeoRestrictionDto?> GetByIdAsync(int id)
    {
        var row = await _repository.GetByIdAsync(id);
        return row == null ? null : ToDto(row);
    }

    public async Task<(bool Success, string? Error)> RemoveAsync(int id, string actorUsername)
    {
        var row = await _repository.GetByIdAsync(id);
        if (row == null)
        {
            return (false, "Alan bulunamadı.");
        }

        var targetLabel = row.RoleId.HasValue ? $"'{row.RoleId}' id'li rol" : $"'{row.UserId}' id'li kullanıcı";
        var label = row.Name != null ? $"'{row.Name}'" : "bir";
        var mapId = row.MapId;

        await _repository.DeleteAsync(id);
        await _repository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "georestriction.remove", $"{targetLabel} için {label} coğrafi alan kaldırıldı.", mapId);
        return (true, null);
    }

    // Görev #7: artık mapId'ye göre de dallanıyor. Öncelik sırası (en spesifik kazanır,
    // kullanıcıyla netleşen tasarım): kişi+bu harita > kişi+global > rol+bu harita >
    // rol+global > sınırsız. IsPaused=true satırlar hiç YOKMUŞ gibi sayılır (bir alt
    // önceliğe düşülür) — "duraklat" GEÇİCİ bir kaldırma, silme değil.
    public async Task<List<Geometry>> GetEffectiveAreasAsync(int? userId, int? mapId)
    {
        if (userId == null) return new List<Geometry>();

        var activeRows = (await _repository.GetAllAsync()).Where(g => !g.IsPaused).ToList();

        if (mapId != null)
        {
            var userMapAreas = activeRows.Where(g => g.UserId == userId && g.MapId == mapId).Select(g => g.Area).ToList();
            if (userMapAreas.Count > 0) return userMapAreas;
        }

        var userGlobalAreas = activeRows.Where(g => g.UserId == userId && g.MapId == null).Select(g => g.Area).ToList();
        if (userGlobalAreas.Count > 0) return userGlobalAreas;

        var user = await _userRepository.GetByIdAsync(userId.Value);
        if (user == null) return new List<Geometry>();

        if (mapId != null)
        {
            var roleMapAreas = activeRows.Where(g => g.RoleId == user.RoleId && g.MapId == mapId).Select(g => g.Area).ToList();
            if (roleMapAreas.Count > 0) return roleMapAreas;
        }

        return activeRows.Where(g => g.RoleId == user.RoleId && g.MapId == null).Select(g => g.Area).ToList();
    }

    // GetEffectiveAreasAsync ile AYNI mantık — WKT+isim ikilisi lazım olduğu için (frontend'in
    // gri maske çizmesi) satırları tekrar okuyoruz.
    public async Task<List<(string Wkt, string? Name)>> GetMyEffectiveAreasAsync(int? userId, int? mapId)
    {
        if (userId == null) return new List<(string, string?)>();

        var activeRows = (await _repository.GetAllAsync()).Where(g => !g.IsPaused).ToList();

        if (mapId != null)
        {
            var userMapRows = activeRows.Where(g => g.UserId == userId && g.MapId == mapId).ToList();
            if (userMapRows.Count > 0) return userMapRows.Select(r => (WktWriter.Write(r.Area), r.Name)).ToList();
        }

        var userGlobalRows = activeRows.Where(g => g.UserId == userId && g.MapId == null).ToList();
        if (userGlobalRows.Count > 0) return userGlobalRows.Select(r => (WktWriter.Write(r.Area), r.Name)).ToList();

        var user = await _userRepository.GetByIdAsync(userId.Value);
        if (user == null) return new List<(string, string?)>();

        if (mapId != null)
        {
            var roleMapRows = activeRows.Where(g => g.RoleId == user.RoleId && g.MapId == mapId).ToList();
            if (roleMapRows.Count > 0) return roleMapRows.Select(r => (WktWriter.Write(r.Area), r.Name)).ToList();
        }

        return activeRows.Where(g => g.RoleId == user.RoleId && g.MapId == null).Select(r => (WktWriter.Write(r.Area), r.Name)).ToList();
    }

    private static GeoRestrictionDto ToDto(GeoRestriction g) => new()
    {
        Id = g.Id,
        RoleId = g.RoleId,
        UserId = g.UserId,
        Name = g.Name,
        Kind = g.Kind,
        Wkt = WktWriter.Write(g.Area),
        ModifiedDate = g.ModifiedDate,
        MapId = g.MapId,
        IsPaused = g.IsPaused,
    };

    // Polygon VEYA MultiPolygon kabul ediyor — Nominatim'den gelen bazı ülke/il sınırları
    // (adalı/parçalı yerler) MultiPolygon olarak dönüyor (bkz. GeoRestriction.cs: Area artık genel Geometry).
    private static bool TryParseArea(string wkt, out Geometry geometry, out string error)
    {
        try
        {
            var parsed = WktReader.Read(wkt);
            parsed.SRID = Srid;

            if (parsed is Polygon || parsed is MultiPolygon)
            {
                geometry = parsed;
                error = string.Empty;
                return true;
            }

            geometry = null!;
            error = "Gönderilen WKT bir Polygon/MultiPolygon değil.";
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

using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

// Hoca ödevi: "poi adında bir tablo ... Operatör için haritada POI ekleme aracı (Point)
// oluşturun." Diğer tbl_point/tbl_line/tbl_polygon ile AYNI WKT/SRID deseni (bkz.
// GeometryService) — tutarlılık için.
public class PoiService : IPoiService
{
    private const int Srid = 4326;
    private static readonly WKTReader WktReader = new();
    private static readonly WKTWriter WktWriter = new();

    private readonly IRepository<Poi> _repository;
    private readonly IRepository<PoiCategory> _categoryRepository;
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<Map> _mapRepository;
    private readonly IRepository<PoiWorkingHour> _workingHourRepository;
    private readonly IRepository<PoiScheduleException> _scheduleExceptionRepository;
    private readonly IAuditLogService _auditLogService;
    private readonly IGeoServerFeatureService _geoServerFeatureService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PoiService> _logger;

    // Hoca ödevi (GeoServer POI Entegrasyonu): "Oluşturulan POI tablosunu GeoServer'a katman
    // olarak ekleyin ve veriyi buradan çekin." — poi tablosunun GeoServer'daki katman adı,
    // AppDbContext'teki ToTable("poi") ile BİREBİR aynı olmalı.
    private const string GeoServerLayerName = "poi";

    public PoiService(
        IRepository<Poi> repository,
        IRepository<PoiCategory> categoryRepository,
        IRepository<User> userRepository,
        IRepository<Map> mapRepository,
        IRepository<PoiWorkingHour> workingHourRepository,
        IRepository<PoiScheduleException> scheduleExceptionRepository,
        IAuditLogService auditLogService,
        IGeoServerFeatureService geoServerFeatureService,
        IConfiguration configuration,
        ILogger<PoiService> logger)
    {
        _repository = repository;
        _categoryRepository = categoryRepository;
        _userRepository = userRepository;
        _mapRepository = mapRepository;
        _workingHourRepository = workingHourRepository;
        _scheduleExceptionRepository = scheduleExceptionRepository;
        _auditLogService = auditLogService;
        _geoServerFeatureService = geoServerFeatureService;
        _configuration = configuration;
        _logger = logger;
    }

    private bool IsGeoServerEnabled()
    {
        var setting = _configuration["GeoServer:Enabled"];
        return string.IsNullOrWhiteSpace(setting) || !string.Equals(setting, "false", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<IEnumerable<PoiDto>> GetAllAsync(int mapId)
    {
        var items = (await _repository.GetAllAsync()).Where(p => !p.IsDeleted && p.MapId == mapId).ToList();

        // Hoca ödevi: "ekleyen kullanıcı bilgileri görülebilsin" — N+1 sorgu yerine tek
        // seferde tüm kategori/kullanıcı listesini çekip id->isim sözlüğüne çeviriyoruz
        // (MapShareService.GetShareCountsForOwnerAsync'teki aynı desen).
        var categories = (await _categoryRepository.GetAllAsync()).ToDictionary(c => c.Id, c => c);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var maps = (await _mapRepository.GetAllAsync()).ToDictionary(m => m.Id, m => m.Name);
        var schedules = await GetScheduleLookupAsync(items.Select(p => p.Id));
        var exceptions = await GetScheduleExceptionLookupAsync(items.Select(p => p.Id));

        return items
            .OrderByDescending(p => p.CreatedDate)
            .Select(p => ToDto(p, categories, users, maps, schedules, exceptions));
    }

    // Hoca ödevi (GeoServer POI Entegrasyonu): "Oluşturulan POI tablosunu GeoServer'a katman
    // olarak ekleyin ve veriyi buradan çekin." Bu, POI'nin haritada GÖSTERİLDİĞİ tek yer
    // (frontend sadece bu uç noktayı çağırıyor, bkz. MapPage.jsx fetchPois) — GeometryService'teki
    // AYNI karar: okuma GeoServer'a taşındı, yazma (create/update/delete) hâlâ EF Core üzerinden
    // doğrudan veritabanına gidiyor (GeoServer'ın PostGIS store'u tabloyu canlı okuduğu için
    // ekstra senkronizasyon gerekmiyor).
    public async Task<IEnumerable<PoiDto>> GetCatalogAsync()
    {
        List<Poi> items;
        if (IsGeoServerEnabled())
        {
            try
            {
                items = await GetCatalogItemsFromGeoServerAsync();
            }
            catch (Exception ex)
            {
                // GeoServer entegrasyonu harita kataloğunun tek hata noktası olmasın.
                // Katman henüz yayımlanmamışsa veya GeoServer geçici olarak kapalıysa aynı
                // yetki kontrollü endpoint veritabanındaki canlı POI kayıtlarıyla devam eder.
                // Uyarı loglanır; böylece yapılandırma problemi sessizce gizlenmez.
                _logger.LogWarning(ex, "GeoServer POI kataloğu okunamadı; veritabanı kataloğuna geri dönülüyor.");
                items = (await _repository.GetAllAsync()).Where(p => !p.IsDeleted).ToList();
            }
        }
        else
        {
            items = (await _repository.GetAllAsync()).Where(p => !p.IsDeleted).ToList();
        }

        var categories = (await _categoryRepository.GetAllAsync()).ToDictionary(c => c.Id, c => c);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var maps = (await _mapRepository.GetAllAsync()).ToDictionary(m => m.Id, m => m.Name);
        var schedules = await GetScheduleLookupAsync(items.Select(p => p.Id));
        var exceptions = await GetScheduleExceptionLookupAsync(items.Select(p => p.Id));
        return items.OrderByDescending(p => p.CreatedDate).Select(p => ToDto(p, categories, users, maps, schedules, exceptions));
    }

    // GeoServer'daki "poi" SQL View'ının kendisi zaten is_deleted=false koşulunu içermeli
    // (bkz. docs/geoserver-poi-entegrasyonu.md, tbl_point'teki 21 Ağustos ödeviyle AYNI
    // kurulum deseni) — CQL_FILTER'daki is_deleted=false, GeometryService'teki gibi buna
    // TEK başına güvenmeyip C# tarafında da tekrar süzülen bir ikinci güvenlik ağı.
    private async Task<List<Poi>> GetCatalogItemsFromGeoServerAsync()
    {
        var features = await _geoServerFeatureService.GetRawFeaturesAsync(GeoServerLayerName, "is_deleted = false");
        var items = new List<Poi>();
        foreach (var feature in features)
        {
            Point? point;
            try
            {
                var geometry = WktReader.Read(feature.Wkt);
                geometry.SRID = Srid;
                if (geometry is not Point p) continue; // poi tablosu sadece nokta içerir, bozuk veriye karşı savunma
                point = p;
            }
            catch
            {
                continue; // GeoServer'dan bozuk/parse edilemeyen bir geometri gelirse tüm listeyi çökertmesin
            }

            var props = feature.Properties;
            items.Add(new Poi
            {
                Id = feature.Id,
                Geometry = point,
                Name = GetPropString(props, "name") ?? string.Empty,
                CategoryId = GetPropInt(props, "category_id"),
                WorkingHours = GetPropString(props, "working_hours"),
                Note = GetPropString(props, "note"),
                Province = GetPropString(props, "province"),
                District = GetPropString(props, "district"),
                Icon = GetPropString(props, "icon"),
                UserId = GetPropInt(props, "user_id"),
                MapId = GetPropInt(props, "map_id"),
                IsActive = GetPropBool(props, "is_active") ?? true,
                IsDeleted = GetPropBool(props, "is_deleted") ?? false,
                CreatedDate = GetPropDateTime(props, "created_date") ?? DateTime.UtcNow,
            });
        }
        // Aynı GeometryService.GetAllFromGeoServerAsync yorumundaki ders: CQL_FILTER GeoServer
        // tarafında herhangi bir sebeple etkisiz kalırsa (katman şeması uyuşmazlığı vb.) TÜM
        // kayıtlar (silinmiş dahil) dönebilir — burada C# tarafında TEKRAR süzüyoruz.
        return items.Where(p => !p.IsDeleted).ToList();
    }

    private static string? GetPropString(JsonElement props, string key) =>
        props.TryGetProperty(key, out var v) && v.ValueKind != JsonValueKind.Null ? v.GetString() : null;

    private static int? GetPropInt(JsonElement props, string key) =>
        props.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;

    private static bool? GetPropBool(JsonElement props, string key)
    {
        if (!props.TryGetProperty(key, out var v) || v.ValueKind == JsonValueKind.Null) return null;
        if (v.ValueKind == JsonValueKind.True) return true;
        if (v.ValueKind == JsonValueKind.False) return false;
        if (v.ValueKind == JsonValueKind.String && bool.TryParse(v.GetString(), out var parsed)) return parsed;
        return null;
    }

    private static DateTime? GetPropDateTime(JsonElement props, string key)
    {
        if (!props.TryGetProperty(key, out var v) || v.ValueKind != JsonValueKind.String) return null;
        return DateTime.TryParse(
            v.GetString(),
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal,
            out var parsed)
            ? parsed
            : null;
    }

    public async Task<IEnumerable<PoiDto>> GetAllForAdminAsync()
    {
        var items = (await _repository.GetAllAsync()).Where(p => !p.IsDeleted).ToList();
        var categories = (await _categoryRepository.GetAllAsync()).ToDictionary(c => c.Id, c => c);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var maps = (await _mapRepository.GetAllAsync()).ToDictionary(m => m.Id, m => m.Name);
        var schedules = await GetScheduleLookupAsync(items.Select(p => p.Id));
        var exceptions = await GetScheduleExceptionLookupAsync(items.Select(p => p.Id));
        return items.OrderByDescending(p => p.CreatedDate).Select(p => ToDto(p, categories, users, maps, schedules, exceptions));
    }

    public async Task<IEnumerable<PoiMapOptionDto>> GetMapOptionsForAdminAsync()
    {
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        return (await _mapRepository.GetAllAsync())
            .Where(m => !m.IsDeleted)
            .OrderBy(m => m.Name)
            .Select(m => new PoiMapOptionDto
            {
                Id = m.Id,
                Name = m.Name,
                OwnerUsername = users.TryGetValue(m.OwnerUserId, out var username) ? username : "Bilinmiyor",
            });
    }

    public async Task<PoiDto?> GetByIdAsync(int id)
    {
        var poi = await _repository.GetByIdAsync(id);
        if (poi == null || poi.IsDeleted) return null;

        var categories = (await _categoryRepository.GetAllAsync()).ToDictionary(c => c.Id, c => c);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var maps = (await _mapRepository.GetAllAsync()).ToDictionary(m => m.Id, m => m.Name);
        var schedules = await GetScheduleLookupAsync([poi.Id]);
        var exceptions = await GetScheduleExceptionLookupAsync([poi.Id]);
        return ToDto(poi, categories, users, maps, schedules, exceptions);
    }

    public async Task<(bool Success, PoiDto? Result, string? Error)> CreateAsync(CreatePoiDto dto, int? userId)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
        {
            return (false, null, "POI adı boş olamaz.");
        }
        var optionalError = ValidateOptionalFields(dto.Note, dto.Province, dto.District, dto.Icon);
        if (optionalError != null) return (false, null, optionalError);

        // Kullanıcının kendi isteği (26 Ağustos): toplu/gömülü POI verisi ("evrensel... herkes
        // için her haritada geçerli") belirli bir haritaya bağlı OLMASIN — MapId null
        // bırakılabilir. Bir MapId GÖNDERİLDİYSE yine de geçerli/silinmemiş bir haritaya
        // işaret etmeli (normal "haritada POI ekleme" akışı bunu hep gönderir, davranışı
        // DEĞİŞMEDİ).
        if (dto.MapId != null)
        {
            var map = await _mapRepository.GetByIdAsync(dto.MapId.Value);
            if (map == null || map.IsDeleted) return (false, null, "Seçilen harita bulunamadı.");
        }

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

        if (parsed is not Point point)
        {
            return (false, null, "POI konumu bir nokta olmalıdır.");
        }

        if (dto.CategoryId != null)
        {
            var category = await _categoryRepository.GetByIdAsync(dto.CategoryId.Value);
            if (category == null) return (false, null, "Seçilen kategori bulunamadı.");
        }

        var (scheduleRows, scheduleError) = ParseSchedule(dto.Schedule);
        if (scheduleError != null) return (false, null, scheduleError);
        var (exceptionRows, exceptionError) = ParseScheduleExceptions(dto.ScheduleExceptions);
        if (exceptionError != null) return (false, null, exceptionError);

        var poi = new Poi
        {
            Geometry = point,
            Name = dto.Name.Trim(),
            CategoryId = dto.CategoryId,
            WorkingHours = string.IsNullOrWhiteSpace(dto.WorkingHours) ? null : dto.WorkingHours.Trim(),
            Note = CleanOptional(dto.Note),
            Province = CleanOptional(dto.Province),
            District = CleanOptional(dto.District),
            Icon = CleanOptional(dto.Icon),
            UserId = userId,
            MapId = dto.MapId,
        };

        await _repository.AddAsync(poi);
        await _repository.SaveChangesAsync();

        if (scheduleRows != null || exceptionRows != null)
        {
            foreach (var row in scheduleRows ?? [])
            {
                row.PoiId = poi.Id;
                await _workingHourRepository.AddAsync(row);
            }
            foreach (var row in exceptionRows ?? [])
            {
                row.PoiId = poi.Id;
                await _scheduleExceptionRepository.AddAsync(row);
            }
            if (scheduleRows != null) poi.WorkingHours = BuildScheduleSummary(scheduleRows);
            await _repository.SaveChangesAsync();
        }

        var categories = (await _categoryRepository.GetAllAsync()).ToDictionary(c => c.Id, c => c);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var maps = (await _mapRepository.GetAllAsync()).ToDictionary(m => m.Id, m => m.Name);
        var schedules = await GetScheduleLookupAsync([poi.Id]);
        var exceptions = await GetScheduleExceptionLookupAsync([poi.Id]);
        var actorUsername = userId != null && users.TryGetValue(userId.Value, out var uname) ? uname : "bilinmeyen";
        await _auditLogService.LogAsync(actorUsername, "poi.create", $"'{poi.Name}' POI'si eklendi.");

        return (true, ToDto(poi, categories, users, maps, schedules, exceptions), null);
    }

    public async Task<(bool Success, PoiDto? Result, string? Error)> UpdateAsync(int id, UpdatePoiDto dto, string actorUsername)
    {
        var poi = await _repository.GetByIdAsync(id);
        if (poi == null || poi.IsDeleted) return (false, null, "POI bulunamadı.");
        if (string.IsNullOrWhiteSpace(dto.Name)) return (false, null, "POI adı boş olamaz.");
        var optionalError = ValidateOptionalFields(dto.Note, dto.Province, dto.District, dto.Icon);
        if (optionalError != null) return (false, null, optionalError);

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

        if (parsed is not Point point) return (false, null, "POI konumu bir nokta olmalıdır.");

        if (dto.CategoryId != null)
        {
            var category = await _categoryRepository.GetByIdAsync(dto.CategoryId.Value);
            if (category == null) return (false, null, "Seçilen kategori bulunamadı.");
        }


        var (scheduleRows, scheduleError) = ParseSchedule(dto.Schedule);
        if (scheduleError != null) return (false, null, scheduleError);
        var (exceptionRows, exceptionError) = ParseScheduleExceptions(dto.ScheduleExceptions);
        if (exceptionError != null) return (false, null, exceptionError);

        poi.Geometry = point;
        poi.Name = dto.Name.Trim();
        poi.CategoryId = dto.CategoryId;
        poi.WorkingHours = string.IsNullOrWhiteSpace(dto.WorkingHours) ? null : dto.WorkingHours.Trim();
        poi.Note = CleanOptional(dto.Note);
        poi.Province = CleanOptional(dto.Province);
        poi.District = CleanOptional(dto.District);
        poi.Icon = CleanOptional(dto.Icon);
        if (scheduleRows != null)
        {
            var existingSchedule = (await _workingHourRepository.GetAllAsync()).Where(h => h.PoiId == poi.Id).ToList();
            foreach (var existing in existingSchedule) await _workingHourRepository.DeleteAsync(existing.Id);
            foreach (var row in scheduleRows)
            {
                row.PoiId = poi.Id;
                await _workingHourRepository.AddAsync(row);
            }
            poi.WorkingHours = BuildScheduleSummary(scheduleRows);
        }
        if (exceptionRows != null)
        {
            var existingExceptions = (await _scheduleExceptionRepository.GetAllAsync()).Where(e => e.PoiId == poi.Id).ToList();
            foreach (var existing in existingExceptions) await _scheduleExceptionRepository.DeleteAsync(existing.Id);
            foreach (var row in exceptionRows)
            {
                row.PoiId = poi.Id;
                await _scheduleExceptionRepository.AddAsync(row);
            }
        }
        await _repository.SaveChangesAsync();

        var categories = (await _categoryRepository.GetAllAsync()).ToDictionary(c => c.Id, c => c);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var maps = (await _mapRepository.GetAllAsync()).ToDictionary(m => m.Id, m => m.Name);
        var schedules = await GetScheduleLookupAsync([poi.Id]);
        var exceptions = await GetScheduleExceptionLookupAsync([poi.Id]);
        await _auditLogService.LogAsync(actorUsername, "poi.update", $"'{poi.Name}' POI'si güncellendi.");
        return (true, ToDto(poi, categories, users, maps, schedules, exceptions), null);
    }

    public async Task<(bool Success, PoiDto? Result, string? Error)> AssignMapAsync(int id, int mapId, string actorUsername)
    {
        var poi = await _repository.GetByIdAsync(id);
        if (poi == null || poi.IsDeleted) return (false, null, "POI bulunamadı.");
        var map = await _mapRepository.GetByIdAsync(mapId);
        if (map == null || map.IsDeleted) return (false, null, "Seçilen harita bulunamadı.");
        poi.MapId = mapId;
        await _repository.SaveChangesAsync();

        var categories = (await _categoryRepository.GetAllAsync()).ToDictionary(c => c.Id, c => c);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var maps = (await _mapRepository.GetAllAsync()).ToDictionary(m => m.Id, m => m.Name);
        var schedules = await GetScheduleLookupAsync([poi.Id]);
        var exceptions = await GetScheduleExceptionLookupAsync([poi.Id]);
        await _auditLogService.LogAsync(actorUsername, "poi.assign-map", $"'{poi.Name}' POI'si '{map.Name}' haritasına atandı.");
        return (true, ToDto(poi, categories, users, maps, schedules, exceptions), null);
    }

    public async Task<(bool Success, PoiDto? Result, string? Error)> SetActiveAsync(int id, bool isActive, string actorUsername)
    {
        var poi = await _repository.GetByIdAsync(id);
        if (poi == null || poi.IsDeleted) return (false, null, "POI bulunamadı.");
        poi.IsActive = isActive;
        await _repository.SaveChangesAsync();

        var categories = (await _categoryRepository.GetAllAsync()).ToDictionary(c => c.Id, c => c);
        var users = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var maps = (await _mapRepository.GetAllAsync()).ToDictionary(m => m.Id, m => m.Name);
        var schedules = await GetScheduleLookupAsync([poi.Id]);
        var exceptions = await GetScheduleExceptionLookupAsync([poi.Id]);
        await _auditLogService.LogAsync(actorUsername, isActive ? "poi.resume" : "poi.pause", $"'{poi.Name}' POI'si {(isActive ? "devam ettirildi" : "duraklatıldı")}.");
        return (true, ToDto(poi, categories, users, maps, schedules, exceptions), null);
    }

    public async Task<(bool Success, string? Error)> DeleteAsync(int id)
    {
        var poi = await _repository.GetByIdAsync(id);
        if (poi == null || poi.IsDeleted)
        {
            return (false, "POI bulunamadı.");
        }

        // Diğer nokta/çizgi/alan tablolarıyla AYNI kural: gerçek silme yok, is_deleted=true.
        poi.IsDeleted = true;
        await _repository.SaveChangesAsync();
        return (true, null);
    }

    private static PoiDto ToDto(
        Poi p,
        Dictionary<int, PoiCategory> categories,
        Dictionary<int, string> users,
        Dictionary<int, string> maps,
        Dictionary<int, List<PoiWorkingHour>> schedules,
        Dictionary<int, List<PoiScheduleException>> exceptions) => new()
    {
        Id = p.Id,
        Wkt = WktWriter.Write(p.Geometry),
        Name = p.Name,
        CategoryId = p.CategoryId,
        CategoryName = p.CategoryId != null && categories.TryGetValue(p.CategoryId.Value, out var category) ? category.Name : null,
        WorkingHours = p.WorkingHours,
        Note = p.Note,
        Province = p.Province,
        District = p.District,
        IsActive = p.IsActive,
        CreatedDate = p.CreatedDate,
        UserId = p.UserId,
        AddedByUsername = p.UserId != null && users.TryGetValue(p.UserId.Value, out var userName) ? userName : null,
        MapId = p.MapId,
        MapName = p.MapId != null && maps.TryGetValue(p.MapId.Value, out var mapName) ? mapName : null,
        // Kullanıcının kendi isteği: POI'nin kendi ikonu > kategorisinin ikonu > "📍"
        // varsayılanı. Bu düşüş burada tek yerde hesaplanır, frontend tekrar etmez.
        Icon = p.Icon,
        EffectiveIcon = !string.IsNullOrWhiteSpace(p.Icon)
            ? p.Icon
            : (p.CategoryId != null && categories.TryGetValue(p.CategoryId.Value, out var catForIcon) && !string.IsNullOrWhiteSpace(catForIcon.Icon))
                ? catForIcon.Icon!
                : "📍",
        Schedule = schedules.TryGetValue(p.Id, out var rows)
            ? rows.OrderBy(h => h.DayOfWeek).Select(ToWorkingHourDto).ToList()
            : [],
        ScheduleExceptions = exceptions.TryGetValue(p.Id, out var exceptionRows)
            ? exceptionRows.OrderBy(e => e.Date).Select(ToScheduleExceptionDto).ToList()
            : [],
    };

    private async Task<Dictionary<int, List<PoiWorkingHour>>> GetScheduleLookupAsync(IEnumerable<int> poiIds)
    {
        var ids = poiIds.ToHashSet();
        return (await _workingHourRepository.GetAllAsync())
            .Where(h => ids.Contains(h.PoiId))
            .GroupBy(h => h.PoiId)
            .ToDictionary(group => group.Key, group => group.OrderBy(h => h.DayOfWeek).ToList());
    }

    private async Task<Dictionary<int, List<PoiScheduleException>>> GetScheduleExceptionLookupAsync(IEnumerable<int> poiIds)
    {
        var ids = poiIds.ToHashSet();
        return (await _scheduleExceptionRepository.GetAllAsync())
            .Where(e => ids.Contains(e.PoiId))
            .GroupBy(e => e.PoiId)
            .ToDictionary(group => group.Key, group => group.OrderBy(e => e.Date).ToList());
    }

    private static PoiWorkingHourDto ToWorkingHourDto(PoiWorkingHour row) => new()
    {
        DayOfWeek = row.DayOfWeek,
        IsOpen = row.IsOpen,
        Is24Hours = row.Is24Hours,
        StartTime = row.StartTime?.ToString("HH:mm"),
        EndTime = row.EndTime?.ToString("HH:mm"),
    };

    private static PoiScheduleExceptionDto ToScheduleExceptionDto(PoiScheduleException row) => new()
    {
        Date = row.Date.ToString("yyyy-MM-dd"),
        RepeatsAnnually = row.RepeatsAnnually,
        IsOpen = row.IsOpen,
        Is24Hours = row.Is24Hours,
        StartTime = row.StartTime?.ToString("HH:mm"),
        EndTime = row.EndTime?.ToString("HH:mm"),
        Note = row.Note,
    };

    private static (List<PoiWorkingHour>? Rows, string? Error) ParseSchedule(IReadOnlyList<PoiWorkingHourDto>? schedule)
    {
        if (schedule == null) return (null, null);
        if (schedule.Count != 7 || schedule.Select(s => s.DayOfWeek).Distinct().Count() != 7 || schedule.Any(s => s.DayOfWeek is < 0 or > 6))
            return (null, "Çalışma saatleri haftanın yedi gününü birer kez içermelidir.");

        var rows = new List<PoiWorkingHour>();
        foreach (var item in schedule.OrderBy(s => s.DayOfWeek))
        {
            TimeOnly? start = null;
            TimeOnly? end = null;
            if (item.IsOpen && !item.Is24Hours)
            {
                if (!TimeOnly.TryParseExact(item.StartTime, "HH:mm", out var parsedStart)
                    || !TimeOnly.TryParseExact(item.EndTime, "HH:mm", out var parsedEnd))
                    return (null, "Açık günlerin başlangıç ve bitiş saati HH:mm biçiminde olmalıdır.");
                start = parsedStart;
                end = parsedEnd;
            }
            rows.Add(new PoiWorkingHour
            {
                DayOfWeek = item.DayOfWeek,
                IsOpen = item.IsOpen,
                Is24Hours = item.IsOpen && item.Is24Hours,
                StartTime = start,
                EndTime = end,
            });
        }
        return (rows, null);
    }

    private static (List<PoiScheduleException>? Rows, string? Error) ParseScheduleExceptions(IReadOnlyList<PoiScheduleExceptionDto>? exceptions)
    {
        if (exceptions == null) return (null, null);
        if (exceptions.Count > 100) return (null, "Bir POI için en fazla 100 özel gün tanımlanabilir.");

        var rows = new List<PoiScheduleException>();
        var unique = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in exceptions)
        {
            if (!DateOnly.TryParseExact(item.Date, "yyyy-MM-dd", out var date))
                return (null, "Özel gün tarihi yyyy-MM-dd biçiminde olmalıdır.");
            if (item.RepeatsAnnually)
                date = new DateOnly(2000, date.Month, date.Day);
            var key = item.RepeatsAnnually ? $"annual:{date:MM-dd}" : $"once:{date:yyyy-MM-dd}";
            if (!unique.Add(key)) return (null, "Aynı özel gün birden fazla kez eklenemez.");
            if (item.Note?.Trim().Length > 200) return (null, "Özel gün açıklaması en fazla 200 karakter olabilir.");

            TimeOnly? start = null;
            TimeOnly? end = null;
            if (item.IsOpen && !item.Is24Hours)
            {
                if (!TimeOnly.TryParseExact(item.StartTime, "HH:mm", out var parsedStart)
                    || !TimeOnly.TryParseExact(item.EndTime, "HH:mm", out var parsedEnd))
                    return (null, "Açık özel günlerin başlangıç ve bitiş saati HH:mm biçiminde olmalıdır.");
                start = parsedStart;
                end = parsedEnd;
            }

            rows.Add(new PoiScheduleException
            {
                Date = date,
                RepeatsAnnually = item.RepeatsAnnually,
                IsOpen = item.IsOpen,
                Is24Hours = item.IsOpen && item.Is24Hours,
                StartTime = start,
                EndTime = end,
                Note = CleanOptional(item.Note),
            });
        }
        return (rows, null);
    }

    private static string BuildScheduleSummary(IEnumerable<PoiWorkingHour> rows)
    {
        string[] names = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
        return string.Join(" · ", rows.OrderBy(r => r.DayOfWeek).Select(row =>
            !row.IsOpen ? $"{names[row.DayOfWeek]} kapalı"
            : row.Is24Hours ? $"{names[row.DayOfWeek]} 24 saat"
            : $"{names[row.DayOfWeek]} {row.StartTime:HH\\:mm}-{row.EndTime:HH\\:mm}"));
    }

    private static string? CleanOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? ValidateOptionalFields(string? note, string? province, string? district, string? icon = null)
    {
        if (note?.Trim().Length > 2000) return "POI notu en fazla 2000 karakter olabilir.";
        if (province?.Trim().Length > 120) return "İl adı en fazla 120 karakter olabilir.";
        if (district?.Trim().Length > 120) return "İlçe adı en fazla 120 karakter olabilir.";
        if (icon?.Trim().Length > 16) return "İkon en fazla 16 karakter olabilir.";
        return null;
    }
}

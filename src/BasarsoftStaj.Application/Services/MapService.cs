using System.Text.RegularExpressions;
using NetTopologySuite.Geometries;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class MapService : IMapService
{
    private readonly IRepository<Map> _mapRepository;
    private readonly IRepository<TblPoint> _pointRepository;
    private readonly IRepository<TblLine> _lineRepository;
    private readonly IRepository<TblPolygon> _polygonRepository;
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IAuditLogService _auditLogService;
    private readonly IMapShareService _mapShareService;

    public MapService(
        IRepository<Map> mapRepository,
        IRepository<TblPoint> pointRepository,
        IRepository<TblLine> lineRepository,
        IRepository<TblPolygon> polygonRepository,
        IRepository<User> userRepository,
        IRepository<Role> roleRepository,
        IAuditLogService auditLogService,
        IMapShareService mapShareService)
    {
        _mapRepository = mapRepository;
        _pointRepository = pointRepository;
        _lineRepository = lineRepository;
        _polygonRepository = polygonRepository;
        _userRepository = userRepository;
        _roleRepository = roleRepository;
        _auditLogService = auditLogService;
        _mapShareService = mapShareService;
    }

    public async Task<IEnumerable<MapDto>> GetMyMapsAsync(int userId)
    {
        // Migration SADECE o an var olan kullanıcılara varsayılan harita açtı — sonradan
        // kayıt olmuş (ya da her nasılsa hiç haritası olmayan) bir kullanıcı için GetAllAsync
        // boş dönerdi, frontend'in "aktif harita" hiç netleşmez ve yükleme ekranında
        // SONSUZA KADAR takılı kalırdı. Listelemeden önce en az bir harita garantiye alınıyor.
        await GetOrCreateDefaultMapIdAsync(userId);

        // Kullanıcının kendi isteği (harita şeridi polish turu): "varsayılan her zaman en
        // üstte olsun" — Görev #77'de bilinçli olarak "varsayılan sürüklenip aşağı da
        // alınabilir" denemiştik, kullanıcı bunun kafa karıştırdığını belirtip varsayılanın
        // SABİT üstte olmasını istedi. Artık IsDefault > IsFavorite > SortOrder > CreatedDate —
        // frontend de varsayılan haritayı sürükle-bırak havuzunun dışında tutuyor (bkz.
        // MapPage.jsx, canReorder/onDragOver), yani bu sıralama asla bozulmayacak şekilde
        // garanti ediliyor.
        var maps = await _mapRepository.GetAllAsync();
        var mine = maps.Where(m => m.OwnerUserId == userId && !m.IsDeleted)
            .OrderByDescending(m => m.IsDefault)
            .ThenByDescending(m => m.IsFavorite)
            .ThenBy(m => m.SortOrder)
            .ThenBy(m => m.CreatedDate)
            .ToList();

        var shareCounts = await _mapShareService.GetShareCountsForOwnerAsync(userId);

        var result = new List<MapDto>();
        foreach (var map in mine)
        {
            var (total, active) = shareCounts.GetValueOrDefault(map.Id, (0, 0));
            result.Add(ToDto(map, await CountGeometriesForMapAsync(map.Id), total, active));
        }
        return result;
    }

    public async Task<(bool Success, MapDto? Result, string? Error)> CreateAsync(int userId, CreateMapDto dto, string actorUsername)
    {
        var trimmed = (dto.Name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return (false, null, "Harita adı boş olamaz.");
        }

        var map = new Map { Name = trimmed, Description = NormalizeDescription(dto.Description), OwnerUserId = userId, IsDefault = false };
        await _mapRepository.AddAsync(map);
        await _mapRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "map.create", $"'{map.Name}' haritası oluşturuldu.");
        return (true, ToDto(map, 0, 0, 0), null);
    }

    private static string? NormalizeDescription(string? description) =>
        string.IsNullOrWhiteSpace(description) ? null : description.Trim();

    // "Rename" ismi kalıyor (frontend/route ile tutarlı) ama artık açıklamayı da günceller —
    // kullanıcının kendi isteği: harita ayarları panelinde ad + açıklama birlikte düzenlenir.
    public async Task<(bool Success, string? Error)> RenameAsync(int userId, int mapId, CreateMapDto dto, string actorUsername)
    {
        var trimmed = (dto.Name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return (false, "Harita adı boş olamaz.");
        }

        var map = await _mapRepository.GetByIdAsync(mapId);
        if (map == null || map.OwnerUserId != userId || map.IsDeleted)
        {
            return (false, "Harita bulunamadı.");
        }

        var oldName = map.Name;
        map.Name = trimmed;
        map.Description = NormalizeDescription(dto.Description);
        // Kullanıcının kendi isteği: "son değiştirme tarihi ve saati yazsın" — ad/açıklama
        // düzenlemesi de bir "içerik değişikliği" sayılıyor (favorileme/sıralama/varsayılan
        // yapma SAYILMIYOR — bkz. SetFavoriteAsync/ReorderAsync/SetDefaultAsync, orada
        // ModifiedDate bilinçli olarak DOKUNULMUYOR).
        map.ModifiedDate = DateTime.UtcNow;
        await _mapRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "map.rename", $"'{oldName}' haritası '{map.Name}' olarak yeniden adlandırıldı.");
        return (true, null);
    }

    public async Task<(bool Success, MapDto? Result, string? Error)> DuplicateAsync(int userId, int sourceMapId, string actorUsername)
    {
        var source = await _mapRepository.GetByIdAsync(sourceMapId);
        if (source == null || source.OwnerUserId != userId || source.IsDeleted)
        {
            return (false, null, "Harita bulunamadı.");
        }

        var existingNames = (await _mapRepository.GetAllAsync())
            .Where(m => m.OwnerUserId == userId && !m.IsDeleted)
            .Select(m => m.Name)
            .ToHashSet();
        var newName = NextCopyName(source.Name, existingNames);

        var newMap = new Map { Name = newName, Description = source.Description, OwnerUserId = userId, IsDefault = false };
        await _mapRepository.AddAsync(newMap);
        await _mapRepository.SaveChangesAsync();

        var copiedCount = await CopyGeometriesAsync<TblPoint, Point>(_pointRepository, sourceMapId, newMap.Id, userId)
                         + await CopyGeometriesAsync<TblLine, LineString>(_lineRepository, sourceMapId, newMap.Id, userId)
                         + await CopyGeometriesAsync<TblPolygon, Polygon>(_polygonRepository, sourceMapId, newMap.Id, userId);

        await _auditLogService.LogAsync(actorUsername, "map.duplicate", $"'{source.Name}' haritası '{newMap.Name}' olarak çoğaltıldı ({copiedCount} çizim).");
        return (true, ToDto(newMap, copiedCount, 0, 0), null);
    }

    // Kaynak haritadaki (silinmemiş) tüm çizimleri yeni haritaya kopyalar. Geometry
    // nesnesini .Copy() ile klonluyoruz — aynı NTS Geometry referansını iki ayrı entity'ye
    // vermek EF Core'un değişiklik takibinde beklenmedik paylaşıma yol açabilirdi.
    private static async Task<int> CopyGeometriesAsync<TEntity, TGeometry>(
        IRepository<TEntity> repository, int sourceMapId, int newMapId, int userId)
        where TEntity : class, IGeometryFeature<TGeometry>, new()
        where TGeometry : Geometry
    {
        var items = await repository.GetAllAsync();
        var toCopy = items.Where(i => !i.IsDeleted && i.MapId == sourceMapId).ToList();

        foreach (var item in toCopy)
        {
            var clone = new TEntity
            {
                Geometry = (TGeometry)item.Geometry.Copy(),
                Place = item.Place,
                Province = item.Province,
                Name = item.Name,
                Color = item.Color,
                CategoryId = item.CategoryId,
                InsertedUserId = userId,
                MapId = newMapId,
            };
            await repository.AddAsync(clone);
        }

        if (toCopy.Count > 0)
        {
            await repository.SaveChangesAsync();
        }
        return toCopy.Count;
    }

    // Görev #75 (kullanıcının kendi isteği: "harita silme geri getirme gelsin, is_delete
    // gibi olsun o da"): eskiden burada kalıcı DeleteAsync (hard delete) çağrılıyordu.
    // Artık geometrilerdeki (tbl_point/tbl_line/tbl_polygon) IsDeleted deseninin AYNISI —
    // sadece IsDeleted=true + DeletedDate damgası, satır DB'de duruyor. Geometriler zaten
    // DB'deki FK (SetNull) sayesinde kalıcı silinmiyordu, bu davranış değişmedi.
    public async Task<(bool Success, string? Error)> DeleteAsync(int userId, int mapId, string actorUsername)
    {
        var map = await _mapRepository.GetByIdAsync(mapId);
        if (map == null || map.OwnerUserId != userId || map.IsDeleted)
        {
            return (false, "Harita bulunamadı.");
        }

        var myMaps = (await _mapRepository.GetAllAsync()).Where(m => m.OwnerUserId == userId && !m.IsDeleted).ToList();
        if (myMaps.Count <= 1)
        {
            return (false, "Son haritanı silemezsin — en az bir haritan olmalı.");
        }

        // Silinen harita varsayılansa, kalanlardan en eskisini yeni varsayılan yap —
        // yoksa ResolveMapIdAsync bir sonraki çağrıda gereksiz yeni bir "Haritam" açar.
        if (map.IsDefault)
        {
            var newDefault = myMaps.Where(m => m.Id != mapId).OrderBy(m => m.CreatedDate).First();
            newDefault.IsDefault = true;
        }

        map.IsDeleted = true;
        map.DeletedDate = DateTime.UtcNow;
        // Silinen bir harita bir daha kimsenin varsayılanı OLMASIN — geri getirilse bile
        // eski "varsayılan" statüsü otomatik dönmesin, kullanıcı isterse elle yeniden ayarlar.
        map.IsDefault = false;
        await _mapRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "map.delete", $"'{map.Name}' haritası çöp kutusuna taşındı.", mapId);
        return (true, null);
    }

    // Görev #75: sahibin çöp kutusundaki (IsDeleted=true) kendi haritalarını listelemesi —
    // geometri Trash'i (TrashController) admin-only'ydi, bu FARKLI: her kullanıcı sadece
    // KENDİ silinen haritalarını görüp geri getirebiliyor (admin yetkisi gerekmiyor).
    public async Task<IEnumerable<MapDto>> GetDeletedMapsAsync(int userId)
    {
        var maps = await _mapRepository.GetAllAsync();
        var deleted = maps.Where(m => m.OwnerUserId == userId && m.IsDeleted)
            .OrderByDescending(m => m.DeletedDate)
            .ToList();

        var result = new List<MapDto>();
        foreach (var map in deleted)
        {
            // Çöp kutusundaki bir harita için paylaşım sayısının bir anlamı yok (görünür
            // değil zaten) — hesaplamaya değmez, sabit (0,0) geçiyoruz.
            result.Add(ToDto(map, await CountGeometriesForMapAsync(map.Id), 0, 0));
        }
        return result;
    }

    public async Task<(bool Success, string? Error)> RestoreAsync(int userId, int mapId, string actorUsername)
    {
        var map = await _mapRepository.GetByIdAsync(mapId);
        if (map == null || map.OwnerUserId != userId || !map.IsDeleted)
        {
            return (false, "Çöp kutusunda böyle bir harita bulunamadı.");
        }

        map.IsDeleted = false;
        map.DeletedDate = null;
        await _mapRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "map.restore", $"'{map.Name}' haritası çöp kutusundan geri getirildi.", mapId);
        return (true, null);
    }

    // Sadece zaten çöp kutusunda olan (IsDeleted=true) bir harita kalıcı silinebilir —
    // geometri Trash'indeki AYNI "önce çöp kutusuna at, sonra istenirse boşalt" garantisi.
    public async Task<(bool Success, string? Error)> PermanentDeleteAsync(int userId, int mapId, string actorUsername)
    {
        var map = await _mapRepository.GetByIdAsync(mapId);
        if (map == null || map.OwnerUserId != userId || !map.IsDeleted)
        {
            return (false, "Çöp kutusunda böyle bir harita bulunamadı.");
        }

        await _mapRepository.DeleteAsync(mapId);
        await _mapRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "map.permanent_delete", $"'{map.Name}' haritası kalıcı olarak silindi.");
        return (true, null);
    }

    public async Task<int> GetOrCreateDefaultMapIdAsync(int userId)
    {
        var maps = await _mapRepository.GetAllAsync();
        var existingDefault = maps.FirstOrDefault(m => m.OwnerUserId == userId && m.IsDefault && !m.IsDeleted);
        if (existingDefault != null)
        {
            return existingDefault.Id;
        }

        // Kullanıcının hâlâ silinmemiş bir haritası varsa (ör. eski varsayılanı çöp
        // kutusuna attı ama DeleteAsync'in "yeni varsayılan seç" mantığı bir sebepten
        // atlanmışsa) yeni bir "Haritam" açmadan ONA geçiyoruz — gereksiz harita çoğalmasın.
        var anyActive = maps.FirstOrDefault(m => m.OwnerUserId == userId && !m.IsDeleted);
        if (anyActive != null)
        {
            anyActive.IsDefault = true;
            await _mapRepository.SaveChangesAsync();
            return anyActive.Id;
        }

        var map = new Map { Name = "Haritam", OwnerUserId = userId, IsDefault = true };
        await _mapRepository.AddAsync(map);
        await _mapRepository.SaveChangesAsync();
        return map.Id;
    }

    // Kullanıcının kendi isteği: "adminler herkesin haritasını görebilecek." Diğer
    // GetXxxMapsAsync metotlarının aksine sahiplik filtresi YOK — bilerek: bu metot sadece
    // MapController'daki ManageAdmin-only uç noktadan çağrılıyor (bkz. o dosyadaki yorum).
    public async Task<IEnumerable<MapDto>> GetAllForAdminAsync()
    {
        var allUsers = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u);
        var users = allUsers.ToDictionary(kv => kv.Key, kv => kv.Value.Username);
        // FAZ 3 (kullanıcının kendi isteği): "rolü de göster/filtrele" — PoiController.
        // GetMapOptionsForAdmin'in username çözümlemesiyle AYNI desen, sadece rol de eklendi.
        var roles = (await _roleRepository.GetAllAsync()).ToDictionary(r => r.Id, r => r);
        var maps = (await _mapRepository.GetAllAsync())
            .Where(m => !m.IsDeleted)
            .OrderBy(m => m.Name)
            .ToList();

        var result = new List<MapDto>();
        foreach (var map in maps)
        {
            var dto = ToDto(map, await CountGeometriesForMapAsync(map.Id), 0, 0);
            dto.OwnerUsername = users.TryGetValue(map.OwnerUserId, out var username) ? username : "Bilinmiyor";
            if (allUsers.TryGetValue(map.OwnerUserId, out var owner) && roles.TryGetValue(owner.RoleId, out var role))
            {
                dto.OwnerRole = role.Name;
                dto.OwnerRoleColor = role.Color;
            }
            result.Add(dto);
        }
        return result;
    }

    public async Task<bool> IsOwnerAsync(int mapId, int userId)
    {
        var map = await _mapRepository.GetByIdAsync(mapId);
        return map != null && map.OwnerUserId == userId && !map.IsDeleted;
    }

    private async Task<int> CountGeometriesForMapAsync(int mapId)
    {
        var pointCount = (await _pointRepository.GetAllAsync()).Count(i => !i.IsDeleted && i.MapId == mapId);
        var lineCount = (await _lineRepository.GetAllAsync()).Count(i => !i.IsDeleted && i.MapId == mapId);
        var polygonCount = (await _polygonRepository.GetAllAsync()).Count(i => !i.IsDeleted && i.MapId == mapId);
        return pointCount + lineCount + polygonCount;
    }

    // "Haritam" -> "Haritam (1)", eğer o da doluysa "Haritam (2)"... Kaynak isim zaten
    // " (N)" ile bitiyorsa önce onu temizleyip yeniden numaralandırıyoruz — üst üste
    // çoğaltmalarda "Harita (1) (1) (1)" gibi katlanan bir isim üretilmesin diye.
    private static string NextCopyName(string sourceName, HashSet<string> existingNames)
    {
        var baseName = Regex.Replace(sourceName, @"\s\(\d+\)$", string.Empty);
        var n = 1;
        string candidate;
        do
        {
            candidate = $"{baseName} ({n})";
            n++;
        } while (existingNames.Contains(candidate));
        return candidate;
    }

    private static MapDto ToDto(Map map, int geometryCount, int shareCount, int activeShareCount) => new()
    {
        Id = map.Id,
        Name = map.Name,
        Description = map.Description,
        IsDefault = map.IsDefault,
        CreatedDate = map.CreatedDate,
        ModifiedDate = map.ModifiedDate,
        GeometryCount = geometryCount,
        DeletedDate = map.DeletedDate,
        IsFavorite = map.IsFavorite,
        SortOrder = map.SortOrder,
        ShareCount = shareCount,
        ActiveShareCount = activeShareCount,
    };

    public async Task<(bool Success, string? Error)> SetFavoriteAsync(int userId, int mapId, bool isFavorite)
    {
        var map = await _mapRepository.GetByIdAsync(mapId);
        if (map == null || map.OwnerUserId != userId || map.IsDeleted)
        {
            return (false, "Harita bulunamadı.");
        }

        map.IsFavorite = isFavorite;
        await _mapRepository.SaveChangesAsync();
        return (true, null);
    }

    // Kullanıcının kendi isteği: "ayarlardan istediğim mapi varsayılan yapabilmeliyim
    // otomatik onunla açılır fln" — GetMyMapsAsync'in sıralaması (IsDefault > IsFavorite
    // > ...) ve fetchMaps'in "aktif harita netleşmemişse varsayılana düş" mantığı zaten
    // buna göre çalışıyordu, sadece bunu ELLE TETİKLEYECEK bir uç eksikti. Aynı anda BENİM
    // sadece TEK bir varsayılanım olabilir — bu yüzden önce eski varsayılanı(mı) kapatıp
    // sonra seçileni açıyoruz (tek SaveChanges'te, yarım kalırsa hiçbiri yazılmaz).
    public async Task<(bool Success, string? Error)> SetDefaultAsync(int userId, int mapId)
    {
        var map = await _mapRepository.GetByIdAsync(mapId);
        if (map == null || map.OwnerUserId != userId || map.IsDeleted)
        {
            return (false, "Harita bulunamadı.");
        }

        if (map.IsDefault) return (true, null); // zaten varsayılan — no-op, hızlı çift tıklamaya karşı da zararsız

        var maps = await _mapRepository.GetAllAsync();
        var previousDefault = maps.FirstOrDefault(m => m.OwnerUserId == userId && m.IsDefault && !m.IsDeleted && m.Id != mapId);
        if (previousDefault != null) previousDefault.IsDefault = false;

        map.IsDefault = true;
        await _mapRepository.SaveChangesAsync();
        return (true, null);
    }

    // Görev #77: sürükle-bırakla belirlenen YENİ sırayı kaydeder — frontend, kullanıcının
    // sürükleyip bıraktığı haldeki TÜM harita id'lerini bu sırada gönderiyor, biz de o
    // sırayı 0'dan başlayan SortOrder değerlerine çeviriyoruz. Sadece BENİM haritalarım
    // (ve silinmemiş olanlar) etkileniyor — listede olmayan/başkasına ait id'ler yoksayılır.
    public async Task<(bool Success, string? Error)> ReorderAsync(int userId, List<int> orderedMapIds)
    {
        if (orderedMapIds == null || orderedMapIds.Count == 0)
        {
            return (false, "Sıralama listesi boş olamaz.");
        }

        var myMaps = (await _mapRepository.GetAllAsync())
            .Where(m => m.OwnerUserId == userId && !m.IsDeleted)
            .ToDictionary(m => m.Id, m => m);

        var order = 0;
        foreach (var id in orderedMapIds)
        {
            if (myMaps.TryGetValue(id, out var map))
            {
                map.SortOrder = order;
                order++;
            }
        }
        await _mapRepository.SaveChangesAsync();
        return (true, null);
    }
}

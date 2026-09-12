using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class MapShareService : IMapShareService
{
    private readonly IRepository<MapShare> _shareRepository;
    private readonly IRepository<Map> _mapRepository;
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IAuditLogService _auditLogService;

    public MapShareService(
        IRepository<MapShare> shareRepository,
        IRepository<Map> mapRepository,
        IRepository<User> userRepository,
        IRepository<Role> roleRepository,
        IAuditLogService auditLogService)
    {
        _shareRepository = shareRepository;
        _mapRepository = mapRepository;
        _userRepository = userRepository;
        _roleRepository = roleRepository;
        _auditLogService = auditLogService;
    }

    public async Task<IEnumerable<MapShareDto>> GetSharesForMapAsync(int mapId, int ownerUserId)
    {
        var map = await _mapRepository.GetByIdAsync(mapId);
        if (map == null || map.OwnerUserId != ownerUserId)
        {
            return Enumerable.Empty<MapShareDto>();
        }

        var shares = (await _shareRepository.GetAllAsync())
            .Where(s => s.MapId == mapId)
            .OrderByDescending(s => s.InvitedDate)
            .ToList();
        if (shares.Count == 0) return Enumerable.Empty<MapShareDto>();

        var usernameById = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var roles = (await _roleRepository.GetAllAsync()).ToList();
        var roleById = roles.ToDictionary(r => r.Id, r => r);
        // Faz 3.2: rol satırlarındaki "bu role kaç kişi dahil" bilgisi için — sadece
        // burada gösterilen rollerin sayımını hesaplıyoruz, tüm sistemi değil.
        var users = (await _userRepository.GetAllAsync()).Where(u => !u.IsDeleted).ToList();
        var userCountByRoleId = users.GroupBy(u => u.RoleId).ToDictionary(g => g.Key, g => g.Count());

        return shares.Select(s => ToDto(s, usernameById, roleById, userCountByRoleId)).ToList();
    }

    // Kullanıcının kendi isteği (harita şeridi polish turu): "kaç kişiyle paylaşıldığı
    // haritanın yanında yazsın, aktif kaç kişi var görelim". Rol paylaşımları roleUserCount
    // kadar kişiye sayılıyor — GetSharesForMapAsync'teki "{roleUserCount} kişi" gösterimiyle
    // AYNI mantık, tutarlı olsun diye.
    public async Task<Dictionary<int, (int Total, int Active)>> GetShareCountsForOwnerAsync(int ownerUserId)
    {
        var myMapIds = (await _mapRepository.GetAllAsync())
            .Where(m => m.OwnerUserId == ownerUserId && !m.IsDeleted)
            .Select(m => m.Id)
            .ToHashSet();
        if (myMapIds.Count == 0) return new Dictionary<int, (int, int)>();

        var shares = (await _shareRepository.GetAllAsync())
            .Where(s => myMapIds.Contains(s.MapId) && s.Status != MapShareStatus.Declined && s.Status != MapShareStatus.Removed)
            .ToList();
        if (shares.Count == 0) return new Dictionary<int, (int, int)>();

        var userCountByRoleId = (await _userRepository.GetAllAsync())
            .Where(u => !u.IsDeleted)
            .GroupBy(u => u.RoleId)
            .ToDictionary(g => g.Key, g => g.Count());

        int PeopleReach(MapShare s) => s.RoleId != null ? userCountByRoleId.GetValueOrDefault(s.RoleId.Value, 0) : 1;

        var result = new Dictionary<int, (int Total, int Active)>();
        foreach (var group in shares.GroupBy(s => s.MapId))
        {
            var total = group.Sum(PeopleReach);
            var active = group.Where(s => s.Status == MapShareStatus.Accepted && s.CanView).Sum(PeopleReach);
            result[group.Key] = (total, active);
        }
        return result;
    }

    public async Task<IEnumerable<SharedMapDto>> GetSharedWithMeAsync(int userId)
    {
        var me = await _userRepository.GetByIdAsync(userId);
        var myRoleId = me?.RoleId;

        var shares = (await _shareRepository.GetAllAsync())
            .Where(s =>
                (s.InvitedUserId == userId && (s.Status == MapShareStatus.Pending || s.Status == MapShareStatus.Accepted)) ||
                // Faz 3.2: rolüme paylaşılmış haritalar da "Benimle Paylaşılanlar"da görünsün —
                // rol paylaşımlarında Pending yok, hep Accepted (bkz. ShareWithRoleAsync).
                (myRoleId != null && s.RoleId == myRoleId && s.Status == MapShareStatus.Accepted))
            .OrderByDescending(s => s.InvitedDate)
            .ToList();
        if (shares.Count == 0) return Enumerable.Empty<SharedMapDto>();

        var mapById = (await _mapRepository.GetAllAsync()).ToDictionary(m => m.Id, m => m);
        var usernameById = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
        var roleById = (await _roleRepository.GetAllAsync()).ToDictionary(r => r.Id, r => r);

        var result = new List<SharedMapDto>();
        foreach (var s in shares)
        {
            // Harita silinmiş olabilir (bkz. MapService.DeleteAsync, Görev #75'ten sonra
            // artık soft-delete/IsDeleted) — o davetleri atla.
            if (!mapById.TryGetValue(s.MapId, out var map) || map.IsDeleted) continue;
            result.Add(new SharedMapDto
            {
                ShareId = s.Id,
                MapId = s.MapId,
                MapName = map.Name,
                OwnerUsername = usernameById.TryGetValue(map.OwnerUserId, out var ownerName) ? ownerName : "?",
                Status = s.Status,
                InvitedDate = s.InvitedDate,
                RespondedDate = s.RespondedDate,
                // Faz 3.2: rol üzerinden erişimin geldiğini belirtmek için — frontend
                // "X rolü üzerinden" gibi bir ipucu gösterebilsin.
                ViaRoleName = s.RoleId != null && roleById.TryGetValue(s.RoleId.Value, out var viaRole) ? viaRole.Name : null,
                // BUG FİX: eskiden hiç doldurulmuyordu, "Duraklatıldı" rozeti sessizce
                // hiçbir zaman görünmüyordu (bkz. DTO'daki yorum).
                CanView = s.CanView,
                // Görev #77: davetlinin kendi tercihleri.
                IsFavorite = s.RecipientIsFavorite,
                IsArchived = s.RecipientIsArchived,
                Note = s.RecipientNote,
            });
        }
        return result;
    }

    public async Task<(bool Success, MapShareDto? Result, string? Error)> InviteAsync(int mapId, int ownerUserId, string invitedUsername, string actorUsername)
    {
        var map = await _mapRepository.GetByIdAsync(mapId);
        if (map == null || map.OwnerUserId != ownerUserId)
        {
            return (false, null, "Harita bulunamadı.");
        }

        var trimmed = (invitedUsername ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return (false, null, "Kullanıcı adı boş olamaz.");
        }

        var users = await _userRepository.GetAllAsync();
        var target = users.FirstOrDefault(u => !u.IsDeleted && u.Username.Equals(trimmed, StringComparison.OrdinalIgnoreCase));
        if (target == null)
        {
            return (false, null, "Böyle bir kullanıcı bulunamadı.");
        }
        if (target.Id == ownerUserId)
        {
            return (false, null, "Haritayı kendinle paylaşamazsın.");
        }

        // Görev #68 (kullanıcının kendi isteği: "hem role hem de o roldeki kişiye bireysel
        // istek gelmesi durumu önemli hata vermeli"): hedef kullanıcı zaten KENDİ ROLÜ
        // üzerinden bu haritaya erişebiliyorsa, ayrıca bireysel davet göndermek KAFA
        // KARIŞTIRICI/ÇAKIŞIK olur (iki farklı izin seti aynı kişi için geçerli olabilir gibi
        // görünür, oysa GetShareForUserAsync kişisel olanı önceliklendirir — bu gizli/şaşırtıcı
        // bir davranış, o yüzden en baştan reddediyoruz).
        var roleShareForTarget = (await _shareRepository.GetAllAsync())
            .FirstOrDefault(s => s.MapId == mapId && s.RoleId == target.RoleId && s.Status == MapShareStatus.Accepted);
        if (roleShareForTarget != null)
        {
            var role = await _roleRepository.GetByIdAsync(target.RoleId);
            return (false, null, $"'{target.Username}' zaten '{role?.Name ?? "bir rol"}' rolü üzerinden bu haritaya erişebiliyor — aynı kişiye ayrıca bireysel davet gönderemezsin.");
        }

        var existing = (await _shareRepository.GetAllAsync())
            .FirstOrDefault(s => s.MapId == mapId && s.InvitedUserId == target.Id);

        MapShare share;
        if (existing != null)
        {
            if (existing.Status == MapShareStatus.Pending || existing.Status == MapShareStatus.Accepted)
            {
                return (false, null, "Bu kullanıcı zaten davetli.");
            }
            // Daha önce reddetmiş/durdurulmuş bir kayıt vardı — aynı satırı Pending'e döndürüyoruz
            // (yeni satır açmıyoruz, unique index zaten (MapId, InvitedUserId) üzerinde).
            existing.Status = MapShareStatus.Pending;
            existing.InvitedDate = DateTime.UtcNow;
            existing.RespondedDate = null;
            share = existing;
        }
        else
        {
            share = new MapShare { MapId = mapId, InvitedUserId = target.Id, Status = MapShareStatus.Pending };
            await _shareRepository.AddAsync(share);
        }
        await _shareRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "map.share.invite", $"'{map.Name}' haritası '{target.Username}' kullanıcısına paylaşıldı (davet gönderildi).");
        return (true, ToDto(share, new Dictionary<int, string> { [target.Id] = target.Username }, new Dictionary<int, Role>(), new Dictionary<int, int>()), null);
    }

    // Faz 3.2 (kullanıcının kendi isteği: "rollere de paylaşabilelim"): kabul/red YOK —
    // roldeki HERKES anında erişir, bu yüzden satır doğrudan Accepted açılıyor.
    public async Task<(bool Success, MapShareDto? Result, string? Error)> ShareWithRoleAsync(int mapId, int ownerUserId, int roleId, string actorUsername)
    {
        var map = await _mapRepository.GetByIdAsync(mapId);
        if (map == null || map.OwnerUserId != ownerUserId)
        {
            return (false, null, "Harita bulunamadı.");
        }

        var role = await _roleRepository.GetByIdAsync(roleId);
        if (role == null)
        {
            return (false, null, "Böyle bir rol bulunamadı.");
        }

        // Görev #68 (aynı çakışma kontrolünün ters yönü): bu roldeki birine ZATEN bireysel
        // davet gönderilmişse (bekleyen ya da kabul edilmiş), role toplu paylaşmadan önce
        // sahibin bunu bilmesi/çözmesi gerekiyor — sessizce üstüne yazmıyoruz.
        var usersInRole = (await _userRepository.GetAllAsync())
            .Where(u => !u.IsDeleted && u.RoleId == roleId)
            .Select(u => u.Id)
            .ToHashSet();
        var conflictingPersonalShares = (await _shareRepository.GetAllAsync())
            .Where(s => s.MapId == mapId && s.InvitedUserId != null && usersInRole.Contains(s.InvitedUserId.Value) &&
                        (s.Status == MapShareStatus.Pending || s.Status == MapShareStatus.Accepted))
            .ToList();
        if (conflictingPersonalShares.Count > 0)
        {
            var usernameById = (await _userRepository.GetAllAsync()).ToDictionary(u => u.Id, u => u.Username);
            var names = conflictingPersonalShares
                .Select(s => usernameById.TryGetValue(s.InvitedUserId!.Value, out var n) ? n : $"#{s.InvitedUserId}");
            return (false, null, $"Bu role paylaşmadan önce şu kişilerin bireysel davetini kaldırmalısın: {string.Join(", ", names)}.");
        }

        var existing = (await _shareRepository.GetAllAsync())
            .FirstOrDefault(s => s.MapId == mapId && s.RoleId == roleId);

        MapShare share;
        if (existing != null)
        {
            if (existing.Status == MapShareStatus.Accepted)
            {
                return (false, null, "Bu rol zaten paylaşımda.");
            }
            existing.Status = MapShareStatus.Accepted;
            existing.InvitedDate = DateTime.UtcNow;
            existing.RespondedDate = DateTime.UtcNow;
            share = existing;
        }
        else
        {
            share = new MapShare { MapId = mapId, RoleId = roleId, Status = MapShareStatus.Accepted, RespondedDate = DateTime.UtcNow };
            await _shareRepository.AddAsync(share);
        }
        await _shareRepository.SaveChangesAsync();

        var userCount = (await _userRepository.GetAllAsync()).Count(u => !u.IsDeleted && u.RoleId == roleId);
        await _auditLogService.LogAsync(actorUsername, "map.share.invite_role", $"'{map.Name}' haritası '{role.Name}' rolüne paylaşıldı ({userCount} kullanıcı).", mapId);
        return (true, ToDto(share, new Dictionary<int, string>(), new Dictionary<int, Role> { [role.Id] = role }, new Dictionary<int, int> { [role.Id] = userCount }), null);
    }

    public async Task<IEnumerable<UserSearchResultDto>> SearchUsersAsync(string query, int excludeUserId)
    {
        var trimmed = (query ?? string.Empty).Trim();
        if (trimmed.Length == 0) return Enumerable.Empty<UserSearchResultDto>();

        var users = await _userRepository.GetAllAsync();
        var matches = users
            .Where(u => !u.IsDeleted && u.Id != excludeUserId && u.Username.Contains(trimmed, StringComparison.OrdinalIgnoreCase))
            .OrderBy(u => u.Username)
            .Take(8)
            .ToList();
        if (matches.Count == 0) return Enumerable.Empty<UserSearchResultDto>();

        // Repository.GetAllAsync() navigasyon property'lerini (User.Role) doldurmuyor —
        // rol adı/rengi için ayrı bir sözlük gerekiyor (bu dosyadaki diğer metotlarla aynı desen).
        var roleById = (await _roleRepository.GetAllAsync()).ToDictionary(r => r.Id, r => r);
        return matches
            .Select(u => new UserSearchResultDto
            {
                Id = u.Id,
                Username = u.Username,
                RoleName = roleById.TryGetValue(u.RoleId, out var role) ? role.Name : string.Empty,
                RoleColor = roleById.TryGetValue(u.RoleId, out var role2) ? role2.Color : string.Empty,
            })
            .ToList();
    }

    public async Task<(bool Success, string? Error)> RespondAsync(int shareId, int userId, bool accept, string actorUsername)
    {
        var share = await _shareRepository.GetByIdAsync(shareId);
        if (share == null || share.InvitedUserId != userId)
        {
            return (false, "Davet bulunamadı.");
        }
        if (share.Status != MapShareStatus.Pending)
        {
            return (false, "Bu davet zaten yanıtlanmış.");
        }

        share.Status = accept ? MapShareStatus.Accepted : MapShareStatus.Declined;
        share.RespondedDate = DateTime.UtcNow;
        await _shareRepository.SaveChangesAsync();

        var map = await _mapRepository.GetByIdAsync(share.MapId);
        var mapName = map?.Name ?? $"#{share.MapId}";
        await _auditLogService.LogAsync(actorUsername, accept ? "map.share.accept" : "map.share.decline",
            accept ? $"'{mapName}' harita davetini kabul etti." : $"'{mapName}' harita davetini reddetti.");
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> RemoveAsync(int shareId, int ownerUserId, string actorUsername)
    {
        var share = await _shareRepository.GetByIdAsync(shareId);
        if (share == null)
        {
            return (false, "Davet bulunamadı.");
        }
        var map = await _mapRepository.GetByIdAsync(share.MapId);
        if (map == null || map.OwnerUserId != ownerUserId)
        {
            return (false, "Bu daveti durdurma yetkin yok.");
        }
        if (share.Status == MapShareStatus.Removed)
        {
            return (false, "Bu davet zaten durdurulmuş.");
        }

        share.Status = MapShareStatus.Removed;
        share.RespondedDate = DateTime.UtcNow;
        await _shareRepository.SaveChangesAsync();

        var targetLabel = await DescribeTargetAsync(share);
        await _auditLogService.LogAsync(actorUsername, "map.share.remove", $"'{map.Name}' haritasındaki '{targetLabel}' paylaşımı durduruldu.", map.Id);
        return (true, null);
    }

    // Faz 3.1: HER ŞEYİN ANA KAPISI — görüntüleme/çizme/düzenleme/silme HEPSİ önce buradan
    // geçiyor. Faz 3.2: artık kişisel paylaşım YA DA kullanıcının ROLÜ üzerinden gelen bir
    // paylaşım (hangisi varsa) erişim veriyor — kişisel paylaşım varsa o ÖNCELİKLİ (daha
    // spesifik), yoksa role bakılıyor.
    public async Task<bool> HasAcceptedAccessAsync(int mapId, int userId)
    {
        var settings = await GetShareForUserAsync(mapId, userId);
        return settings?.CanView == true;
    }

    public async Task<MapShareSettingsDto?> GetShareForUserAsync(int mapId, int userId)
    {
        var shares = (await _shareRepository.GetAllAsync()).Where(s => s.MapId == mapId && s.Status == MapShareStatus.Accepted).ToList();

        var personal = shares.FirstOrDefault(s => s.InvitedUserId == userId);
        if (personal != null) return ToSettingsDto(personal);

        var me = await _userRepository.GetByIdAsync(userId);
        if (me == null) return null;

        var viaRole = shares.FirstOrDefault(s => s.RoleId == me.RoleId);
        return viaRole == null ? null : ToSettingsDto(viaRole);
    }

    private static MapShareSettingsDto ToSettingsDto(MapShare share) => new()
    {
        CanView = share.CanView,
        CanDraw = share.CanDraw,
        CanDelete = share.CanDelete,
        CanEditOthers = share.CanEditOthers,
        AllowedColors = share.AllowedColors,
    };

    public async Task<(bool Success, string? Error)> UpdateShareSettingsAsync(int shareId, int ownerUserId, bool canDraw, bool canDelete, bool canEditOthers, string? allowedColors, string actorUsername)
    {
        var share = await _shareRepository.GetByIdAsync(shareId);
        if (share == null)
        {
            return (false, "Davet bulunamadı.");
        }
        var map = await _mapRepository.GetByIdAsync(share.MapId);
        if (map == null || map.OwnerUserId != ownerUserId)
        {
            return (false, "Bu daveti düzenleme yetkin yok.");
        }

        var trimmedColors = string.IsNullOrWhiteSpace(allowedColors) ? null : allowedColors.Trim();
        share.CanDraw = canDraw;
        share.CanDelete = canDelete;
        share.CanEditOthers = canEditOthers;
        share.AllowedColors = trimmedColors;
        await _shareRepository.SaveChangesAsync();

        var targetLabel = await DescribeTargetAsync(share);
        await _auditLogService.LogAsync(
            actorUsername,
            "map.share.settings_update",
            $"'{map.Name}' haritasında '{targetLabel}' için ayarlar güncellendi (çizme: {(canDraw ? "açık" : "kapalı")}, silme: {(canDelete ? "açık" : "kapalı")}, başkalarını düzenleme: {(canEditOthers ? "açık" : "kapalı")}, renk kısıtı: {(trimmedColors == null ? "yok" : trimmedColors)}).",
            map.Id);
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> SetViewPausedAsync(int shareId, int ownerUserId, bool canView, string actorUsername)
    {
        var share = await _shareRepository.GetByIdAsync(shareId);
        if (share == null)
        {
            return (false, "Davet bulunamadı.");
        }
        var map = await _mapRepository.GetByIdAsync(share.MapId);
        if (map == null || map.OwnerUserId != ownerUserId)
        {
            return (false, "Bu daveti düzenleme yetkin yok.");
        }

        share.CanView = canView;
        await _shareRepository.SaveChangesAsync();

        var targetLabel = await DescribeTargetAsync(share);
        await _auditLogService.LogAsync(
            actorUsername,
            canView ? "map.share.resume" : "map.share.pause",
            $"'{map.Name}' haritasındaki '{targetLabel}' paylaşımı {(canView ? "devam ettirildi" : "duraklatıldı")}.",
            map.Id);
        return (true, null);
    }

    // Görev #76 (kullanıcının kendi isteği): paylaşım satırındaki bir kişiye tıklayınca
    // açılan profil kartı — hedef kullanıcının rolü + BENİM (ownerUserId) onunla paylaştığım
    // (silinmemiş) haritaların listesi. Sadece kişisel paylaşımları sayıyoruz — rol
    // paylaşımları belirli bir kişiye değil role bağlı, "bu kişiyle paylaştığım haritalar"
    // sorusunun cevabı değil.
    public async Task<UserShareSummaryDto?> GetUserShareSummaryAsync(int ownerUserId, string username)
    {
        var trimmed = (username ?? string.Empty).Trim();
        if (trimmed.Length == 0) return null;

        var target = (await _userRepository.GetAllAsync())
            .FirstOrDefault(u => !u.IsDeleted && u.Username.Equals(trimmed, StringComparison.OrdinalIgnoreCase));
        if (target == null) return null;

        var roleById = (await _roleRepository.GetAllAsync()).ToDictionary(r => r.Id, r => r);
        var myMaps = (await _mapRepository.GetAllAsync())
            .Where(m => m.OwnerUserId == ownerUserId && !m.IsDeleted)
            .ToDictionary(m => m.Id, m => m);

        var shares = (await _shareRepository.GetAllAsync())
            .Where(s => s.InvitedUserId == target.Id && myMaps.ContainsKey(s.MapId) &&
                        s.Status != MapShareStatus.Declined && s.Status != MapShareStatus.Removed)
            .OrderByDescending(s => s.InvitedDate)
            .ToList();

        roleById.TryGetValue(target.RoleId, out var targetRole);
        return new UserShareSummaryDto
        {
            Username = target.Username,
            RoleName = targetRole?.Name ?? string.Empty,
            RoleColor = targetRole?.Color ?? string.Empty,
            SharedMaps = shares.Select(s => new UserSharedMapDto
            {
                MapId = s.MapId,
                MapName = myMaps[s.MapId].Name,
                Status = s.Status.ToString(),
                CanView = s.CanView,
            }).ToList(),
        };
    }

    // Görev #77 (mid-turn ek istek, kullanıcının kendi cümlesi): "paylaşılan haritaları
    // sonradan arşive atabilmeliyim, favorileyebilmeliyim veya onlara not ekleyebilmeliyim
    // bir kullanıcı olarak." Bu, SAHİBİN ayarladığı CanView/CanDraw gibi alanlardan TAMAMEN
    // AYRI bir yetki kontrolü gerektiriyor: burada "share.InvitedUserId == userId" kontrol
    // ediliyor (davetlinin KENDİSİ), UpdateShareSettingsAsync/SetViewPausedAsync'teki
    // "map.OwnerUserId == ownerUserId" (SAHİP) kontrolünün TAM TERSİ.
    public async Task<(bool Success, string? Error)> SetRecipientPrefsAsync(int shareId, int userId, SetRecipientPrefsDto dto)
    {
        var share = await _shareRepository.GetByIdAsync(shareId);
        if (share == null || share.InvitedUserId != userId)
        {
            return (false, "Bu paylaşım bulunamadı.");
        }

        if (dto.IsFavorite.HasValue) share.RecipientIsFavorite = dto.IsFavorite.Value;
        if (dto.IsArchived.HasValue) share.RecipientIsArchived = dto.IsArchived.Value;
        if (dto.ClearNote) share.RecipientNote = null;
        else if (dto.Note != null) share.RecipientNote = string.IsNullOrWhiteSpace(dto.Note) ? null : dto.Note.Trim();

        await _shareRepository.SaveChangesAsync();
        return (true, null);
    }

    // Audit log mesajlarında "kime" kısmı — kişi ise kullanıcı adı, rol ise "X rolü".
    private async Task<string> DescribeTargetAsync(MapShare share)
    {
        if (share.InvitedUserId != null)
        {
            return (await _userRepository.GetByIdAsync(share.InvitedUserId.Value))?.Username ?? $"#{share.InvitedUserId}";
        }
        if (share.RoleId != null)
        {
            var role = await _roleRepository.GetByIdAsync(share.RoleId.Value);
            return role != null ? $"{role.Name} rolü" : $"#{share.RoleId} rolü";
        }
        return "?";
    }

    private static MapShareDto ToDto(MapShare share, Dictionary<int, string> usernameById, Dictionary<int, Role> roleById, Dictionary<int, int> userCountByRoleId)
    {
        var isRole = share.RoleId != null;
        var roleName = string.Empty;
        var roleColor = string.Empty;
        var roleUserCount = 0;
        if (isRole && roleById.TryGetValue(share.RoleId!.Value, out var role))
        {
            roleName = role.Name;
            roleColor = role.Color;
            roleUserCount = userCountByRoleId.TryGetValue(role.Id, out var c) ? c : 0;
        }

        return new MapShareDto
        {
            Id = share.Id,
            MapId = share.MapId,
            TargetType = isRole ? "Role" : "User",
            InvitedUserId = share.InvitedUserId,
            InvitedUsername = !isRole && share.InvitedUserId != null && usernameById.TryGetValue(share.InvitedUserId.Value, out var name) ? name : string.Empty,
            RoleId = share.RoleId,
            RoleName = roleName,
            RoleColor = roleColor,
            RoleUserCount = roleUserCount,
            Status = share.Status,
            InvitedDate = share.InvitedDate,
            RespondedDate = share.RespondedDate,
            CanView = share.CanView,
            CanDraw = share.CanDraw,
            CanDelete = share.CanDelete,
            CanEditOthers = share.CanEditOthers,
            AllowedColors = share.AllowedColors,
        };
    }
}

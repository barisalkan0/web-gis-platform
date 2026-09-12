using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Faz 2: harita paylaşımı — davet/kabul/reddet/durdur + "Benimle Paylaşılanlar" listesi.
// Davet GÖNDERMEK ManageMultipleMaps izni ister (aynı izin haritayı çoğaltıp isimlendirebilen
// kişiye paylaşma hakkını da veriyor — bilinçli sadeleştirme, bkz. PermissionCodes.ManageMultipleMaps).
// Kabul/red/"benimle paylaşılanlar" HERKESE açık — davet edilen kişinin bu izne sahip olması
// gerekmiyor, sadece kendi davetine yanıt veriyor.
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MapShareController : PermissionControllerBase
{
    private readonly IMapShareService _mapShareService;
    private readonly IPermissionService _permissionService;
    private readonly ICurrentUserService _currentUser;
    private readonly IMapService _mapService;
    private readonly IAuditLogService _auditLogService;
    private readonly IRoleService _roleService;

    public MapShareController(
        IMapShareService mapShareService,
        IPermissionService permissionService,
        ICurrentUserService currentUser,
        IMapService mapService,
        IAuditLogService auditLogService,
        IRoleService roleService,
        ILogger<MapShareController> logger) : base(logger)
    {
        _mapShareService = mapShareService;
        _permissionService = permissionService;
        _currentUser = currentUser;
        _mapService = mapService;
        _auditLogService = auditLogService;
        _roleService = roleService;
    }

    // Görev #78: paylaşma artık ManageMultipleMaps'ten AYRI bir izin (PermissionCodes.
    // ShareMap) — admin, bir rolün çoklu harita yönetimine dokunmadan sadece "başkalarıyla
    // paylaşma" yeteneğini kısıtlayabiliyor (ör. sadece adminler paylaşabilsin). Var olan
    // bir paylaşımı YÖNETMEK (Duraklat/Kaldır/Ayarlar) bilinçli olarak bu izne bağlı DEĞİL —
    // aşağıdaki UpdateSettings/SetPaused hâlâ ManageMultipleMaps kontrol ediyor, "paylaşma
    // yetkisi elinden alınan biri daha önce kurduğu paylaşımı yönetemez hale gelmesin" diye.
    private Task<IActionResult?> RequireShareAsync() =>
        RequirePermissionAsync(_permissionService, PermissionCodes.ShareMap, "Bu rolün harita paylaşma yetkisi yok.");

    // Sahibin kendi haritası için davet listesi (kim davetli, kim kabul etti, ne zaman).
    [HttpGet("map/{mapId}")]
    public async Task<IActionResult> GetSharesForMap(int mapId)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            return Ok(await _mapShareService.GetSharesForMapAsync(mapId, userId.Value));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Paylaşımlar listelenemedi.");
        }
    }

    // Davet edilen kişinin "Benimle Paylaşılanlar" ekranı.
    [HttpGet("shared-with-me")]
    public async Task<IActionResult> GetSharedWithMe()
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            return Ok(await _mapShareService.GetSharedWithMeAsync(userId.Value));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Paylaşılan haritalar listelenemedi.");
        }
    }

    [HttpPost("map/{mapId}")]
    public async Task<IActionResult> Invite(int mapId, [FromBody] InviteToMapDto dto)
    {
        try
        {
            var denied = await RequireShareAsync();
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, result, error) = await _mapShareService.InviteAsync(mapId, userId.Value, dto.Username, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Davet gönderilemedi.");
        }
    }

    // Faz 3.2 (kullanıcının kendi isteği: "rollere de paylaşabilelim"): kabul/red YOK,
    // roldeki herkes anında erişir.
    [HttpPost("map/{mapId}/role")]
    public async Task<IActionResult> ShareWithRole(int mapId, [FromBody] ShareWithRoleDto dto)
    {
        try
        {
            var denied = await RequireShareAsync();
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, result, error) = await _mapShareService.ShareWithRoleAsync(mapId, userId.Value, dto.RoleId, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Rol ile paylaşılamadı.");
        }
    }

    // Faz 3.2: Paylaş baloncuğundaki "role paylaş" seçeneği için rol listesi — RoleController.
    // GetAll admin-gated (ManageAdmin) olduğu için ayrı, daha hafif bir uç: ManageMultipleMaps
    // sahibi olan HERKES (admin olmasa bile) rolleri görüp seçebilmeli.
    [HttpGet("pickable-roles")]
    public async Task<IActionResult> GetPickableRoles()
    {
        try
        {
            var denied = await RequireShareAsync();
            if (denied != null) return denied;

            return Ok(await _roleService.GetAllAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Roller listelenemedi.");
        }
    }

    // Faz 3.2 (kullanıcının kendi isteği: "kullanıcı adının her harfini yazarken filtreleme
    // yapıp göstermeli"): Paylaş baloncuğundaki canlı kullanıcı arama kutusu.
    [HttpGet("search-users")]
    public async Task<IActionResult> SearchUsers([FromQuery] string q)
    {
        try
        {
            var denied = await RequireShareAsync();
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            return Ok(await _mapShareService.SearchUsersAsync(q, userId.Value));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcılar aranamadı.");
        }
    }

    // Görev #76 (kullanıcının kendi isteği: "paylaşılan kişilerin üzerine tıklayınca...
    // kullanıcı hakkında bilgiler görülebilsin, o kullanıcıyla hangi mapler paylaşılmış
    // görülebilsin"): bir paylaşım satırındaki kişiye tıklayınca açılan profil kartı.
    [HttpGet("user/{username}")]
    public async Task<IActionResult> GetUserSummary(string username)
    {
        try
        {
            var denied = await RequireShareAsync();
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var summary = await _mapShareService.GetUserShareSummaryAsync(userId.Value, username);
            return summary == null ? NotFound(new { message = "Kullanıcı bulunamadı." }) : Ok(summary);
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcı bilgisi alınamadı.");
        }
    }

    // Görev #77 (mid-turn ek istek, kullanıcının kendi cümlesi): "paylaşılan haritaları
    // sonradan arşive atabilmeliyim, favorileyebilmeliyim veya onlara not ekleyebilmeliyim
    // bir kullanıcı olarak." HERKESE açık (davetli kendi payına düşen satırı düzenliyor,
    // özel bir izin gerekmiyor — Accept/Decline ile aynı yetki mantığı).
    [HttpPatch("{id}/recipient-prefs")]
    public async Task<IActionResult> UpdateRecipientPrefs(int id, [FromBody] SetRecipientPrefsDto dto)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapShareService.SetRecipientPrefsAsync(id, userId.Value, dto);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Tercihler kaydedilemedi.");
        }
    }

    [HttpPost("{id}/accept")]
    public Task<IActionResult> Accept(int id) => Respond(id, true);

    [HttpPost("{id}/decline")]
    public Task<IActionResult> Decline(int id) => Respond(id, false);

    private async Task<IActionResult> Respond(int id, bool accept)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapShareService.RespondAsync(id, userId.Value, accept, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Davet yanıtlanamadı.");
        }
    }

    // Sadece harita sahibi çağırabilir — bekleyen/kabul edilmiş bir daveti durdurur.
    [HttpDelete("{id}")]
    public async Task<IActionResult> Remove(int id)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapShareService.RemoveAsync(id, userId.Value, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Paylaşım durdurulamadı.");
        }
    }

    // Faz 3 (kullanıcının kendi isteği): sahip, bir davetlinin "başkalarının çizimini de
    // düzenleyebilir mi" ve "hangi renkleri kullanabilir" ayarlarını günceller. ManageMultipleMaps
    // izni Invite ile aynı — paylaşabilen zaten paylaşımın ayarlarını da yönetebilmeli.
    [HttpPatch("{id}/settings")]
    public async Task<IActionResult> UpdateSettings(int id, [FromBody] UpdateMapShareSettingsDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageMultipleMaps, "Bu rolün paylaşım ayarlarını değiştirme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapShareService.UpdateShareSettingsAsync(id, userId.Value, dto.CanDraw, dto.CanDelete, dto.CanEditOthers, dto.AllowedColors, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Paylaşım ayarları güncellenemedi.");
        }
    }

    // Faz 3.1 (kullanıcının kendi isteği: "kişiyi duraklatıp silebilelim"): davete/Status'a
    // dokunmadan TÜM erişimi tek tıkla aç/kapa — Remove (Durdur/Sil) gibi KALICI değil,
    // geri alınabilir. body: { canView: false } duraklatır, { canView: true } devam ettirir.
    [HttpPatch("{id}/pause")]
    public async Task<IActionResult> SetPaused(int id, [FromBody] SetSharePausedDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageMultipleMaps, "Bu rolün paylaşım ayarlarını değiştirme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapShareService.SetViewPausedAsync(id, userId.Value, dto.CanView, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Paylaşım duraklatılamadı.");
        }
    }

    // Faz 3: bir kullanıcının (sahip DEĞİLSE) bu haritadaki KENDİ ayarları — frontend'in
    // çizim renk paletini kısıtlı gösterebilmesi için. Herkese açık (özel izin gerekmez,
    // GeoRestriction'ın "/mine" ucuyla aynı mantık) — sahip ya da kısıtlaması olmayan biri
    // için boş/varsayılan bir nesne döner (403 değil).
    [HttpGet("map/{mapId}/my-settings")]
    public async Task<IActionResult> GetMySettings(int mapId)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var settings = await _mapShareService.GetShareForUserAsync(mapId, userId.Value);
            return Ok(settings ?? new MapShareSettingsDto());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Ayarlar okunamadı.");
        }
    }

    // Faz 3: harita sahibinin (admin OLMASA bile) kendi haritasındaki aktiviteyi görebilmesi
    // için — Paylaş modalındaki "Aktivite" sekmesi. Sadece sahip görebilir.
    [HttpGet("map/{mapId}/activity")]
    public async Task<IActionResult> GetActivity(int mapId)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            if (!await _mapService.IsOwnerAsync(mapId, userId.Value)) return StatusCode(403, new { message = "Bu haritanın aktivite kaydını görme yetkin yok." });

            return Ok(await _auditLogService.GetForMapAsync(mapId));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Aktivite kaydı okunamadı.");
        }
    }
}

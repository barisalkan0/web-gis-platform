using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Hocanın "Coğrafi Yetki Tanımlama Modülü" görevi — v2: bir Role YA DA belirli bir User'a
// artık BİRDEN FAZLA alan eklenip tek tek kaldırılabiliyor (kullanıcının kendi isteğiyle
// genişletildi). GLOBAL uçlar (role/{id}, user/{id}) hâlâ ManageGeoRestrictions iznine
// sahip roller/kullanıcılar için — frontend bu izin yoksa admin panelindeki butonu hiç
// göstermiyor.
//
// Görev #7 (kullanıcının kendi isteği, harita şeridi polish turu): YENİ map/{mapId}/... uçları
// admin izni GEREKTİRMİYOR — sadece o haritanın SAHİBİ olmak yeterli (Paylaş modalındaki
// "🚧 Kısıtla" butonu). Bir admin de (ManageGeoRestrictions'a sahipse) her haritanın kısıtını
// yönetebilir — bkz. RequireMapOwnerOrAdminAsync.
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GeoRestrictionController : PermissionControllerBase
{
    private readonly IGeoRestrictionService _geoRestrictionService;
    private readonly IPermissionService _permissionService;
    private readonly ICurrentUserService _currentUser;
    private readonly IMapService _mapService;

    public GeoRestrictionController(
        IGeoRestrictionService geoRestrictionService,
        IPermissionService permissionService,
        ICurrentUserService currentUser,
        IMapService mapService,
        ILogger<GeoRestrictionController> logger) : base(logger)
    {
        _geoRestrictionService = geoRestrictionService;
        _permissionService = permissionService;
        _currentUser = currentUser;
        _mapService = mapService;
    }

    private Task<IActionResult?> RequireGeoAsync() =>
        RequirePermissionAsync(_permissionService, PermissionCodes.ManageGeoRestrictions, "Bu rolün coğrafi yetki tanımlama izni yok.");

    // Görev #7: harita-özel uçların yetki kontrolü — ADMIN İZNİ DEĞİL, "bu haritanın sahibi
    // misin" (ManageMultipleMaps/ShareMap GİBİ ayrı bir izin de gerekmiyor — Rename/Delete
    // ile aynı "kendi malını yönetme" mantığı, bkz. MapController). Admin (ManageGeoRestrictions
    // sahibiyse) her haritayı da yönetebilsin diye bir istisna var — kullanıcı desteğe ihtiyaç
    // duyarsa admin araya girebilsin.
    private async Task<(bool Allowed, int? UserId, IActionResult? Denied)> RequireMapOwnerOrAdminAsync(int mapId)
    {
        var userId = _currentUser.GetUserId(User);
        if (userId == null) return (false, null, Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." }));

        if (await _mapService.IsOwnerAsync(mapId, userId.Value)) return (true, userId, null);

        var adminDenied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageGeoRestrictions, "Bu haritanın sahibi değilsin.");
        return adminDenied == null ? (true, userId, null) : (false, userId, adminDenied);
    }

    // Herkese açık (özel izin gerektirmez) — kullanıcı kendi çizim alanlarının neler olduğunu
    // öğrenip haritada gri maske + sınır çizgileri gösterebilsin diye (bkz. MapPage.jsx).
    // Görev #7: artık mapId query param'ı da alıyor — aktif haritaya özel bir kısıt varsa
    // (admin'in globalinden ÖNCE) o dönsün diye (bkz. IGeoRestrictionService öncelik sırası).
    [HttpGet("mine")]
    public async Task<IActionResult> GetMine([FromQuery] int? mapId)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            var areas = await _geoRestrictionService.GetMyEffectiveAreasAsync(userId, mapId);
            return Ok(new { areas = areas.Select(a => new { wkt = a.Wkt, name = a.Name }) });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Coğrafi alanların okunamadı.");
        }
    }

    [HttpGet("role/{roleId}")]
    public async Task<IActionResult> GetForRole(int roleId)
    {
        try
        {
            var denied = await RequireGeoAsync();
            if (denied != null) return denied;

            return Ok(await _geoRestrictionService.GetForRoleAsync(roleId));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Rolün coğrafi alanları okunamadı.");
        }
    }

    [HttpPost("role/{roleId}")]
    public async Task<IActionResult> AddForRole(int roleId, [FromBody] CreateGeoRestrictionDto dto)
    {
        try
        {
            var denied = await RequireGeoAsync();
            if (denied != null) return denied;

            var (success, result, error) = await _geoRestrictionService.AddForRoleAsync(roleId, dto, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Rol için coğrafi alan eklenemedi.");
        }
    }

    [HttpGet("user/{userId}")]
    public async Task<IActionResult> GetForUser(int userId)
    {
        try
        {
            var denied = await RequireGeoAsync();
            if (denied != null) return denied;

            return Ok(await _geoRestrictionService.GetForUserAsync(userId));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcının coğrafi alanları okunamadı.");
        }
    }

    [HttpPost("user/{userId}")]
    public async Task<IActionResult> AddForUser(int userId, [FromBody] CreateGeoRestrictionDto dto)
    {
        try
        {
            var denied = await RequireGeoAsync();
            if (denied != null) return denied;

            var (success, result, error) = await _geoRestrictionService.AddForUserAsync(userId, dto, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcı için coğrafi alan eklenemedi.");
        }
    }

    // ---- Görev #7: harita sahibinin KENDİ haritasına özel kısıtları ----

    // Kullanıcının kendi isteği: "buradan (Harita Ayarları) tamamen yönetilebilmeli" —
    // Paylaşılanlar kartlarının hepsinde "kısıtlı mı/duraklatılmış mı" rozetini tek istekle
    // gösterebilmek için (her satır için ayrı GET atmak yerine).
    [HttpGet("map/{mapId}")]
    public async Task<IActionResult> GetAllForMap(int mapId)
    {
        try
        {
            var (allowed, _, denied) = await RequireMapOwnerOrAdminAsync(mapId);
            if (!allowed) return denied!;

            return Ok(await _geoRestrictionService.GetAllForMapAsync(mapId));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Haritanın coğrafi kısıtları okunamadı.");
        }
    }

    [HttpGet("map/{mapId}/role/{roleId}")]
    public async Task<IActionResult> GetForMapRole(int mapId, int roleId)
    {
        try
        {
            var (allowed, _, denied) = await RequireMapOwnerOrAdminAsync(mapId);
            if (!allowed) return denied!;

            return Ok(await _geoRestrictionService.GetForMapRoleAsync(mapId, roleId));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Rolün bu haritaya özel alanları okunamadı.");
        }
    }

    [HttpPost("map/{mapId}/role/{roleId}")]
    public async Task<IActionResult> AddForMapRole(int mapId, int roleId, [FromBody] CreateGeoRestrictionDto dto)
    {
        try
        {
            var (allowed, _, denied) = await RequireMapOwnerOrAdminAsync(mapId);
            if (!allowed) return denied!;

            var (success, result, error) = await _geoRestrictionService.AddForMapRoleAsync(mapId, roleId, dto, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Rol için haritaya özel alan eklenemedi.");
        }
    }

    [HttpGet("map/{mapId}/user/{userId}")]
    public async Task<IActionResult> GetForMapUser(int mapId, int userId)
    {
        try
        {
            var (allowed, _, denied) = await RequireMapOwnerOrAdminAsync(mapId);
            if (!allowed) return denied!;

            return Ok(await _geoRestrictionService.GetForMapUserAsync(mapId, userId));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcının bu haritaya özel alanları okunamadı.");
        }
    }

    [HttpPost("map/{mapId}/user/{userId}")]
    public async Task<IActionResult> AddForMapUser(int mapId, int userId, [FromBody] CreateGeoRestrictionDto dto)
    {
        try
        {
            var (allowed, _, denied) = await RequireMapOwnerOrAdminAsync(mapId);
            if (!allowed) return denied!;

            var (success, result, error) = await _geoRestrictionService.AddForMapUserAsync(mapId, userId, dto, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcı için haritaya özel alan eklenemedi.");
        }
    }

    // "istediğimiz zaman duraklatabilelim istediğimize" — o kişi/rol için bu haritadaki TÜM
    // kısıt satırlarını tek seferde duraklatır/devam ettirir.
    [HttpPatch("map/{mapId}/role/{roleId}/pause")]
    public async Task<IActionResult> SetRolePaused(int mapId, int roleId, [FromBody] SetGeoRestrictionPausedDto dto)
    {
        try
        {
            var (allowed, _, denied) = await RequireMapOwnerOrAdminAsync(mapId);
            if (!allowed) return denied!;

            var (success, error) = await _geoRestrictionService.SetPausedForMapRoleAsync(mapId, roleId, dto.IsPaused, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kısıtlama durumu değiştirilemedi.");
        }
    }

    [HttpPatch("map/{mapId}/user/{userId}/pause")]
    public async Task<IActionResult> SetUserPaused(int mapId, int userId, [FromBody] SetGeoRestrictionPausedDto dto)
    {
        try
        {
            var (allowed, _, denied) = await RequireMapOwnerOrAdminAsync(mapId);
            if (!allowed) return denied!;

            var (success, error) = await _geoRestrictionService.SetPausedForMapUserAsync(mapId, userId, dto.IsPaused, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kısıtlama durumu değiştirilemedi.");
        }
    }

    // v2: silme artık role/{roleId} ya da user/{userId} altında değil — bir alan kendi id'siyle
    // tekil olduğu için (birden fazla alan olabildiğinden) doğrudan id ile siliniyor.
    // Görev #7: satır GLOBAL mi (MapId=null, admin izni gerekir) yoksa HARİTAYA ÖZEL mi
    // (MapId dolu, o haritanın sahibi de silebilir) önce bakılıyor.
    [HttpDelete("{id}")]
    public async Task<IActionResult> Remove(int id)
    {
        try
        {
            var row = await _geoRestrictionService.GetByIdAsync(id);
            if (row == null) return NotFound(new { message = "Alan bulunamadı." });

            if (row.MapId != null)
            {
                var (allowed, _, denied) = await RequireMapOwnerOrAdminAsync(row.MapId.Value);
                if (!allowed) return denied!;
            }
            else
            {
                var denied = await RequireGeoAsync();
                if (denied != null) return denied;
            }

            var (success, error) = await _geoRestrictionService.RemoveAsync(id, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Coğrafi alan kaldırılamadı.");
        }
    }
}

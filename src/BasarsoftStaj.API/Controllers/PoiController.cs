using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// POI katmanı aktif haritaya bağlıdır. Görüntüleme ViewPoi (ManagePoi/ManageAdmin bunu
// dolaylı sağlar) ve harita erişimi ister; oluşturma/taşıma ayrıca ManagePoi + CanDraw,
// silme ise mevcut sahiplik/admin ve paylaşılan haritadaki CanDelete kurallarına bağlıdır.
[ApiController]
[Route("api/[controller]")]
public class PoiController : PermissionControllerBase
{
    private readonly IPoiService _poiService;
    private readonly IPermissionService _permissionService;
    private readonly ICurrentUserService _currentUser;
    private readonly IMapService _mapService;
    private readonly IMapShareService _mapShareService;

    public PoiController(
        IPoiService poiService,
        IPermissionService permissionService,
        ICurrentUserService currentUser,
        IMapService mapService,
        IMapShareService mapShareService,
        ILogger<PoiController> logger) : base(logger)
    {
        _poiService = poiService;
        _permissionService = permissionService;
        _currentUser = currentUser;
        _mapService = mapService;
        _mapShareService = mapShareService;
    }

    private async Task<IActionResult?> RequirePoiViewAsync()
    {
        var username = User.Identity?.Name;
        if (string.IsNullOrWhiteSpace(username)) return Unauthorized();
        var codes = await _permissionService.GetEffectivePermissionCodesForUsernameAsync(username);
        return codes.Contains(PermissionCodes.ManageAdmin)
            || codes.Contains(PermissionCodes.ManagePoi)
            || codes.Contains(PermissionCodes.ViewPoi)
            ? null
            : StatusCode(StatusCodes.Status403Forbidden, new { message = "Bu rolün POI görüntüleme yetkisi yok." });
    }

    private async Task<bool> CanViewMapAsync(int mapId, int userId) =>
        await _mapService.IsOwnerAsync(mapId, userId)
        || await _mapShareService.HasAcceptedAccessAsync(mapId, userId)
        // Kullanıcının kendi isteği: adminler sahiplik/paylaşım aranmaksızın her haritayı görsün.
        || await IsAdminAsync(_permissionService);

    private async Task<IActionResult?> RequireCanDrawAsync(int mapId, int userId)
    {
        if (await _mapService.IsOwnerAsync(mapId, userId)) return null;
        // Kullanıcının kendi isteği: "adminler her şeyi yapabilecek."
        if (await IsAdminAsync(_permissionService)) return null;
        if (!await _mapShareService.HasAcceptedAccessAsync(mapId, userId))
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Bu haritada POI oluşturma veya taşıma yetkin yok." });
        var settings = await _mapShareService.GetShareForUserAsync(mapId, userId);
        return settings?.CanDraw == true
            ? null
            : StatusCode(StatusCodes.Status403Forbidden, new { message = "Bu haritada POI oluşturma veya taşıma yetkin yok." });
    }

    [Authorize]
    [HttpGet("admin")]
    public async Task<IActionResult> GetAllForAdmin()
    {
        var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.None, "POI yönetimi için yönetim yetkisi gerekiyor.");
        return denied ?? Ok(await _poiService.GetAllForAdminAsync());
    }

    [Authorize]
    [HttpGet("admin/maps")]
    public async Task<IActionResult> GetMapOptionsForAdmin()
    {
        var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.None, "Harita listesini görmek için yönetim yetkisi gerekiyor.");
        return denied ?? Ok(await _poiService.GetMapOptionsForAdminAsync());
    }

    [Authorize]
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int? mapId)
    {
        try
        {
            if (mapId is null or <= 0) return BadRequest(new { message = "mapId zorunludur." });
            var permissionDenied = await RequirePoiViewAsync();
            if (permissionDenied != null) return permissionDenied;
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            if (!await CanViewMapAsync(mapId.Value, userId.Value))
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Bu haritayı görüntüleme yetkin yok." });
            return Ok(await _poiService.GetAllAsync(mapId.Value));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI'ler listelenemedi.");
        }
    }

    [Authorize]
    [HttpGet("catalog")]
    public async Task<IActionResult> GetCatalog()
    {
        try
        {
            var permissionDenied = await RequirePoiViewAsync();
            return permissionDenied ?? Ok(await _poiService.GetCatalogAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI kataloğu listelenemedi.");
        }
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePoiDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManagePoi, "Bu rolün POI ekleme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            if (dto.MapId != null)
            {
                var mapDenied = await RequireCanDrawAsync(dto.MapId.Value, userId.Value);
                if (mapDenied != null) return mapDenied;
            }
            else
            {
                // Kullanıcının kendi isteği: haritaya bağlı olmayan ("evrensel/gömülü") POI
                // sadece yöneticiler tarafından oluşturulabilsin — "Atanmamış POI'leri
                // yalnızca yönetici düzenleyebilir/silebilir" kuralıyla AYNI mantık
                // (bkz. Update/Delete uçları), burada CREATE için de simetrik uygulanıyor.
                var adminDenied = await RequirePermissionAsync(_permissionService, PermissionCodes.None, "Haritaya bağlı olmayan POI oluşturmak için yönetim yetkisi gerekiyor.");
                if (adminDenied != null) return adminDenied;
            }
            var (success, result, error) = await _poiService.CreateAsync(dto, userId);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI oluşturulamadı.");
        }
    }

    [Authorize]
    [HttpPatch("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdatePoiDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManagePoi, "Bu rolün POI düzenleme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var poi = await _poiService.GetByIdAsync(id);
            if (poi == null) return NotFound(new { message = "POI bulunamadı." });
            var codes = await _permissionService.GetEffectivePermissionCodesForUsernameAsync(User.Identity!.Name!);
            var isAdmin = codes.Contains(PermissionCodes.ManageAdmin);
            if (!isAdmin && poi.UserId != userId)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Yalnızca kendi eklediğiniz POI'leri düzenleyebilirsiniz." });
            }
            if (!isAdmin && !poi.IsActive)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Duraklatılmış POI'leri yalnızca yönetici düzenleyebilir." });
            }
            if (!isAdmin)
            {
                if (poi.MapId == null) return StatusCode(StatusCodes.Status403Forbidden, new { message = "Atanmamış POI'leri yalnızca yönetici yönetebilir." });
                var mapDenied = await RequireCanDrawAsync(poi.MapId.Value, userId.Value);
                if (mapDenied != null) return mapDenied;
            }

            var (success, result, error) = await _poiService.UpdateAsync(id, dto, User.Identity!.Name!);
            return success ? Ok(result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI güncellenemedi.");
        }
    }

    [Authorize]
    [HttpPatch("{id}/map")]
    public async Task<IActionResult> AssignMap(int id, [FromBody] AssignPoiMapDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.None, "POI haritasını değiştirmek için yönetim yetkisi gerekiyor.");
            if (denied != null) return denied;
            var (success, result, error) = await _poiService.AssignMapAsync(id, dto.MapId, User.Identity!.Name!);
            return success ? Ok(result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI haritaya atanamadı.");
        }
    }

    [Authorize]
    [HttpPatch("{id}/status")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] UpdatePoiStatusDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.None, "POI durumunu yalnızca yöneticiler değiştirebilir.");
            if (denied != null) return denied;
            var (success, result, error) = await _poiService.SetActiveAsync(id, dto.IsActive, User.Identity!.Name!);
            return success ? Ok(result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI durumu güncellenemedi.");
        }
    }

    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var poi = await _poiService.GetByIdAsync(id);
            if (poi == null) return NotFound(new { message = "POI bulunamadı." });

            var codes = await _permissionService.GetEffectivePermissionCodesForUsernameAsync(User.Identity!.Name!);
            var isAdmin = codes.Contains(PermissionCodes.ManageAdmin);
            var isOwner = poi.UserId == userId;
            if (!isAdmin && !isOwner)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { message = "Bu POI'yi sadece ekleyen kişi veya bir yönetici silebilir." });
            }
            if (!isAdmin)
            {
                if (poi.MapId == null) return StatusCode(StatusCodes.Status403Forbidden, new { message = "Atanmamış POI'leri yalnızca yönetici silebilir." });
                if (!await _mapService.IsOwnerAsync(poi.MapId.Value, userId.Value))
                {
                    var settings = await _mapShareService.GetShareForUserAsync(poi.MapId.Value, userId.Value);
                    if (settings?.CanDelete != true)
                        return StatusCode(StatusCodes.Status403Forbidden, new { message = "Bu haritada POI silme yetkin yok." });
                }
            }

            var (success, error) = await _poiService.DeleteAsync(id);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI silinemedi.");
        }
    }
}

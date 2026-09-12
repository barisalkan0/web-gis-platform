using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Hoca ödevi (Akıllı Ulaşım Modülü): "Durak Ekleme: Operatör için haritada 'Durak Ekle'
// (Point) aracı oluşturun ... Duraklara tıklandığında bilgi kutucuğu açılmalıdır." Görüntüleme
// ViewRoutes (ManageRoutes/ManageAdmin bunu dolaylı sağlar) ister — PoiController.RequirePoiViewAsync
// ile AYNI desen; ekleme/düzenleme/silme/sıralama ManageRoutes'a bağlı.
[ApiController]
[Route("api/[controller]")]
public class TransitStopController : PermissionControllerBase
{
    private readonly ITransitStopService _stopService;
    private readonly IPermissionService _permissionService;
    private readonly ICurrentUserService _currentUser;

    public TransitStopController(
        ITransitStopService stopService,
        IPermissionService permissionService,
        ICurrentUserService currentUser,
        ILogger<TransitStopController> logger) : base(logger)
    {
        _stopService = stopService;
        _permissionService = permissionService;
        _currentUser = currentUser;
    }

    private async Task<IActionResult?> RequireStopViewAsync()
    {
        var username = User.Identity?.Name;
        if (string.IsNullOrWhiteSpace(username)) return Unauthorized();
        var codes = await _permissionService.GetEffectivePermissionCodesForUsernameAsync(username);
        return codes.Contains(PermissionCodes.ManageAdmin)
            || codes.Contains(PermissionCodes.ManageRoutes)
            || codes.Contains(PermissionCodes.ViewRoutes)
            ? null
            : StatusCode(StatusCodes.Status403Forbidden, new { message = "Bu rolün durak/güzergah görüntüleme yetkisi yok." });
    }

    [Authorize]
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var denied = await RequireStopViewAsync();
            return denied ?? Ok(await _stopService.GetAllAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Duraklar listelenemedi.");
        }
    }

    [Authorize]
    [HttpGet("by-route/{routeId}")]
    public async Task<IActionResult> GetByRoute(int routeId)
    {
        try
        {
            var denied = await RequireStopViewAsync();
            return denied ?? Ok(await _stopService.GetByRouteAsync(routeId));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Güzergahın durakları listelenemedi.");
        }
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTransitStopDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün durak ekleme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (success, result, error) = await _stopService.CreateAsync(dto, userId, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Durak oluşturulamadı.");
        }
    }

    [Authorize]
    [HttpPatch("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateTransitStopDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün durak düzenleme yetkisi yok.");
            if (denied != null) return denied;

            var (success, result, error) = await _stopService.UpdateAsync(id, dto, User.Identity!.Name!);
            return success ? Ok(result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Durak güncellenemedi.");
        }
    }

    // "Güzergah içerisindeki duraklar sıra bazlı listelenmeli ve Sürükle-Bırak yöntemiyle
    // durak sıralaması değiştirilebilmelidir." — frontend sürükle-bırak SONRASI güzergahın
    // TÜM durak id'lerini yeni sırayla tek seferde gönderir (PoiCategoryService.NormalizeSiblings
    // ile aynı fikir).
    [Authorize]
    [HttpPatch("reorder")]
    public async Task<IActionResult> Reorder([FromBody] ReorderTransitStopsDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün durak sıralama yetkisi yok.");
            if (denied != null) return denied;
            if (dto.StopIds.Count == 0) return BadRequest(new { message = "Sıralama listesi boş olamaz." });

            // routeId ayrıca gönderilmiyor — ilk durağın güzergahından çıkarılıyor, servis
            // katmanında TÜM id'lerin o güzergaha ait olduğu zaten doğrulanıyor.
            var allStops = await _stopService.GetAllAsync();
            var firstStop = allStops.FirstOrDefault(s => s.Id == dto.StopIds[0]);
            if (firstStop == null) return BadRequest(new { message = "Durak bulunamadı." });

            var (success, error) = await _stopService.ReorderAsync(firstStop.RouteId, dto.StopIds, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Durak sıralaması güncellenemedi.");
        }
    }

    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün durak silme yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _stopService.DeleteAsync(id, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Durak silinemedi.");
        }
    }

    // Kullanıcının kendi isteği: "durağı duraklatınca otomatik sonrakiyle birleşsin".
    [Authorize]
    [HttpPatch("{id}/pause")]
    public async Task<IActionResult> SetPaused(int id, [FromBody] SetTransitPausedDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün durak duraklatma yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _stopService.SetPausedAsync(id, dto.IsPaused, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Durak durumu değiştirilemedi.");
        }
    }
}

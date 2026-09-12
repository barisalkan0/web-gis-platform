using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Hoca ödevi (Akıllı Ulaşım Modülü): "Güzergah Yönetimi: ... Yeni güzergah ekleme (isim ve
// renk belirleme), listeleme ve düzenleme yapılabilsin." Listeleme PoiCategoryController ile
// AYNI fikirle herkese açık (auth gerektirmez) — Durak Ekle formundaki güzergah dropdown'ı ve
// haritadaki güzergah rengi/etiketi için gerekli, oluşturma/düzenleme/silme ManageRoutes iznine
// sahip roller (Admin, Ulaşım Operatörü) için.
[ApiController]
[Route("api/[controller]")]
public class TransitRouteController : PermissionControllerBase
{
    private readonly ITransitRouteService _routeService;
    private readonly IPermissionService _permissionService;
    private readonly ICurrentUserService _currentUser;

    public TransitRouteController(
        ITransitRouteService routeService,
        IPermissionService permissionService,
        ICurrentUserService currentUser,
        ILogger<TransitRouteController> logger) : base(logger)
    {
        _routeService = routeService;
        _permissionService = permissionService;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            return Ok(await _routeService.GetAllAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Güzergahlar listelenemedi.");
        }
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTransitRouteDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün güzergah ekleme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (success, result, error) = await _routeService.CreateAsync(dto, userId, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Güzergah oluşturulamadı.");
        }
    }

    [Authorize]
    [HttpPatch("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateTransitRouteDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün güzergah düzenleme yetkisi yok.");
            if (denied != null) return denied;

            var (success, result, error) = await _routeService.UpdateAsync(id, dto, User.Identity!.Name!);
            return success ? Ok(result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Güzergah güncellenemedi.");
        }
    }

    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün güzergah silme yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _routeService.DeleteAsync(id, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Güzergah silinemedi.");
        }
    }

    // Kullanıcının kendi isteği: "duraklatma".
    [Authorize]
    [HttpPatch("{id}/pause")]
    public async Task<IActionResult> SetPaused(int id, [FromBody] SetTransitPausedDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün güzergah duraklatma yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _routeService.SetPausedAsync(id, dto.IsPaused, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Güzergah durumu değiştirilemedi.");
        }
    }

    // Kullanıcının kendi isteği: haritada elle bükülen hattı kaydet.
    [Authorize]
    [HttpPatch("{id}/path")]
    public async Task<IActionResult> SetPath(int id, [FromBody] SetTransitRoutePathDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün güzergah hattını düzenleme yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _routeService.SetPathAsync(id, dto.Wkt, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Güzergah hattı kaydedilemedi.");
        }
    }

    // Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): "Güzergah üzerine 'Rota
    // Oluştur' butonu ekleyin." — SetPath ile AYNI yetki (ManageRoutes), ama admin/operatör
    // elle bükmek yerine OSRM'e istek atıp gerçek yol ağına göre bir rota istiyor.
    [Authorize]
    [HttpPost("{id}/generate-route")]
    public async Task<IActionResult> GenerateRoute(int id)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün rota oluşturma yetkisi yok.");
            if (denied != null) return denied;

            var (success, result, error) = await _routeService.GenerateRouteAsync(id, User.Identity!.Name!);
            return success ? Ok(result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Rota oluşturulamadı.");
        }
    }
}

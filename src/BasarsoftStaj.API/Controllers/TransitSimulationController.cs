using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma): "Haritada veya listede bir
// güzergaha tıklandığında 'Simülasyonu Başlat' butonu çıksın (Sadece Admin ve Operatör
// başlatabilsin)." — ManageRoutes izni zaten SADECE Admin ve Ulaşım Operatörü rollerinde var
// (bkz. TransitRouteController'daki AYNI izin kullanımı), yeni bir izin kodu açmaya gerek
// yoktu. Durum (state) ucu ise TransitRoute.GetAll gibi herkese açık — "Takip Et" butonunun
// görünüp görünmeyeceğine istemci bu uçtan karar veriyor, izin gerektirmiyor.
[ApiController]
[Route("api/[controller]")]
public class TransitSimulationController : PermissionControllerBase
{
    private readonly ITransitSimulationService _simulationService;
    private readonly IPermissionService _permissionService;

    public TransitSimulationController(
        ITransitSimulationService simulationService,
        IPermissionService permissionService,
        ILogger<TransitSimulationController> logger) : base(logger)
    {
        _simulationService = simulationService;
        _permissionService = permissionService;
    }

    [HttpGet("{routeId}/state")]
    public async Task<IActionResult> GetState(int routeId)
    {
        try
        {
            return Ok(await _simulationService.GetSnapshotAsync(routeId));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Simülasyon durumu alınamadı.");
        }
    }

    [Authorize]
    [HttpPost("{routeId}/start")]
    public async Task<IActionResult> Start(int routeId)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün simülasyon başlatma yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _simulationService.StartAsync(routeId, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Simülasyon başlatılamadı.");
        }
    }

    [Authorize]
    [HttpPost("{routeId}/stop")]
    public async Task<IActionResult> Stop(int routeId)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageRoutes, "Bu rolün simülasyon durdurma yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _simulationService.StopAsync(routeId, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Simülasyon durdurulamadı.");
        }
    }
}

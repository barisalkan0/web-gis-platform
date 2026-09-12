using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Gün 6: Permission tablosunun tanım listesi — admin panelindeki rol/kullanıcı izin
// checkbox matrisi bu uçtan gelen (Code, Name, Description) satırlarını render ediyor.
// Sadece ManageAdmin iznine sahip roller/kullanıcılar görebilir (izin tanımları da bir
// yönetim bilgisi).
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PermissionController : PermissionControllerBase
{
    private readonly IPermissionService _permissionService;

    public PermissionController(IPermissionService permissionService, ILogger<PermissionController> logger) : base(logger)
    {
        _permissionService = permissionService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.None, "Bu işlem için yönetim yetkisi gerekiyor.");
            return denied ?? Ok(await _permissionService.GetAllAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "İzin tanımları listelenemedi.");
        }
    }
}

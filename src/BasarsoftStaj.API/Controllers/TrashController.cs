using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NetTopologySuite.Geometries;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Çöp kutusu: silinen (IsDeleted=true) nokta/çizgi/alan kayıtlarını listeleme, geri
// getirme ve kalıcı silme. Sadece ManageAdmin iznine sahip roller/kullanıcılar kullanabilir.
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TrashController : PermissionControllerBase
{
    private readonly IGeometryService<TblPoint, Point> _pointService;
    private readonly IGeometryService<TblLine, LineString> _lineService;
    private readonly IGeometryService<TblPolygon, Polygon> _polygonService;
    private readonly IPermissionService _permissionService;

    public TrashController(
        IGeometryService<TblPoint, Point> pointService,
        IGeometryService<TblLine, LineString> lineService,
        IGeometryService<TblPolygon, Polygon> polygonService,
        IPermissionService permissionService,
        ILogger<TrashController> logger) : base(logger)
    {
        _pointService = pointService;
        _lineService = lineService;
        _polygonService = polygonService;
        _permissionService = permissionService;
    }

    private Task<IActionResult?> RequireAdminAsync() =>
        RequirePermissionAsync(_permissionService, PermissionCodes.None, "Bu işlem için yönetim yetkisi gerekiyor.");

    [HttpGet("point")]
    public async Task<IActionResult> GetDeletedPoints()
    {
        try
        {
            var denied = await RequireAdminAsync();
            return denied ?? Ok(await _pointService.GetDeletedAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çöp kutusundaki noktalar listelenemedi.");
        }
    }

    [HttpGet("line")]
    public async Task<IActionResult> GetDeletedLines()
    {
        try
        {
            var denied = await RequireAdminAsync();
            return denied ?? Ok(await _lineService.GetDeletedAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çöp kutusundaki çizgiler listelenemedi.");
        }
    }

    [HttpGet("polygon")]
    public async Task<IActionResult> GetDeletedPolygons()
    {
        try
        {
            var denied = await RequireAdminAsync();
            return denied ?? Ok(await _polygonService.GetDeletedAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çöp kutusundaki alanlar listelenemedi.");
        }
    }

    [HttpPost("point/{id}/restore")]
    public async Task<IActionResult> RestorePoint(int id)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;
            return await _pointService.RestoreAsync(id) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Nokta geri getirilemedi.");
        }
    }

    [HttpPost("line/{id}/restore")]
    public async Task<IActionResult> RestoreLine(int id)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;
            return await _lineService.RestoreAsync(id) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çizgi geri getirilemedi.");
        }
    }

    [HttpPost("polygon/{id}/restore")]
    public async Task<IActionResult> RestorePolygon(int id)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;
            return await _polygonService.RestoreAsync(id) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Alan geri getirilemedi.");
        }
    }

    [HttpDelete("point/{id}")]
    public async Task<IActionResult> PermanentDeletePoint(int id)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;
            return await _pointService.PermanentDeleteAsync(id) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Nokta kalıcı olarak silinemedi.");
        }
    }

    [HttpDelete("line/{id}")]
    public async Task<IActionResult> PermanentDeleteLine(int id)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;
            return await _lineService.PermanentDeleteAsync(id) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çizgi kalıcı olarak silinemedi.");
        }
    }

    [HttpDelete("polygon/{id}")]
    public async Task<IActionResult> PermanentDeletePolygon(int id)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;
            return await _polygonService.PermanentDeleteAsync(id) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Alan kalıcı olarak silinemedi.");
        }
    }

    [HttpDelete("point")]
    public async Task<IActionResult> EmptyPointTrash()
    {
        try
        {
            var denied = await RequireAdminAsync();
            return denied ?? Ok(new { deleted = await _pointService.EmptyTrashAsync() });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Nokta çöp kutusu boşaltılamadı.");
        }
    }

    [HttpDelete("line")]
    public async Task<IActionResult> EmptyLineTrash()
    {
        try
        {
            var denied = await RequireAdminAsync();
            return denied ?? Ok(new { deleted = await _lineService.EmptyTrashAsync() });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çizgi çöp kutusu boşaltılamadı.");
        }
    }

    [HttpDelete("polygon")]
    public async Task<IActionResult> EmptyPolygonTrash()
    {
        try
        {
            var denied = await RequireAdminAsync();
            return denied ?? Ok(new { deleted = await _polygonService.EmptyTrashAsync() });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Alan çöp kutusu boşaltılamadı.");
        }
    }
}

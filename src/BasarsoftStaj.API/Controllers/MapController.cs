using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Faz 1a: "Birden fazla harita" — kullanıcının kendi fikri (hocanın verdiği bir görev
// değil, bkz. staj günlüğü notları). Listeleme ve yeniden adlandırma HERKESE açık
// (sadece kendi haritan üzerinde) — oluşturma ve çoğaltma ManageMultipleMaps iznine
// sahip roller/kullanıcılar için (bkz. PermissionCodes.ManageMultipleMaps).
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MapController : PermissionControllerBase
{
    private readonly IMapService _mapService;
    private readonly IPermissionService _permissionService;
    private readonly ICurrentUserService _currentUser;

    public MapController(
        IMapService mapService,
        IPermissionService permissionService,
        ICurrentUserService currentUser,
        ILogger<MapController> logger) : base(logger)
    {
        _mapService = mapService;
        _permissionService = permissionService;
        _currentUser = currentUser;
    }

    private Task<IActionResult?> RequireMultiMapAsync() =>
        RequirePermissionAsync(_permissionService, PermissionCodes.ManageMultipleMaps, "Bu rolün birden fazla harita yönetme yetkisi yok.");

    [HttpGet]
    public async Task<IActionResult> GetMine()
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            return Ok(await _mapService.GetMyMapsAsync(userId.Value));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Haritalar listelenemedi.");
        }
    }

    // Kullanıcının kendi isteği: "adminler herkesin haritasını görebilecek istediği
    // takdirde." PoiController.GetMapOptionsForAdmin ile AYNI "admin-only" deseni:
    // PermissionCodes.None hiçbir role gerçekten atanmadığı için RequirePermissionAsync
    // yalnızca ManageAdmin bypass'ıyla geçer.
    [HttpGet("admin/all")]
    public async Task<IActionResult> GetAllForAdmin()
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.None, "Tüm haritaları görmek için yönetim yetkisi gerekiyor.");
            if (denied != null) return denied;

            return Ok(await _mapService.GetAllForAdminAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Haritalar listelenemedi.");
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateMapDto dto)
    {
        try
        {
            var denied = await RequireMultiMapAsync();
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, result, error) = await _mapService.CreateAsync(userId.Value, dto, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Harita oluşturulamadı.");
        }
    }

    [HttpPatch("{id}")]
    public async Task<IActionResult> Rename(int id, [FromBody] CreateMapDto dto)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapService.RenameAsync(userId.Value, id, dto, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Harita yeniden adlandırılamadı.");
        }
    }

    // Kullanıcının kendi isteği: harita silme — herkese açık (kendi haritan üzerinde,
    // Rename gibi özel izin gerektirmiyor; ManageMultipleMaps sadece YENİ oluşturma/
    // çoğaltma için gerekli, silme "kendi malını yönetme" kapsamında).
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapService.DeleteAsync(userId.Value, id, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Harita silinemedi.");
        }
    }

    // Görev #75 (kullanıcının kendi isteği: "harita silme geri getirme gelsin"): sahibin
    // KENDİ çöp kutusu — geometri Trash'i (TrashController) admin-only'ydi, bu herkese açık
    // (kendi haritan üzerinde, Delete/Rename ile aynı yetki mantığı).
    [HttpGet("trash")]
    public async Task<IActionResult> GetTrash()
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            return Ok(await _mapService.GetDeletedMapsAsync(userId.Value));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çöp kutusu listelenemedi.");
        }
    }

    [HttpPost("{id}/restore")]
    public async Task<IActionResult> Restore(int id)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapService.RestoreAsync(userId.Value, id, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Harita geri getirilemedi.");
        }
    }

    [HttpDelete("{id}/permanent")]
    public async Task<IActionResult> PermanentDelete(int id)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapService.PermanentDeleteAsync(userId.Value, id, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Harita kalıcı olarak silinemedi.");
        }
    }

    // Görev #77 (kullanıcının kendi isteği: "map favorileme gelsin"): herkese açık (kendi
    // haritan üzerinde, Rename/Delete ile aynı yetki mantığı).
    [HttpPatch("{id}/favorite")]
    public async Task<IActionResult> SetFavorite(int id, [FromBody] SetMapFavoriteDto dto)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapService.SetFavoriteAsync(userId.Value, id, dto.IsFavorite);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Favori durumu güncellenemedi.");
        }
    }

    // Kullanıcının kendi isteği (harita şeridi polish turu, ek tur): "ayarlardan istediğim
    // mapi varsayılan yapabilmeliyim" — istek gövdesi yok, id zaten route'ta (favorite ile
    // aynı yetki mantığı: herkese açık, sadece KENDİ haritan üzerinde).
    [HttpPatch("{id}/default")]
    public async Task<IActionResult> SetDefault(int id)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapService.SetDefaultAsync(userId.Value, id);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Varsayılan harita güncellenemedi.");
        }
    }

    // Görev #77 (kullanıcının kendi isteği: "mapleri kendimiz tutup sürükleme mantığı ile
    // dizebilelim"): frontend, kullanıcının sürükleyip bıraktığı haldeki TÜM harita
    // id'lerini sırayla gönderiyor.
    [HttpPatch("reorder")]
    public async Task<IActionResult> Reorder([FromBody] ReorderMapsDto dto)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, error) = await _mapService.ReorderAsync(userId.Value, dto.OrderedIds);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Sıralama kaydedilemedi.");
        }
    }

    [HttpPost("{id}/duplicate")]
    public async Task<IActionResult> Duplicate(int id)
    {
        try
        {
            var denied = await RequireMultiMapAsync();
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var (success, result, error) = await _mapService.DuplicateAsync(userId.Value, id, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Harita çoğaltılamadı.");
        }
    }
}

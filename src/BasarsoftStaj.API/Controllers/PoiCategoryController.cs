using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Hoca ödevi: POI'nin hiyerarşik kategorileri. Listeleme herkese açık (POI ekleme formunda
// dropdown için lazım — Kullanıcı rolü bile POI'leri GÖRÜNTÜLEYEBİLDİĞİ için kategori
// isimlerini de görebilmeli), oluşturma/düzenleme/silme ManagePoiCategories iznine sahip
// roller/kullanıcılar için (Admin Paneli'ndeki "POI Yönetimi" sekmesi).
[ApiController]
[Route("api/[controller]")]
public class PoiCategoryController : PermissionControllerBase
{
    private readonly IPoiCategoryService _poiCategoryService;
    private readonly IPermissionService _permissionService;

    public PoiCategoryController(IPoiCategoryService poiCategoryService, IPermissionService permissionService, ILogger<PoiCategoryController> logger)
        : base(logger)
    {
        _poiCategoryService = poiCategoryService;
        _permissionService = permissionService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            return Ok(await _poiCategoryService.GetAllAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI kategorileri listelenemedi.");
        }
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePoiCategoryDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManagePoiCategories, "Bu rolün POI kategorisi yönetme yetkisi yok.");
            if (denied != null) return denied;

            var (success, result, error) = await _poiCategoryService.CreateAsync(dto, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI kategorisi oluşturulamadı.");
        }
    }

    [Authorize]
    [HttpPatch("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdatePoiCategoryDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManagePoiCategories, "Bu rolün POI kategorisi yönetme yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _poiCategoryService.UpdateAsync(id, dto, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI kategorisi güncellenemedi.");
        }
    }

    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManagePoiCategories, "Bu rolün POI kategorisi silme yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _poiCategoryService.DeleteAsync(id, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "POI kategorisi silinemedi.");
        }
    }
}

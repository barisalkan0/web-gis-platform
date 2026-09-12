using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Kategoriler (doğalgaz hattı, su hattı vs.) — çizim yaparken opsiyonel olarak
// seçilebiliyor. Listeleme herkese açık (haritada filtre için lazım), oluşturma/
// düzenleme/silme ManageCategories/DeleteCategories iznine sahip roller/kullanıcılar için.
[ApiController]
[Route("api/[controller]")]
public class CategoryController : PermissionControllerBase
{
    private readonly ICategoryService _categoryService;
    private readonly IPermissionService _permissionService;

    public CategoryController(ICategoryService categoryService, IPermissionService permissionService, ILogger<CategoryController> logger)
        : base(logger)
    {
        _categoryService = categoryService;
        _permissionService = permissionService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            return Ok(await _categoryService.GetAllAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kategoriler listelenemedi.");
        }
    }

    [Authorize]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCategoryDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageCategories, "Bu rolün kategori yönetme yetkisi yok.");
            if (denied != null) return denied;

            var (success, result, error) = await _categoryService.CreateAsync(dto, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kategori oluşturulamadı.");
        }
    }

    [Authorize]
    [HttpPatch("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateCategoryDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.ManageCategories, "Bu rolün kategori yönetme yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _categoryService.UpdateAsync(id, dto);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kategori güncellenemedi.");
        }
    }

    [Authorize]
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DeleteCategories, "Bu rolün kategori silme yetkisi yok.");
            if (denied != null) return denied;

            var (success, error) = await _categoryService.DeleteAsync(id);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kategori silinemedi.");
        }
    }
}

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Discord tarzı rol yönetimi: listele, oluştur, düzenle (isim/renk/izin listesi), sil.
// Hepsi ManageAdmin iznine sahip roller/kullanıcılar için.
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class RoleController : PermissionControllerBase
{
    private readonly IRoleService _roleService;
    private readonly IPermissionService _permissionService;

    public RoleController(IRoleService roleService, IPermissionService permissionService, ILogger<RoleController> logger) : base(logger)
    {
        _roleService = roleService;
        _permissionService = permissionService;
    }

    private Task<IActionResult?> RequireAdminAsync() =>
        RequirePermissionAsync(_permissionService, PermissionCodes.None, "Bu işlem için yönetim yetkisi gerekiyor.");

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var denied = await RequireAdminAsync();
            return denied ?? Ok(await _roleService.GetAllAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Roller listelenemedi.");
        }
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRoleDto dto)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;

            var (success, result, error) = await _roleService.CreateAsync(dto, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Rol oluşturulamadı.");
        }
    }

    [HttpPatch("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateRoleDto dto)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;

            var (success, error) = await _roleService.UpdateAsync(id, dto, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Rol güncellenemedi.");
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;

            var (success, error) = await _roleService.DeleteAsync(id, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Rol silinemedi.");
        }
    }
}

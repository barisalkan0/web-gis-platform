using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Admin paneli: kullanıcı listesi + ekle/çıkar/güncelle + rol atama + doğrudan izin atama +
// aktivite logları (Gün 6). Rol oluşturma/silme/izin düzenleme RoleController'da, kategori
// yönetimi CategoryController'da — her biri kendi izin kodunu kendi kontrol ediyor.
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AdminController : PermissionControllerBase
{
    private readonly IUserService _userService;
    private readonly IRoleService _roleService;
    private readonly IAuditLogService _auditLogService;
    private readonly IPermissionService _permissionService;

    public AdminController(
        IUserService userService,
        IRoleService roleService,
        IAuditLogService auditLogService,
        IPermissionService permissionService,
        ILogger<AdminController> logger) : base(logger)
    {
        _userService = userService;
        _roleService = roleService;
        _auditLogService = auditLogService;
        _permissionService = permissionService;
    }

    private Task<IActionResult?> RequireAdminAsync() =>
        RequirePermissionAsync(_permissionService, PermissionCodes.None, "Bu işlem için yönetim yetkisi gerekiyor.");

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        try
        {
            var denied = await RequireAdminAsync();
            return denied ?? Ok(await _userService.GetAllAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcılar listelenemedi.");
        }
    }

    // Gün 6: "Kullanıcı Listesi (Ekle/Çıkar/Güncelle)" — Ekle.
    [HttpPost("users")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserDto dto)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;

            var (success, result, error) = await _userService.CreateAsync(dto, User.Identity!.Name!);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcı oluşturulamadı.");
        }
    }

    // Gün 6: "Kullanıcı Listesi (Ekle/Çıkar/Güncelle)" — Güncelle (kullanıcı adı/aktiflik).
    // Rol değişikliği kasıtlı olarak burada değil, ayrı ve zaten çalışan bir uç nokta.
    [HttpPatch("users/{id}")]
    public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserDto dto)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;

            var (success, error) = await _userService.UpdateAsync(id, dto, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcı güncellenemedi.");
        }
    }

    // Gün 6: "Kullanıcı Listesi (Ekle/Çıkar/Güncelle)" — Çıkar. Kalıcı silme DEĞİL, soft
    // delete (projenin genelindeki "hiçbir kayıt gerçekten silinmiyor" kuralına tutarlı).
    [HttpDelete("users/{id}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;

            var (success, error) = await _userService.DeleteAsync(id, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcı çıkarılamadı.");
        }
    }

    [HttpPatch("users/{id}/role")]
    public async Task<IActionResult> AssignRole(int id, [FromBody] AssignRoleDto dto)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;

            var (success, error) = await _userService.AssignRoleAsync(id, dto.RoleId, User.Identity!.Name!);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcının rolü güncellenemedi.");
        }
    }

    // Gün 6: "Yetkiler hem Role hem de doğrudan Kullanıcıya atanabilmelidir." — bu uç nokta
    // bir kullanıcıya ROLÜNDEN BAĞIMSIZ doğrudan izin atıyor/kaldırıyor. Zaten rolden gelen
    // bir izni burada TEKRAR göndermeye gerek yok (frontend zaten göndermiyor, disabled+
    // "rolden geliyor" rozetiyle gösteriyor) ama gönderilse de zararı olmaz, sadece gereksiz
    // bir UserPermission satırı olarak durur.
    [HttpPatch("users/{id}/permissions")]
    public async Task<IActionResult> SetUserPermissions(int id, [FromBody] SetPermissionsDto dto)
    {
        try
        {
            var denied = await RequireAdminAsync();
            if (denied != null) return denied;

            await _permissionService.SetDirectUserPermissionsAsync(id, dto.PermissionCodes);
            await _auditLogService.LogAsync(User.Identity!.Name!, "user.permissions_change", $"Kullanıcı #{id} için doğrudan izinler güncellendi.");
            return NoContent();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcı izinleri güncellenemedi.");
        }
    }

    [HttpGet("logs")]
    public async Task<IActionResult> GetLogs()
    {
        try
        {
            var denied = await RequireAdminAsync();
            return denied ?? Ok(await _auditLogService.GetRecentAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Loglar listelenemedi.");
        }
    }

    [HttpGet("logs/paged")]
    public async Task<IActionResult> GetLogsPage([FromQuery] int page = 1, [FromQuery] int pageSize = 25)
    {
        try
        {
            var denied = await RequireAdminAsync();
            return denied ?? Ok(await _auditLogService.GetPageAsync(page, pageSize));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Log sayfası listelenemedi.");
        }
    }
}

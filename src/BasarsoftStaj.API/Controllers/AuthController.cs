using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;

namespace BasarsoftStaj.API.Controllers;

// Katmanlı mimari: Controller artık BCrypt/JWT/EF detaylarıyla hiç ilgilenmiyor,
// sadece IAuthService'i çağırıp sonucu uygun HTTP yanıtına çeviriyor.
[ApiController]
[Route("api/[controller]")]
public class AuthController : ApiControllerBase
{
    private readonly IAuthService _authService;
    private readonly IRoleService _roleService;
    private readonly IPermissionService _permissionService;
    private readonly ICurrentUserService _currentUser;

    public AuthController(IAuthService authService, IRoleService roleService, IPermissionService permissionService, ICurrentUserService currentUser, ILogger<AuthController> logger) : base(logger)
    {
        _authService = authService;
        _roleService = roleService;
        _permissionService = permissionService;
        _currentUser = currentUser;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequestDto dto)
    {
        try
        {
            var (success, error) = await _authService.RegisterAsync(dto);
            if (!success)
            {
                var isDuplicate = error == "Bu kullanıcı adı zaten kullanılıyor.";
                return isDuplicate ? Conflict(new { message = error }) : BadRequest(new { message = error });
            }

            return Created(string.Empty, new { message = "Kayıt başarılı." });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kayıt oluşturulamadı.");
        }
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequestDto dto)
    {
        try
        {
            var (success, result) = await _authService.LoginAsync(dto);
            if (!success)
            {
                return Unauthorized(new { message = "Kullanıcı adı veya şifre hatalı." });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Giriş yapılamadı.");
        }
    }

    // Giriş yaptıktan hemen sonra (ve harita/admin panelinde her ihtiyaç duyulduğunda)
    // frontend'in "ben kimim, ne yapabilirim" diye sorduğu uç nokta. Rol/izin bilgisi
    // JWT'nin içine gömülü DEĞİL, her çağrıda DB'den taze okunuyor — bir admin rolü
    // yeniden adlandırsa/izinlerini değiştirse bile kullanıcı yeniden giriş yapmadan
    // bir sonraki /me çağrısında güncel halini görür.
    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        try
        {
            var username = User.FindFirstValue(ClaimTypes.Name);
            if (username == null) return Unauthorized();

            var role = await _roleService.GetRoleForUsernameAsync(username);
            if (role == null) return Unauthorized();

            var permissionCodes = await _permissionService.GetEffectivePermissionCodesForUsernameAsync(username);
            var userId = _currentUser.GetUserId(User);

            return Ok(new MeDto
            {
                UserId = userId ?? 0,
                Username = username,
                RoleId = role.Id,
                RoleName = role.Name,
                RoleColor = role.Color,
                PermissionCodes = permissionCodes,
            });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Kullanıcı bilgisi alınamadı.");
        }
    }
}

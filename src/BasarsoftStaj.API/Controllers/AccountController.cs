using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;

namespace BasarsoftStaj.API.Controllers;

// Herkese açık "Ayarlar" sayfası — şifre değiştirme ve hesabı kapatma (Tehlikeli Bölge).
// Admin izinleriyle ilgisi yok, giriş yapmış her kullanıcı kendi hesabı için kullanabilir.
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AccountController : ApiControllerBase
{
    private readonly IAccountService _accountService;

    public AccountController(IAccountService accountService, ILogger<AccountController> logger) : base(logger)
    {
        _accountService = accountService;
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
    {
        try
        {
            var (success, error) = await _accountService.ChangePasswordAsync(User.Identity!.Name!, dto);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Şifre değiştirilemedi.");
        }
    }

    [HttpPost("delete")]
    public async Task<IActionResult> DeleteAccount([FromBody] DeleteAccountDto dto)
    {
        try
        {
            var (success, error) = await _accountService.DeleteOwnAccountAsync(User.Identity!.Name!, dto);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Hesap silinemedi.");
        }
    }
}

using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

public interface IAuthService
{
    Task<(bool Success, string? Error)> RegisterAsync(RegisterRequestDto dto);
    Task<(bool Success, LoginResponseDto? Result)> LoginAsync(LoginRequestDto dto);
}

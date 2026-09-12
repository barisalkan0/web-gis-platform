using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class AuthService : IAuthService
{
    private readonly IConfiguration _configuration;
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<Role> _roleRepository;

    public AuthService(IConfiguration configuration, IRepository<User> userRepository, IRepository<Role> roleRepository)
    {
        _configuration = configuration;
        _userRepository = userRepository;
        _roleRepository = roleRepository;
    }

    public async Task<(bool Success, string? Error)> RegisterAsync(RegisterRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.Password))
        {
            return (false, "Kullanıcı adı ve şifre boş olamaz.");
        }

        if (dto.Password != dto.ConfirmPassword)
        {
            return (false, "Şifreler eşleşmiyor.");
        }

        var existingUser = await _userRepository.FindAsync(u => u.Username == dto.Username && !u.IsDeleted);
        if (existingUser != null)
        {
            return (false, "Bu kullanıcı adı zaten kullanılıyor.");
        }

        // İlk kayıt olan kullanıcı otomatik Admin rolü (seed id 2) alır, sonrakiler
        // varsayılan Kullanıcı rolüne (seed id 1) düşer. Sonradan admin panelinden
        // istenildiği gibi değiştirilebilir.
        var anyUserExists = (await _userRepository.GetAllAsync()).Any();

        var user = new User
        {
            Username = dto.Username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            IsDeleted = false,
            IsActive = true,
            ModifiedDate = DateTime.UtcNow,
            CreatedDate = DateTime.UtcNow,
            RoleId = anyUserExists ? Role.DefaultUserRoleId : Role.DefaultAdminRoleId,
        };

        await _userRepository.AddAsync(user);
        await _userRepository.SaveChangesAsync();

        return (true, null);
    }

    public async Task<(bool Success, LoginResponseDto? Result)> LoginAsync(LoginRequestDto dto)
    {
        var user = await _userRepository.FindAsync(u => u.Username == dto.Username && !u.IsDeleted && u.IsActive);
        if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
        {
            return (false, null);
        }

        var role = await _roleRepository.GetByIdAsync(user.RoleId);

        var jwtSettings = _configuration.GetSection("Jwt");
        var key = Encoding.UTF8.GetBytes(jwtSettings["Key"]!);
        var expiryMinutes = int.Parse(jwtSettings["ExpiryMinutes"]!);
        var expiresAt = DateTime.UtcNow.AddMinutes(expiryMinutes);

        // Not: JWT'deki Role claim'i sadece bilgi amaçlı (görüntüleme) — gerçek izin
        // kontrolleri her istekte DB'den taze okunuyor (bkz. RoleService.GetRoleForUsernameAsync),
        // böylece bir rol yeniden adlandırılsa/izinleri değişse bile token geçerliyken
        // hemen yansır, tekrar login gerekmez.
        // NameIdentifier: "harita sadece giriş yapmış kullanıcının kendi çizimlerini
        // listelesin" isteği için — controller'lar bu claim'den kullanıcı id'sini okuyup
        // GET/POST'larda InsertedUserId filtresi/damgası olarak kullanıyor (bkz.
        // ICurrentUserService). Bu değişiklikten ÖNCE alınmış tokenlarda bu claim yok,
        // o kullanıcıların bir kere daha giriş yapması gerekir.
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, role?.Name ?? "?"),
        };

        var credentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: jwtSettings["Issuer"],
            audience: jwtSettings["Audience"],
            claims: claims,
            expires: expiresAt,
            signingCredentials: credentials
        );

        var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

        return (true, new LoginResponseDto
        {
            Token = tokenString,
            ExpiresAt = expiresAt,
        });
    }
}

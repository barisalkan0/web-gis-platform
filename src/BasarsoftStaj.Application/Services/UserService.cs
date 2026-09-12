using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class UserService : IUserService
{
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IAuditLogService _auditLogService;
    private readonly IPermissionService _permissionService;

    public UserService(
        IRepository<User> userRepository,
        IRepository<Role> roleRepository,
        IAuditLogService auditLogService,
        IPermissionService permissionService)
    {
        _userRepository = userRepository;
        _roleRepository = roleRepository;
        _auditLogService = auditLogService;
        _permissionService = permissionService;
    }

    public async Task<IEnumerable<UserSummaryDto>> GetAllAsync()
    {
        var users = (await _userRepository.GetAllAsync()).Where(u => !u.IsDeleted).OrderBy(u => u.CreatedDate).ToList();
        var roles = (await _roleRepository.GetAllAsync()).ToDictionary(r => r.Id);

        var result = new List<UserSummaryDto>();
        foreach (var u in users)
        {
            roles.TryGetValue(u.RoleId, out var role);
            var directPermissionCodes = await _permissionService.GetDirectUserPermissionCodesAsync(u.Id);
            result.Add(new UserSummaryDto
            {
                Id = u.Id,
                Username = u.Username,
                RoleId = u.RoleId,
                RoleName = role?.Name ?? "?",
                RoleColor = role?.Color ?? "#6b7280",
                CreatedDate = u.CreatedDate,
                IsActive = u.IsActive,
                DirectPermissionCodes = directPermissionCodes,
            });
        }
        return result;
    }

    public async Task<(bool Success, string? Error)> AssignRoleAsync(int userId, int roleId, string actorUsername)
    {
        var user = await _userRepository.GetByIdAsync(userId);
        if (user == null || user.IsDeleted)
        {
            return (false, "Kullanıcı bulunamadı.");
        }

        var newRole = await _roleRepository.GetByIdAsync(roleId);
        if (newRole == null)
        {
            return (false, "Rol bulunamadı.");
        }

        var oldRole = await _roleRepository.GetByIdAsync(user.RoleId);

        // Yönetim yetkili (ManageAdmin) son kullanıcının rolünü, başka yönetim yetkili
        // kimse yokken değiştirmeye izin vermiyoruz — yoksa panele kimse giremez.
        var oldRoleWasAdmin = oldRole != null && await _permissionService.RoleHasPermissionAsync(oldRole.Id, PermissionCodes.ManageAdmin);
        var newRoleIsAdmin = await _permissionService.RoleHasPermissionAsync(roleId, PermissionCodes.ManageAdmin);
        if (oldRoleWasAdmin && !newRoleIsAdmin)
        {
            var otherAdminCapableUsers = await CountOtherAdminCapableUsersAsync(excludeUserId: userId);
            if (otherAdminCapableUsers == 0)
            {
                return (false, "Son yönetim yetkili kullanıcının rolü değiştirilemez. Önce başka birini bu yetkiye sahip bir role atayın.");
            }
        }

        user.RoleId = roleId;
        user.ModifiedDate = DateTime.UtcNow;
        await _userRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(
            actorUsername,
            "user.role_change",
            $"'{user.Username}' kullanıcısının rolü '{oldRole?.Name ?? "?"}' → '{newRole.Name}' olarak değiştirildi.");

        return (true, null);
    }

    public async Task<(bool Success, UserSummaryDto? Result, string? Error)> CreateAsync(CreateUserDto dto, string actorUsername)
    {
        if (string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.Password))
        {
            return (false, null, "Kullanıcı adı ve şifre boş olamaz.");
        }

        var existing = await _userRepository.FindAsync(u => u.Username == dto.Username && !u.IsDeleted);
        if (existing != null)
        {
            return (false, null, "Bu kullanıcı adı zaten kullanılıyor.");
        }

        var roleId = dto.RoleId ?? Role.DefaultUserRoleId;
        var role = await _roleRepository.GetByIdAsync(roleId);
        if (role == null)
        {
            return (false, null, "Rol bulunamadı.");
        }

        var user = new User
        {
            Username = dto.Username.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            IsDeleted = false,
            IsActive = true,
            ModifiedDate = DateTime.UtcNow,
            CreatedDate = DateTime.UtcNow,
            RoleId = roleId,
        };

        await _userRepository.AddAsync(user);
        await _userRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "user.create", $"'{user.Username}' kullanıcısı admin panelinden oluşturuldu (rol: '{role.Name}').");

        return (true, new UserSummaryDto
        {
            Id = user.Id,
            Username = user.Username,
            RoleId = user.RoleId,
            RoleName = role.Name,
            RoleColor = role.Color,
            CreatedDate = user.CreatedDate,
            IsActive = user.IsActive,
            DirectPermissionCodes = new List<string>(),
        }, null);
    }

    public async Task<(bool Success, string? Error)> UpdateAsync(int userId, UpdateUserDto dto, string actorUsername)
    {
        if (string.IsNullOrWhiteSpace(dto.Username))
        {
            return (false, "Kullanıcı adı boş olamaz.");
        }

        var user = await _userRepository.GetByIdAsync(userId);
        if (user == null || user.IsDeleted)
        {
            return (false, "Kullanıcı bulunamadı.");
        }

        var trimmedUsername = dto.Username.Trim();
        if (!string.Equals(trimmedUsername, user.Username, StringComparison.Ordinal))
        {
            var clash = await _userRepository.FindAsync(u => u.Username == trimmedUsername && !u.IsDeleted && u.Id != userId);
            if (clash != null)
            {
                return (false, "Bu kullanıcı adı zaten kullanılıyor.");
            }
        }

        var oldUsername = user.Username;
        user.Username = trimmedUsername;
        user.IsActive = dto.IsActive;
        user.ModifiedDate = DateTime.UtcNow;
        await _userRepository.SaveChangesAsync();

        var renameNote = oldUsername != user.Username ? $" (eski adı: '{oldUsername}')" : "";
        await _auditLogService.LogAsync(actorUsername, "user.update", $"'{user.Username}' kullanıcısı güncellendi{renameNote}.");
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> DeleteAsync(int userId, string actorUsername)
    {
        var user = await _userRepository.GetByIdAsync(userId);
        if (user == null || user.IsDeleted)
        {
            return (false, "Kullanıcı bulunamadı.");
        }

        var role = await _roleRepository.GetByIdAsync(user.RoleId);
        var isAdminCapable = role != null && await _permissionService.RoleHasPermissionAsync(role.Id, PermissionCodes.ManageAdmin);
        if (isAdminCapable)
        {
            var otherAdminCapableUsers = await CountOtherAdminCapableUsersAsync(excludeUserId: userId);
            if (otherAdminCapableUsers == 0)
            {
                return (false, "Son yönetim yetkili kullanıcı silinemez. Önce başka birini bu yetkiye sahip bir role atayın.");
            }
        }

        user.IsDeleted = true;
        user.DeletedAt = DateTime.UtcNow;
        user.ModifiedDate = DateTime.UtcNow;
        await _userRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "user.delete", $"'{user.Username}' kullanıcısı admin panelinden çıkarıldı (soft delete).");
        return (true, null);
    }

    private async Task<int> CountOtherAdminCapableUsersAsync(int excludeUserId)
    {
        var allUsers = (await _userRepository.GetAllAsync()).Where(u => !u.IsDeleted && u.Id != excludeUserId).ToList();
        var roles = (await _roleRepository.GetAllAsync()).ToDictionary(r => r.Id);

        var count = 0;
        foreach (var u in allUsers)
        {
            if (!roles.TryGetValue(u.RoleId, out var r)) continue;
            if (await _permissionService.RoleHasPermissionAsync(r.Id, PermissionCodes.ManageAdmin)) count++;
        }
        return count;
    }
}

using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class RoleService : IRoleService
{
    private readonly IRepository<Role> _roleRepository;
    private readonly IRepository<User> _userRepository;
    private readonly IAuditLogService _auditLogService;
    private readonly IPermissionService _permissionService;

    public RoleService(
        IRepository<Role> roleRepository,
        IRepository<User> userRepository,
        IAuditLogService auditLogService,
        IPermissionService permissionService)
    {
        _roleRepository = roleRepository;
        _userRepository = userRepository;
        _auditLogService = auditLogService;
        _permissionService = permissionService;
    }

    public async Task<IEnumerable<RoleDto>> GetAllAsync()
    {
        var roles = await _roleRepository.GetAllAsync();
        var activeUsers = (await _userRepository.GetAllAsync()).Where(u => !u.IsDeleted).ToList();

        var result = new List<RoleDto>();
        foreach (var role in roles.OrderByDescending(r => r.IsBuiltIn).ThenBy(r => r.Name))
        {
            var permissionCodes = await _permissionService.GetRolePermissionCodesAsync(role.Id);
            result.Add(ToDto(role, activeUsers.Count(u => u.RoleId == role.Id), permissionCodes));
        }
        return result;
    }

    public async Task<Role?> GetRoleForUsernameAsync(string username)
    {
        var user = await _userRepository.FindAsync(u => u.Username == username && !u.IsDeleted);
        if (user == null) return null;
        return await _roleRepository.GetByIdAsync(user.RoleId);
    }

    public async Task<(bool Success, RoleDto? Result, string? Error)> CreateAsync(CreateRoleDto dto, string actorUsername)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
        {
            return (false, null, "Rol adı boş olamaz.");
        }

        var existing = await _roleRepository.FindAsync(r => r.Name == dto.Name.Trim());
        if (existing != null)
        {
            return (false, null, "Bu isimde bir rol zaten var.");
        }

        var role = new Role
        {
            Name = dto.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim(),
            Color = string.IsNullOrWhiteSpace(dto.Color) ? "#6b7280" : dto.Color.Trim(),
        };

        await _roleRepository.AddAsync(role);
        await _roleRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "role.create", $"'{role.Name}' rolü oluşturuldu.");
        return (true, ToDto(role, 0, new List<string>()), null);
    }

    public async Task<(bool Success, string? Error)> UpdateAsync(int id, UpdateRoleDto dto, string actorUsername)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
        {
            return (false, "Rol adı boş olamaz.");
        }

        var role = await _roleRepository.GetByIdAsync(id);
        if (role == null)
        {
            return (false, "Rol bulunamadı.");
        }

        // Sistemde ManageAdmin yetkisine sahip en az bir rol kalmalı — yoksa hiç kimse
        // admin paneline erişemez hale gelir. Bu, tek admin rolünden bu yetkiyi kaldırmaya
        // çalışırken (o role atanmış kullanıcı olsun olmasın) kontrol.
        var hadManageAdmin = await _permissionService.RoleHasPermissionAsync(id, PermissionCodes.ManageAdmin);
        var willHaveManageAdmin = dto.PermissionCodes.Contains(PermissionCodes.ManageAdmin);
        if (hadManageAdmin && !willHaveManageAdmin)
        {
            var allRoles = await _roleRepository.GetAllAsync();
            var otherAdminCapableRoles = 0;
            foreach (var other in allRoles.Where(r => r.Id != id))
            {
                if (await _permissionService.RoleHasPermissionAsync(other.Id, PermissionCodes.ManageAdmin))
                {
                    otherAdminCapableRoles++;
                }
            }
            if (otherAdminCapableRoles == 0)
            {
                return (false, "Sistemde yönetim yetkisine sahip başka bir rol yok. Önce başka bir role bu yetkiyi verin.");
            }
        }

        var oldName = role.Name;
        role.Name = dto.Name.Trim();
        role.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
        role.Color = string.IsNullOrWhiteSpace(dto.Color) ? role.Color : dto.Color.Trim();

        await _roleRepository.SaveChangesAsync();
        await _permissionService.SetRolePermissionsAsync(id, dto.PermissionCodes);

        var renameNote = oldName != role.Name ? $" (eski adı: '{oldName}')" : "";
        await _auditLogService.LogAsync(actorUsername, "role.update", $"'{role.Name}' rolü güncellendi{renameNote}.");
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> DeleteAsync(int id, string actorUsername)
    {
        var role = await _roleRepository.GetByIdAsync(id);
        if (role == null)
        {
            return (false, "Rol bulunamadı.");
        }

        if (role.IsBuiltIn)
        {
            return (false, "Sistem rolleri (Kullanıcı/Admin) silinemez.");
        }

        var users = await _userRepository.GetAllAsync();
        var usersWithRole = users.Count(u => !u.IsDeleted && u.RoleId == id);
        if (usersWithRole > 0)
        {
            return (false, $"Bu role atanmış {usersWithRole} kullanıcı var. Önce onları başka bir role taşıyın.");
        }

        // Rolün kendi RolePermission satırları da silinsin — DB'de FK Cascade zaten
        // yapardı ama açıkça temizlemek "silinen rolün hayalet izin kayıtları" bırakmamak
        // için daha net.
        await _permissionService.SetRolePermissionsAsync(id, new List<string>());

        await _roleRepository.DeleteAsync(id);
        await _roleRepository.SaveChangesAsync();

        await _auditLogService.LogAsync(actorUsername, "role.delete", $"'{role.Name}' rolü silindi.");
        return (true, null);
    }

    private static RoleDto ToDto(Role r, int userCount, List<string> permissionCodes) => new()
    {
        Id = r.Id,
        Name = r.Name,
        Description = r.Description,
        Color = r.Color,
        IsBuiltIn = r.IsBuiltIn,
        PermissionCodes = permissionCodes,
        CreatedDate = r.CreatedDate,
        UserCount = userCount,
    };
}

using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class PermissionService : IPermissionService
{
    private readonly IRepository<Permission> _permissionRepository;
    private readonly IRepository<RolePermission> _rolePermissionRepository;
    private readonly IRepository<UserPermission> _userPermissionRepository;
    private readonly IRepository<User> _userRepository;

    public PermissionService(
        IRepository<Permission> permissionRepository,
        IRepository<RolePermission> rolePermissionRepository,
        IRepository<UserPermission> userPermissionRepository,
        IRepository<User> userRepository)
    {
        _permissionRepository = permissionRepository;
        _rolePermissionRepository = rolePermissionRepository;
        _userPermissionRepository = userPermissionRepository;
        _userRepository = userRepository;
    }

    public async Task<IEnumerable<PermissionDto>> GetAllAsync()
    {
        var permissions = await _permissionRepository.GetAllAsync();
        return permissions
            .OrderBy(p => p.Id)
            .Select(p => new PermissionDto { Id = p.Id, Code = p.Code, Name = p.Name, Description = p.Description });
    }

    public async Task<List<string>> GetRolePermissionCodesAsync(int roleId)
    {
        var codeById = (await _permissionRepository.GetAllAsync()).ToDictionary(p => p.Id, p => p.Code);
        var rolePermissions = await _rolePermissionRepository.GetAllAsync();
        return rolePermissions
            .Where(rp => rp.RoleId == roleId && codeById.ContainsKey(rp.PermissionId))
            .Select(rp => codeById[rp.PermissionId])
            .Distinct()
            .ToList();
    }

    public async Task<List<string>> GetDirectUserPermissionCodesAsync(int userId)
    {
        var codeById = (await _permissionRepository.GetAllAsync()).ToDictionary(p => p.Id, p => p.Code);
        var userPermissions = await _userPermissionRepository.GetAllAsync();
        return userPermissions
            .Where(up => up.UserId == userId && codeById.ContainsKey(up.PermissionId))
            .Select(up => codeById[up.PermissionId])
            .Distinct()
            .ToList();
    }

    public async Task<List<string>> GetEffectivePermissionCodesForUsernameAsync(string username)
    {
        var user = await _userRepository.FindAsync(u => u.Username == username && !u.IsDeleted);
        if (user == null) return new List<string>();

        var rolePermissionCodes = await GetRolePermissionCodesAsync(user.RoleId);
        var directPermissionCodes = await GetDirectUserPermissionCodesAsync(user.Id);
        return rolePermissionCodes.Union(directPermissionCodes).Distinct().ToList();
    }

    public async Task<bool> RoleHasPermissionAsync(int roleId, string code)
    {
        var codes = await GetRolePermissionCodesAsync(roleId);
        return codes.Contains(code);
    }

    // İstenen izin kodu (Code, string) listesini alıp Permission.Id'lere çeviriyor —
    // bilinmeyen/yazım hatalı bir kod sessizce yok sayılıyor (throw etmiyoruz, admin panel
    // zaten sadece GET /api/Permission'dan gelen gerçek kodları gönderiyor).
    private async Task<HashSet<int>> ResolvePermissionIdsAsync(List<string> permissionCodes)
    {
        var idByCode = (await _permissionRepository.GetAllAsync()).ToDictionary(p => p.Code, p => p.Id);
        return permissionCodes.Where(idByCode.ContainsKey).Select(code => idByCode[code]).ToHashSet();
    }

    public async Task SetRolePermissionsAsync(int roleId, List<string> permissionCodes)
    {
        var desiredIds = await ResolvePermissionIdsAsync(permissionCodes);
        var existing = (await _rolePermissionRepository.GetAllAsync()).Where(rp => rp.RoleId == roleId).ToList();
        var existingByPermissionId = existing.ToDictionary(rp => rp.PermissionId, rp => rp.Id);

        foreach (var permissionId in desiredIds.Except(existingByPermissionId.Keys))
        {
            await _rolePermissionRepository.AddAsync(new RolePermission { RoleId = roleId, PermissionId = permissionId });
        }
        foreach (var permissionId in existingByPermissionId.Keys.Except(desiredIds))
        {
            await _rolePermissionRepository.DeleteAsync(existingByPermissionId[permissionId]);
        }

        await _rolePermissionRepository.SaveChangesAsync();
    }

    public async Task SetDirectUserPermissionsAsync(int userId, List<string> permissionCodes)
    {
        var desiredIds = await ResolvePermissionIdsAsync(permissionCodes);
        var existing = (await _userPermissionRepository.GetAllAsync()).Where(up => up.UserId == userId).ToList();
        var existingByPermissionId = existing.ToDictionary(up => up.PermissionId, up => up.Id);

        foreach (var permissionId in desiredIds.Except(existingByPermissionId.Keys))
        {
            await _userPermissionRepository.AddAsync(new UserPermission { UserId = userId, PermissionId = permissionId });
        }
        foreach (var permissionId in existingByPermissionId.Keys.Except(desiredIds))
        {
            await _userPermissionRepository.DeleteAsync(existingByPermissionId[permissionId]);
        }

        await _userPermissionRepository.SaveChangesAsync();
    }
}

using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

// Gün 6 ödevi: dinamik yetkilendirme. Role üzerindeki eski sabit CanXxx boolean'larının
// yerini alan Permission/RolePermission/UserPermission üçlüsünü tek yerden yöneten servis
// (bkz. Domain/Entities/Permission.cs, RolePermission.cs, UserPermission.cs).
public interface IPermissionService
{
    Task<IEnumerable<PermissionDto>> GetAllAsync();

    // Bir rolün sahip olduğu izin kodları (RolePermission üzerinden).
    Task<List<string>> GetRolePermissionCodesAsync(int roleId);

    // Bir kullanıcıya ROLÜNDEN BAĞIMSIZ doğrudan atanmış izin kodları.
    Task<List<string>> GetDirectUserPermissionCodesAsync(int userId);

    // Efektif izin seti: rolden gelenler ∪ doğrudan atananlar. PermissionControllerBase ve
    // AuthController.Me() bunu kullanıyor — JWT'ye gömülü değil, her istekte DB'den taze.
    Task<List<string>> GetEffectivePermissionCodesForUsernameAsync(string username);

    // Bir rolün belirli bir izin koduna sahip olup olmadığı (düz kontrol, ManageAdmin
    // bypass'ı YOK) — RoleService/UserService'teki "son yönetici" güvenlik kontrolleri için.
    Task<bool> RoleHasPermissionAsync(int roleId, string code);

    // Admin panelindeki checkbox matrisinin "toplu kaydet"i — rolün/kullanıcının izin
    // setini TAMAMEN verilen listeyle değiştirir (fark analiz edip ekleme/çıkarma yapar).
    Task SetRolePermissionsAsync(int roleId, List<string> permissionCodes);
    Task SetDirectUserPermissionsAsync(int userId, List<string> permissionCodes);
}

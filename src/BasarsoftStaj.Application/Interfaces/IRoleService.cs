using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Interfaces;

public interface IRoleService
{
    Task<IEnumerable<RoleDto>> GetAllAsync();

    // GeometryController/CategoryController/AnalysisController'ın izin kontrolü için —
    // JWT'deki kullanıcı adından güncel rolü (ve dolayısıyla güncel izinleri) okur.
    // Rol adı/izinleri sonradan değiştirilse bile JWT'ye tekrar login olmadan yansır,
    // çünkü her istekte DB'den taze okunuyor.
    Task<Role?> GetRoleForUsernameAsync(string username);

    Task<(bool Success, RoleDto? Result, string? Error)> CreateAsync(CreateRoleDto dto, string actorUsername);
    Task<(bool Success, string? Error)> UpdateAsync(int id, UpdateRoleDto dto, string actorUsername);
    Task<(bool Success, string? Error)> DeleteAsync(int id, string actorUsername);
}

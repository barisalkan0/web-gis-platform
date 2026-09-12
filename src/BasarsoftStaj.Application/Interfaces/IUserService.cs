using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

public interface IUserService
{
    Task<IEnumerable<UserSummaryDto>> GetAllAsync();

    // Bir kullanıcının rolünü değiştirir (admin panelindeki dropdown). Sistemde ManageAdmin
    // yetkisine sahip son kullanıcının rolü, başka bir yönetici yetkili rol yokken
    // değiştirilemez.
    Task<(bool Success, string? Error)> AssignRoleAsync(int userId, int roleId, string actorUsername);

    // Gün 6: Admin panelinden "Kullanıcı Listesi (Ekle/Çıkar/Güncelle)".
    Task<(bool Success, UserSummaryDto? Result, string? Error)> CreateAsync(CreateUserDto dto, string actorUsername);
    Task<(bool Success, string? Error)> UpdateAsync(int userId, UpdateUserDto dto, string actorUsername);
    // Kalıcı silme DEĞİL — soft delete (IsDeleted=true), projenin geneline tutarlı.
    Task<(bool Success, string? Error)> DeleteAsync(int userId, string actorUsername);
}

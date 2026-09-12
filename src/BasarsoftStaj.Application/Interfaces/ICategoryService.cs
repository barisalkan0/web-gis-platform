using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

public interface ICategoryService
{
    Task<IEnumerable<CategoryDto>> GetAllAsync();
    Task<(bool Success, CategoryDto? Result, string? Error)> CreateAsync(CreateCategoryDto dto, string actorUsername);
    Task<(bool Success, string? Error)> UpdateAsync(int id, UpdateCategoryDto dto);
    Task<(bool Success, string? Error)> DeleteAsync(int id);
}

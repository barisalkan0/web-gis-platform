using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

public interface IPoiCategoryService
{
    // Düz liste dönüyor (ParentId ile) — hiyerarşiyi ağaca çevirmek frontend'in işi
    // (küçük bir liste için ekstra bir ağaç DTO'su/recursion'a gerek yok).
    Task<IEnumerable<PoiCategoryDto>> GetAllAsync();
    Task<(bool Success, PoiCategoryDto? Result, string? Error)> CreateAsync(CreatePoiCategoryDto dto, string actorUsername);
    Task<(bool Success, string? Error)> UpdateAsync(int id, UpdatePoiCategoryDto dto, string actorUsername);
    Task<(bool Success, string? Error)> DeleteAsync(int id, string actorUsername);
}

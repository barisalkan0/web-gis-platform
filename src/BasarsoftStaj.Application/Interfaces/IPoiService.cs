using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

public interface IPoiService
{
    // is_deleted=true olanlar hariç, hem harita katmanı hem Admin Paneli "POI Yönetimi"
    // listesi bunu kullanıyor — POI'ler haritaya-özel değil (bkz. Poi.cs yorumu), tek liste.
    Task<IEnumerable<PoiDto>> GetAllAsync(int mapId);
    Task<IEnumerable<PoiDto>> GetCatalogAsync();
    Task<IEnumerable<PoiDto>> GetAllForAdminAsync();
    Task<IEnumerable<PoiMapOptionDto>> GetMapOptionsForAdminAsync();
    Task<PoiDto?> GetByIdAsync(int id);
    Task<(bool Success, PoiDto? Result, string? Error)> CreateAsync(CreatePoiDto dto, int? userId);
    Task<(bool Success, PoiDto? Result, string? Error)> UpdateAsync(int id, UpdatePoiDto dto, string actorUsername);
    Task<(bool Success, PoiDto? Result, string? Error)> AssignMapAsync(int id, int mapId, string actorUsername);
    Task<(bool Success, PoiDto? Result, string? Error)> SetActiveAsync(int id, bool isActive, string actorUsername);
    Task<(bool Success, string? Error)> DeleteAsync(int id);
}

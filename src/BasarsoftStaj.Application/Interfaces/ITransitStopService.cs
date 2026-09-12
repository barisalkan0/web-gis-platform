using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

public interface ITransitStopService
{
    // Haritada gösterilecek tüm aktif duraklar (tüm güzergahlar birden) — POI'nin "catalog"
    // ucuyla AYNI fikir, tek fark GeoServer entegrasyonu yok (kapsam dışı, doğrudan DB).
    Task<IEnumerable<TransitStopDto>> GetAllAsync();

    // Güzergah Yönetimi panelindeki sürükle-bırak listesi: TEK güzergahın durakları, sıraya göre.
    Task<IEnumerable<TransitStopDto>> GetByRouteAsync(int routeId);

    Task<(bool Success, TransitStopDto? Result, string? Error)> CreateAsync(CreateTransitStopDto dto, int? userId, string actorUsername);
    Task<(bool Success, TransitStopDto? Result, string? Error)> UpdateAsync(int id, UpdateTransitStopDto dto, string actorUsername);
    Task<(bool Success, string? Error)> DeleteAsync(int id, string actorUsername);
    Task<(bool Success, string? Error)> ReorderAsync(int routeId, List<int> stopIds, string actorUsername);

    // Kullanıcının kendi isteği: "duraklatma" — duraklatılan durak hat çiziminden atlanır.
    Task<(bool Success, string? Error)> SetPausedAsync(int id, bool isPaused, string actorUsername);
}

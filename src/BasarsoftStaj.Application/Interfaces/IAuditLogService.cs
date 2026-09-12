using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

public interface IAuditLogService
{
    // mapId (Faz 3, opsiyonel): geometry.* aksiyonları hangi haritada olduğunu damgalar ki
    // harita sahibi (admin olmasa bile) kendi haritasına özel aktiviteyi görebilsin (bkz.
    // GetForMapAsync). Admin-only aksiyonlarda (rol/izin vs.) null bırakılır — imza geriye
    // dönük uyumlu kalsın diye opsiyonel parametre olarak eklendi.
    Task LogAsync(string actorUsername, string action, string details, int? mapId = null);
    Task<IEnumerable<AuditLogDto>> GetRecentAsync(int take = 200);
    Task<PagedResultDto<AuditLogDto>> GetPageAsync(int page = 1, int pageSize = 25);

    // Faz 3: bir haritaya özel (MapId eşleşen) son aksiyonlar — paylaşım modalındaki
    // "Aktivite" sekmesi için.
    Task<IEnumerable<AuditLogDto>> GetForMapAsync(int mapId, int take = 100);
}

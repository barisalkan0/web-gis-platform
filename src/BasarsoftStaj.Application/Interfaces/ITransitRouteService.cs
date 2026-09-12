using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

public interface ITransitRouteService
{
    Task<IEnumerable<TransitRouteDto>> GetAllAsync();
    Task<(bool Success, TransitRouteDto? Result, string? Error)> CreateAsync(CreateTransitRouteDto dto, int? userId, string actorUsername);
    Task<(bool Success, TransitRouteDto? Result, string? Error)> UpdateAsync(int id, UpdateTransitRouteDto dto, string actorUsername);
    // Bir güzergah silinince ona bağlı duraklar da (gerçek silme yok) is_deleted=true olur —
    // "yetim" (route'suz) durak asla oluşmaz, RouteId'nin NOT NULL olma garantisiyle tutarlı.
    Task<(bool Success, string? Error)> DeleteAsync(int id, string actorUsername);

    // Kullanıcının kendi isteği: "duraklatma".
    Task<(bool Success, string? Error)> SetPausedAsync(int id, bool isPaused, string actorUsername);

    // Kullanıcının kendi isteği: elle bükülen hattı kaydet (null/boş wkt = düz çizgiye dön).
    Task<(bool Success, string? Error)> SetPathAsync(int id, string? wkt, string actorUsername);

    // Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): "Güzergah üzerine 'Rota
    // Oluştur' butonu ekleyin." — aktif durakların güncel sırasına göre OSRM'e istek atıp
    // sonucu route.RouteGeometry'ye kaydeder.
    Task<(bool Success, TransitRouteDto? Result, string? Error)> GenerateRouteAsync(int id, string actorUsername);
}

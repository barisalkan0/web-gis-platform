using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

// "Envanter Analizi" — hem normal Poligon çiziminden sonra otomatik, hem de menüdeki
// geçici (kaydedilmeyen) analiz aracından çağrılıyor. İkisi de aynı mantığı kullanıyor:
// verilen bir poligonla mevcut nokta/çizgi/alan envanteri arasındaki kesişim sayısı.
public interface IInventoryAnalysisService
{
    // BUG FİX (kullanıcının kendi tespiti): mapId/userId/isOwner artık zorunlu — analiz
    // artık SADECE o haritadaki, görünür (herkese-açık + kendi özel) kayıtları tarıyor.
    Task<(bool Success, IntersectionResultDto? Result, string? Error)> AnalyzeAsync(AnalyzeIntersectionDto dto, int mapId, int? userId, bool isOwner);
}

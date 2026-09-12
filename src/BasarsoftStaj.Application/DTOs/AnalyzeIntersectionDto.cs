namespace BasarsoftStaj.Application.DTOs;

public class AnalyzeIntersectionDto
{
    public string Wkt { get; set; } = string.Empty;

    // BUG FİX (kullanıcının kendi tespiti — "toplam 7 diyor ama ekranda 1 nokta 1 çizgi
    // var"): eskiden bu DTO'da mapId yoktu, analiz TÜM veritabanını tarıyordu. Artık
    // GeometryController'daki ResolveMapIdAsync ile aynı mantık — gelmezse aktif
    // kullanıcının varsayılan haritasına düşülüyor (bkz. AnalysisController).
    public int? MapId { get; set; }
}

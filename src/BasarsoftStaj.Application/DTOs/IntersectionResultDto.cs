namespace BasarsoftStaj.Application.DTOs;

// "Envanter Analizi" sonucu — çizilen poligonla kesişen mevcut nokta/çizgi/alan sayısı.
public class IntersectionResultDto
{
    public int PointCount { get; set; }
    public int LineCount { get; set; }
    public int PolygonCount { get; set; }
    public int TotalCount => PointCount + LineCount + PolygonCount;

    // Kesişen kayıtların gerçek id'leri — frontend bunları haritada neon/parlak
    // vurgulayabilsin diye ("analiz kesişiminin içinde kalanlar parlasın" isteği).
    public List<int> PointIds { get; set; } = new();
    public List<int> LineIds { get; set; } = new();
    public List<int> PolygonIds { get; set; } = new();

    // Kesişen TÜM alanların (poligonların) birleşimi — tek bir geometri (çakışan/iç içe
    // kısımlar birleştirilmiş, tekrar saymıyor). Frontend "toplam alan"ı BUNUN üzerinden
    // hesaplıyor, tek tek alanları toplamak yerine — böylece iki poligon üst üste binse
    // bile o ortak bölge toplamda sadece bir kere sayılır. WKT dönmemizin sebebi: gerçek
    // (coğrafi/geodesic) m² hesabı SRID 4326 derece cinsinden anlamsız kalıyor (bkz.
    // frontend describeGeometry yorumu), o yüzden alan hesabı burada değil, frontend'de
    // ol/sphere ile projeksiyona duyarlı yapılıyor — biz sadece doğru TOPOLOJIYI (union)
    // sağlıyoruz, NetTopologySuite bunun için hazır ve güvenilir.
    public string? UnionedPolygonWkt { get; set; }
}

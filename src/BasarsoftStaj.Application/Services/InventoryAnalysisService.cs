using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using NetTopologySuite.Operation.Union;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

public class InventoryAnalysisService : IInventoryAnalysisService
{
    private const int Srid = 4326;
    private static readonly WKTReader WktReader = new();
    private static readonly WKTWriter WktWriter = new();

    private readonly IGeometryService<TblPoint, Point> _pointService;
    private readonly IGeometryService<TblLine, LineString> _lineService;
    private readonly IGeometryService<TblPolygon, Polygon> _polygonService;

    public InventoryAnalysisService(
        IGeometryService<TblPoint, Point> pointService,
        IGeometryService<TblLine, LineString> lineService,
        IGeometryService<TblPolygon, Polygon> polygonService)
    {
        _pointService = pointService;
        _lineService = lineService;
        _polygonService = polygonService;
    }

    public async Task<(bool Success, IntersectionResultDto? Result, string? Error)> AnalyzeAsync(AnalyzeIntersectionDto dto, int mapId, int? userId, bool isOwner)
    {
        Geometry polygon;
        try
        {
            polygon = WktReader.Read(dto.Wkt);
            polygon.SRID = Srid;
        }
        catch (Exception)
        {
            return (false, null, "Geçersiz poligon verisi.");
        }

        if (polygon is not Polygon)
        {
            return (false, null, "Analiz için bir poligon (alan) gönderilmeli.");
        }

        // Hoca isteği: tam kapsanma şart değil, kısmi kesişim de sayılıyor —
        // bu yüzden Contains/Within değil Intersects kullanıyoruz (bkz. GeometryService).
        // Sayı yerine doğrudan id listesini çekiyoruz (Count = id listesinin uzunluğu) —
        // frontend haritada hangi kayıtların kesiştiğini id'lerle bulup parlak gösterebilsin.
        var pointIds = await _pointService.GetIntersectingIdsAsync(polygon, mapId, userId, isOwner);
        var lineIds = await _lineService.GetIntersectingIdsAsync(polygon, mapId, userId, isOwner);
        var polygonIds = await _polygonService.GetIntersectingIdsAsync(polygon, mapId, userId, isOwner);

        // "Alanlar iç içeyse (üst üste binerse) toplamı yanlış hesaplamayalım" isteği —
        // her poligonun alanını ayrı ayrı toplamak yerine, kesişen poligonların TOPOLOJİK
        // birleşimini (union) alıyoruz; ortak/çakışan bölgeler union'da bir kere var olur.
        // NetTopologySuite bu iş için hazır ve güvenilir (UnaryUnionOp, çoklu geometri
        // birleştirmede pairwise .Union() zincirlemekten daha sağlam). Gerçek m² hesabı
        // burada YAPILMIYOR bilerek — SRID 4326 (derece) üzerinde .Area anlamsız kalır,
        // frontend bu WKT'yi ol/sphere ile projeksiyona duyarlı hesaplıyor (bkz. DTO yorumu).
        var polygonWkts = await _polygonService.GetIntersectingWktAsync(polygon, mapId, userId, isOwner);
        string? unionedPolygonWkt = null;
        if (polygonWkts.Count > 0)
        {
            var geometries = polygonWkts.Select(w => WktReader.Read(w)).ToList();
            var unioned = UnaryUnionOp.Union(geometries);
            unioned.SRID = Srid;
            unionedPolygonWkt = WktWriter.Write(unioned);
        }

        return (true, new IntersectionResultDto
        {
            PointCount = pointIds.Count,
            LineCount = lineIds.Count,
            PolygonCount = polygonIds.Count,
            PointIds = pointIds,
            LineIds = lineIds,
            PolygonIds = polygonIds,
            UnionedPolygonWkt = unionedPolygonWkt,
        }, null);
    }
}

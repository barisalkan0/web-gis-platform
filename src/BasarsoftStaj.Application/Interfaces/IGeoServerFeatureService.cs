namespace BasarsoftStaj.Application.Interfaces;

// Hocanın "GeoServer Kurulumu ve Kavramlar" + "Veritabanı Servis Entegrasyonu" ödevi
// (bkz. docs/geoserver-kurulum.md): backend artık nokta/çizgi/alan verisini DOĞRUDAN
// veritabanından değil, GeoServer'ın WFS servisinden (GetFeature, outputFormat=
// application/json) çekiyor. GeoServer'ın kendisi PostGIS'e bağlı bir "store" üzerinden
// AYNI tabloları (tbl_point/tbl_line/tbl_polygon) canlı okuyor — veri hâlâ tek kaynaktan
// (PostGIS) geliyor, sadece okuma yolu backend->DB yerine backend->GeoServer->DB oldu.
public interface IGeoServerFeatureService
{
    // layerName: GeoServer'da yayınlanan katmanın adı, workspace'siz (tbl_point/tbl_line/
    // tbl_polygon — bkz. GeometryService.GeoServerLayerName). cqlFilter: ECQL WHERE koşulu
    // (ör. "is_deleted = false AND map_id = 5") — GetAllAsync'in eski LINQ .Where()
    // zincirinin GeoServer tarafındaki karşılığı.
    Task<List<GeoServerFeature>> GetFeaturesAsync(string layerName, string cqlFilter);

    // Hoca ödevi (GeoServer POI Entegrasyonu): tbl_point/tbl_line/tbl_polygon'a özel sabit
    // GeoServerFeature şeklinin (Place/Color/InsertedUserId...) "poi" tablosunun kendi
    // kolonlarıyla (kategori_id, mesai_saatleri, il/ilçe, user_id...) birebir örtüşmemesi
    // yüzünden GENEL amaçlı bir okuma yolu eklendi — properties'i ham (tip bazında ayrıştırma
    // çağıran tarafa ait) döndürüyor, her yeni tablo için GeoServerFeature'ı şişirmek yerine.
    Task<List<RawGeoServerFeature>> GetRawFeaturesAsync(string layerName, string cqlFilter);
}

// properties: JsonElement.Clone() ile alınmış, orijinal JsonDocument'ın ömründen bağımsız
// (Clone() tam olarak bu senaryo için var — bkz. GeoServerFeatureService.GetRawFeaturesAsync).
public class RawGeoServerFeature
{
    public int Id { get; set; }
    public string Wkt { get; set; } = string.Empty;
    public System.Text.Json.JsonElement Properties { get; set; }
}

// WFS GeoJSON yanıtındaki tek bir feature'ın, GeometryService.ToDto ile aynı şekle
// (bkz. GeometryDto) çevrilmiş hali.
public class GeoServerFeature
{
    public int Id { get; set; }
    public string Wkt { get; set; } = string.Empty;
    public string? Place { get; set; }
    public string? Province { get; set; }
    public string? Name { get; set; }
    public string? Color { get; set; }
    public int? CategoryId { get; set; }
    public DateTime CreatedDate { get; set; }
    public DateTime? ModifiedDate { get; set; }
    public bool IsActive { get; set; }
    public int? InsertedUserId { get; set; }
    public bool IsPrivate { get; set; }

    // BUG FİX (kullanıcının kendi tespiti: "artı butonuna basıp yeni harita oluşturdum
    // ama varsayılan haritamdaki çizimlerin hepsi duruyordu, sıfır çizim istiyordum"):
    // GetAllFromGeoServerAsync eskiden GeoServer'ın CQL_FILTER'ının map_id/is_deleted'i
    // doğru filtrelediğine KÖRÜ KÖRÜNE güveniyordu — filtre GeoServer tarafında herhangi
    // bir sebeple (katman şeması/CQL sürüm uyumsuzluğu/vs.) etkisiz kalırsa TÜM haritaların
    // TÜM kayıtları backend'den hiç süzülmeden frontend'e dönüyordu. Artık MapId/IsDeleted
    // de GeoServer yanıtından okunuyor ki GeometryService tarafında AYNI .Where() zinciriyle
    // (repository yolundaki ile BİREBİR aynı) ikinci bir garanti filtresi uygulanabilsin —
    // dış sisteme (GeoServer) güvenmek yerine doğrulamak — GeometryService.cs'teki
    // GetIntersectingIdsAsync/GetIntersectingWktAsync yorumunda anlatılan AYNI ders
    // (bir zamanlar filtresiz tüm veritabanını tarayan bug) burada da geçerli.
    public int? MapId { get; set; }
    public bool IsDeleted { get; set; }
}

using NetTopologySuite.Geometries;

namespace BasarsoftStaj.Application.Interfaces;

// Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): "Rota hesaplamaları için OSRM
// (Open Source Routing Machine) kullanın (Docker üzerinde localde çalıştırıp HTTP istekleri
// atmanız tercih edilmektedir)." — IGeoServerFeatureService ile AYNI mimari: dış bir HTTP
// servisine (burada GeoServer değil, kullanıcının kendi Docker'da ayağa kaldıracağı OSRM
// sunucusu) istek atıp cevabı uygulamanın kendi tiplerine (burada NTS LineString) çeviren
// ince bir sarmalayıcı. bkz. docs/osrm-kurulum.md (Docker komutları).
public interface IOsrmService
{
    // waypoints: (lon, lat) sırasıyla, EN AZ 2 nokta — TransitStopService/TransitRouteService
    // bunu aktif (duraklatılmamış) durakların SortOrder'a göre sıralı konumlarından üretir.
    // Başarısızsa (OSRM'e ulaşılamadı, "Ok" değil, rota bulunamadı vb.) Route=null + Error
    // doludur — çağıran taraf bunu kullanıcıya göstermeli, eski rotayı SESSİZCE silmemeli.
    Task<(bool Success, LineString? Route, string? Error)> GetRouteAsync(IReadOnlyList<(double Lon, double Lat)> waypoints);
}

using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using NetTopologySuite.Geometries;
using BasarsoftStaj.Application.Interfaces;

namespace BasarsoftStaj.Application.Services;

// Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): GeoServerFeatureService ile AYNI
// desen (appsettings'ten BaseUrl okuyup HTTP isteği atan, DI'a AddHttpClient<TI,TC> ile kayıtlı
// ince bir servis — bkz. Program.cs). OSRM'in "Route" servisinin HTTP API'si:
// GET {baseUrl}/route/v1/driving/{lon1},{lat1};{lon2},{lat2};...?overview=full&geometries=geojson
// Cevap: { "code": "Ok", "routes": [ { "geometry": { "coordinates": [[lon,lat], ...] } } ] }
// (bkz. docs/osrm-kurulum.md — Docker ile localde nasıl ayağa kaldırılır).
public class OsrmService : IOsrmService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public OsrmService(HttpClient httpClient, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _configuration = configuration;
    }

    public async Task<(bool Success, LineString? Route, string? Error)> GetRouteAsync(IReadOnlyList<(double Lon, double Lat)> waypoints)
    {
        if (waypoints.Count < 2)
        {
            return (false, null, "Rota hesaplamak için en az 2 aktif durak gerekiyor.");
        }

        var baseUrl = (_configuration["Osrm:BaseUrl"] ?? "http://localhost:5000").TrimEnd('/');
        var profile = _configuration["Osrm:Profile"] ?? "driving";
        var coordsPart = string.Join(';', waypoints.Select(w =>
            $"{w.Lon.ToString(CultureInfo.InvariantCulture)},{w.Lat.ToString(CultureInfo.InvariantCulture)}"));
        var url = $"{baseUrl}/route/v1/{profile}/{coordsPart}?overview=full&geometries=geojson";

        HttpResponseMessage response;
        try
        {
            response = await _httpClient.GetAsync(url);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            // Kullanıcının/hocanın "Docker üzerinde localde çalıştırıp HTTP istekleri
            // atmanız tercih edilmektedir" notu: OSRM ayakta değilse bunu AÇIKÇA söylemek,
            // sessizce eski rotayı silmekten/hiçbir şey olmamış gibi davranmaktan çok daha
            // iyi — çağıran taraf (TransitRouteService/TransitStopService) bu mesajı
            // kullanıcıya/loglara yansıtıyor.
            return (false, null, "OSRM sunucusuna ulaşılamadı. Docker'da çalıştığından emin olun (bkz. docs/osrm-kurulum.md).");
        }

        if (!response.IsSuccessStatusCode)
        {
            return (false, null, $"OSRM sunucusu hata döndürdü ({(int)response.StatusCode}).");
        }

        using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        var root = doc.RootElement;

        var code = root.TryGetProperty("code", out var codeEl) ? codeEl.GetString() : null;
        if (!string.Equals(code, "Ok", StringComparison.OrdinalIgnoreCase))
        {
            var message = root.TryGetProperty("message", out var msgEl) ? msgEl.GetString() : null;
            return (false, null, message != null
                ? $"OSRM rota hesaplayamadı: {message}"
                : "OSRM rota hesaplayamadı (bu duraklar arasında yol bulunamadı olabilir).");
        }

        if (!root.TryGetProperty("routes", out var routes) || routes.GetArrayLength() == 0)
        {
            return (false, null, "OSRM herhangi bir rota döndürmedi.");
        }

        var geometry = routes[0].GetProperty("geometry");
        var coordinatesEl = geometry.GetProperty("coordinates");
        var coordinates = new List<Coordinate>();
        foreach (var pair in coordinatesEl.EnumerateArray())
        {
            var lon = pair[0].GetDouble();
            var lat = pair[1].GetDouble();
            coordinates.Add(new Coordinate(lon, lat));
        }

        if (coordinates.Count < 2)
        {
            return (false, null, "OSRM geçersiz (2 noktadan az) bir rota geometrisi döndürdü.");
        }

        var lineString = GeometryFactory.Default.CreateLineString(coordinates.ToArray());
        lineString.SRID = 4326;
        return (true, lineString, null);
    }
}

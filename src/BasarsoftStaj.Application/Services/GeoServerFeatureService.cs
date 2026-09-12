using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using BasarsoftStaj.Application.Interfaces;

namespace BasarsoftStaj.Application.Services;

// Hoca ödevi (GeoServer entegrasyonu): appsettings.json'daki "GeoServer" bölümünden
// (BaseUrl/Workspace) okuyup ilgili katmana WFS GetFeature isteği atıyor, dönen GeoJSON
// FeatureCollection'ı GeometryService'in beklediği düz DTO'ya (GeoServerFeature) çeviriyor.
// HttpClient, Program.cs'de AddHttpClient<IGeoServerFeatureService, GeoServerFeatureService>()
// ile DI'a kayıtlı (IHttpClientFactory üzerinden — soket tükenmesi olmasın diye kendi
// başımıza `new HttpClient()` yapmıyoruz).
public class GeoServerFeatureService : IGeoServerFeatureService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public GeoServerFeatureService(HttpClient httpClient, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _configuration = configuration;
    }

    public async Task<List<GeoServerFeature>> GetFeaturesAsync(string layerName, string cqlFilter)
    {
        using var doc = await FetchFeatureCollectionAsync(layerName, cqlFilter);
        var result = new List<GeoServerFeature>();
        if (!doc.RootElement.TryGetProperty("features", out var features)) return result;

        foreach (var feature in features.EnumerateArray())
        {
            result.Add(ParseFeature(feature));
        }
        return result;
    }

    // Hoca ödevi (GeoServer POI Entegrasyonu): GetFeaturesAsync ile AYNI istek/parse iskeleti,
    // sadece properties'i sabit bir DTO'ya değil çağıranın kendi bildiği kolonlara göre
    // okuyabileceği ham (ama JsonDocument'tan bağımsız — Clone()) bir JsonElement'e çeviriyor.
    public async Task<List<RawGeoServerFeature>> GetRawFeaturesAsync(string layerName, string cqlFilter)
    {
        using var doc = await FetchFeatureCollectionAsync(layerName, cqlFilter);
        var result = new List<RawGeoServerFeature>();
        if (!doc.RootElement.TryGetProperty("features", out var features)) return result;

        foreach (var feature in features.EnumerateArray())
        {
            var properties = feature.GetProperty("properties");
            result.Add(new RawGeoServerFeature
            {
                Id = GetInt(properties, "id") ?? ExtractIdFromFid(feature),
                Wkt = GeometryToWkt(feature.GetProperty("geometry")),
                // Clone(): aşağıdaki using bloğu (doc) metottan çıkınca dispose olacak —
                // Clone() olmadan çağıran taraf dispose edilmiş bir belgeye ait JsonElement'e
                // erişmeye çalışıp ObjectDisposedException alırdı.
                Properties = properties.Clone(),
            });
        }
        return result;
    }

    private async Task<JsonDocument> FetchFeatureCollectionAsync(string layerName, string cqlFilter)
    {
        var baseUrl = (_configuration["GeoServer:BaseUrl"] ?? "http://localhost:8080/geoserver").TrimEnd('/');
        var workspace = _configuration["GeoServer:Workspace"] ?? "basarsoft";
        var typeName = $"{workspace}:{layerName}";

        var url = $"{baseUrl}/wfs?service=WFS&version=2.0.0&request=GetFeature" +
                   $"&typeNames={Uri.EscapeDataString(typeName)}" +
                   "&outputFormat=application/json" +
                   $"&CQL_FILTER={Uri.EscapeDataString(cqlFilter)}";

        using var response = await _httpClient.GetAsync(url);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException(
                $"GeoServer'dan '{typeName}' katmanı okunamadı ({(int)response.StatusCode}). " +
                $"GeoServer çalışıyor mu, workspace/katman adları doğru mu kontrol et. Yanıt: {body}");
        }

        var stream = await response.Content.ReadAsStreamAsync();
        return await JsonDocument.ParseAsync(stream);
    }

    private static GeoServerFeature ParseFeature(JsonElement feature)
    {
        var properties = feature.GetProperty("properties");
        var geometry = feature.GetProperty("geometry");

        return new GeoServerFeature
        {
            Id = GetInt(properties, "id") ?? ExtractIdFromFid(feature),
            Wkt = GeometryToWkt(geometry),
            Place = GetString(properties, "place"),
            Province = GetString(properties, "province"),
            Name = GetString(properties, "name"),
            Color = GetString(properties, "color"),
            CategoryId = GetInt(properties, "category_id"),
            // NOT: tabloda CreatedDate property'si "inserted_date" kolonuna eşleniyor
            // (bkz. AppDbContext.OnModelCreating) — GeoServer da PostGIS'teki gerçek kolon
            // adını ("inserted_date") dönüyor, "created_date" değil.
            CreatedDate = GetDateTime(properties, "inserted_date") ?? DateTime.UtcNow,
            ModifiedDate = GetDateTime(properties, "modified_date"),
            IsActive = GetBool(properties, "is_active") ?? true,
            InsertedUserId = GetInt(properties, "inserted_user_id"),
            IsPrivate = GetBool(properties, "is_private") ?? false,
            // BUG FİX (kullanıcının kendi tespiti — bkz. IGeoServerFeatureService.cs'teki
            // GeoServerFeature.MapId/IsDeleted yorumu): CQL_FILTER'a tam güvenmek yerine bu
            // ikisini de okuyup GeometryService'te ikinci bir garanti filtresi uyguluyoruz.
            MapId = GetInt(properties, "map_id"),
            IsDeleted = GetBool(properties, "is_deleted") ?? false,
        };
    }

    // GeoServer PostGIS store'da "Expose primary keys" AÇILMAZSA id, properties içinde
    // gelmez — bu durumda tek çare feature'ın kendi "id" alanındaki "tbl_point.123" gibi
    // fid'den sayısal kısmı ayıklamak. Kurulum rehberinde bu seçeneği açmasını söylüyoruz
    // (docs/geoserver-kurulum.md) ki bu yedek yola hiç düşülmesin — ama düşerse de kırılmasın
    // diye burada bir güvenlik ağı olarak duruyor.
    private static int ExtractIdFromFid(JsonElement feature)
    {
        if (feature.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String)
        {
            var raw = idProp.GetString() ?? string.Empty;
            var dot = raw.LastIndexOf('.');
            if (dot >= 0 && int.TryParse(raw[(dot + 1)..], out var parsed)) return parsed;
        }
        return 0;
    }

    private static string? GetString(JsonElement props, string key) =>
        props.TryGetProperty(key, out var v) && v.ValueKind != JsonValueKind.Null ? v.GetString() : null;

    private static int? GetInt(JsonElement props, string key) =>
        props.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetInt32() : null;

    private static bool? GetBool(JsonElement props, string key)
    {
        if (!props.TryGetProperty(key, out var v) || v.ValueKind == JsonValueKind.Null) return null;
        if (v.ValueKind == JsonValueKind.True) return true;
        if (v.ValueKind == JsonValueKind.False) return false;
        // GeoServer bazı ayarlarda boolean'ı "true"/"false" string olarak da dönebiliyor.
        if (v.ValueKind == JsonValueKind.String && bool.TryParse(v.GetString(), out var parsed)) return parsed;
        return null;
    }

    private static DateTime? GetDateTime(JsonElement props, string key)
    {
        if (!props.TryGetProperty(key, out var v) || v.ValueKind != JsonValueKind.String) return null;
        return DateTime.TryParse(
            v.GetString(),
            CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal,
            out var parsed)
            ? parsed
            : null;
    }

    // Proje sadece Point/LineString/Polygon kullanıyor (Multi* yok) — bu üçü için elle
    // WKT üretmek, ekstra bir GeoJSON NuGet paketi eklemekten daha az riskli (bu ortamda
    // dotnet CLI yok, paket kurup derleyerek doğrulayamıyorum — bkz. proje notları).
    private static string GeometryToWkt(JsonElement geometry)
    {
        var type = geometry.GetProperty("type").GetString();
        var coordinates = geometry.GetProperty("coordinates");

        return type switch
        {
            "Point" => $"POINT ({FormatCoord(coordinates)})",
            "LineString" => $"LINESTRING ({FormatCoordList(coordinates)})",
            "Polygon" => $"POLYGON ({FormatRings(coordinates)})",
            _ => throw new NotSupportedException($"Desteklenmeyen GeoServer geometri tipi: {type}"),
        };
    }

    private static string FormatCoord(JsonElement coord)
    {
        var values = coord.EnumerateArray().ToArray();
        var x = values[0].GetDouble().ToString(CultureInfo.InvariantCulture);
        var y = values[1].GetDouble().ToString(CultureInfo.InvariantCulture);
        return $"{x} {y}";
    }

    private static string FormatCoordList(JsonElement coords) =>
        string.Join(", ", coords.EnumerateArray().Select(FormatCoord));

    private static string FormatRings(JsonElement rings) =>
        string.Join(", ", rings.EnumerateArray().Select(ring => $"({FormatCoordList(ring)})"));
}

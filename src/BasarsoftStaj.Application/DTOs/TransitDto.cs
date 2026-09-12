namespace BasarsoftStaj.Application.DTOs;

// Hoca ödevi (Akıllı Ulaşım Modülü, Durak ve Güzergah Yönetimi).

public class TransitRouteDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty;
    public DateTime CreatedDate { get; set; }
    // Güzergah Yönetimi listesinde her satırda "N durak" gösterebilmek için — ayrı bir
    // istek yapmaya gerek kalmasın diye burada hazır dönüyor (PoiCategory'nin admin panelinde
    // countPoisInCategoryTree ile CLIENT tarafında hesapladığı şeyin BACKEND'de hazır hali).
    public int StopCount { get; set; }
    // Kullanıcının kendi isteği: "duraklatma" — true ise harita katmanında gösterilmez.
    public bool IsPaused { get; set; }
    // Kullanıcının kendi isteği: elle bükülmüş hat — null ise frontend durakları sırayla
    // düz çizgiyle birleştirir, doluysa bu WKT AYNEN çizilir (bkz. TransitRoute.Path).
    public string? PathWkt { get; set; }
    // Kullanıcının kendi isteği: "şehre, ilçeye göre filtre olsun" — bkz. TransitRoute.cs yorumu.
    public string? Province { get; set; }
    public string? District { get; set; }
    // FAZ 2 (kullanıcının kendi isteği): "il ilçe mahalle vs otomatik oluştursun".
    public string? Neighborhood { get; set; }

    // Hoca ödevi (27 Ağustos, OSRM): PathWkt (elle bükülmüş) ile AYNI "null ise yok" deseni —
    // doluysa frontend BUNU (gerçek yol rotası) PathWkt/düz çizgi yerine çizer.
    public string? RouteGeometryWkt { get; set; }
    public DateTime? RouteGeneratedAt { get; set; }
}

public class CreateTransitRouteDto
{
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty;
    public string? Province { get; set; }
    public string? District { get; set; }
    public string? Neighborhood { get; set; }
}

public class UpdateTransitRouteDto
{
    public string? Name { get; set; }
    public string? Color { get; set; }
    // "" (boş string) GÖNDERİLEBİLİR anlamı "temizle" — bu yüzden null/boş ayrımı serviste
    // dikkatli yapılıyor (bkz. TransitRouteService.UpdateAsync).
    public string? Province { get; set; }
    public string? District { get; set; }
    public string? Neighborhood { get; set; }
}

public class TransitStopDto
{
    public int Id { get; set; }
    public string Wkt { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int RouteId { get; set; }
    public string RouteName { get; set; } = string.Empty;
    public string RouteColor { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public DateTime CreatedDate { get; set; }
    public int? UserId { get; set; }
    public string? AddedByUsername { get; set; }
    // Kullanıcının kendi isteği: "duraklatma" — true ise harita katmanında gösterilmez ve
    // hat, önceki/sonraki aktif durağı doğrudan birleştirir.
    public bool IsPaused { get; set; }
}

public class CreateTransitStopDto
{
    public string Wkt { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int RouteId { get; set; }
}

public class UpdateTransitStopDto
{
    public string? Wkt { get; set; }
    public string? Name { get; set; }
    public int? RouteId { get; set; }
}

// "Güzergah içerisindeki duraklar sıra bazlı listelenmeli ve Sürükle-Bırak yöntemiyle durak
// sıralaması değiştirilebilmelidir." — sürükle-bırak sonrası frontend YENİ sırayı (durak
// id'lerinin tam listesi, baştan sona) tek seferde gönderir; PoiCategoryService.NormalizeSiblings
// ile AYNI "kardeşleri 0'dan yeniden numarala" mantığı burada da uygulanır.
public class ReorderTransitStopsDto
{
    public List<int> StopIds { get; set; } = new();
}

// SetGeoRestrictionPausedDto/SetSharePausedDto ile AYNI desen — "Duraklat/Devam Ettir"
// butonunun gönderdiği tek alanlı istek gövdesi (hem route hem stop için ortak kullanılıyor).
public class SetTransitPausedDto
{
    public bool IsPaused { get; set; }
}

// Kullanıcının kendi isteği: haritada elle bükülen hattı kaydetmek için — null/boş Wkt
// gönderilirse "elle bükülmüş hattı sil, düz çizgiye dön" anlamına gelir.
public class SetTransitRoutePathDto
{
    public string? Wkt { get; set; }
}

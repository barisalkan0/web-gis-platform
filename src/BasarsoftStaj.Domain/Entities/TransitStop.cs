using NetTopologySuite.Geometries;

namespace BasarsoftStaj.Domain.Entities;

// Hoca ödevi (Akıllı Ulaşım Modülü): "Durak Ekleme: Operatör için haritada 'Durak Ekle'
// (Point) aracı oluşturun. Durak ismi girilsin ve mevcut güzergahlar dropdown üzerinden
// seçilsin." — Poi.cs'teki AYNI Point/SRID=4326/WKT deseni kullanılıyor (tutarlılık için).
//
// RouteId BİLİNÇLİ OLARAK NOT NULL: hoca metni "Her bir durak bir güzergaha ait olacak
// şekilde 1-N ilişki kurun" diyor — Poi.MapId'nin aksine (o nullable, "evrensel" POI
// senaryosu için) burada durağın güzergahsız var olması ödev tanımına aykırı olurdu.
public class TransitStop
{
    public int Id { get; set; }
    public Point Geometry { get; set; } = null!;
    public string Name { get; set; } = string.Empty;

    public int RouteId { get; set; }
    public TransitRoute? Route { get; set; }

    // "Güzergah içerisindeki duraklar sıra bazlı listelenmeli ve Sürükle-Bırak yöntemiyle
    // durak sıralaması değiştirilebilmelidir." — PoiCategory.SortOrder ile AYNI mantık,
    // burada "kardeşler" aynı RouteId'ye sahip duraklar.
    public int SortOrder { get; set; }

    // Kullanıcının kendi isteği: "durağı duraklatınca otomatik sonrakiyle birleşsin" —
    // TransitRoute.IsPaused ile AYNI desen. Frontend hat kurarken (fetchStops) sadece
    // !IsPaused duraklardan geçiyor, böylece duraklatılan durak atlanıp önceki/sonraki aktif
    // durak doğrudan birleşiyor (SortOrder değişmez, sadece o durak listeden filtrelenir).
    public bool IsPaused { get; set; } = false;

    public bool IsDeleted { get; set; }
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public int? UserId { get; set; }
}

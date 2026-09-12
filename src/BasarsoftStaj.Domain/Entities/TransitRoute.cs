using NetTopologySuite.Geometries;

namespace BasarsoftStaj.Domain.Entities;

// Hoca ödevi (Akıllı Ulaşım Modülü, Durak ve Güzergah Yönetimi): "Ulaşım modülü için durak
// ve güzergah tablolarını oluşturun. Her bir durak bir güzergaha ait olacak şekilde 1-N
// ilişki kurun." — Güzergah (Route) burada "1" tarafı, TransitStop "N" tarafı.
//
// İsimlendirme notu: C# sınıf adı bilinçli olarak "TransitRoute" (düz "Route" değil) —
// ASP.NET Core'un kendi routing altyapısında da bir "Route" kavramı/sınıfı var, isim
// çakışmasından (using belirsizliği) kaçınmak için PoiCategory/Poi ile AYNI netlikte ayrı bir
// isim seçildi. DB tablosu yine de sade "route" (bkz. AppDbContext.ToTable).
public class TransitRoute
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    // Güzergah Yönetimi paneli: "Yeni güzergah ekleme (isim ve renk belirleme)" — haritada
    // duraklar ve güzergah çizgisi bu renkle gösterilir (POI kategorilerindeki serbest renk
    // paletiyle AYNI fikir, burada kullanıcı kendi rengini seçebiliyor).
    public string Color { get; set; } = "#2563eb";

    // Kullanıcının kendi isteği ("istediğimiz durağı veya güzergahı duraklatma şeyi de olsun
    // duraklatınca görünmesinler") — GeoRestriction.IsPaused/MapShare.IsPaused ile AYNI desen:
    // satırı silmeden haritadan geçici olarak gizler, ManageRoutes yetkisi olanlar admin
    // panelinde yine görür.
    public bool IsPaused { get; set; } = false;

    // Kullanıcının kendi isteği: "eklediğimiz güzergahlar düz çizgi olarak birleşiyor... en
    // kötü ihtimalle aralarındaki çizgileri tutup kırabiliyor olalım bükebilelim." — admin
    // haritada çizgiyi elle büktüğünde SADECE bu alan set edilir (durakların kendisi/sırası
    // değişmez). Null ise frontend eskisi gibi durakları sırayla düz çizgiyle birleştirir;
    // dolu ise bu LineString AYNEN çizilir. SRID 4326, WGS84 (Geometry/TransitStop.Point ile
    // aynı konvansiyon).
    public LineString? Path { get; set; }

    // Kullanıcının kendi isteği: "şehre, ilçeye göre filtre olsun" — Poi.Province/District ile
    // AYNI desen (serbest metin). GÜNCELLEME (FAZ 2, kullanıcının kendi isteği: "il ilçe
    // mahalle vs otomatik oluştursun"): artık admin elle girmek ZORUNDA değil — frontend, bu
    // güzergaha İLK durak eklendiğinde reverse-geocode ile otomatik dolduruyor (bkz.
    // MapPage.jsx confirmStopDraw). Alan yine serbest metin ve admin panelden elle
    // düzeltilebilir/geçersiz kılınabilir; otomatik doldurma SADECE hâlâ boşsa devreye girer,
    // admin'in elle girdiği bir değerin üzerine asla yazmaz.
    public string? Province { get; set; }
    public string? District { get; set; }

    // Kullanıcının kendi isteği: "mahalle" seviyesi de eklensin — Province/District ile AYNI
    // otomatik-doldurma mantığı, sadece daha dar bir Nominatim zoom seviyesiyle (bkz.
    // MapPage.jsx reverseGeocode'un zoom parametresi).
    public string? Neighborhood { get; set; }

    // Hoca ödevi (27 Ağustos, OSRM entegrasyonu): "Hesaplanan rotaları ilgili güzergah için
    // veritabanına kaydedin ve haritada gösterin." — bu, YUKARIDAKİ `Path` (adminin ELLE
    // büktüğü hat) ile KASITLI OLARAK AYRI bir alan: Path admin'in serbest çizimi, RouteGeometry
    // ise OSRM'in gerçek yol ağına göre hesapladığı rota. Frontend render önceliği:
    // RouteGeometry (OSRM) > Path (elle) > düz çizgi (bkz. MapPage.jsx fetchStops). "Durak
    // sırası değiştiğinde OSRM'e yeni istek atılarak rota otomatik güncellenmelidir" —
    // bkz. TransitStopService'teki RegenerateRouteIfNeededAsync çağrıları.
    public LineString? RouteGeometry { get; set; }
    public DateTime? RouteGeneratedAt { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public int? UserId { get; set; }

    public ICollection<TransitStop> Stops { get; set; } = new List<TransitStop>();
}

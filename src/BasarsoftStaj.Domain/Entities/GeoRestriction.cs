using NetTopologySuite.Geometries;

namespace BasarsoftStaj.Domain.Entities;

// Hocanın "Coğrafi Yetki Tanımlama Modülü" görevi — v2 (kullanıcının kendi isteğiyle
// genişletildi): bir Role YA DA belirli bir User için artık BİRDEN FAZLA alan tanımlanabilir
// (her satır bir alan) — o rol/kullanıcı bu alanların HERHANGİ BİRİNİN içindeyse çizebilir
// (bkz. GeometryService.CreateAsync/UpdateGeometryAsync: restrictedAreas.Any(a => a.Contains(...))).
//
// Tasarım kararları (kullanıcıyla netleştirildi):
// - Kullanıcıya özel EN AZ BİR alan varsa, rolünün alanları TAMAMEN yoksayılır (override,
//   tek-alan dönemindeki kuralın aynısı — bkz. GeoRestrictionService.GetEffectiveAreasAsync).
// - Area artık Polygon değil genel Geometry — Nominatim'den gelen bazı ülke/il sınırları
//   (örn. adalı/parçalı ülkeler) MultiPolygon olabiliyor, bu yüzden tip genişletildi.
// - Tam olarak RoleId YA DA UserId dolu olmalı (DB check constraint'i de var, bkz. AppDbContext).
// Kullanıcının kendi isteği (harita şeridi polish turu, Görev #7): "yeni harita eklerken
// kullanıcılar rolüne bazı kısıtlar, userlere bireysel bazı kısıtlar da ekleyebilelim" —
// artık bir harita SAHİBİ de (admin olmasa bile) kendi haritasını paylaştığı bir kişiye/role
// ÖZEL kısıt tanımlayabiliyor. MapId null ise bu satır ESKİ admin-tanımlı GLOBAL kısıt
// (tüm haritalarda geçerli); dolu ise SADECE o haritada geçerli, o haritanın sahibi
// tarafından tanımlanmış bir kısıt. Öncelik sırası (en spesifik kazanır, bkz.
// GeoRestrictionService.GetEffectiveAreasAsync): kişi+bu harita > kişi+global >
// rol+bu harita > rol+global > sınırsız.
public class GeoRestriction
{
    public int Id { get; set; }

    public int? RoleId { get; set; }
    public int? UserId { get; set; }

    // Görev #7: null = global (eski davranış), dolu = sadece bu haritada geçerli.
    public int? MapId { get; set; }

    // Görev #7: "istediğimiz zaman duraklatabilelim istediğimize" — satırı silmeden geçici
    // olarak devre dışı bırakır (GetEffectiveAreasAsync bu satırı hiç yokmuş gibi sayar,
    // bir alt önceliğe düşer). Hem global hem harita-özel kısıtlarda kullanılabilir.
    public bool IsPaused { get; set; } = false;

    // Admin'in kendi etiketi ("Bölge 1") ya da Nominatim'den gelen yer adı ("Türkiye") —
    // tamamen opsiyonel, sadece listede okunabilir olsun diye.
    public string? Name { get; set; }

    // "Freeform" (elle çizildi) ya da "Place" (ülke/il adıyla Nominatim'den arandı) —
    // bkz. GeoRestrictionKind. Sadece bilgilendirici, yetkilendirme mantığını etkilemiyor.
    public string Kind { get; set; } = GeoRestrictionKind.Freeform;

    // SRID 4326 (WGS84). Polygon ya da MultiPolygon olabilir.
    public Geometry Area { get; set; } = null!;

    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public DateTime ModifiedDate { get; set; } = DateTime.UtcNow;
}

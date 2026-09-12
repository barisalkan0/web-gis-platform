namespace BasarsoftStaj.Domain.Entities;

// Hoca ödevi (POI/Rol/Operatör ödevi): "Hiyerarşik yapıda poi_category (Örn: Yeme-İçme →
// Restoran, Kafe) tablosu ekleyin. Tablo kendi içinde Parent-Child ilişkisini
// desteklemelidir." — ParentId null ise en üst seviye ("Yeme-İçme" gibi), dolu ise bir
// başka PoiCategory'nin altında ("Restoran" → parent: "Yeme-İçme"). Kaç seviye derinlik
// olacağı sınırlanmadı, teoride sınırsız iç içe geçebilir (frontend'de girinti ile gösterilir).
//
// BİLİNÇLİ KAPSAM: bu, projede ÖNCEDEN var olan (nokta/çizgi/alan için kullanılan, düz/
// hiyerarşik OLMAYAN) Category tablosundan TAMAMEN AYRI — hoca'nın metni POI'ye özel yeni
// bir kategori sistemi istiyor, ikisini birleştirmek hem hoca'nın "hiyerarşik" isteğini hem
// de var olan düz sistemi bozardı.
public class PoiCategory
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? ParentId { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    // Kullanıcının kendi isteği ("ikon ekleme de olacak poilere"): kategorinin haritadaki
    // varsayılan görsel ikonu. Dosya yükleme yerine BİLİNÇLİ olarak tek bir emoji/kısa
    // karakter dizisi tutuyoruz — projede hiç dosya depolama/servis etme altyapısı yok,
    // rastgele dosya yükletmek (boyut/tip doğrulama, depolama, statik sunum) bu özelliğin
    // gerektirdiğinden çok daha büyük bir güvenlik/karmaşıklık yükü. Bir POI kendi Icon'unu
    // ayrıca set edip bunu ezebilir (bkz. Poi.Icon).
    public string? Icon { get; set; }
}

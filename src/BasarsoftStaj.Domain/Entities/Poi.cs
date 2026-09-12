using NetTopologySuite.Geometries;

namespace BasarsoftStaj.Domain.Entities;

// Hoca ödevi (POI/Rol/Operatör ödevi): "Veritabanına poi adında bir tablo ekleyin (standart
// is_active, is_deleted, created_date, user_id kolonları ile kategori_id, isim ve
// mesai_saatleri alanları yer almalıdır)."
//
// BİLİNÇLİ EK (hoca metninde birebir yazmıyor ama zorunlu): bir Geometry (Point) kolonu —
// "Operatör için haritada POI ekleme aracı (Point) oluşturun" cümlesi POI'nin haritada bir
// KONUMU olmasını gerektiriyor, konum olmadan haritada gösterilemez/tıklanamaz. Diğer
// nokta/çizgi/alan tablolarıyla (tbl_point vb.) AYNI SRID (4326/WGS84) ve WKT taşıma
// deseni kullanılıyor.
//
// POI'ler çoklu-harita ve paylaşım sınırlarına uymak için MapId ile bir haritaya bağlıdır.
// Alan nullable tutulur: migration sırasında sahibi/haritası bulunamayan eski kayıtlar
// admin panelinde "Atanmamış" olarak korunur, normal harita sorgularına girmez.
public class Poi
{
    public int Id { get; set; }
    public Point Geometry { get; set; } = null!;
    public string Name { get; set; } = string.Empty;
    public int? CategoryId { get; set; }
    public string? WorkingHours { get; set; }
    public string? Note { get; set; }
    public string? Province { get; set; }
    public string? District { get; set; }
    public int? MapId { get; set; }
    public Map? Map { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsDeleted { get; set; } = false;
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public int? UserId { get; set; }
    // Kullanıcının kendi isteği: bu POI'ye özel bir ikon (bkz. PoiCategory.Icon yorumu —
    // aynı gerekçeyle emoji/kısa karakter dizisi, dosya yükleme yok). null ise haritada
    // kategorinin ikonu, o da yoksa varsayılan 📍 kullanılır (bkz. ToDto -> EffectiveIcon).
    public string? Icon { get; set; }
    public ICollection<PoiWorkingHour> WorkingHourSchedule { get; set; } = new List<PoiWorkingHour>();
    public ICollection<PoiScheduleException> ScheduleExceptions { get; set; } = new List<PoiScheduleException>();
}

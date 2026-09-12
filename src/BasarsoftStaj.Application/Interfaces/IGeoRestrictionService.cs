using NetTopologySuite.Geometries;
using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

// Hocanın "Coğrafi Yetki Tanımlama Modülü" görevi — v2: bir Role YA DA belirli bir User için
// artık BİRDEN FAZLA alan tanımlanabilir (kullanıcının kendi isteğiyle genişletildi), o
// rol/kullanıcı bu alanların HERHANGİ BİRİNİN içindeyse çizebilir.
//
// Görev #7 (kullanıcının kendi isteği, harita şeridi polish turu): artık SADECE admin değil,
// bir harita SAHİBİ de kendi haritasına özel (MapId dolu) kısıtlar tanımlayabiliyor — global
// (MapId=null, admin-tanımlı) ve harita-özel satırlar AYNI tabloda yaşıyor, aralarındaki
// öncelik GetEffectiveAreasAsync'te çözülüyor.
public interface IGeoRestrictionService
{
    // ---- Global (admin, MapId=null) ----
    Task<IEnumerable<GeoRestrictionDto>> GetForRoleAsync(int roleId);
    Task<IEnumerable<GeoRestrictionDto>> GetForUserAsync(int userId);
    Task<(bool Success, GeoRestrictionDto? Result, string? Error)> AddForRoleAsync(int roleId, CreateGeoRestrictionDto dto, string actorUsername);
    Task<(bool Success, GeoRestrictionDto? Result, string? Error)> AddForUserAsync(int userId, CreateGeoRestrictionDto dto, string actorUsername);

    // ---- Görev #7: harita sahibinin KENDİ haritasına özel (MapId dolu) ----
    Task<IEnumerable<GeoRestrictionDto>> GetForMapRoleAsync(int mapId, int roleId);
    Task<IEnumerable<GeoRestrictionDto>> GetForMapUserAsync(int mapId, int userId);
    Task<(bool Success, GeoRestrictionDto? Result, string? Error)> AddForMapRoleAsync(int mapId, int roleId, CreateGeoRestrictionDto dto, string actorUsername);
    Task<(bool Success, GeoRestrictionDto? Result, string? Error)> AddForMapUserAsync(int mapId, int userId, CreateGeoRestrictionDto dto, string actorUsername);

    // "istediğimiz zaman duraklatabilelim istediğimize" — o (mapId, target) grubundaki TÜM
    // satırları tek seferde duraklatır/devam ettirir.
    Task<(bool Success, string? Error)> SetPausedForMapRoleAsync(int mapId, int roleId, bool isPaused, string actorUsername);
    Task<(bool Success, string? Error)> SetPausedForMapUserAsync(int mapId, int userId, bool isPaused, string actorUsername);

    // Kullanıcının kendi isteği: "buradan (Harita Ayarları) tamamen yönetilebilmeli" —
    // Paylaşılanlar kartlarının her birinde "kısıtlı mı/duraklatılmış mı" rozetini
    // gösterebilmek için, o haritadaki TÜM (role+user) kısıt satırlarını TEK istekte döner
    // (her satır için ayrı ayrı GetForMapRoleAsync/GetForMapUserAsync çağırmaktan kaçınmak için).
    Task<IEnumerable<GeoRestrictionDto>> GetAllForMapAsync(int mapId);

    // Controller'ın silme öncesi "bu satır global mi yoksa hangi haritaya özel mi" diye bakıp
    // doğru yetki kontrolünü (admin mi, o haritanın sahibi mi) seçebilmesi için.
    Task<GeoRestrictionDto?> GetByIdAsync(int id);

    // Tek bir alanı kendi id'siyle siler (role/user'a bakılmaksızın — id zaten global tekil).
    Task<(bool Success, string? Error)> RemoveAsync(int id, string actorUsername);

    // GeometryService'in çizim/düzenleme sırasında kullandığı asıl kontrol noktası: kullanıcının
    // EFEKTİF alan listesini döner (bkz. sınıf üstü yorum — öncelik sırası). mapId null gelirse
    // (mapId bilinmiyorsa) sadece global katman değerlendirilir. userId null gelirse boş liste döner.
    Task<List<Geometry>> GetEffectiveAreasAsync(int? userId, int? mapId);

    // Kullanıcının KENDİ efektif alanlarını WKT olarak döner (frontend'in haritada gri maske +
    // sınır çizgisi göstermesi için) — ManageGeoRestrictions izni GEREKTİRMEZ, herkes sadece
    // "benim alanlarım ne" diye sorabilir (bkz. GeoRestrictionController.GetMine).
    Task<List<(string Wkt, string? Name)>> GetMyEffectiveAreasAsync(int? userId, int? mapId);
}

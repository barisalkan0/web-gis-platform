using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

// Faz 1a: "Birden fazla harita" — kullanıcının kendi fikri (hocanın verdiği bir görev
// değil, bkz. staj günlüğü notları). Her kullanıcının en az bir (varsayılan) haritası
// vardır; ManageMultipleMaps izni olmayan kullanıcılar sadece bu tek haritayı görür/
// yeniden adlandırabilir, yeni oluşturamaz/çoğaltamaz (izin kontrolü MapController'da,
// servis katmanı sadece "userId bu haritanın sahibi mi" diye bakar).
public interface IMapService
{
    Task<IEnumerable<MapDto>> GetMyMapsAsync(int userId);
    Task<(bool Success, MapDto? Result, string? Error)> CreateAsync(int userId, CreateMapDto dto, string actorUsername);
    Task<(bool Success, string? Error)> RenameAsync(int userId, int mapId, CreateMapDto dto, string actorUsername);

    // Kaynak haritanın TÜM (silinmemiş) çizimlerini de kopyalar — "aynı haritadan bir
    // tane daha oluştursun, Copy (1) gibi" isteği boş bir harita değil, dolu bir kopya
    // istiyor. NOT: bu, geometrilerin gerçekten MapId'ye göre yazılıp okunduğu Faz 1b
    // tamamlanana kadar sadece migration'ın backfill ettiği ESKİ çizimler için doğru
    // çalışır — 1b'den önce oluşturulan YENİ çizimler henüz hiçbir haritaya
    // bağlanmıyor (MapId=null), bu yüzden hiçbir çoğaltmaya dahil olmazlar.
    Task<(bool Success, MapDto? Result, string? Error)> DuplicateAsync(int userId, int sourceMapId, string actorUsername);

    // GeometryController'ın "mapId gelmezse aktif haritayı sen çöz" ihtiyacı için —
    // kullanıcının IsDefault=true haritasını döner, yoksa (migration'dan SONRA kayıt
    // olmuş bir kullanıcı, migration sadece o anda VAR OLAN kullanıcılara harita açtığı
    // için) kendiliğinden bir tane oluşturur. Bu sayede AuthService'in kayıt akışına hiç
    // dokunmadan her kullanıcının garanti bir haritası olur.
    Task<int> GetOrCreateDefaultMapIdAsync(int userId);

    // Faz 2: paylaşım/görüntüleme yetki kontrollerinde tekrar tekrar kullanılıyor
    // (GeometryController, MapShareService) — "bu harita gerçekten bu kullanıcıya mı ait".
    Task<bool> IsOwnerAsync(int mapId, int userId);

    // Kullanıcının kendi isteği: harita silme. Son harita silinemez (en az bir harita
    // garantisi bozulmasın diye) — bkz. MapService.DeleteAsync yorumu. Artık KALICI değil,
    // soft-delete (IsDeleted=true) — bkz. Görev #75.
    Task<(bool Success, string? Error)> DeleteAsync(int userId, int mapId, string actorUsername);

    // Görev #75: harita çöp kutusu — geometrilerdeki (TrashController) desenin AYNISI ama
    // admin-only DEĞİL, her kullanıcı sadece KENDİ silinen haritalarını görüp yönetebiliyor.
    Task<IEnumerable<MapDto>> GetDeletedMapsAsync(int userId);
    Task<(bool Success, string? Error)> RestoreAsync(int userId, int mapId, string actorUsername);
    Task<(bool Success, string? Error)> PermanentDeleteAsync(int userId, int mapId, string actorUsername);

    // Görev #77: favorileme + sürükle-bırak sıralama.
    Task<(bool Success, string? Error)> SetFavoriteAsync(int userId, int mapId, bool isFavorite);
    Task<(bool Success, string? Error)> ReorderAsync(int userId, List<int> orderedMapIds);

    // Kullanıcının kendi isteği (harita şeridi polish turu, ek tur): "ayarlardan istediğim
    // mapi varsayılan yapabilmeliyim" — eskiden IsDefault SADECE otomatik atanıyordu
    // (ilk harita / silinen varsayılanın yerine en eskisi), kullanıcı elle DEĞİŞTİREMİYORDU.
    Task<(bool Success, string? Error)> SetDefaultAsync(int userId, int mapId);

    // Kullanıcının kendi isteği: "adminler herkesin haritasını/çizgi ve POI'lerini
    // görebilecek istediği takdirde." Sahiplik/paylaşım gerekmeksizin TÜM (silinmemiş)
    // haritaları sahip kullanıcı adıyla döner — sadece ManageAdmin izniyle çağrılmalı,
    // yetki kontrolü MapController'da (PoiController.GetMapOptionsForAdmin ile aynı desen).
    Task<IEnumerable<MapDto>> GetAllForAdminAsync();
}

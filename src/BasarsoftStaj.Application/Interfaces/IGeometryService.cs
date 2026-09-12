using NetTopologySuite.Geometries;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Interfaces;

// tbl_point / tbl_line / tbl_polygon için ORTAK iş mantığı — WKT doğrulama/parse,
// DTO eşleme, soft-delete. Controller artık bunu çağırıyor, EF/WKT detaylarıyla
// hiç ilgilenmiyor. Aynı implementasyon (GeometryService<T,TGeometry>) üç geometri
// tipi için de DI'da ayrı ayrı kayıtlı (bkz. Program.cs) — kod 3 kere tekrarlanmıyor.
public interface IGeometryService<TEntity, TGeometry>
    where TEntity : class, IGeometryFeature<TGeometry>, new()
    where TGeometry : Geometry
{
    // mapId (Faz 1b): "birden fazla harita" özelliği — sadece o an AKTİF haritaya ait
    // (ve silinmemiş) kayıtlar döner. Controller bunu her zaman somut (non-null) bir
    // değerle çağırıyor — mapId query'de gelmezse önce kullanıcının varsayılan haritasına
    // çözülüyor (bkz. GeometryController.ResolveMapIdAsync).
    // Faz 3 (kullanıcının kendi isteği): userId + isOwner artık YENİDEN kullanılıyor — bu
    // sefer "kim düzenleyebilir" için değil, "IsPrivate=true olan kayıtları kim görebilir"
    // için. Harita sahibi (isOwner=true) HER ŞEYİ görür; sahip değilse sadece kendi
    // InsertedUserId'siyle eşleşen özel kayıtları + tüm herkese-açık kayıtları görür.
    Task<IEnumerable<GeometryDto>> GetAllAsync(int mapId, int? userId, bool isOwner);

    // Kullanıcının kendi isteği: "Ortak Görünüm" — admin-only, TÜM haritalardaki (silinmemiş)
    // kayıtları sahibiyle birlikte döner (mapId/isOwner filtresi YOK, IsPrivate dahi görülür —
    // zaten sadece ManageAdmin/None izniyle çağrılabiliyor, bkz. GeometryController).
    Task<IEnumerable<GeometryDto>> GetAllForAdminAsync();

    // Faz 3: PATCH/DELETE uçlarının "bu kaydın haritası VE yazarı kim" kontrolü yapabilmesi
    // için (CanEditFeatureAsync bunu kullanıyor: sahip mi / yazarın kendisi mi / haritada
    // "başkalarını düzenleyebilir" iznine sahip mi). Kayıt bulunamazsa (null, null) döner.
    Task<(int? MapId, int? AuthorId)> GetOwnershipInfoAsync(int id);

    // userId: yeni kaydın InsertedUserId'sini damgalamak için (JWT'den okunuyor,
    // client body'sinden DEĞİL — kullanıcı başkasının adına kayıt oluşturamasın).
    // actorUsername: audit log için (Faz 3) — null geçilirse loglanmaz (geriye dönük uyum).
    Task<(bool Success, GeometryDto? Result, string? Error)> CreateAsync(CreateGeometryDto dto, int? userId, string? actorUsername = null);
    Task<bool> UpdatePlaceAsync(int id, UpdatePlaceDto dto);

    // Sağdaki panelden sonradan isim/renk/kategori/gizlilik düzenleme. userId: renk
    // kısıtlaması kontrolü için (Faz 3) — sahip değilse ve haritada AllowedColors
    // tanımlıysa yeni renk o listede olmalı.
    Task<(bool Success, string? Error)> UpdateAttributesAsync(int id, UpdateAttributesDto dto, int? userId = null, string? actorUsername = null);

    // Bilgi kartındaki "Düzenle" ile köşe noktaları sürüklenip şekil değiştirildikten
    // sonra yeni WKT'yi kaydetmek için. Tip uyuşmazsa (ör. bir noktaya çizgi WKT'si
    // gönderilirse) false döner. userId (hocanın Coğrafi Yetki görevi): şekli sürükleyip
    // tanımlı sınırın dışına taşımayı da engelleyebilmek için gerekiyor — bkz. CreateAsync'teki
    // aynı kontrolün burada TEKRARLANMA nedeni (sadece çizim değil, taşıma da kısıtlanmalı).
    Task<(bool Success, string? Error)> UpdateGeometryAsync(int id, UpdateGeometryDto dto, int? userId, string? actorUsername = null);

    Task<bool> SoftDeleteAsync(int id, string? actorUsername = null);

    // Haritada kesişen kayıtları NEON/parlak vurgulayabilmek için gerçek id listesi.
    // BUG FİX (kullanıcının kendi tespiti): mapId/userId/isOwner artık GetAllAsync ile
    // AYNI görünürlük kuralını uyguluyor — eskiden TÜM haritalardaki/kullanıcılardaki
    // kayıtları sayıyordu (Faz 1a/Faz 3'ten önce yazılmış, o zaman taşınmayı unutulmuş).
    Task<List<int>> GetIntersectingIdsAsync(Geometry polygon, int mapId, int? userId, bool isOwner);

    // Envanter Analizi'nde poligonların birleşim (union) alanını hesaplayabilmek için
    // kesişen kayıtların gerçek geometrilerine (WKT) ihtiyaç var, sadece id'ye değil.
    // Aynı görünürlük filtresi burada da geçerli.
    Task<List<string>> GetIntersectingWktAsync(Geometry polygon, int mapId, int? userId, bool isOwner);

    // Çöp kutusu (admin paneli): silinen kayıtları listeleme, geri getirme, kalıcı silme.
    Task<IEnumerable<GeometryDto>> GetDeletedAsync();
    Task<bool> RestoreAsync(int id);
    Task<bool> PermanentDeleteAsync(int id);
    Task<int> EmptyTrashAsync();
}

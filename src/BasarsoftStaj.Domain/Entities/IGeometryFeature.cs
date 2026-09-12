using NetTopologySuite.Geometries;

namespace BasarsoftStaj.Domain.Entities;

// tbl_point / tbl_line / tbl_polygon'un ortak sözleşmesi. Bu sayede tek bir generic
// GeometryService<TEntity, TGeometry> üçü için de kullanılabiliyor (kod 3 kere
// tekrarlanmıyor) — bkz. Application/Services/GeometryService.cs.
public interface IGeometryFeature<TGeometry> where TGeometry : Geometry
{
    int Id { get; set; }
    TGeometry Geometry { get; set; }
    string? Place { get; set; }
    string? Province { get; set; }
    string? Name { get; set; }
    string? Color { get; set; }
    int? CategoryId { get; set; }
    bool IsDeleted { get; set; }
    DateTime CreatedDate { get; set; } // DB kolonu: inserted_date

    // Gün 5 ödevi: izleme kolonları. IsActive'in bu uygulamada henüz özel bir anlamı yok
    // (User'daki gibi hesap askıya alma benzeri bir kullanım tanımlanmadı) — sadece
    // hocanın istediği kolon var olsun diye eklendi, varsayılan true.
    bool IsActive { get; set; }
    // Kaydı oluşturan kullanıcı — "harita sadece giriş yapmış kullanıcının kendi
    // çizimlerini listelesin" isteği bunun üzerinden filtreleniyor. Nullable: bu
    // özellikten ÖNCE oluşturulmuş eski kayıtlarda bilinmiyor.
    int? InsertedUserId { get; set; }
    DateTime? ModifiedDate { get; set; }

    // "Birden fazla harita" özelliği: kaydın ait olduğu Map (bkz. Domain/Entities/Map.cs).
    // Nullable — InsertedUserId'yle AYNI sebep: sahibi silinmiş/eski kayıtlarda MapId'nin
    // hangi haritaya ait olduğu bilinemeyebilir (migration'da elden geldiğince backfill
    // ediliyor ama garanti yok), bu yüzden required yapmadık.
    int? MapId { get; set; }

    // Faz 3 (kullanıcının kendi isteği): paylaşılan bir haritada "sadece bana özel" çizim.
    // true ise bu kaydı SADECE çizen (InsertedUserId) ve haritanın SAHİBİ görebilir —
    // haritayı paylaşımla görüntüleyen diğer kişiler hiç görmez (bkz. GeometryService.GetAllAsync).
    // Varsayılan false: eski kayıtlar ve normal davranış "herkese açık" kalır.
    bool IsPrivate { get; set; }
}

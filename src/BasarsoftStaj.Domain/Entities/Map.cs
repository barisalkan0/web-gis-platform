namespace BasarsoftStaj.Domain.Entities;

// "Birden fazla harita" özelliği (kullanıcının kendi fikri, hocanın verdiği bir görev
// değil — bkz. staj günlüğü notları): her kullanıcı artık birden fazla Map'e sahip
// olabilir, çizimler (tbl_point/tbl_line/tbl_polygon) artık doğrudan kullanıcıya değil
// bir Map'e bağlı (bkz. IGeometryFeature.MapId). Migration, mevcut her kullanıcı için
// IsDefault=true bir "Haritam" oluşturup var olan çizimleri oraya bağlıyor — geriye
// dönük veri kaybı olmasın diye.
public class Map
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    // Sahiplik — ManageMultipleMaps izni olmayan bir kullanıcının bile TEK (varsayılan)
    // haritası olur, sadece yenisini oluşturamaz/çoğaltamaz (bkz. PermissionCodes.ManageMultipleMaps).
    public int OwnerUserId { get; set; }
    public User? OwnerUser { get; set; }

    // Migration'ın otomatik oluşturduğu, kullanıcının silemeyeceği ilk/varsayılan harita.
    // "Son haritanı silemezsin" kilidi buna bakarak uygulanacak (bkz. MapService, Gün 6'daki
    // "son admin silinemez" desenine benzer bir koruma).
    public bool IsDefault { get; set; } = false;

    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    // Kullanıcının kendi isteği ("son değiştirme tarihi ve saati yazsın... Windows'taki
    // klasörler gibi filtreleyebilsin"): ad/açıklama düzenlenince (bkz. MapService.RenameAsync)
    // ya da haritaya bir çizim eklenince/düzenlenince/silinince (bkz. GeometryService.
    // TouchMapModifiedAsync) güncellenir. Favorileme/sıralama/varsayılan-yapma BİLİNÇLİ OLARAK
    // bunu tetiklemiyor — bunlar "içerik" değil, kullanıcının kendi düzenleme tercihleri.
    public DateTime ModifiedDate { get; set; } = DateTime.UtcNow;

    // Kullanıcının kendi isteği: "haritaların açıklamaları da eklenebilmeli ne haritası
    // olduğu bilinsin" — serbest metin, opsiyonel.
    public string? Description { get; set; }

    // Görev #75 (kullanıcının kendi isteği: "harita silme geri getirme gelsin, is_delete
    // gibi olsun o da") — geometrilerdeki (tbl_point/tbl_line/tbl_polygon) IsDeleted +
    // çöp kutusu deseninin BİREBİR aynısı, bu sefer Map için. DeleteAsync artık kalıcı
    // DEĞİL, IsDeleted=true yapıyor; GetMyMapsAsync zaten silinenleri listeden çıkarıyor,
    // yani mevcut davranış (silinen harita listede görünmez) aynen korunuyor — sadece
    // artık geri getirilebiliyor.
    public bool IsDeleted { get; set; } = false;
    public DateTime? DeletedDate { get; set; }

    // Görev #77 (kullanıcının kendi isteği: "map favorileme gelsin, mapleri kendimiz tutup
    // sürükleme mantığı ile dizebilelim"): IsFavorite sahibin kendi yıldızladığı haritaları
    // işaretler (Haritalarım listesinde üstte gösterilir). SortOrder sahibin sürükle-bırakla
    // belirlediği sıra — GetMyMapsAsync artık BUNA göre sıralıyor (bkz. MapService).
    public bool IsFavorite { get; set; } = false;
    public int SortOrder { get; set; } = 0;
}

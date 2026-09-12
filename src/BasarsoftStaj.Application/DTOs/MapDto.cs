namespace BasarsoftStaj.Application.DTOs;

public class MapDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsDefault { get; set; }
    public DateTime CreatedDate { get; set; }
    // Kullanıcının kendi isteği: "son değiştirme tarihi ve saati yazsın" + isme/tarihe göre
    // filtreleme — bkz. Map.ModifiedDate yorumu (ne zaman güncellendiği).
    public DateTime ModifiedDate { get; set; }
    public int GeometryCount { get; set; }

    // Görev #75: sadece çöp kutusu listesinde (GetDeletedMapsAsync) doluyor — normal
    // Haritalarım listesinde her zaman null (zaten silinmemiş kayıtlar döner).
    public DateTime? DeletedDate { get; set; }

    // Görev #77: favorileme + sürükle-bırak sıralama.
    public bool IsFavorite { get; set; }
    public int SortOrder { get; set; }

    // Kullanıcının kendi isteği (harita şeridi polish turu): "kaç kişiyle paylaşıldığı
    // haritanın yanında yazsın, aktif kaç kişi var görelim". ShareCount: Declined/Removed
    // hariç tüm paylaşımların ulaştığı kişi sayısı (rol paylaşımı roleUserCount kadar
    // sayılır). ActiveShareCount: bunların Accepted VE duraklatılmamış (CanView=true) olanı.
    public int ShareCount { get; set; }
    public int ActiveShareCount { get; set; }

    // Kullanıcının kendi isteği: "adminler herkesin haritasını görebilecek" — sadece admin-only
    // "Tüm Haritalar" listesinde (GetAllForAdminAsync) doluyor, normal "Haritalarım"/
    // "Paylaşılanlar" listelerinde her zaman null (zaten sahibi belli/kendisi).
    public string? OwnerUsername { get; set; }

    // FAZ 3 (kullanıcının kendi isteği): "Tüm Haritalar"da kullanıcı ADI ve ROLÜ filtrelenip
    // gösterilebilsin — OwnerUsername ile AYNI "sadece admin-only listede dolu" kuralı.
    public string? OwnerRole { get; set; }
    public string? OwnerRoleColor { get; set; }
}

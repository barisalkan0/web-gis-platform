namespace BasarsoftStaj.Application.DTOs;

public class GeometryDto
{
    public int Id { get; set; }
    public string Wkt { get; set; } = string.Empty;
    public string? Place { get; set; }
    public string? Province { get; set; }
    public string? Name { get; set; }
    public string? Color { get; set; }
    public int? CategoryId { get; set; }
    public DateTime CreatedDate { get; set; }
    public DateTime? ModifiedDate { get; set; }
    public bool IsActive { get; set; }
    public int? InsertedUserId { get; set; }
    public bool IsPrivate { get; set; }

    // Kullanıcının kendi isteği ("Ortak Görünüm" — tüm kullanıcıların çizimlerini bir arada
    // gösteren admin-only birleşik harita): sadece GetAllForAdminAsync doluyor, normal
    // (tek haritaya scoped) GetAllAsync çağrılarında her zaman null — MapDto.OwnerUsername
    // ile AYNI "sadece admin-only yolda dolu" kuralı.
    public int? MapId { get; set; }
    public string? OwnerUsername { get; set; }
}

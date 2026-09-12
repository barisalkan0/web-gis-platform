namespace BasarsoftStaj.Application.DTOs;

// Hem "yeni harita oluştur" hem "yeniden adlandır" için kullanılıyor — ikisi de tek bir
// alan (Name) alıyor, ayrı bir UpdateMapDto açmak gereksiz tekrar olurdu.
public class CreateMapDto
{
    public string Name { get; set; } = string.Empty;

    // Kullanıcının kendi isteği: yeni harita baloncuğunda ad + açıklama birlikte girilir.
    public string? Description { get; set; }
}

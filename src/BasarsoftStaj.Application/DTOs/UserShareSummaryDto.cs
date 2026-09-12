namespace BasarsoftStaj.Application.DTOs;

// Görev #76 (kullanıcının kendi isteği: "paylaşılan kişilerin üzerine tıklayınca ekrana bi
// bar gelsin kullanıcı hakkında bilgiler görülebilsin, o kullanıcıyla hangi mapler
// paylaşılmış görülebilsin ve oradan da istek atılabilsin") — bir paylaşım satırındaki
// kişiye tıklayınca açılan profil kartı için: temel kullanıcı bilgisi + BENİM (istek
// atan owner'ın) o kişiyle paylaştığı haritaların listesi.
public class UserShareSummaryDto
{
    public string Username { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public string RoleColor { get; set; } = string.Empty;
    public List<UserSharedMapDto> SharedMaps { get; set; } = new();
}

public class UserSharedMapDto
{
    public int MapId { get; set; }
    public string MapName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public bool CanView { get; set; }
}

namespace BasarsoftStaj.Application.DTOs;

// Faz 3.2 (kullanıcının kendi isteği: "kullanıcı adının her harfini yazarken filtreleme
// yapıp göstermeli"): Paylaş baloncuğundaki canlı arama sonucu — PasswordHash gibi hassas
// alanlar kasıtlı olarak yok, sadece seçim listesi için yeterli minimum bilgi.
public class UserSearchResultDto
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public string RoleColor { get; set; } = string.Empty;
}

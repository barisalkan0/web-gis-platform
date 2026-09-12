namespace BasarsoftStaj.Application.DTOs;

// Admin panelinden "+ Kullanıcı Ekle" ile doğrudan kullanıcı oluşturma — RegisterRequestDto'dan
// ayrı tutuldu çünkü burada bir RoleId de seçilebiliyor (kayıt ekranında yok, herkes
// varsayılan role düşer) ve şifre tekrar alanı gerekmiyor (admin tek seferde giriyor).
public class CreateUserDto
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public int? RoleId { get; set; }
}

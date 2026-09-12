namespace BasarsoftStaj.Application.DTOs;

// Tehlikeli Bölge: hesabı kapatmak için şifre + sabit onay kelimesi ("HESABIMI SİL")
// isteniyor, 2FA açıksa ayrıca doğrulama kodu da isteniyor (2FA henüz "yakında" olduğu
// için TwoFactorCode şu an kullanılmıyor ama alan hazır).
public class DeleteAccountDto
{
    public string Password { get; set; } = string.Empty;
    public string ConfirmationPhrase { get; set; } = string.Empty;
    public string? TwoFactorCode { get; set; }
}

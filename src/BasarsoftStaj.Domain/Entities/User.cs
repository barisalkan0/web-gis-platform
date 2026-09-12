namespace BasarsoftStaj.Domain.Entities;

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public bool IsDeleted { get; set; } = false;
    public bool IsActive { get; set; } = true;
    public DateTime ModifiedDate { get; set; } = DateTime.UtcNow;
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    // Kullanıcı kendi hesabını sildiğinde (Ayarlar > Tehlikeli Bölge) IsDeleted=true olur
    // ve bu tarih damgalanır — 30 gün boyunca geri alınabilir kalır, süre dolunca kalıcı
    // temizlemeye uygun hale gelir (bkz. AccountService.PurgeExpiredAsync).
    public DateTime? DeletedAt { get; set; }

    // 2FA altyapısının ilk adımı — gerçek TOTP akışı henüz yok ("yakında"), ama alan
    // hazır olsun diye şimdiden ekleniyor.
    public bool TwoFactorEnabled { get; set; } = false;

    // Artık sabit bir enum değil — Role tablosuna FK. Roller admin panelinden
    // oluşturulup/silinip izinleri değiştirilebiliyor (bkz. Domain/Entities/Role.cs).
    public int RoleId { get; set; } = Role.DefaultUserRoleId;
    public Role? Role { get; set; }
}

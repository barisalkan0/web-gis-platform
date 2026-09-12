namespace BasarsoftStaj.Application.DTOs;

// Admin panelindeki kullanıcı listesi için — PasswordHash gibi hassas alanlar kasıtlı
// olarak yok. Rolden gelen izinler burada TEKRARLANMIYOR (frontend zaten roles listesini
// yüklü tutuyor, RoleId üzerinden eşleştirip okuyabiliyor) — DirectPermissionCodes sadece
// bu kullanıcıya ROLÜNDEN BAĞIMSIZ doğrudan verilmiş ekstra izinleri taşıyor (Gün 6).
public class UserSummaryDto
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public int RoleId { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public string RoleColor { get; set; } = string.Empty;
    public DateTime CreatedDate { get; set; }
    public bool IsActive { get; set; }
    public List<string> DirectPermissionCodes { get; set; } = new();
}

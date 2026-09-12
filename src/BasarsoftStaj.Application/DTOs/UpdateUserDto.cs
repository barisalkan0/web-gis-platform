namespace BasarsoftStaj.Application.DTOs;

// Admin panelinden kullanıcı adı / aktiflik durumu güncelleme ("Güncelle"). Rol değişikliği
// kasıtlı olarak burada değil — o zaten ayrı, çalışan bir uç nokta (PATCH users/{id}/role).
public class UpdateUserDto
{
    public string Username { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

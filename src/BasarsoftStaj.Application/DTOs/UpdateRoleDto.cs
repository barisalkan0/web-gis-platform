namespace BasarsoftStaj.Application.DTOs;

// Rol düzenleme pop-up'ının gönderdiği TAM durum — admin panelinden isim, renk ve izin
// kodları listesi tek PATCH'te birlikte güncelleniyor. Gün 6: tek tek Can* boolean'ları
// yerine PermissionCodes (o rolün sahip olacağı TAM izin listesi) gönderiliyor.
public class UpdateRoleDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Color { get; set; } = string.Empty;
    public List<string> PermissionCodes { get; set; } = new();
}

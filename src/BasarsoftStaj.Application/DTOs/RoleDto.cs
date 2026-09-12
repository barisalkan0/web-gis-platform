namespace BasarsoftStaj.Application.DTOs;

public class RoleDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Color { get; set; } = string.Empty;
    public bool IsBuiltIn { get; set; }
    // Gün 6: sabit CanXxx boolean'ları yerine dinamik izin kodları listesi (bkz. Permission,
    // PermissionCodes). Admin panelindeki checkbox'lar bu kodlara göre işaretleniyor.
    public List<string> PermissionCodes { get; set; } = new();
    public DateTime CreatedDate { get; set; }
    public int UserCount { get; set; }
}

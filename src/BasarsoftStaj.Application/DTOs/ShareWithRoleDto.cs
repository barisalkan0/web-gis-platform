namespace BasarsoftStaj.Application.DTOs;

// Faz 3.2: haritayı bir role toplu paylaşmak için — o roldeki HERKES otomatik erişir,
// kabul/red akışı yok (bkz. MapShareService.ShareWithRoleAsync).
public class ShareWithRoleDto
{
    public int RoleId { get; set; }
}

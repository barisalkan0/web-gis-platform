namespace BasarsoftStaj.Application.DTOs;

// Harita sahibinin "kimi davet ettim/hangi role paylaştım, kim kabul etti" görünümü.
public class MapShareDto
{
    public int Id { get; set; }
    public int MapId { get; set; }

    // Faz 3.2 (kullanıcının kendi isteği: "rollere de paylaşabilelim veya kişilere de"):
    // "User" ya da "Role" — frontend'in tek listede iki türü ayırt edip gruplamasını
    // (Aktif/Davetli, kişi/rol ikonu vb.) kolaylaştırmak için, null kontrolüyle uğraşmasın.
    public string TargetType { get; set; } = "User";

    // TargetType="User" ise dolu, "Role" ise boş.
    public int? InvitedUserId { get; set; }
    public string InvitedUsername { get; set; } = string.Empty;

    // TargetType="Role" ise dolu, "User" ise boş. RoleUserCount: "bu role kaç kişi dahil"
    // (bilgi amaçlı — paylaşımdan etkilenen kişi sayısını net görebilsin diye).
    // Görev #7: InvitedUserId/RoleId — frontend'in Paylaş modalından doğrudan
    // "🚧 Kısıtla" (GeoRestrictionModal, mapId-özel) açabilmesi için (id olmadan hangi
    // kullanıcı/role kısıt tanımlanacağı bilinemez).
    public int? RoleId { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public string RoleColor { get; set; } = string.Empty;
    public int RoleUserCount { get; set; }

    public string Status { get; set; } = string.Empty;
    public DateTime InvitedDate { get; set; }
    public DateTime? RespondedDate { get; set; }

    // Faz 3: sahibin bu davetliye/role tanımladığı ayarlar — Paylaş modalındaki toggle/palet
    // editörünü doldurmak için.
    public bool CanView { get; set; } = true;
    public bool CanDraw { get; set; } = true;
    public bool CanDelete { get; set; } = true;
    public bool CanEditOthers { get; set; }
    public string? AllowedColors { get; set; }
}

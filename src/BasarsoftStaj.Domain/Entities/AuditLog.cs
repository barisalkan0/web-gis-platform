namespace BasarsoftStaj.Domain.Entities;

// Admin panelindeki her önemli aksiyon (rol verme/alma, izin değiştirme, rol/kategori
// oluşturma-silme vs.) buraya bir satır düşer — "hangi admin ne yaptı" görülebilsin diye.
public class AuditLog
{
    public int Id { get; set; }
    public string ActorUsername { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty; // kısa kod: "role.create", "user.role_change" vs.
    public string Details { get; set; } = string.Empty; // insan tarafından okunabilir açıklama
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;

    // Faz 3: harita sahibinin (admin OLMASA bile) kendi haritasına özel aktiviteyi
    // görebilmesi için — geometry.* aksiyonları bununla damgalanıyor, admin-only aksiyonlarda
    // (rol/izin değişikliği vs.) null kalıyor (bkz. MapShareService.GetActivityForMapAsync).
    public int? MapId { get; set; }
}

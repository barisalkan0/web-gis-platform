namespace BasarsoftStaj.Domain.Entities;

// Gün 6 ödevi: Role üzerindeki sabit CanXxx boolean'larının yerini alan gerçek, dinamik
// yetki tablosu. Code programatik kontroller için SABİT kalması gereken anahtar (bkz.
// PermissionCodes) — Name/Description admin panelinden okunan/değiştirilebilen serbest
// metin, koddaki hiçbir kontrol bunlara bakmıyor.
public class Permission
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
}

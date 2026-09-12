namespace BasarsoftStaj.Application.DTOs;

// Davet edilen kişinin "Benimle Paylaşılanlar" ekranı — hem yanıt bekleyen hem kabul
// edilmiş paylaşımlar burada listelenir (Declined/Removed olanlar dönmez).
public class SharedMapDto
{
    public int ShareId { get; set; }
    public int MapId { get; set; }
    public string MapName { get; set; } = string.Empty;
    public string OwnerUsername { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime InvitedDate { get; set; }
    public DateTime? RespondedDate { get; set; }

    // Faz 3.2: bu erişim kişisel bir davetten değil, kullanıcının bir ROLÜ üzerinden
    // geliyorsa dolu (ör. "Editör" rolü) — null ise kişisel davet.
    public string? ViaRoleName { get; set; }

    // BUG FİX (bu turda fark edildi, Görev #72'nin "Duraklatıldı" rozeti için gerekliydi
    // ama DTO'da hiç yoktu — rozet sessizce hiç görünmüyordu): sahip "Duraklat" derse burada
    // false olur, frontend "Duraklatıldı" rozetini gösterebilsin diye eklendi.
    public bool CanView { get; set; } = true;

    // Görev #77 (mid-turn ek istek): davetlinin (BENİM, görüntüleyenin) kendi tercihleri —
    // favorileme/arşivleme/not. Sahibin ayarlarından TAMAMEN bağımsız.
    public bool IsFavorite { get; set; }
    public bool IsArchived { get; set; }
    public string? Note { get; set; }
}

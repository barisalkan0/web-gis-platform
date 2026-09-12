namespace BasarsoftStaj.Application.DTOs;

// Görev #77 (mid-turn ek istek, kullanıcının kendi cümlesi): "paylaşılan haritaları
// sonradan arşive atabilmeliyim, favorileyebilmeliyim veya onlara not ekleyebilmeliyim
// bir kullanıcı olarak." Üç alan da NULLABLE — frontend sadece DEĞİŞTİRDİĞİ alanı
// gönderir, diğerleri dokunulmadan kalır (PATCH semantiği, PUT değil).
public class SetRecipientPrefsDto
{
    public bool? IsFavorite { get; set; }
    public bool? IsArchived { get; set; }
    public string? Note { get; set; }
    // Note alanını AÇIKÇA boşaltmak (null yapmak) istiyorsa frontend bunu true gönderir —
    // yoksa Note=null "bu alanı hiç göndermedim" ile "notu sildim" ayırt edilemezdi.
    public bool ClearNote { get; set; }
}

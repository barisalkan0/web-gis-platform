namespace BasarsoftStaj.Domain.Entities;

// MapShare.Status için sabit string değerler — PermissionCodes.cs ile aynı gerekçe:
// literal string yerine buradan referans alınırsa yazım hatası derleme zamanında yakalanır.
public static class MapShareStatus
{
    // Davet gönderildi, hedef kişi henüz kabul/red etmedi.
    public const string Pending = "Pending";

    // Hedef kişi kabul etti — harita artık onun "Benimle Paylaşılanlar" listesinde,
    // içeriğini görüntüleyebiliyor (Faz 2: sadece görüntüleme, çizemez).
    public const string Accepted = "Accepted";

    // Hedef kişi reddetti — tekrar davet edilirse aynı satır Pending'e döner (bkz. MapShareService.InviteAsync).
    public const string Declined = "Declined";

    // Sahip, kabul edilmiş ya da bekleyen bir daveti durdurdu/kişiyi çıkardı.
    public const string Removed = "Removed";
}

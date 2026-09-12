using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

// Faz 2: harita paylaşımı — sahip (ManageMultipleMaps iznine sahipse) kullanıcı adıyla
// davet gönderir. Davet Pending başlar, hedef kişi kabul/red eder, sahip istediği an
// durdurabilir (Removed). ŞİMDİLİK sadece görüntüleme paylaşılıyor — çizim/düzenleme izni,
// kişiye özel görünürlük ve renk kısıtlaması Faz 3'te (bkz. PermissionCodes.ManageMultipleMaps).
public interface IMapShareService
{
    // Sahibin kendi haritası için gönderdiği tüm davetler (Pending/Accepted/Declined/Removed) —
    // "kim davetli, kim kabul etti" ekranı için. mapId sahibine ait değilse boş liste döner.
    Task<IEnumerable<MapShareDto>> GetSharesForMapAsync(int mapId, int ownerUserId);

    // Davet edilen kişinin "Benimle Paylaşılanlar" ekranı — Pending + Accepted olanlar.
    Task<IEnumerable<SharedMapDto>> GetSharedWithMeAsync(int userId);

    Task<(bool Success, MapShareDto? Result, string? Error)> InviteAsync(int mapId, int ownerUserId, string invitedUsername, string actorUsername);

    // Faz 3.2 (kullanıcının kendi isteği: "rollere de paylaşabilelim"): haritayı bir role
    // toplu paylaşır — kabul/red YOK, roldeki herkes anında erişir (Status=Accepted).
    Task<(bool Success, MapShareDto? Result, string? Error)> ShareWithRoleAsync(int mapId, int ownerUserId, int roleId, string actorUsername);

    // Paylaş baloncuğundaki canlı kullanıcı arama kutusu için — kullanıcı adının GEÇTİĞİ
    // (baştan değil, herhangi bir yerinde) ilk birkaç eşleşme. query boşsa boş liste döner
    // (tüm kullanıcıları dökmeyelim). excludeUserId: kendi kendini paylaşamasın diye kendisi hariç.
    Task<IEnumerable<UserSearchResultDto>> SearchUsersAsync(string query, int excludeUserId);

    // accept=true -> Accepted, false -> Declined. Sadece davet edilen kişi kendi davetine yanıt verebilir.
    Task<(bool Success, string? Error)> RespondAsync(int shareId, int userId, bool accept, string actorUsername);

    // Sadece harita sahibi çağırabilir — bekleyen/kabul edilmiş bir daveti durdurur (Removed).
    Task<(bool Success, string? Error)> RemoveAsync(int shareId, int ownerUserId, string actorUsername);

    // GeometryController'ın "bu mapId benim değil ama bana paylaşılmış mı, kabul ettim mi" kontrolü için.
    Task<bool> HasAcceptedAccessAsync(int mapId, int userId);

    // ---- Faz 3 (kullanıcının kendi isteği) ----
    // Bu kullanıcının (sahip DEĞİLSE) bu haritadaki ayarları — GeometryController'ın
    // "başkalarının çizimini düzenleyebilir mi" ve GeometryService'in renk kısıtlaması
    // kontrolü için ortak kullanılıyor. Kabul edilmiş bir paylaşım yoksa null döner.
    Task<MapShareSettingsDto?> GetShareForUserAsync(int mapId, int userId);

    // Sadece harita sahibi çağırabilir — bir davetlinin çizme/silme/başkasını-düzenleme
    // iznini ve renk kısıtlamasını günceller (görüntüleme dahil değil, bkz. SetViewPausedAsync).
    Task<(bool Success, string? Error)> UpdateShareSettingsAsync(int shareId, int ownerUserId, bool canDraw, bool canDelete, bool canEditOthers, string? allowedColors, string actorUsername);

    // Faz 3.1: "Duraklat/Devam Ettir" — davete/Status'a dokunmadan TÜM erişimi tek tıkla
    // aç/kapa. RemoveAsync (Durdur/Sil) gibi kalıcı değil, geri alınabilir.
    Task<(bool Success, string? Error)> SetViewPausedAsync(int shareId, int ownerUserId, bool canView, string actorUsername);

    // Görev #76: bir paylaşım satırındaki kişiye tıklayınca açılan profil kartı için —
    // hedef kullanıcının temel bilgisi + BENİM (ownerUserId) onunla paylaştığım haritalar.
    Task<UserShareSummaryDto?> GetUserShareSummaryAsync(int ownerUserId, string username);

    // Görev #77 (mid-turn ek istek): DAVETLİNİN (sahip DEĞİL) kendi favorileme/arşivleme/not
    // tercihlerini günceller — sadece kendi payına düşen satırı değiştirebilir.
    Task<(bool Success, string? Error)> SetRecipientPrefsAsync(int shareId, int userId, SetRecipientPrefsDto dto);

    // Kullanıcının kendi isteği (harita şeridi polish turu): "kaç kişiyle paylaşıldığı
    // haritanın yanında yazsın, aktif kaç kişi var görelim" — MapService.GetMyMapsAsync bunu
    // TEK sorguda tüm haritalar için toplu istiyor (N harita için N ayrı sorgu atmasın diye).
    // Total: Declined/Removed HARİÇ tüm paylaşımların ulaştığı kişi sayısı (rol paylaşımı
    // roleUserCount kadar kişi sayılır, MapShareDto'daki aynı deseni kullanıyoruz). Active:
    // bunların içinde Accepted VE CanView=true (duraklatılmamış) olanlar.
    Task<Dictionary<int, (int Total, int Active)>> GetShareCountsForOwnerAsync(int ownerUserId);
}

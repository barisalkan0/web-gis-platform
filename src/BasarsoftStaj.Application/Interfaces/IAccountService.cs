using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

public interface IAccountService
{
    Task<(bool Success, string? Error)> ChangePasswordAsync(string username, ChangePasswordDto dto);

    // Hesabı "Tehlikeli Bölge"den kapatır — kalıcı silmez, IsDeleted+DeletedAt işaretler.
    // 30 gün boyunca (PurgeExpiredAsync çalışana kadar) geri alınabilir durumda kalır.
    Task<(bool Success, string? Error)> DeleteOwnAccountAsync(string username, DeleteAccountDto dto);

    // DeletedAt üzerinden 30 günü dolmuş hesapları kalıcı olarak temizler. Gerçek bir
    // zamanlanmış görev (cron/hosted service) burada YOK — admin panelinden ya da
    // periyodik bir tetikleyiciden manuel çağrılması gerekiyor (bkz. ilgili not).
    Task<int> PurgeExpiredAsync();
}

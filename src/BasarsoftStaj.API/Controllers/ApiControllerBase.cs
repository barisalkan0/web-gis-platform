using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace BasarsoftStaj.API.Controllers;

// Hoca isteği: "Controller altındaki tüm API uçlarına try-catch ekleyerek hata yönetimini
// standartlaştırın." Her endpoint kendi try-catch'ini yazıyor (bilerek — hoca literal olarak
// bunu istedi), ama yakalanan hatanın loglanması ve standart 500 yanıtına çevrilmesi tek bir
// yerde (HandleException) toplanıyor ki aynı kod 40+ endpoint'te tekrar tekrar yazılmasın.
// PermissionControllerBase (rol/izin kontrolü olan controller'lar) ve doğrudan bu sınıftan
// türeyen controller'lar (Analysis, Locations, Account) aynı yardımcıyı paylaşıyor.
public abstract class ApiControllerBase : ControllerBase
{
    protected readonly ILogger Logger;

    protected ApiControllerBase(ILogger logger)
    {
        Logger = logger;
    }

    // userMessage: kullanıcıya gösterilecek genel mesaj (hata detayını/stack trace'i asla
    // client'a sızdırmıyoruz) — asıl teknik detay sadece log'a yazılıyor.
    protected IActionResult HandleException(Exception ex, string userMessage)
    {
        Logger.LogError(ex, "{Message} (Path: {Path})", userMessage, HttpContext?.Request?.Path);
        return StatusCode(500, new { message = userMessage });
    }
}

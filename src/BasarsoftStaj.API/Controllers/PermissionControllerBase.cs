using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// İzin kontrolü Geometry/Trash/Admin/Role/Category/Analysis controller'larının hepsinde
// tekrarlanan bir mantık — ortak bir üst sınıfa taşındı. [Authorize] ile gelen kullanıcının
// GÜNCEL efektif izin setini (rolünden gelenler + kendisine doğrudan atananlar, DB'den taze)
// okuyup istenen izin kodunun bu sette olup olmadığını kontrol eder.
//
// Gün 6: eskiden burada Role üzerinde sabit bir boolean okunuyordu (Func<Role,bool>), artık
// IPermissionService üzerinden dinamik Permission koduna bakılıyor (bkz. PermissionCodes.cs).
// Not: token geçerliyken kullanıcı sonradan silinmiş/rolsüz kalmışsa (nadir bir durum —
// normalde JWT süresi izin/rol değişikliğinden önce dolar) efektif liste boş döner ve bu
// durum aşağıda 403 olarak ele alınıyor; eski kodun ayrıca yaptığı 401/403 ayrımı burada
// bilinçli olarak basitleştirildi, gerçek pratik fark yaratmıyor.
public abstract class PermissionControllerBase : ApiControllerBase
{
    protected PermissionControllerBase(ILogger logger) : base(logger) { }

    protected async Task<IActionResult?> RequirePermissionAsync(
        IPermissionService permissionService, string permissionCode, string deniedMessage)
    {
        var username = User.Identity?.Name;
        if (string.IsNullOrEmpty(username)) return Unauthorized();

        var effectiveCodes = await permissionService.GetEffectivePermissionCodesForUsernameAsync(username);

        // ManageAdmin her zaman geçer — hem admin panelini yönetebilsinler hem de kendi
        // izinlerinden bağımsız her araçta çalışabilsinler (eski CanManageAdmin bypass'ının
        // birebir devamı).
        if (effectiveCodes.Contains(PermissionCodes.ManageAdmin)) return null;

        return effectiveCodes.Contains(permissionCode) ? null : StatusCode(403, new { message = deniedMessage });
    }

    // Kullanıcının kendi isteği: "adminler her şeyi yapabilecek ve herkesin çizgi ve
    // POI'lerini görebilecek istediği takdirde." CanViewMapAsync gibi GÖRÜNTÜLEME
    // kontrollerinde (Geometry/Poi/GeoServerConfig controller'larında tekrarlanan aynı
    // desen) RequirePermissionAsync'in üstündeki ManageAdmin bypass'ı hiç devreye girmiyordu
    // çünkü bu kontroller GET uçlarında ayrı, kendi private CanViewMapAsync metotlarıyla
    // yapılıyor. Aynı bypass mantığını buraya taşıyoruz ki admin sahiplik/paylaşım
    // aranmaksızın HER haritayı görüntüleyebilsin.
    protected async Task<bool> IsAdminAsync(IPermissionService permissionService)
    {
        var username = User.Identity?.Name;
        if (string.IsNullOrEmpty(username)) return false;
        var effectiveCodes = await permissionService.GetEffectivePermissionCodesForUsernameAsync(username);
        return effectiveCodes.Contains(PermissionCodes.ManageAdmin);
    }
}

using System.Security.Claims;
using BasarsoftStaj.Application.Interfaces;

namespace BasarsoftStaj.Application.Services;

public class CurrentUserService : ICurrentUserService
{
    public int? GetUserId(ClaimsPrincipal principal)
    {
        // FindFirstValue (Microsoft.AspNetCore.Http'ye ait bir extension) yerine bilerek
        // ClaimsPrincipal'ın kendi FindFirst metodunu kullanıyoruz — bu proje (Application)
        // ASP.NET Core paketlerine referans vermiyor, sadece çekirdek System.Security.Claims'e.
        var idClaim = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(idClaim, out var id) ? id : null;
    }
}

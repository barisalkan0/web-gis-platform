using System.Security.Claims;

namespace BasarsoftStaj.Application.Interfaces;

// JWT'deki NameIdentifier claim'inden ("kullanıcı id'si") o an giriş yapmış kullanıcıyı
// çözen küçük bir yardımcı — "harita sadece giriş yapan kullanıcının kendi çizimlerini
// göstersin" isteği için gerekli. Controller'larda ClaimsPrincipal parse etme kodu
// tekrarlanmasın diye tek bir yerde toplandı.
public interface ICurrentUserService
{
    // Claim yoksa (ör. bu özellik eklenmeden ÖNCE alınmış eski bir token) veya
    // sayıya çevrilemiyorsa null döner — çağıran taraf bunu 401 olarak ele almalı.
    int? GetUserId(ClaimsPrincipal principal);
}

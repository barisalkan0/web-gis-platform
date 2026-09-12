namespace BasarsoftStaj.Application.DTOs;

// Giriş yaptıktan sonra frontend'in "ben kimim, ne yapabilirim" diye sorduğu uç nokta
// (GET api/Auth/me) için — JWT'nin içindeki kullanıcı adını ve GÜNCEL, EFEKTİF izin
// listesini (rolden gelenler + kullanıcıya doğrudan atananlar birleşik, DB'den taze
// okunmuş, JWT'ye gömülü değil) birlikte döndürüyor. Böylece bir admin rolünü/iznini
// değiştirdiğinde kullanıcı yeniden giriş yapmadan da (bir sonraki /me çağrısında) güncel
// halini görür. Gün 6: tek tek Can* boolean'ları yerine PermissionCodes listesi — frontend
// (auth.js) bunu aynı eski boolean şekline kendi tarafında çeviriyor, MapPage/AttributePopup/
// CategoryManagerModal gibi tüketiciler HİÇ değişmedi.
public class MeDto
{
    // Görev #70 (kullanıcının kendi isteği): frontend'in "bu şekli BEN mi çizdim" diye
    // GeometryDto.InsertedUserId ile karşılaştırabilmesi için — paylaşılan bir haritada
    // düzenle/sil butonlarını yazara göre gizlemek/deaktif etmek üzere eklendi.
    public int UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public int RoleId { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public string RoleColor { get; set; } = string.Empty;
    public List<string> PermissionCodes { get; set; } = new();
}

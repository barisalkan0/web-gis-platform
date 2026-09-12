namespace BasarsoftStaj.Application.DTOs;

// Bir role veya kullanıcıya atanacak izinlerin TAM listesi — gönderilen liste, o rolün/
// kullanıcının o andaki izin setinin tamamının yerine geçer (var olup listede olmayanlar
// kaldırılır, listede olup var olmayanlar eklenir). Admin panelindeki checkbox matrisiyle
// birebir eşleşen bir "toplu kaydet" deseni (bkz. RoleController/AdminController).
public class SetPermissionsDto
{
    public List<string> PermissionCodes { get; set; } = new();
}

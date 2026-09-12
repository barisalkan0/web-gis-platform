namespace BasarsoftStaj.Domain.Entities;

// Kullanıcıya ROLÜNDEN BAĞIMSIZ doğrudan verilmiş yetki. Hoca'nın Gün 6 isteği: "Yetkiler
// hem Role hem de doğrudan Kullanıcıya atanabilmelidir." Bir izin zaten kullanıcının
// rolünde varsa buraya AYRICA eklenmez (admin panelinde o zaten "rolden geliyor" rozetiyle
// gösterilip seçilemez hale getiriliyor, bkz. AdminPage.jsx) — bu tablo sadece rolün
// vermediği, kullanıcıya özel ekstra izinleri tutar.
public class UserPermission
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int PermissionId { get; set; }
}

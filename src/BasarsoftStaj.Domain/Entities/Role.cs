namespace BasarsoftStaj.Domain.Entities;

// Discord tarzı dinamik rol sistemi — artık sabit bir enum değil, adminlerin panelden
// oluşturup silebildiği, adını/rengini değiştirebildiği gerçek bir tablo. "Kullanıcı" ve
// "Admin" kurulumda otomatik oluşan (seed) roller — IsBuiltIn=true olduğu için silinemezler
// ama adı/rengi/izinleri tamamen değiştirilebilir ("her şey sonradan değiştirilebilir olmalı").
//
// Gün 6 ödevi: izinler artık burada sabit CanXxx boolean'ları olarak DEĞİL, ayrı bir
// Permission tablosuna RolePermission ile bağlanarak tutuluyor (bkz. Permission.cs,
// RolePermission.cs, PermissionCodes.cs). Bir rolün o an sahip olduğu izinler
// IPermissionService üzerinden okunuyor.
public class Role
{
    // Seed rollerin sabit id'leri — migration'da HasData ile oluşturuluyor, AuthService
    // yeni kayıt olan kullanıcıya varsayılan rolü atarken bu id'leri kullanıyor.
    public const int DefaultUserRoleId = 1;
    public const int DefaultAdminRoleId = 2;
    // Hoca ödevi (POI/Rol/Operatör): "Sisteme 3 temel rol tanımlayın: Admin, Operatör, Kullanıcı."
    public const int DefaultOperatorRoleId = 3;

    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    // "rol açıklaması falan da girilebilsin" — admin panelinde rol oluştururken/düzenlerken
    // görünen serbest metin açıklama, tamamen opsiyonel.
    public string? Description { get; set; }
    public string Color { get; set; } = "#6b7280";
    public bool IsBuiltIn { get; set; } = false;

    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
}

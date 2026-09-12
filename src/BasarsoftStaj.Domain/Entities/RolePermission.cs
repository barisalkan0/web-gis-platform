namespace BasarsoftStaj.Domain.Entities;

// Role <-> Permission çoktan-çoğa ilişkisi. Navigasyon property bilinçli olarak yok —
// projedeki generic Repository<T> Include() desteklemiyor, PermissionService bu tabloyu
// GetAllAsync() ile çekip bellekte join'liyor (küçük bir tablo, TblPoint/Line/Polygon gibi
// büyümüyor, bu yeterince hızlı).
public class RolePermission
{
    public int Id { get; set; }
    public int RoleId { get; set; }
    public int PermissionId { get; set; }
}

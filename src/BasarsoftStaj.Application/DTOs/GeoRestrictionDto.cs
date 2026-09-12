namespace BasarsoftStaj.Application.DTOs;

public class GeoRestrictionDto
{
    public int Id { get; set; }
    public int? RoleId { get; set; }
    public int? UserId { get; set; }
    public string? Name { get; set; }
    public string Kind { get; set; } = "Freeform";
    public string Wkt { get; set; } = string.Empty;
    public DateTime ModifiedDate { get; set; }

    // Görev #7: null = global (admin), dolu = sadece bu haritada geçerli (harita sahibi tanımladı).
    public int? MapId { get; set; }
    public bool IsPaused { get; set; }
}

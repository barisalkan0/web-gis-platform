using NetTopologySuite.Geometries;

namespace BasarsoftStaj.Domain.Entities;

public class TblLine : IGeometryFeature<LineString>
{
    public int Id { get; set; }
    public LineString Geometry { get; set; } = null!;
    public string? Place { get; set; }
    public string? Province { get; set; }
    public string? Name { get; set; }
    public string? Color { get; set; }
    public int? CategoryId { get; set; }
    public bool IsDeleted { get; set; } = false;
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public bool IsActive { get; set; } = true;
    public int? InsertedUserId { get; set; }
    public DateTime? ModifiedDate { get; set; }
    public int? MapId { get; set; }
    public bool IsPrivate { get; set; } = false;
}

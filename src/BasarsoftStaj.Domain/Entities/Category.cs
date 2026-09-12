namespace BasarsoftStaj.Domain.Entities;

// Nokta/çizgi/alanların "ne olduğunu" etiketlemek için opsiyonel kategori — doğalgaz
// hattı, su hattı, elektrik direği vs. Zorunlu değil, kullanıcı boş bırakabilir.
public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Color { get; set; } = "#6b7280";
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public string? CreatedByUsername { get; set; }
}

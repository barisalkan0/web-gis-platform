namespace BasarsoftStaj.Application.DTOs;

public class CategoryDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Color { get; set; } = string.Empty;
    public DateTime CreatedDate { get; set; }
    public string? CreatedByUsername { get; set; }
}

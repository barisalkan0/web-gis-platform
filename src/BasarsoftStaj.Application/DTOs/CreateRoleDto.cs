namespace BasarsoftStaj.Application.DTOs;

public class CreateRoleDto
{
    public string Name { get; set; } = string.Empty;
    public string? Color { get; set; }
    public string? Description { get; set; }
}

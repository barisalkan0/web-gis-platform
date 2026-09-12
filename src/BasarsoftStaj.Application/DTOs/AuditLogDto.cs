namespace BasarsoftStaj.Application.DTOs;

public class AuditLogDto
{
    public int Id { get; set; }
    public string ActorUsername { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public DateTime CreatedDate { get; set; }
}

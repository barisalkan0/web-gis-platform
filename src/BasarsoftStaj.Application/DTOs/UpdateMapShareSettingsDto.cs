namespace BasarsoftStaj.Application.DTOs;

// Faz 3: Paylaş modalındaki bir davetli satırı için sahibin gönderdiği ayar güncellemesi.
public class UpdateMapShareSettingsDto
{
    public bool CanDraw { get; set; } = true;
    public bool CanDelete { get; set; } = true;
    public bool CanEditOthers { get; set; }
    public string? AllowedColors { get; set; }
}

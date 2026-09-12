namespace BasarsoftStaj.Application.DTOs;

// Faz 3: GeometryService'in (renk kısıtlaması kontrolü için) ve GeometryController'ın
// ("başkalarının çizimini düzenleyebilir mi") ihtiyaç duyduğu, bir davetlinin belirli bir
// haritadaki ayarlarının küçük/hafif görünümü — tam MapShareDto'ya gerek yok.
public class MapShareSettingsDto
{
    public bool CanView { get; set; } = true;
    public bool CanDraw { get; set; } = true;
    public bool CanDelete { get; set; } = true;
    public bool CanEditOthers { get; set; }
    public string? AllowedColors { get; set; }
}

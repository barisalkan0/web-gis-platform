namespace BasarsoftStaj.Application.DTOs;

// Haritada bir nokta/çizgi/alanın köşe noktalarını sürükleyerek şeklini değiştirdikten
// sonra (bkz. frontend ol/interaction/Modify) yeni WKT'yi kaydetmek için.
public class UpdateGeometryDto
{
    public string Wkt { get; set; } = string.Empty;
}

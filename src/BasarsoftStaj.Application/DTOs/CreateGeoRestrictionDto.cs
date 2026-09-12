namespace BasarsoftStaj.Application.DTOs;

// v2: SetGeoRestrictionDto'nun yerine geçti — artık "tek alanın üzerine yaz" değil,
// "listeye yeni bir alan EKLE" anlamına geliyor (bkz. IGeoRestrictionService.AddForRoleAsync/AddForUserAsync).
public class CreateGeoRestrictionDto
{
    public string Wkt { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string Kind { get; set; } = "Freeform";
}

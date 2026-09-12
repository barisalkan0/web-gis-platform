namespace BasarsoftStaj.Application.DTOs;

// Hoca ödevi (2. tur — GeoServer SQL View/WMS-WFS ayrımı + Isı Haritası): frontend'in
// GeoServer'a DOĞRUDAN (backend'e uğramadan) WMS isteği atabilmesi için ihtiyaç duyduğu
// bağlantı bilgileri + O KULLANICIYA/HARİTAYA özel scoped CQL_FILTER. Katman adları
// (tbl_point/tbl_line/tbl_polygon) sabit ve zaten frontend'de biliniyor — burada
// TEKRARLANMASına gerek yok, sadece değişebilecek/gizli kalması gereken şeyler (baseUrl,
// workspace, filtre) dönüyor.
public class GeoServerConfigDto
{
    public string BaseUrl { get; set; } = string.Empty;
    public string Workspace { get; set; } = string.Empty;
    public string CqlFilter { get; set; } = string.Empty;
}

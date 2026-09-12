namespace BasarsoftStaj.Application.Services;

// Hoca ödevi (Isı Haritası + SQL View/CQL_FILTER, 2. tur): "Kullanıcı bazlı filtrelemeler
// için GeoServer'ın cql_filter yapısını kullanın" — bu görünürlük kuralı (silinmemiş +
// doğru harita + özel görünürlük) artık İKİ ayrı yerden GeoServer'a CQL_FILTER olarak
// gönderiliyor: GeometryService.GetAllFromGeoServerAsync (WFS, çizim/etkileşim) ve
// GeoServerConfigController (WMS, genel gösterim + Isı Haritası). Aynı string'i iki
// yerde elle tekrar etmek zamanla birbirinden sapıp bir güvenlik açığına dönüşebilir
// (biri güncellenir diğeri unutulur) — bu yüzden TEK doğruluk kaynağı burada.
public static class GeoServerCqlFilterBuilder
{
    // isOwner=true ise haritanın sahibi her şeyi görür (özel kayıtlar dahil).
    // isOwner=false ise: özel olmayan kayıtlar + (varsa) kendi özel kayıtları.
    public static string BuildVisibilityFilter(int mapId, int? userId, bool isOwner)
    {
        var filter = $"is_deleted = false AND map_id = {mapId}";
        if (!isOwner)
        {
            filter += userId != null
                ? $" AND (is_private = false OR inserted_user_id = {userId})"
                : " AND is_private = false";
        }
        return filter;
    }
}

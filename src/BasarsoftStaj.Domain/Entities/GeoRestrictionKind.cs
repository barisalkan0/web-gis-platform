namespace BasarsoftStaj.Domain.Entities;

// GeoRestriction.Kind için sabit değerler — admin bir alanı elle mi çizdi (Freeform) yoksa
// Nominatim'den ülke/il arayarak mı ekledi (Place) bilgisini taşır. Sadece bilgilendirici/
// arayüz amaçlı — enforcement (GeometryService) ikisi arasında ayrım YAPMIYOR, hepsi aynı
// şekilde "izinli alan" olarak Contains kontrolüne giriyor.
public static class GeoRestrictionKind
{
    public const string Freeform = "Freeform";
    public const string Place = "Place";
}

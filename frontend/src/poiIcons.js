// Kullanıcının kendi isteği ("ikon ekleme de olacak poilere"): kategori ve POI formlarında
// kullanılan ortak ikon paleti. Dosya yükleme yerine emoji seçildi (bkz. Poi.cs/PoiCategory.cs
// yorumları) — hem admin panelinde hem POI ekleme formunda AYNI liste kullanılıyor ki
// tutarlı bir seçim deneyimi olsun.
export const POI_ICON_PALETTE = [
  '📍', '🍽️', '☕', '🍺', '🏨', '🏥', '💊', '🏫', '🏦', '🛒',
  '⛽', '🅿️', '🚉', '⛲', '🏛️', '⛪', '🎭', '🎬', '🏋️', '🛠️',
  '🏢', '🏠', '🌳', '🐾', '📚', '🧑‍🎨', '⚽', '🎡', '🛍️', '💈',
];

export function isValidPoiIcon(icon) {
  return typeof icon === 'string' && icon.trim().length > 0 && icon.trim().length <= 16;
}

// Kullanıcının kendi isteği: "google mapste nereler öneriliyor falan diye" — arama
// barının altındaki "önerilen kategoriler" çipleri için ÖNCELİK sırası. Kategoriler admin
// panelinden serbestçe oluşturulduğu için sabit bir liste değil, bu anahtar kelimeler
// gerçek kategori isimleriyle (içerir/contains, Türkçe küçük harfe çevrilip) eşleştirilip
// bulunan ilk N tanesi "önerilen" olarak gösteriliyor (bkz. PoiSearchBar.jsx
// buildSuggestedCategories). Sırayla en çok aranan/bilinen yer türleri — Google Maps'in
// arama çubuğu altında gösterdiği kısayollara esinlenerek seçildi.
export const POI_SUGGESTED_CATEGORY_KEYWORDS = [
  'restoran', 'kafe', 'kahve', 'market', 'eczane', 'hastane', 'banka',
  'otel', 'okul', 'park', 'akaryakıt', 'benzin', 'otopark', 'alışveriş',
  'cami', 'müze', 'spor', 'kuaför',
];

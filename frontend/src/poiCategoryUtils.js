// Hoca ödevi (GeoServer POI Entegrasyonu): "Her bir POI kategorisi için ... farklı ikon
// veya renkler ile gösterilmesini sağlayın." Aynı deterministik palet, GeoServer'a
// yüklenecek kategori SLD'lerini üreten scripts/generate-poi-category-slds.js dosyasında
// da BİREBİR kullanılıyor. Buraya taşındı (eskiden MapPage.jsx'e özeldi) ki arama barındaki
// kategori çipleri de (PoiSearchBar.jsx) AYNI renkleri kullanabilsin — harita pini, admin
// paneli ve arama çipleri arasında tutarlılık bozulmasın diye TEK kaynak.
export const POI_CATEGORY_COLOR_PALETTE = [
  '#2563eb', '#db2777', '#16a34a', '#f59e0b', '#7c3aed',
  '#0891b2', '#dc2626', '#65a30d', '#c026d3', '#0d9488',
  '#ea580c', '#4338ca',
];
export const POI_NEUTRAL_CATEGORY_COLOR = '#6b7280'; // kategorisiz POI

export function categoryColorForId(categoryId) {
  if (categoryId == null) return POI_NEUTRAL_CATEGORY_COLOR;
  const index = Math.abs(Number(categoryId)) % POI_CATEGORY_COLOR_PALETTE.length;
  return POI_CATEGORY_COLOR_PALETTE[index];
}

export function buildPoiCategoryOptions(categories) {
  const byParent = new Map();
  categories.forEach((category) => {
    const key = category.parentId ?? 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(category);
  });
  byParent.forEach((list) => list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, 'tr')));

  const result = [];
  function walk(parentKey, depth) {
    const children = byParent.get(parentKey) || [];
    children.forEach((category) => {
      result.push({
        id: category.id,
        name: category.name,
        description: category.description,
        icon: category.icon,
        depth,
        label: `${'　'.repeat(depth)}${depth > 0 ? '↳ ' : ''}${category.name}`,
      });
      walk(category.id, depth + 1);
    });
  }
  walk('root', 0);
  return result;
}

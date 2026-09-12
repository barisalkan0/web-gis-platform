import { useEffect, useMemo, useRef, useState } from 'react';
import { buildPoiCategoryOptions, categoryColorForId } from '../poiCategoryUtils';
import { POI_SUGGESTED_CATEGORY_KEYWORDS } from '../poiIcons';

// Hoca ödevi (POI Arama Barı): "Ekrana Google Maps benzeri bir Arama Barı ekleyin. Arama
// yapıldığında kayıtlı POI'ler arasında arama yapılsın, sonuçlardan birine tıklandığında
// harita o noktaya otomatik zoom yapsın. Bu arama özelliği Kullanıcı (User) rolüne de açık
// olmalıdır." — backend'e ayrı bir arama endpoint'i eklemedik: POI listesi zaten haritaya
// girerken bir kere çekiliyor (bkz. MapPage.jsx fetchPois -> GET /api/Poi/catalog, herkese
// açık bir uç nokta), arama bu listenin üzerinde CLIENT-SIDE filtreleniyor. Kullanıcı rolü
// dahil herkes zaten bu listeyi görebildiği için ekstra bir izin kontrolüne gerek yok.
//
// Kullanıcının kendi isteği (2. tur): arama barının altında Google Maps tarzı önerilen
// kategori çipleri + "Tümü" ile tam kategori listesi, bir POI/kategori seçilince haritada
// SADECE o gösterilsin (izolasyon MapPage'deki görünürlük effect'inde, selectedPoiId/
// activeCategoryId üzerinden), arama kutusu seçili POI'yi pinleyip yanında X ile Esc'e
// eşdeğer bir "temizle" sunsun.
const MAX_RESULTS = 8;
const MAX_SUGGESTED_CATEGORIES = 6;
const MAX_RECENTS = 6;
const RECENTS_STORAGE_KEY = 'poiSearchRecents';

// Kullanıcının kendi isteği (3. tur): "arama yerine tıklayınca önerilenler aşağı doğru
// sıralansın... son arananlar fln da olsun... geçmişte arandığı farklı bi sembolle yazsın."
// — Google Maps'teki gibi, arama kutusu boşken odaklanınca son SEÇİLEN (arama sonucundan
// tıklanan) POI'ler saat ikonuyla listelenir. Gerçek tarayıcıda kalıcı kalsın diye
// localStorage kullanılıyor (Cowork'teki artifact önizlemesinden FARKLI olarak bu gerçek,
// dağıtılmış bir uygulama — localStorage burada tamamen uygun).
function loadRecentIds() {
  try {
    const raw = localStorage.getItem(RECENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentIds(ids) {
  try {
    localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage kapalı/erişilemez olabilir (gizli sekme, kota dolu vb.) — sessizce yok say,
    // özellik sadece "hatırlamıyor" hâline düşer, uygulamayı bozmaz.
  }
}

function normalize(text) {
  return (text || '').toLocaleLowerCase('tr-TR');
}

function matchesQuery(poi, query) {
  const q = normalize(query);
  return (
    normalize(poi.name).includes(q) ||
    normalize(poi.categoryName).includes(q) ||
    normalize(poi.province).includes(q) ||
    normalize(poi.district).includes(q)
  );
}

// Kategoriler admin panelinden serbestçe oluşturulduğu için sabit değil — anahtar kelime
// listesindeki SIRAYA göre gerçek kategorilerle eşleştirip ilk MAX_SUGGESTED_CATEGORIES
// tanesini döndürür. Yeterli eşleşme yoksa geri kalanı POI sayısı en çok olan kategorilerle
// tamamlar (en azından çipler boş kalmasın, kullanışlı bir şeyler göstersin).
function buildSuggestedCategories(categories, pois) {
  if (!categories?.length) return [];
  const used = new Set();
  const suggested = [];
  for (const keyword of POI_SUGGESTED_CATEGORY_KEYWORDS) {
    if (suggested.length >= MAX_SUGGESTED_CATEGORIES) break;
    const match = categories.find((c) => !used.has(c.id) && normalize(c.name).includes(keyword));
    if (match) {
      used.add(match.id);
      suggested.push(match);
    }
  }
  if (suggested.length < MAX_SUGGESTED_CATEGORIES) {
    const counts = new Map();
    pois.forEach((p) => {
      if (p.categoryId != null) counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    });
    const rest = categories
      .filter((c) => !used.has(c.id))
      .sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0));
    for (const c of rest) {
      if (suggested.length >= MAX_SUGGESTED_CATEGORIES) break;
      suggested.push(c);
    }
  }
  return suggested;
}

// POI'nin WKT'sinden lon/lat çıkarımı — arama sıralamasında ekrana yakınlık için gerekiyor.
// Her tuş vuruşunda binlerce WKT'yi yeniden ayrıştırmamak için sonuç POI id'sine göre
// önbelleğe alınıyor (POI'lerin geometrisi oturum içinde değişmiyor).
const POI_LONLAT_CACHE = new Map();
function poiLonLat(poi) {
  if (POI_LONLAT_CACHE.has(poi.id)) return POI_LONLAT_CACHE.get(poi.id);
  let result = null;
  const match = /POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(poi.wkt || '');
  if (match) result = { lon: Number(match[1]), lat: Number(match[2]) };
  POI_LONLAT_CACHE.set(poi.id, result);
  return result;
}

function PoiSearchBar({ pois, onSelect, selectedPoiId, onClear, categories = [], activeCategoryId, onSelectCategory, getMapView }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  const [recentIds, setRecentIds] = useState(() => loadRecentIds());
  const containerRef = useRef(null);

  const selectedPoi = selectedPoiId != null ? pois.find((p) => p.id === selectedPoiId) : null;

  // Dışarıdan (haritada doğrudan bir POI'ye tıklanınca da) selectedPoiId değişebiliyor —
  // sadece arama sonucuna tıklandığında değil. Input her iki durumda da senkron kalsın.
  useEffect(() => {
    if (selectedPoi) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery(selectedPoi.name);
      setOpen(false);
    }
  }, [selectedPoi]);

  const recentPois = useMemo(
    () => recentIds.map((id) => pois.find((p) => p.id === id)).filter(Boolean),
    [recentIds, pois]
  );

  const isRecentResults = !query.trim();
  const hasRecentHistory = recentPois.length > 0;

  const suggestedCategories = useMemo(() => buildSuggestedCategories(categories, pois), [categories, pois]);

  // Kullanıcının kendi isteği (4. tur): "arama çubuğuna bir kez tıklayınca geçmiş aramalar
  // sıralansın, geçmiş arama yoksa önerilenlerden birkaç tane sıralansın." — henüz hiç POI
  // seçilmemişse (localStorage boş, yeni kullanıcı/temiz tarayıcı) boş bir dropdown göstermek
  // yerine önerilen kategorilerden birkaç örnek POI listeleniyor (aynı suggestedCategories
  // listesi, arama çipleriyle TUTARLI). recentPois doluysa bu fallback hiç devreye girmiyor.
  const fallbackSuggestedPois = useMemo(() => {
    if (recentPois.length > 0 || suggestedCategories.length === 0) return [];
    const perCategory = 2;
    const seen = new Set();
    const out = [];
    for (const cat of suggestedCategories) {
      for (const poi of pois) {
        if (out.length >= MAX_RESULTS) break;
        if (poi.categoryId !== cat.id || seen.has(poi.id)) continue;
        seen.add(poi.id);
        out.push(poi);
        if (out.filter((p) => p.categoryId === cat.id).length >= perCategory) break;
      }
      if (out.length >= MAX_RESULTS) break;
    }
    return out;
  }, [recentPois, suggestedCategories, pois]);

  const results = useMemo(() => {
    if (selectedPoi) return []; // pinlenmişken sonuç listesi anlamsız
    const trimmed = query.trim();
    // Kutu boşken (henüz bir şey yazılmamışken) odaklanınca son seçilenleri göster —
    // Google Maps'teki "arama geçmişi" davranışı. Geçmiş yoksa önerilen birkaç yer.
    if (!trimmed) return recentPois.length > 0 ? recentPois.slice(0, MAX_RESULTS) : fallbackSuggestedPois;
    const q = normalize(trimmed);
    // Kullanıcının kendi isteği (3 Eylül): "mevcut zoom hangi kısımları görüyor ise orasının
    // içinde kalan veya yakın civarlarında olan şeyleri öncelikli önersin, mesela search bara
    // burger king yazdım diyelim, zoom yaptığım kısım izmirde, öncelikli olarak izmirdekileri
    // önersin sonra ankara fln görünsün." — sıralama üç kademeli:
    //   1) Ekranda GÖRÜNEN alandakiler (viewport extent'i içinde)
    //   2) Ekranın merkezine olan uzaklık (yakın olan önce)
    //   3) Eşitlikte klasik alaka: isimle başlayanlar, sonra alfabetik
    // Uzaklık için lon/lat farkının karesi yeterli (gerçek metre hesabına gerek yok, sadece
    // SIRALAMA lazım); enlem farkı için basit bir cos düzeltmesi uyguluyoruz.
    const view = getMapView?.() || null;
    const scored = pois
      .filter((poi) => matchesQuery(poi, trimmed))
      .map((poi) => {
        const point = poiLonLat(poi);
        let inView = false;
        let distance = Number.POSITIVE_INFINITY;
        if (view && point) {
          const [minLon, minLat, maxLon, maxLat] = view.extent;
          inView = point.lon >= minLon && point.lon <= maxLon && point.lat >= minLat && point.lat <= maxLat;
          const dLon = (point.lon - view.center.lon) * Math.cos((view.center.lat * Math.PI) / 180);
          const dLat = point.lat - view.center.lat;
          distance = dLon * dLon + dLat * dLat;
        }
        return { poi, inView, distance };
      });
    return scored
      .sort((a, b) => {
        if (a.inView !== b.inView) return a.inView ? -1 : 1;
        if (a.distance !== b.distance) return a.distance - b.distance;
        const an = normalize(a.poi.name);
        const bn = normalize(b.poi.name);
        const aStarts = an.startsWith(q) ? 0 : 1;
        const bStarts = bn.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return an.localeCompare(bn, 'tr');
      })
      .slice(0, MAX_RESULTS)
      .map((entry) => entry.poi);
  }, [pois, query, selectedPoi, recentPois, fallbackSuggestedPois, getMapView]);

  // Kullanıcının kendi isteği (4. tur): "Tümü" yerine "Diğer" popover'ı artık düz alfabetik
  // liste değil, admin panelindeki AYNI girintili üst/alt kategori ağacını (bkz.
  // buildPoiCategoryOptions, admin'deki buildIndentedCategoryOptions ile birebir aynı mantık)
  // gösteriyor — "tüm kategori ve alt kategorileri göstersin" isteği bunu gerektiriyor.
  const categoryTree = useMemo(() => buildPoiCategoryOptions(categories), [categories]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(results.length > 0 ? 0 : -1);
  }, [results]);

  useEffect(() => {
    function handlePointerDown(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false);
        setAllCategoriesOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function pick(poi) {
    onSelect(poi);
    setQuery(poi.name);
    setOpen(false);
    setRecentIds((prev) => {
      const next = [poi.id, ...prev.filter((id) => id !== poi.id)].slice(0, MAX_RECENTS);
      saveRecentIds(next);
      return next;
    });
  }

  function clearAll() {
    setQuery('');
    setOpen(false);
    onClear?.();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      // MapPage'deki global Esc handler zaten selectedPoi/poiCategoryFilter'ı temizliyor —
      // burada sadece dropdown'ı kapatıp input'un odağını bozmuyoruz, event'i yutmuyoruz.
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) pick(results[activeIndex]);
    }
  }

  const showChips = !open && !query.trim() && !selectedPoi && categories.length > 0;

  return (
    <div className="poi-search-bar" ref={containerRef}>
      <div className={`poi-search-input-wrap${selectedPoi ? ' poi-search-input-wrap-pinned' : ''}`}>
        <span className="poi-search-icon">🔍</span>
        <input
          type="text"
          className="poi-search-input"
          placeholder="POI ara (isim, kategori, il/ilçe)…"
          value={query}
          readOnly={!!selectedPoi}
          onChange={(e) => {
            if (selectedPoi) return;
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!selectedPoi) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {(query || selectedPoi) && (
          <button
            type="button"
            className="poi-search-clear"
            title={selectedPoi ? 'Seçimi temizle (Esc)' : 'Temizle'}
            onClick={clearAll}
          >
            ✕
          </button>
        )}
      </div>

      {open && (query.trim() || results.length > 0) && (
        <ul className="poi-search-results">
          {isRecentResults && results.length > 0 && (
            <li className="poi-search-results-label">
              {hasRecentHistory ? 'Son aramalar' : 'Önerilen yerler'}
            </li>
          )}
          {!isRecentResults && results.length === 0 && (
            <li className="poi-search-empty">Eşleşen POI bulunamadı.</li>
          )}
          {results.map((poi, index) => (
            <li key={poi.id}>
              <button
                type="button"
                className={`poi-search-result${index === activeIndex ? ' poi-search-result-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(poi)}
              >
                <span className={`poi-search-result-icon${isRecentResults && hasRecentHistory ? ' poi-search-result-icon-recent' : ''}`} aria-hidden="true">
                  {isRecentResults && hasRecentHistory ? '🕐' : (poi.effectiveIcon || '📍')}
                </span>
                <span className="poi-search-result-text">
                  <span className="poi-search-result-name">{poi.name}</span>
                  <span className="poi-search-result-meta">
                    {[poi.categoryName, poi.district || poi.province].filter(Boolean).join(' · ') || 'Kategorisiz'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showChips && (
        <div className="poi-category-chip-row">
          {/* Kullanıcının kendi isteği (7. tur): "Diğer" butonuna tıklayınca hiçbir şey
              olmuyordu — kök neden, bu satırın `overflow-x: auto` olması: CSS'te bir eksen
              overflow'u 'visible' olmayan bir değere ayarlanınca DİĞER eksen de otomatik
              'auto'ya düşüyor (spec davranışı), yani satır DİKEY taşmayı da (popover menüsü)
              kesiyordu — menü DOM'da vardı ama görünmezdi. Çözüm: yatay kaydırma SADECE
              çip listesini saran iç kutuda, "Diğer" butonu+popover'ı bu kaydırılan alanın
              DIŞINDA, satırın kendisi artık overflow:visible. */}
          <div className="poi-category-chip-scroll">
            {suggestedCategories.map((cat) => {
              const color = categoryColorForId(cat.id);
              const isActive = String(activeCategoryId) === String(cat.id);
              return (
                <button
                  type="button"
                  key={cat.id}
                  className={`poi-category-chip${isActive ? ' poi-category-chip-active' : ''}`}
                  style={{ '--chip-color': color }}
                  onClick={() => onSelectCategory?.(cat.id)}
                  title={cat.name}
                >
                  <span className="poi-category-chip-icon">{cat.icon || '📍'}</span>
                  <span className="poi-category-chip-label">{cat.name}</span>
                </button>
              );
            })}
          </div>
          <div className="poi-category-chip-all-wrap">
            <button
              type="button"
              className={`poi-category-chip poi-category-chip-all${activeCategoryId && !suggestedCategories.some((c) => String(c.id) === String(activeCategoryId)) ? ' poi-category-chip-active' : ''}`}
              onClick={() => setAllCategoriesOpen((v) => !v)}
              title="Diğer kategoriler"
            >
              <span className="poi-category-chip-icon" aria-hidden="true">⋮</span>
              <span className="poi-category-chip-label">Diğer</span>
            </button>
            {allCategoriesOpen && (
              <ul className="poi-category-all-menu">
                {activeCategoryId && (
                  <li>
                    <button
                      type="button"
                      className="poi-category-all-menu-clear"
                      onClick={() => {
                        onSelectCategory?.('');
                        setAllCategoriesOpen(false);
                      }}
                    >
                      ✕ Filtreyi kaldır
                    </button>
                  </li>
                )}
                {categoryTree.map((cat) => (
                  <li key={cat.id}>
                    <button
                      type="button"
                      className={`poi-category-all-menu-item${String(activeCategoryId) === String(cat.id) ? ' is-active' : ''}`}
                      style={{ paddingLeft: 12 + cat.depth * 14 }}
                      onClick={() => {
                        onSelectCategory?.(cat.id);
                        setAllCategoriesOpen(false);
                      }}
                    >
                      <span style={{ color: categoryColorForId(cat.id) }}>{cat.icon || '📍'}</span>
                      {cat.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PoiSearchBar;

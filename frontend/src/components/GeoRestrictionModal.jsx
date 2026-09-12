import { useEffect, useRef, useState } from 'react';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Feature from 'ol/Feature';
import WKT from 'ol/format/WKT';
import GeoJSON from 'ol/format/GeoJSON';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import { fromLonLat } from 'ol/proj';
import { createEmpty, extend as extendExtent, isEmpty as isEmptyExtent } from 'ol/extent';
import 'ol/ol.css';
import { authHeader } from '../auth';
import VertexCoordinateEditor from './VertexCoordinateEditor';

const GEO_BASE = 'http://localhost:5276/api/GeoRestriction';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const PLACE_SIMPLIFY_TOLERANCE_M = 1000; // ülke/il sınırları on binlerce nokta olabiliyor — 1km toleransla sadeleştiriyoruz
const wktFormat = new WKT();
const geoJsonFormat = new GeoJSON();

// Var olan alanlar mavi (salt okunur önizleme), eklenmekte olan yeni alan turuncu —
// birbirine karışmasın diye bilinçli olarak farklı renkler.
const EXISTING_AREA_STYLE = new Style({
  fill: new Fill({ color: 'rgba(37, 99, 235, 0.15)' }),
  stroke: new Stroke({ color: '#2563eb', width: 2 }),
});
const PREVIEW_AREA_STYLE = new Style({
  fill: new Fill({ color: 'rgba(249, 115, 22, 0.22)' }),
  stroke: new Stroke({ color: '#f97316', width: 2, lineDash: [6, 4] }),
});

const KIND_ICON = { Freeform: '✏️', Place: '📍' };

// Hocanın "Coğrafi Yetki Tanımlama Modülü" görevi — v2 (kullanıcının kendi isteğiyle
// genişletildi): bir Role ya da User için artık BİRDEN FAZLA alan tanımlanabilir, her biri
// ya elle çizilmiş bir poligon (Freeform) ya da Nominatim'den isimle aranmış bir ülke/il
// sınırı (Place) olabilir. target: { type: 'role'|'user', id, label }.
//
// Görev #7 (kullanıcının kendi isteği, harita şeridi polish turu): bu BİLEŞEN artık İKİ
// bağlamda kullanılıyor — admin panelinde GLOBAL kısıt (mapId=undefined, eski davranış,
// ManageGeoRestrictions izni gerekir) VE bir harita sahibinin Paylaş modalından açtığı
// HARİTAYA ÖZEL kısıt (mapId dolu, sadece o haritanın sahibi olmak yeterli). Aynı çizim/
// ülke-arama/enlem-boylam arayüzünü ikisi için de TEKRAR YAZMAK yerine parametreleştirdik —
// tasarım dili (renkler, layout) birebir aynı kalsın diye.
function GeoRestrictionModal({ target, mapId, mapName, onClose }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const existingSourceRef = useRef(null);
  const previewSourceRef = useRef(null);
  const drawRef = useRef(null);
  const modifyRef = useRef(null);
  const sketchActiveRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [areas, setAreas] = useState([]); // GeoRestrictionDto[]
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Harita-özel modda GET/POST'un gittiği taban URL farklı (bkz. dosya üstü açıklama) —
  // DELETE ve pause uçları zaten id/mapId'yi kendi route'unda taşıyor, ayrı hesaplamaya gerek yok.
  const scopedBase = mapId != null ? `${GEO_BASE}/map/${mapId}/${target.type}/${target.id}` : `${GEO_BASE}/${target.type}/${target.id}`;
  // Kullanıcının kendi isteği: "istediğimiz zaman duraklatabilelim istediğimize" — TÜM alanlar
  // tek grup olarak duraklatılıyor (tek tek poligon değil), bu yüzden "hepsi duraklatılmış mı"
  // tek bir bayrağa indirgiyoruz.
  const allPaused = mapId != null && areas.length > 0 && areas.every((a) => a.isPaused);

  const [addOpen, setAddOpen] = useState(false); // "+ Yeni Alan Ekle" bölümü — varsayılan kapalı, popup ekrana sığsın
  const [addMode, setAddMode] = useState('draw'); // 'draw' | 'search'
  const [previewFeature, setPreviewFeature] = useState(null);
  const [newAreaName, setNewAreaName] = useState('');
  const [coordEditorOpen, setCoordEditorOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedResultId, setSelectedResultId] = useState(null);

  // Harita kurulumu — bir kere. "Türkiye sınırlarına zoomlanmış bir harita açılsın" isteği:
  // fit() yerine kabaca Türkiye'yi ortalayan sabit bir merkez/zoom (modal az önce DOM'a
  // eklendiği için fit()'in ihtiyaç duyduğu gerçek boyut henüz netleşmemiş olabilir).
  useEffect(() => {
    const existingSource = new VectorSource();
    existingSourceRef.current = existingSource;
    const existingLayer = new VectorLayer({ source: existingSource, style: EXISTING_AREA_STYLE });

    const previewSource = new VectorSource();
    previewSourceRef.current = previewSource;
    const previewLayer = new VectorLayer({ source: previewSource, style: PREVIEW_AREA_STYLE });

    const map = new OlMap({
      target: mapDivRef.current,
      layers: [new TileLayer({ source: new OSM() }), existingLayer, previewLayer],
      view: new View({ center: fromLonLat([35.5, 39.0]), zoom: 5.2 }),
    });

    const draw = new Draw({ source: previewSource, type: 'Polygon' });
    draw.on('drawstart', () => {
      sketchActiveRef.current = true;
      previewSource.clear(); // aynı anda sadece TEK bir "eklenmekte olan" alan olur
    });
    draw.on('drawend', (event) => {
      sketchActiveRef.current = false;
      setPreviewFeature(event.feature);
    });
    draw.on('drawabort', () => {
      sketchActiveRef.current = false;
    });
    draw.setActive(false); // sadece addOpen + addMode==='draw' iken aktifleşiyor (bkz. aşağıdaki effect)
    drawRef.current = draw;
    map.addInteraction(draw);

    const modify = new Modify({ source: previewSource });
    modify.setActive(false);
    modifyRef.current = modify;
    map.addInteraction(modify);

    mapRef.current = map;
    setTimeout(() => map.updateSize(), 0); // modal açılış layout gecikmesine karşı güvenlik ağı

    return () => {
      map.setTarget(undefined);
    };
  }, []);

  // Hangi interaction aktif: sadece "yeni alan ekle" açıkken VE 'draw' modundayken Draw/Modify
  // canlı olsun — liste görünümündeyken ya da 'search' modundayken haritaya tıklayınca
  // yanlışlıkla yeni bir poligon başlamasın.
  useEffect(() => {
    const shouldDraw = addOpen && addMode === 'draw';
    drawRef.current?.setActive(shouldDraw && !previewFeature);
    modifyRef.current?.setActive(shouldDraw && !!previewFeature);
  }, [addOpen, addMode, previewFeature]);

  // Esc: MapPage'deki AYNI davranış — yarım kalmış bir çizim taslağı varsa SADECE onu iptal
  // et; taslak yoksa modalı kapat.
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return;
      if (drawRef.current && sketchActiveRef.current) {
        drawRef.current.abortDrawing();
        sketchActiveRef.current = false;
        return;
      }
      onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Var olan alanları yükle — hepsini haritada mavi önizleme olarak göster, hepsinin
  // birleşik kapsama alanına yakınlaş.
  async function fetchAreas() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(scopedBase, { headers: authHeader() });
      if (!response.ok) {
        setError('Alanlar yüklenemedi.');
        setLoading(false);
        return;
      }
      const data = await response.json();
      setAreas(data);
      setLoading(false);

      const existingSource = existingSourceRef.current;
      if (existingSource) {
        existingSource.clear();
        const extent = createEmpty();
        data.forEach((a) => {
          const feature = wktFormat.readFeature(a.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
          existingSource.addFeature(feature);
          extendExtent(extent, feature.getGeometry().getExtent());
        });
        mapRef.current?.updateSize();
        if (!isEmptyExtent(extent)) {
          mapRef.current?.getView().fit(extent, { padding: [40, 40, 40, 40], maxZoom: 10 });
        }
      }
    } catch (err) {
      console.error('Coğrafi alanlar yüklenemedi:', err);
      setError('Sunucuya bağlanılamadı.');
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchAreas();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.type, target.id, mapId]);

  // Kullanıcının kendi isteği: "istediğimiz zaman duraklatabilelim istediğimize" — bu
  // kişi/rol için BU HARİTADAKİ tüm kısıt satırlarını tek seferde duraklatır/devam ettirir.
  // Sadece harita-özel modda anlamlı (global/admin kısıtlarında bu buton hiç gösterilmiyor).
  async function handleTogglePaused() {
    if (mapId == null || areas.length === 0 || pausing) return;
    setPausing(true);
    setError('');
    setStatusMsg('');
    try {
      const response = await fetch(`${scopedBase}/pause`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaused: !allPaused }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.message || 'Kısıtlama durumu değiştirilemedi.');
        return;
      }
      setStatusMsg(allPaused ? 'Kısıtlama devam ettirildi.' : 'Kısıtlama duraklatıldı.');
      await fetchAreas();
    } catch (err) {
      console.error('Kısıtlama durumu değiştirilemedi:', err);
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setPausing(false);
    }
  }

  function resetAddForm() {
    previewSourceRef.current?.clear();
    setPreviewFeature(null);
    setNewAreaName('');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedResultId(null);
    setCoordEditorOpen(false);
  }

  function handleToggleAdd() {
    setAddOpen((v) => {
      if (v) resetAddForm(); // kapatınca yarım kalan taslağı da temizle
      return !v;
    });
  }

  async function handleSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setError('');
    try {
      const url = `${NOMINATIM_SEARCH_URL}?format=json&polygon_geojson=1&limit=5&q=${encodeURIComponent(q)}`;
      const response = await fetch(url, { headers: { 'Accept-Language': 'tr' } });
      if (!response.ok) {
        setError('Arama başarısız.');
        setSearchResults([]);
        return;
      }
      const data = await response.json();
      const withBoundary = data.filter((d) => d.geojson && (d.geojson.type === 'Polygon' || d.geojson.type === 'MultiPolygon'));
      setSearchResults(withBoundary);
      if (withBoundary.length === 0) {
        setError('Bu isim için çizilebilir bir sınır bulunamadı. Daha genel bir isim dene (ör. tam ülke/şehir adı).');
      }
    } catch (err) {
      console.error('Yer araması başarısız:', err);
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setSearching(false);
    }
  }

  function handlePickSearchResult(result) {
    try {
      setSelectedResultId(result.place_id);
      const geometry = geoJsonFormat.readGeometry(result.geojson, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });
      // Ülke sınırları on binlerce nokta olabiliyor — kaydetmeden/kontrol etmeden önce
      // sadeleştiriyoruz, yoksa her çizim kontrolünde (NTS Contains) yavaşlığa yol açar.
      const simplified = geometry.simplify(PLACE_SIMPLIFY_TOLERANCE_M);
      previewSourceRef.current?.clear();
      const feature = new Feature(simplified);
      previewSourceRef.current?.addFeature(feature);
      setPreviewFeature(feature);
      if (!newAreaName.trim()) {
        setNewAreaName(result.display_name.split(',').slice(0, 2).join(',').trim());
      }
      mapRef.current?.updateSize();
      mapRef.current?.getView().fit(simplified.getExtent(), { padding: [40, 40, 40, 40], maxZoom: 12 });
    } catch (err) {
      console.error('Sınır işlenemedi:', err);
      setError('Bu sonucun sınırı işlenemedi.');
    }
  }

  async function handleAddArea() {
    if (saving) return; // hızlı çift tıklamaya karşı — buton zaten disabled ama savunma amaçlı ikinci bir bariyer
    if (!previewFeature) {
      setError('Önce bir alan çiz ya da arama sonucundan seç.');
      return;
    }
    const wkt = wktFormat.writeFeature(previewFeature, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
    setSaving(true);
    setError('');
    setStatusMsg('');
    try {
      const response = await fetch(scopedBase, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ wkt, name: newAreaName.trim() || null, kind: addMode === 'search' ? 'Place' : 'Freeform' }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.message || 'Alan eklenemedi.');
        return;
      }
      setStatusMsg('Alan eklendi.');
      resetAddForm();
      await fetchAreas();
    } catch (err) {
      console.error('Alan eklenemedi:', err);
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveArea(area) {
    if (saving || pausing) return; // hızlı çift tıklamaya karşı — buton zaten disabled ama savunma amaçlı ikinci bir bariyer
    setSaving(true);
    setError('');
    setStatusMsg('');
    try {
      const response = await fetch(`${GEO_BASE}/${area.id}`, { method: 'DELETE', headers: authHeader() });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => null);
        setError(data?.message || 'Alan kaldırılamadı.');
        return;
      }
      setStatusMsg('Alan kaldırıldı.');
      await fetchAreas();
    } catch (err) {
      console.error('Alan kaldırılamadı:', err);
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setSaving(false);
    }
  }

  function focusArea(area) {
    const geometry = wktFormat.readGeometry(area.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
    mapRef.current?.getView().fit(geometry.getExtent(), { padding: [40, 40, 40, 40], maxZoom: 12, duration: 300 });
  }

  return (
    <div className="attribute-popup-overlay" onClick={onClose}>
      <div className="geo-restriction-popup" onClick={(e) => e.stopPropagation()}>
        <div className="attribute-popup-title">
          {mapId != null ? '🚧 Çizim Kısıtlaması' : '🗺️ Coğrafi Yetki Alanları'} — {target.label}
          {mapId != null && mapName && <span className="geo-restriction-map-name"> · {mapName}</span>}
        </div>

        <div className="geo-restriction-scroll">
          <p className="admin-hint">
            {target.label} {mapId != null ? 'bu haritada' : 'hiçbir haritada'} sadece aşağıdaki alanların İÇİNDE çizim
            yapabilir (birden fazla alan eklenebilir — herhangi birinin içinde olmak yeterli). Hiç alan yoksa
            kısıtlama yoktur.
          </p>

          {/* Görev #7: "istediğimiz zaman duraklatabilelim istediğimize" — sadece harita-özel
              modda ve en az bir alan varken anlamlı. */}
          {mapId != null && areas.length > 0 && (
            <button
              type="button"
              className={`geo-restriction-pause-toggle${allPaused ? ' geo-restriction-pause-toggle-active' : ''}`}
              onClick={handleTogglePaused}
              disabled={pausing || saving}
            >
              {pausing ? '…' : allPaused ? `▶ Devam Ettir (${target.label})` : `⏸ Duraklat (${target.label})`}
            </button>
          )}

          <div className="geo-area-list">
            {loading && <p className="admin-hint">Yükleniyor…</p>}
            {!loading && areas.length === 0 && <p className="admin-hint">Henüz hiç alan tanımlanmamış — sınırsız.</p>}
            {areas.map((a) => (
              <div key={a.id} className={`geo-area-row${a.isPaused ? ' geo-area-row-paused' : ''}`} onClick={() => focusArea(a)}>
                <span className="geo-area-icon">{KIND_ICON[a.kind] || '✏️'}</span>
                <span className="geo-area-name">
                  {a.name || `İsimsiz alan #${a.id}`}
                  {a.isPaused && <span className="geo-area-paused-badge">Duraklatıldı</span>}
                </span>
                <button
                  type="button"
                  className="geo-area-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveArea(a);
                  }}
                  disabled={saving || pausing}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div ref={mapDivRef} className="geo-restriction-map" />

          <div className="geo-coord-toggle-wrap">
            <button type="button" className="geo-coord-toggle" onClick={handleToggleAdd}>
              <span>{addOpen ? '▾' : '▸'} + Yeni Alan Ekle</span>
            </button>
            {addOpen && (
              <div className="geo-coord-toggle-body geo-coord-toggle-body--form">
                <div className="geo-add-mode-tabs">
                  <button
                    type="button"
                    className={`geo-add-mode-tab${addMode === 'draw' ? ' geo-add-mode-tab-active' : ''}`}
                    onClick={() => {
                      resetAddForm();
                      setAddMode('draw');
                    }}
                  >
                    ✏️ Serbest Çiz
                  </button>
                  <button
                    type="button"
                    className={`geo-add-mode-tab${addMode === 'search' ? ' geo-add-mode-tab-active' : ''}`}
                    onClick={() => {
                      resetAddForm();
                      setAddMode('search');
                    }}
                  >
                    🔍 Ülke/İl Ara
                  </button>
                </div>

                {addMode === 'draw' && (
                  <>
                    <p className="admin-hint">Haritada bir poligon çiz. Köşeleri sürükleyebilir ya da elle enlem/boylam girebilirsin.</p>
                    {previewFeature && (
                      <div className="geo-coord-toggle-wrap">
                        <button type="button" className="geo-coord-toggle" onClick={() => setCoordEditorOpen((v) => !v)}>
                          <span>{coordEditorOpen ? '▾' : '▸'} Enlem/boylam olarak elle gir</span>
                        </button>
                        {coordEditorOpen && (
                          <div className="geo-coord-toggle-body">
                            <VertexCoordinateEditor feature={previewFeature} mode="Polygon" />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {addMode === 'search' && (
                  <>
                    <div className="geo-search-row">
                      <input
                        type="text"
                        className="attribute-popup-input"
                        placeholder="Ülke, il ya da şehir adı (ör. Türkiye, Almanya, Brüksel)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      />
                      <button type="button" className="attribute-popup-confirm" disabled={searching} onClick={handleSearch}>
                        {searching ? 'Aranıyor…' : 'Ara'}
                      </button>
                    </div>
                    {searchResults.length > 0 && (
                      <div className="geo-search-results">
                        {searchResults.map((r) => (
                          <button
                            type="button"
                            key={r.place_id}
                            className={`geo-search-result${r.place_id === selectedResultId ? ' geo-search-result-active' : ''}`}
                            onClick={() => handlePickSearchResult(r)}
                          >
                            {r.display_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {previewFeature && (
                  <>
                    <label className="attribute-popup-label" htmlFor="geo-area-name">
                      Alan adı (opsiyonel)
                    </label>
                    <input
                      id="geo-area-name"
                      type="text"
                      className="attribute-popup-input"
                      value={newAreaName}
                      onChange={(e) => setNewAreaName(e.target.value)}
                      placeholder="ör. Bölge 1"
                    />
                  </>
                )}

                <button type="button" className="attribute-popup-confirm" disabled={!previewFeature || saving} onClick={handleAddArea}>
                  {saving ? 'Ekleniyor…' : '+ Bu Alanı Ekle'}
                </button>
              </div>
            )}
          </div>

          {error && <p className="admin-error">{error}</p>}
          {statusMsg && !error && <p className="admin-hint">{statusMsg}</p>}
        </div>

        <div className="attribute-popup-actions">
          <button type="button" className="attribute-popup-cancel" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

export default GeoRestrictionModal;

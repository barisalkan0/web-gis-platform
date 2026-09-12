import { useCallback, useEffect, useRef, useState } from 'react';
import { fromLonLat, toLonLat } from 'ol/proj';

// Şekil düzenleme modunda (bkz. MapPage: startEditingGeometry) her köşe için elle
// enlem/boylam girilebilen satırlar. Harita <-> liste çift yönlü senkron:
//  - Haritada köşe sürüklenince (Modify interaction) feature'ın geometrisi değişir,
//    OpenLayers feature'ın 'change' olayını tetikler, biz de listeyi yeniden okuruz.
//  - Listede bir enlem/boylam kutusundan çıkılınca (blur) veya Enter'a basılınca
//    girilen değerler feature.getGeometry().setCoordinates(...) ile haritaya yazılır.
// Köşe eklenip/silinmesi de Modify'ın kendi varsayılan davranışıyla olur (bir kenarın
// ortasından sürükleyerek yeni köşe eklenir, Alt+tıklayarak köşe silinir) — liste her
// 'change' olayında yeniden okunduğu için satır sayısı otomatik güncellenir.

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function toVertexList(mode, geometry) {
  if (!geometry) return [];

  if (mode === 'Point') {
    const [lon, lat] = toLonLat(geometry.getCoordinates());
    return [{ lat: String(round6(lat)), lon: String(round6(lon)) }];
  }

  if (mode === 'LineString') {
    return geometry.getCoordinates().map((c) => {
      const [lon, lat] = toLonLat(c);
      return { lat: String(round6(lat)), lon: String(round6(lon)) };
    });
  }

  // Polygon: dış halka kapalı (ilk nokta = son nokta) — kullanıcıya sadece gerçek
  // köşeleri gösteriyoruz, kapanış noktasını ayrıca satır olarak eklemiyoruz.
  const ring = geometry.getCoordinates()[0] || [];
  return ring.slice(0, -1).map((c) => {
    const [lon, lat] = toLonLat(c);
    return { lat: String(round6(lat)), lon: String(round6(lon)) };
  });
}

function buildCoordinates(mode, vertices) {
  const projected = vertices.map((v) => fromLonLat([v.lon, v.lat]));
  if (mode === 'Point') return projected[0];
  if (mode === 'LineString') return projected;
  return [[...projected, projected[0]]]; // halkayı kapat
}

const MIN_VERTEX_COUNT = { Point: 1, LineString: 2, Polygon: 3 };

// Not: MapPage bu bileşeni her farklı feature için `key={item.key}` ile mount ediyor,
// bu yüzden feature/mode hiçbir zaman mount sırasında DEĞİŞMEZ — yukarıdaki useState
// başlangıç değeri ilk render'da her zaman doğru feature'ı yansıtır. Effect sadece
// haritadaki sürükleme gibi DIŞ değişiklikleri dinleyen bir abonelik, senkron setState
// çağrısı yok (react-hooks/set-state-in-effect kuralına uygun).
function VertexCoordinateEditor({ feature, mode, selectedIndex = null, onSelectIndex }) {
  const [vertices, setVertices] = useState(() => toVertexList(mode, feature?.getGeometry()));
  const rowRefs = useRef([]);

  const refresh = useCallback(() => {
    setVertices(toVertexList(mode, feature?.getGeometry()));
  }, [feature, mode]);

  useEffect(() => {
    if (!feature) return undefined;
    feature.on('change', refresh);
    return () => feature.un('change', refresh);
  }, [feature, refresh]);

  // Haritada bir köşeye tıklanınca (bkz. MapPage: selectedVertexIndex) listede karşılığı
  // görünür alana kaydırılsın — liste uzunsa kullanıcı elle aşağı inmek zorunda kalmasın.
  useEffect(() => {
    if (selectedIndex == null) return;
    rowRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  function handleFieldChange(index, key, value) {
    setVertices((current) => current.map((v, i) => (i === index ? { ...v, [key]: value } : v)));
  }

  function commit() {
    if (!feature) return;
    const parsed = vertices.map((v) => ({ lat: parseFloat(v.lat), lon: parseFloat(v.lon) }));
    // Eksik/geçersiz bir kutu varsa haritaya yazmayı erteliyoruz — kullanıcı yazmayı bitirsin.
    if (parsed.some((v) => !Number.isFinite(v.lat) || !Number.isFinite(v.lon))) return;
    if (parsed.length < (MIN_VERTEX_COUNT[mode] || 1)) return;
    feature.getGeometry().setCoordinates(buildCoordinates(mode, parsed));
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  }

  if (vertices.length === 0) return null;

  return (
    <div className="vertex-coord-editor">
      <div className="vertex-coord-editor-title">
        {mode === 'Point' ? 'Konum (elle girilebilir)' : `Köşe noktaları — ${vertices.length} adet`}
      </div>
      <div className="vertex-coord-editor-list">
        {vertices.map((v, i) => (
          <div
            className={`vertex-coord-row${i === selectedIndex ? ' vertex-coord-row-selected' : ''}`}
            key={i}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            onClick={() => onSelectIndex?.(i)}
          >
            {mode !== 'Point' && <span className="vertex-coord-index">{i + 1}</span>}
            <label className="vertex-coord-field">
              <span>Enlem</span>
              <input
                type="number"
                step="any"
                value={v.lat}
                onChange={(e) => handleFieldChange(i, 'lat', e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
              />
            </label>
            <label className="vertex-coord-field">
              <span>Boylam</span>
              <input
                type="number"
                step="any"
                value={v.lon}
                onChange={(e) => handleFieldChange(i, 'lon', e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

export default VertexCoordinateEditor;

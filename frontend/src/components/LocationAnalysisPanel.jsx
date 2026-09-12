import { useMemo } from 'react';
import SearchableCategorySelect from './SearchableCategorySelect';
import { buildPoiCategoryOptions } from '../poiCategoryUtils';

const MIN_CRITERIA = 2;
const MAX_CRITERIA = 5;

// Hoca ödevi (25 Ağustos — "Analiz Paneli ve Alan Seçimi"): "Kullanıcı (User) rolünün de
// erişebileceği 'Konum Analizi' buton ve panelini geliştirin... Hedef bölge seçimi için
// kullanıcıya imkan tanıyın (İller listesinden seçim yapma veya haritada Poligon çizme
// yöntemi ile sınır belirlenebilir)... en az 2, en fazla 5 adet kategori bazlı kriter...
// Her kritere 100 üzerinden bir ağırlık puanı verilmeli ve tüm kriterlerin puanları toplamı
// tam olarak 100 olmalıdır... Analiz yalnızca seçilen alan içerisindeki POI'ler üzerinde
// çalışmalıdır... renklendirilmiş dinamik bir Isı Haritası üretilip haritada gösterilmelidir."
//
// Bu bileşen SADECE form/kontrol yüzeyi — asıl filtreleme (alan+kategori) ve ol/layer/Heatmap
// katmanı MapPage.jsx'te kuruluyor (POI listesi ve harita referansları zaten orada).
// PoiScheduleEditor'la AYNI desen: kendi state'i yok, tamamen "controlled" — her şey prop
// olarak akıyor, MapPage tek doğruluk kaynağı.
//
// İl bazlı alan seçimi kararı: gerçek il sınır poligonları (GeoJSON) projeye YOK — POI'lerin
// kendi `province` (serbest metin) alanına göre eşleştiriyoruz. Hoca'nın "sadece seçilen alan
// içindeki POI'ler üzerinde çalışmalı" şartını tam karşılıyor (bir POI'nin "hangi ilde"
// olduğunu zaten POI'nin kendisi taşıyor); tek eksik, haritada o ilin gerçek sınır çizgisini
// GÖRSEL olarak çizmemiz — bunun için gereken veri seti (81 il, ayrıntılı poligon) bu ortamda
// güvenilir şekilde indirilemedi (bkz. proje notları), o yüzden bilinçli olarak vazgeçildi.
function LocationAnalysisPanel({
  areaMode,
  onAreaModeChange,
  provinces,
  province,
  onProvinceChange,
  hasPolygon,
  drawingPolygon,
  onDrawPolygon,
  onClearPolygon,
  categories,
  criteria,
  onCriteriaChange,
  onStart,
  onClear,
  onClose,
  resultActive,
  matchedCount,
  matchedBreakdown,
  topSpots,
  selectedSpotIndex,
  onSpotSelect,
}) {
  const categoryOptions = useMemo(() => buildPoiCategoryOptions(categories), [categories]);
  const usedCategoryIds = new Set(criteria.map((c) => c.categoryId).filter((id) => id !== ''));
  const totalWeight = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const hasArea = areaMode === 'province' ? !!province : hasPolygon;
  const hasAllCategories = criteria.every((c) => c.categoryId !== '');
  const canStart = hasArea
    && criteria.length >= MIN_CRITERIA
    && criteria.length <= MAX_CRITERIA
    && hasAllCategories
    && totalWeight === 100;

  const blockingReasons = [];
  if (!hasArea) blockingReasons.push(areaMode === 'province' ? 'Bir il seçin.' : 'Haritada bir poligon çizin.');
  if (criteria.length < MIN_CRITERIA) blockingReasons.push(`En az ${MIN_CRITERIA} kriter ekleyin.`);
  if (!hasAllCategories) blockingReasons.push('Her kriter için bir kategori seçilmeli.');
  if (hasAllCategories && totalWeight !== 100) blockingReasons.push(`Ağırlıklar toplamı tam olarak 100 olmalı (şu an ${totalWeight}).`);

  function updateCriterion(index, patch) {
    onCriteriaChange(criteria.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addCriterion() {
    if (criteria.length >= MAX_CRITERIA) return;
    onCriteriaChange([...criteria, { categoryId: '', weight: 0 }]);
  }

  function removeCriterion(index) {
    onCriteriaChange(criteria.filter((_, i) => i !== index));
  }

  return (
    <div className="location-analysis-panel">
      <div className="location-analysis-panel-header">
        <span className="location-analysis-panel-title">📊 Konum Analizi</span>
        <button
          type="button"
          className="location-analysis-panel-close"
          onClick={onClose}
          title="Kapat"
          aria-label="Konum analizi panelini kapat"
        >
          ✕
        </button>
      </div>

      <div className="location-analysis-section">
        <div className="location-analysis-section-title">1. Hedef Bölge</div>
        <div className="location-analysis-area-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={areaMode === 'province'}
            className={`location-analysis-area-tab${areaMode === 'province' ? ' is-active' : ''}`}
            onClick={() => onAreaModeChange('province')}
          >
            İlden Seç
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={areaMode === 'polygon'}
            className={`location-analysis-area-tab${areaMode === 'polygon' ? ' is-active' : ''}`}
            onClick={() => onAreaModeChange('polygon')}
          >
            Haritada Çiz
          </button>
        </div>
        {areaMode === 'province' ? (
          <select
            className="location-analysis-select"
            value={province}
            onChange={(event) => onProvinceChange(event.target.value)}
          >
            <option value="">İl seçin…</option>
            {provinces.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        ) : (
          <div className="location-analysis-polygon-row">
            <button
              type="button"
              className={`location-analysis-draw-btn${drawingPolygon ? ' is-active' : ''}`}
              onClick={onDrawPolygon}
            >
              {drawingPolygon ? 'Haritada poligonu çizin…' : hasPolygon ? '✏️ Yeniden Çiz' : '✏️ Poligon Çiz'}
            </button>
            {hasPolygon && !drawingPolygon && (
              <button type="button" className="location-analysis-secondary-btn" onClick={onClearPolygon}>
                Poligonu Temizle
              </button>
            )}
          </div>
        )}
      </div>

      <div className="location-analysis-section">
        <div className="location-analysis-section-title">
          2. Kriterler ve Ağırlıklar
          <span className={`location-analysis-weight-total${totalWeight === 100 ? ' is-ok' : ' is-error'}`}>
            Toplam: {totalWeight}/100
          </span>
        </div>
        {criteria.map((row, index) => (
          <div className="location-analysis-criterion-row" key={index}>
            {/* Kullanıcının kendi isteği: "kriter olarak bişeyi seçince başka kriter seçme
                ekranında yok olmasın sadece deaktif olsun silik görünsün" — başka bir satırda
                zaten kullanılan kategoriler listeden ÇIKARILMIYOR artık, sadece disabled
                işaretleniyor (bkz. SearchableCategorySelect'teki .is-disabled stili). Kendi
                satırının seçimi (row.categoryId) hiçbir zaman disabled değil, yoksa kullanıcı
                kendi seçtiğini bile tekrar göremez/değiştiremez hale gelir. */}
            <SearchableCategorySelect
              options={categoryOptions.map((opt) => ({
                ...opt,
                disabled: usedCategoryIds.has(opt.id) && opt.id !== row.categoryId,
              }))}
              value={row.categoryId}
              onChange={(id) => updateCriterion(index, { categoryId: id ? Number(id) : '' })}
              ariaLabel={`${index + 1}. kriter kategorisi`}
              emptyLabel="Kategori seç…"
              floating
            />
            <input
              type="number"
              min={0}
              max={100}
              className="location-analysis-weight-input"
              value={row.weight}
              onChange={(event) => updateCriterion(index, { weight: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })}
              aria-label={`${index + 1}. kriter ağırlığı`}
            />
            <span className="location-analysis-weight-percent" aria-hidden="true">%</span>
            <button
              type="button"
              className="location-analysis-remove-btn"
              onClick={() => removeCriterion(index)}
              title="Kriteri kaldır"
              aria-label="Kriteri kaldır"
              disabled={criteria.length <= MIN_CRITERIA}
            >
              ✕
            </button>
          </div>
        ))}
        {criteria.length < MAX_CRITERIA && (
          <button type="button" className="location-analysis-add-btn" onClick={addCriterion}>
            + Kriter Ekle ({criteria.length}/{MAX_CRITERIA})
          </button>
        )}
      </div>

      {!canStart && blockingReasons.length > 0 && (
        <ul className="location-analysis-hints">
          {blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}

      <div className="location-analysis-actions">
        <button type="button" className="location-analysis-start-btn" onClick={onStart} disabled={!canStart}>
          🔥 Analizi Başlat
        </button>
        {resultActive && (
          <button type="button" className="location-analysis-secondary-btn" onClick={onClear}>
            Analizi Temizle
          </button>
        )}
      </div>

      {resultActive && matchedCount != null && (
        <div className={`location-analysis-result${matchedCount === 0 ? ' is-empty' : ''}`}>
          <div>
            {matchedCount > 0
              ? <>Seçili alanda <strong>{matchedCount}</strong> POI ısı haritasına dahil edildi — harita otomatik o bölgeye yakınlaştı.</>
              : 'Seçilen kriterlerde/alanda eşleşen POI bulunamadı.'}
          </div>
          {matchedBreakdown?.length > 0 && (
            <ul className="location-analysis-result-breakdown">
              {matchedBreakdown.map((row) => (
                <li key={row.categoryId}>{row.categoryName}: <strong>{row.count}</strong></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Kullanıcının kendi isteği: "asıl amaç güzel konumda ev bulmak... güzel noktalarda
          evler bulabilelim." Isı haritası sadece yoğunluk gösteriyordu, somut bir öneri
          vermiyordu — bu liste kriterlere göre en avantajlı 5 NOKTAYı sıralıyor, tıklayınca
          haritada o noktaya odaklanıp (bkz. focusHouseSpot) mesafe dökümünü gösteriyor. */}
      {resultActive && topSpots?.length > 0 && (
        <div className="location-analysis-section location-analysis-spots">
          <div className="location-analysis-section-title">🏡 En İyi Ev Konumları</div>
          <p className="location-analysis-spots-hint">
            Bir öneriye tıklayın: harita o noktaya odaklanır, 250 m yürüme mesafesi daire olarak
            çizilir ve puana katkı veren yerler haritada öne çıkar.
          </p>
          <ul className="location-analysis-spots-list">
            {topSpots.map((spot, index) => (
              <li key={index}>
                <button
                  type="button"
                  className={`location-analysis-spot-item${selectedSpotIndex === index ? ' is-selected' : ''}`}
                  onClick={() => onSpotSelect(index)}
                >
                  <span className="location-analysis-spot-rank">{index + 1}</span>
                  <span className="location-analysis-spot-info">
                    <span className="location-analysis-spot-score">
                      <strong>{Math.round(spot.score)}</strong>
                      <small>/100</small>
                      {/* Puanı sayı olarak okumak zor — aynı bilgiyi bir çubukla da veriyoruz. */}
                      <span className="location-analysis-spot-bar" aria-hidden="true">
                        <span className="location-analysis-spot-bar-fill" style={{ width: `${Math.max(4, Math.min(100, Math.round(spot.score)))}%` }} />
                      </span>
                    </span>
                    {/* Kullanıcının kendi isteği: "çeşit sayısının yakınlığı daha önemli olsun"
                        — tek bir en yakın isim yerine, her kriter için KAÇ seçenek yakında var
                        onu gösteriyoruz (detaylı döküm zaten aşağıda açılıyor). */}
                    <span className="location-analysis-spot-nearest">
                      {spot.breakdown.map((b) => `${b.categoryName} (${b.nearbyCount})`).join(' · ')}
                    </span>
                  </span>
                </button>
                {selectedSpotIndex === index && (
                  <ul className="location-analysis-spot-breakdown">
                    {spot.breakdown.map((b) => (
                      <li key={b.categoryId}>
                        {b.categoryName}: <strong>{b.nearbyCount} seçenek</strong> yakında
                        {b.nearbyNames?.length > 0 && <> ({b.nearbyNames.join(', ')})</>}
                        {' — en yakın '}{Math.round(b.distanceMeters)}m
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default LocationAnalysisPanel;

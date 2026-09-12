import { useEffect, useState } from 'react';
import { authHeader, getPermissions } from '../auth';
import ColorSwatchInput from './ColorSwatchInput';

const CUSTOM_COLOR_KEY = 'customColorHistory';
const MAX_CUSTOM_COLORS = 8;

function loadCustomColors() {
  try {
    const raw = localStorage.getItem(CUSTOM_COLOR_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Yeni özel bir renk seçildiğinde geçmişe ekler — en fazla 8 tane tutuluyor, dolunca
// en eski (ilk eklenen) silinip yenisi sona ekleniyor (FIFO).
function rememberCustomColor(hex) {
  const current = loadCustomColors().filter((c) => c !== hex);
  const next = [...current, hex].slice(-MAX_CUSTOM_COLORS);
  localStorage.setItem(CUSTOM_COLOR_KEY, JSON.stringify(next));
  return next;
}

// Çizim tamamlanınca (drawend) açılan öznitelik pop-up'ı. Hoca isteği: kullanıcıdan en az
// İsim ve Renk bilgisi alınmalı, bu veriler geometriyle birlikte kaydedilmeli. Poligon
// modunda ayrıca — kaydetmeden ÖNCE — çizilen alanın mevcut envanterle kesişim sayısını
// gösteriyoruz. Ayrıca opsiyonel bir kategori seçilebiliyor (yeni kategori de buradan
// oluşturulabiliyor) — "bu nokta ne? doğalgaz mı, su hattı mı" diye etiketlemek için.
function AttributePopup({
  mode,
  typeLabel,
  wkt,
  analysisApiBase,
  categoryApiBase,
  colorPresets,
  categories,
  onCategoriesChanged,
  onConfirm,
  onCancel,
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(colorPresets[0]);
  const [customColors, setCustomColors] = useState(loadCustomColors);
  const [categoryId, setCategoryId] = useState('');
  // Faz 3 (kullanıcının kendi isteği): paylaşılan bir haritada "sadece bana görünsün" —
  // sahibi olmayan haritalarda da anlamlı olabilir (owner kendi çizimini gizleyebilir),
  // bu yüzden her zaman gösteriyoruz, sadece varsayılan kapalı.
  const [isPrivate, setIsPrivate] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [intersection, setIntersection] = useState(null);
  // mode her instance için sabit (pop-up her açılışta yeniden monte oluyor), bu yüzden
  // başlangıç değerini doğrudan buradan kurmak effect içinde senkron setState çağırmaktan
  // daha temiz — "checking" zaten Polygon modunda ilk andan itibaren true olmalı.
  const [checking, setChecking] = useState(mode === 'Polygon');
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    if (mode !== 'Polygon') return;
    let ignore = false;

    fetch(`${analysisApiBase}/intersect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wkt }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!ignore) setIntersection(data);
      })
      .catch(() => {
        if (!ignore) setCheckFailed(true);
      })
      .finally(() => {
        if (!ignore) setChecking(false);
      });

    return () => {
      ignore = true;
    };
  }, [mode, wkt, analysisApiBase]);

  // Canlı önizleme — renk penceresinde sürüklenirken sürekli tetiklenir, sadece rengi
  // günceller, geçmişe kaydetmez.
  function handlePreviewColorChange(hex) {
    setColor(hex);
  }

  // Seçim kesinleşince (native 'change' — bkz. ColorSwatchInput) BİR KERE tetiklenir,
  // "son kullanılan renkler" geçmişine asıl burada eklenir. Önceden bu iş onChange'e
  // bağlıydı; sürükleme sırasında her piksel için ayrı kayıt eklendiğinden geçmiş
  // birbirine neredeyse aynı renklerle doluyordu.
  function handleCustomColorCommit(hex) {
    setCustomColors(rememberCustomColor(hex));
  }

  async function handleCreateCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    try {
      const response = await fetch(categoryApiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ name: trimmed, color }),
      });
      if (!response.ok) return;

      const created = await response.json();
      onCategoriesChanged?.();
      setCategoryId(created.id);
      setNewCategoryName('');
      setCreatingCategory(false);
    } catch {
      // yoksayıldı — kategori oluşturulamazsa kullanıcı yine de kategorisiz kaydedebilir
    }
  }

  return (
    <div className="attribute-popup-overlay">
      <div className="attribute-popup">
        <div className="attribute-popup-title">{typeLabel} bilgileri</div>

        <label className="attribute-popup-label" htmlFor="attribute-popup-name">
          İsim
        </label>
        <input
          id="attribute-popup-name"
          className="attribute-popup-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${typeLabel} adı (opsiyonel)`}
          autoFocus
        />

        <div className="attribute-popup-label">Renk</div>
        <div className="attribute-popup-palette">
          {colorPresets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`attribute-popup-swatch${color === preset ? ' attribute-popup-swatch-active' : ''}`}
              style={{ background: preset }}
              onClick={() => setColor(preset)}
              title={preset}
            />
          ))}
          <ColorSwatchInput
            value={color}
            onChange={handlePreviewColorChange}
            onCommit={handleCustomColorCommit}
            className="attribute-popup-color-input"
            title="Serbest renk seç"
            rainbow
          />
        </div>

        {customColors.length > 0 && (
          <>
            <div className="attribute-popup-label attribute-popup-label-sub">Son kullanılan renkler</div>
            <div className="attribute-popup-palette">
              {customColors.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={`attribute-popup-swatch${color === hex ? ' attribute-popup-swatch-active' : ''}`}
                  style={{ background: hex }}
                  onClick={() => setColor(hex)}
                  title={hex}
                />
              ))}
            </div>
          </>
        )}

        <div className="attribute-popup-label">Kategori</div>
        {!creatingCategory ? (
          <div className="attribute-popup-category-row">
            <select
              className="attribute-popup-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Kategorisiz</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {/* Yeni kategori açma sadece bu yetkiye sahip rollere görünür — diğerleri
                sadece var olan kategoriler arasından seçebilir. */}
            {getPermissions().canManageCategories && (
              <button type="button" className="attribute-popup-new-category" onClick={() => setCreatingCategory(true)}>
                + Yeni
              </button>
            )}
          </div>
        ) : (
          <div className="attribute-popup-category-row">
            <input
              className="attribute-popup-input"
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Kategori adı (ör. Doğalgaz hattı)"
              autoFocus
            />
            <button type="button" className="attribute-popup-new-category" onClick={handleCreateCategory}>
              Ekle
            </button>
            <button
              type="button"
              className="attribute-popup-new-category-cancel"
              onClick={() => {
                setCreatingCategory(false);
                setNewCategoryName('');
              }}
            >
              ✕
            </button>
          </div>
        )}

        {mode === 'Polygon' && (
          <div className="attribute-popup-analysis">
            {checking && <p className="attribute-popup-analysis-hint">Envanter kesişimi hesaplanıyor…</p>}
            {!checking && intersection && (
              <p className="attribute-popup-analysis-result">
                Bu alanın içinde <strong>{intersection.totalCount}</strong> envanter var
                {' '}
                (nokta: {intersection.pointCount}, çizgi: {intersection.lineCount}, alan: {intersection.polygonCount})
              </p>
            )}
            {!checking && checkFailed && (
              <p className="attribute-popup-analysis-hint">Kesişim hesaplanamadı, yine de kaydedebilirsiniz.</p>
            )}
          </div>
        )}

        <label className="attribute-popup-checkbox-row">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          <span>Sadece bana görünsün (haritayı paylaştığım kişiler bu çizimi göremesin)</span>
        </label>

        <div className="attribute-popup-actions">
          <button type="button" className="attribute-popup-cancel" onClick={onCancel}>
            Vazgeç
          </button>
          <button
            type="button"
            className="attribute-popup-confirm"
            onClick={() => onConfirm(name.trim(), color, categoryId, isPrivate)}
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

export default AttributePopup;

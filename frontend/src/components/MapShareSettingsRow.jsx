import { useState } from 'react';

// Küçük, bağımlılıksız bir pill/toggle switch — native checkbox'ın "daha güzel bir react/css
// olsun" isteği için. Erişilebilirlik için altında gerçek bir <input type="checkbox"> var,
// sadece görünüşü CSS ile pill'e çeviriyoruz (bkz. App.css .map-share-toggle-*).
function ToggleSwitch({ checked, onChange, label, disabled }) {
  return (
    <label className={`map-share-toggle${disabled ? ' map-share-toggle-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="map-share-toggle-track">
        <span className="map-share-toggle-thumb" />
      </span>
      <span className="map-share-toggle-label">{label}</span>
    </label>
  );
}

// Faz 3.1 (kullanıcının kendi isteği: "görüntüleme, silme, çizme ayrı izinler olsun, daha
// güzel bir react/css olsun"): Paylaş modalındaki her "Accepted" davetli satırının altına
// açılıp kapanan "Ayarlar" bölümü. Görüntüleme (Duraklat/Devam Et) satırın kendisinde bir
// düğme olarak duruyor (bkz. MapPage.jsx map-share-row) — çünkü o "tüm erişimin ana kapısı",
// burada sadece haritadaki bir çizimle ilgili üç ayrı izin var: Çizme, Silme, Başkalarını
// Düzenleme — artı kişiye özel renk kısıtlaması.
function MapShareSettingsRow({ share, colorPresets, onSave }) {
  const [open, setOpen] = useState(false);
  const [canDraw, setCanDraw] = useState(share.canDraw !== false);
  const [canDelete, setCanDelete] = useState(share.canDelete !== false);
  const [canEditOthers, setCanEditOthers] = useState(!!share.canEditOthers);
  const [selectedColors, setSelectedColors] = useState(
    share.allowedColors ? share.allowedColors.split(',').map((c) => c.trim()).filter(Boolean) : []
  );
  const [saving, setSaving] = useState(false);

  function toggleColor(hex) {
    setSelectedColors((current) => (current.includes(hex) ? current.filter((c) => c !== hex) : [...current, hex]));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(share.id, canDraw, canDelete, canEditOthers, selectedColors.length > 0 ? selectedColors.join(',') : null);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const hasCustomSettings = share.canDraw === false || share.canDelete === false || !!share.canEditOthers || !!share.allowedColors;

  return (
    <div className="map-share-settings">
      {/* Kullanıcının isteği (9. tur): "izinler yazısı daha güzel olsun böyle açılabilir güzel"
          — düz metin gibi duran linki gerçek bir açılır/kapanır CHIP'e çevirdik (arka plan,
          kenarlık, dönen ok ikonu). aria-expanded ile ekran okuyucular da açık/kapalı
          durumunu anlıyor. */}
      <button
        type="button"
        className={`map-share-settings-toggle${open ? ' map-share-settings-toggle-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="map-share-settings-toggle-arrow">▸</span>
        İzinler
        {hasCustomSettings && <span className="map-share-settings-toggle-dot" title="Özel izin ayarları var" />}
      </button>
      {open && (
        <div className="map-share-settings-body">
          <ToggleSwitch checked={canDraw} onChange={setCanDraw} label="Çizebilir (yeni nokta/çizgi/alan ekleyebilir)" />
          <ToggleSwitch checked={canDelete} onChange={setCanDelete} label="Silebilir (kendi çizdiğini)" />
          <ToggleSwitch
            checked={canEditOthers}
            onChange={setCanEditOthers}
            label="Başkalarının çizimini de düzenleyebilir/silebilir"
          />

          <div className="map-share-settings-label">Renk kısıtlaması (hiçbiri seçili değilse sınırsız)</div>
          <div className="map-share-settings-palette">
            {colorPresets.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`map-share-color-swatch${selectedColors.includes(hex) ? ' map-share-color-swatch-active' : ''}`}
                style={{ background: hex }}
                onClick={() => toggleColor(hex)}
                title={hex}
              />
            ))}
          </div>

          <button type="button" className="map-share-settings-save" disabled={saving} onClick={handleSave}>
            {saving ? 'Kaydediliyor…' : 'İzinleri Kaydet'}
          </button>
        </div>
      )}
    </div>
  );
}

export default MapShareSettingsRow;

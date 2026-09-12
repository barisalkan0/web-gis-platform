import { useState } from 'react';
import { POI_ICON_PALETTE } from '../poiIcons';

// Kullanıcının kendi isteği ("ikon ekleme de olacak poilere"): kategori ve POI formlarında
// paylaşılan basit bir ikon seçici — hazır bir emoji ızgarası + istenirse serbest metin
// (kullanıcı listede olmayan bir emoji de yapıştırabilir). value=null/'' => "seçilmedi"
// (POI formunda bu, "kategorinin ikonunu kullan" anlamına gelir).
function IconPicker({ value, onChange, allowEmpty = true, emptyLabel = 'Kategoriden gelsin' }) {
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div className="icon-picker">
      <div className="icon-picker-grid">
        {allowEmpty && (
          <button
            type="button"
            className={`icon-picker-option icon-picker-empty${!value ? ' icon-picker-option-active' : ''}`}
            onClick={() => onChange('')}
            title={emptyLabel}
          >
            —
          </button>
        )}
        {POI_ICON_PALETTE.map((icon) => (
          <button
            key={icon}
            type="button"
            className={`icon-picker-option${value === icon ? ' icon-picker-option-active' : ''}`}
            onClick={() => onChange(icon)}
          >
            {icon}
          </button>
        ))}
        <button
          type="button"
          className={`icon-picker-option icon-picker-custom${customOpen ? ' icon-picker-option-active' : ''}`}
          onClick={() => setCustomOpen((v) => !v)}
          title="Listede olmayan bir ikon gir"
        >
          ✏️
        </button>
      </div>
      {customOpen && (
        <input
          type="text"
          className="icon-picker-custom-input"
          placeholder="Bir emoji yapıştır…"
          value={value && !POI_ICON_PALETTE.includes(value) ? value : ''}
          maxLength={16}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  );
}

export default IconPicker;

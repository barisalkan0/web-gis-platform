import { useState } from 'react';
import ColorSwatchInput from './ColorSwatchInput';

// "Çizilenler" panelinde bir öğenin ismini/rengini/kategorisini yerinde (inline)
// düzenlemek için — çizim sırasındaki AttributePopup ile aynı alanlar, ama küçük ve
// listenin içine gömülü.
function ItemEditRow({ item, colorPresets, categories, onSave, onCancel }) {
  const [name, setName] = useState(item.name || '');
  const [color, setColor] = useState(item.color || colorPresets[0]);
  const [categoryId, setCategoryId] = useState(item.categoryId || '');
  const [isPrivate, setIsPrivate] = useState(!!item.isPrivate);

  return (
    <li className="shapes-edit-row">
      <input
        className="shapes-edit-input"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="İsim"
        autoFocus
      />

      <div className="shapes-edit-palette">
        {colorPresets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`shapes-edit-swatch${color === preset ? ' shapes-edit-swatch-active' : ''}`}
            style={{ background: preset }}
            onClick={() => setColor(preset)}
          />
        ))}
        <ColorSwatchInput
          value={color}
          onChange={setColor}
          className="shapes-edit-color-input"
          title="Serbest renk seç"
          rainbow
        />
      </div>

      {categories.length > 0 && (
        <select
          className="shapes-edit-select"
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
      )}

      <label className="shapes-edit-private-row">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        <span>Sadece bana görünsün</span>
      </label>

      <div className="shapes-edit-actions">
        <button type="button" className="shapes-edit-cancel" onClick={onCancel}>
          Vazgeç
        </button>
        <button type="button" className="shapes-edit-save" onClick={() => onSave(name.trim(), color, categoryId, isPrivate)}>
          Kaydet
        </button>
      </div>
    </li>
  );
}

export default ItemEditRow;

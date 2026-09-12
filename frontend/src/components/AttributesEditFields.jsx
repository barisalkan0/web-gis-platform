import ColorSwatchInput from './ColorSwatchInput';

// Bilgi kartındaki "Düzenle" moduna eklenen isim/renk/kategori alanları — "Çizilenler"
// panelindeki ItemEditRow ile aynı fikir, ama popup'ın (FeatureInfoCard) içine gömülü.
// Hoca isteği: "kullanıcı bu ekran üzerinden objenin isim/renk bilgilerini VE konumunu
// güncelleyebilmeli" — yani ikisi de AYNI Düzenle/Kaydet akışından yapılabilmeli, ayrı
// bir panele gitmeye gerek kalmadan.
function AttributesEditFields({
  name,
  onNameChange,
  color,
  onColorChange,
  colorPresets,
  categoryId,
  onCategoryChange,
  categories,
}) {
  return (
    <div className="attrs-edit-fields">
      <input
        className="attrs-edit-input"
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="İsim"
      />

      <div className="attrs-edit-palette">
        {colorPresets.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`attrs-edit-swatch${color === preset ? ' attrs-edit-swatch-active' : ''}`}
            style={{ background: preset }}
            onClick={() => onColorChange(preset)}
            title={preset}
          />
        ))}
        <ColorSwatchInput
          value={color}
          onChange={onColorChange}
          className="attrs-edit-color-input"
          title="Serbest renk seç"
          rainbow
        />
      </div>

      {categories.length > 0 && (
        <select
          className="attrs-edit-select"
          value={categoryId}
          onChange={(e) => onCategoryChange(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Kategorisiz</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export default AttributesEditFields;

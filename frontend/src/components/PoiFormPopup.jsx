import { useState } from 'react';
import { authHeader, getPermissions } from '../auth';
import { buildPoiCategoryOptions } from '../poiCategoryUtils';
import PoiScheduleEditor from './PoiScheduleEditor';
import { createDefaultPoiSchedule } from '../poiScheduleUtils';
import SearchableCategorySelect from './SearchableCategorySelect';
import PoiScheduleExceptionEditor from './PoiScheduleExceptionEditor';
import IconPicker from './IconPicker';

// Hoca ödevi (POI/Rol/Operatör): "Açılan formda isim girilsin, Admin'in hazırladığı
// kategoriler dropdown olarak seçilsin ve mesai saatleri girilebilsin." — AttributePopup'ın
// sade bir varyantı (renk/gizlilik/envanter-kesişimi yok, POI'nin kendi alan seti var).
function PoiFormPopup({ categories, poiCategoryApiBase, onCategoriesChanged, onConfirm, onCancel }) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [schedule, setSchedule] = useState(() => createDefaultPoiSchedule());
  const [scheduleExceptions, setScheduleExceptions] = useState([]);
  const [note, setNote] = useState('');
  // Kullanıcının kendi isteği ("ikon ekleme de olacak poilere"): boş = kategorinin
  // ikonunu kullan (bkz. backend'deki EffectiveIcon çözümü), sadece istenirse override et.
  const [icon, setIcon] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);

  const options = buildPoiCategoryOptions(categories);

  async function handleConfirm() {
    if (saving) return; // hızlı çift tıklamaya karşı
    const trimmed = name.trim();
    if (!trimmed) {
      setError('İsim boş olamaz.');
      return;
    }
    setSaving(true);
    await onConfirm(trimmed, categoryId || null, schedule, scheduleExceptions, note.trim() || null, icon || null);
    // saving'i burada geri false yapmıyoruz — onConfirm başarılıysa popup zaten kapanır
    // (MapPage pendingPoiDraw'ı null'a çeker), tekrar render olmaz.
  }

  async function createCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed || categorySaving) return;
    setCategorySaving(true);
    setError('');
    try {
      const response = await fetch(poiCategoryApiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          name: trimmed,
          description: newCategoryDescription.trim() || null,
          parentId: newCategoryParentId || null,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.message || 'POI kategorisi oluşturulamadı.');
        return;
      }
      await onCategoriesChanged?.();
      setCategoryId(data.id);
      setNewCategoryName('');
      setNewCategoryDescription('');
      setNewCategoryParentId('');
      setCreatingCategory(false);
    } catch {
      setError('POI kategorisi oluşturulurken sunucuya bağlanılamadı.');
    } finally {
      setCategorySaving(false);
    }
  }

  return (
    <div className="attribute-popup-overlay">
      <div className="attribute-popup poi-form-popup">
        <div className="attribute-popup-title">📍 POI bilgileri</div>

        <label className="attribute-popup-label" htmlFor="poi-form-name">
          İsim
        </label>
        <input
          id="poi-form-name"
          className="attribute-popup-input"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          placeholder="Örn. Sahil Kafe"
          autoFocus
        />

        <div className="attribute-popup-label attribute-popup-label-row">
          <span>Kategori</span>
          {getPermissions().canManagePoiCategories && (
            <button
              type="button"
              className="attribute-popup-inline-add"
              onClick={() => setCreatingCategory((value) => !value)}
              aria-expanded={creatingCategory}
              title="Yeni POI kategorisi oluştur"
            >
              +
            </button>
          )}
        </div>
        <SearchableCategorySelect
          options={options}
          value={categoryId}
          onChange={(next) => setCategoryId(next ? Number(next) : '')}
          ariaLabel="POI kategorisi ara ve seç"
        />

        {creatingCategory && (
          <div className="poi-inline-category-form">
            <input
              className="attribute-popup-input"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Yeni kategori adı"
              aria-label="Yeni POI kategorisi adı"
            />
            <select
              className="attribute-popup-select"
              value={newCategoryParentId}
              onChange={(e) => setNewCategoryParentId(e.target.value ? Number(e.target.value) : '')}
              aria-label="Üst POI kategorisi"
            >
              <option value="">Üst kategori yok</option>
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <textarea
              className="attribute-popup-input"
              rows={2}
              maxLength={500}
              value={newCategoryDescription}
              onChange={(e) => setNewCategoryDescription(e.target.value)}
              placeholder="Kategori açıklaması (opsiyonel)"
              aria-label="Yeni POI kategorisi açıklaması"
            />
            <div className="poi-inline-category-actions">
              <button type="button" className="attribute-popup-cancel" onClick={() => setCreatingCategory(false)} disabled={categorySaving}>
                Vazgeç
              </button>
              <button type="button" className="attribute-popup-confirm" onClick={createCategory} disabled={categorySaving || !newCategoryName.trim()}>
                {categorySaving ? 'Ekleniyor…' : 'Kategoriyi Ekle'}
              </button>
            </div>
          </div>
        )}

        <div className="attribute-popup-label">
          İkon (opsiyonel)
        </div>
        <IconPicker value={icon} onChange={setIcon} allowEmpty emptyLabel="Kategoriden gelsin" />

        <div className="attribute-popup-label">
          Mesai Saatleri
        </div>
        <PoiScheduleEditor value={schedule} onChange={setSchedule} />
        <PoiScheduleExceptionEditor value={scheduleExceptions} onChange={setScheduleExceptions} />

        <label className="attribute-popup-label" htmlFor="poi-form-note">
          Not
        </label>
        <textarea
          id="poi-form-note"
          className="attribute-popup-input"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="POI hakkında açıklama veya not (opsiyonel)"
        />

        {error && <p className="admin-error">{error}</p>}

        <div className="attribute-popup-actions">
          <button type="button" className="attribute-popup-cancel" onClick={onCancel} disabled={saving}>
            Vazgeç
          </button>
          <button type="button" className="attribute-popup-confirm" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PoiFormPopup;

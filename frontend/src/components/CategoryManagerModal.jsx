import { useState } from 'react';
import { authHeader, getPermissions } from '../auth';
import ColorSwatchInput from './ColorSwatchInput';
import ConfirmDialog from './ConfirmDialog';

// Tam admin paneline erişimi olmayan ama "kategori yönetimi" iznine sahip roller için
// küçük, kendi başına yeten bir kategori yönetim penceresi — "bazı roller panel
// butonunu göremez ama mesela kategori oluşturabilir" isteğinin karşılığı. Kullanıcı/
// rol/çöp kutusu gibi tam admin panelindeki hassas bölümlere hiç dokunmuyor.
function CategoryManagerModal({ categories, categoryApiBase, onClose, onChanged }) {
  const permissions = getPermissions();
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newColor, setNewColor] = useState('#6b7280');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(null);

  async function createCategory() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const response = await fetch(categoryApiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ name: trimmed, description: newDescription.trim() || null, color: newColor }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.message || 'Kategori oluşturulamadı.');
      return;
    }
    setError('');
    setNewName('');
    setNewDescription('');
    setCreating(false);
    onChanged();
  }

  async function renameCategory(cat, name) {
    const response = await fetch(`${categoryApiBase}/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ name }),
    });
    if (response.ok) onChanged();
    setEditingId(null);
  }

  async function recolorCategory(cat, color) {
    await fetch(`${categoryApiBase}/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ color }),
    });
    onChanged();
  }

  async function updateDescription(cat, description) {
    const normalized = description.trim();
    if (normalized === (cat.description || '')) return;
    const response = await fetch(`${categoryApiBase}/${cat.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ description: normalized }),
    });
    if (response.ok) onChanged();
  }

  function deleteCategory(cat) {
    setPendingConfirm({
      title: `"${cat.name}" kategorisini sil`,
      message: 'Üzerindeki nokta/çizgi/alanlar silinmez, sadece kategorisiz kalır.',
      onConfirm: async () => {
        const response = await fetch(`${categoryApiBase}/${cat.id}`, {
          method: 'DELETE',
          headers: authHeader(),
        });
        if (response.ok) onChanged();
      },
    });
  }

  return (
    <div className="attribute-popup-overlay" onClick={onClose}>
      <div className="attribute-popup category-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="attribute-popup-title">🏷️ Kategori Yönetimi</div>
        {error && <p className="admin-error">{error}</p>}

        <ul className="admin-category-list">
          {categories.map((cat) => (
            <li key={cat.id} className="admin-category-item category-manager-item">
              <ColorSwatchInput
                value={cat.color}
                onChange={(hex) => recolorCategory(cat, hex)}
                className="admin-role-color-input"
                title="Kategori rengi"
                disabled={!permissions.canManageCategories}
              />
              <div className="admin-category-copy">
                {editingId === cat.id ? (
                  <input
                    className="admin-category-name-input"
                    type="text"
                    defaultValue={cat.name}
                    autoFocus
                    onBlur={(e) => renameCategory(cat, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                  />
                ) : (
                  <span
                    className="admin-category-name"
                    onClick={() => permissions.canManageCategories && setEditingId(cat.id)}
                  >
                    {cat.name}
                  </span>
                )}
                {permissions.canManageCategories ? (
                  <textarea
                    className="admin-category-description-input"
                    rows={2}
                    defaultValue={cat.description || ''}
                    onBlur={(e) => updateDescription(cat, e.target.value)}
                    placeholder="Kategori açıklaması ekle…"
                    aria-label={`${cat.name} kategori açıklaması`}
                  />
                ) : (
                  <small className="admin-category-description">{cat.description || 'Açıklama eklenmemiş'}</small>
                )}
              </div>
              {permissions.canDeleteCategories && (
                <button className="admin-trash-delete" onClick={() => deleteCategory(cat)}>
                  Sil
                </button>
              )}
            </li>
          ))}
          {categories.length === 0 && <p className="admin-hint">Henüz kategori yok.</p>}
        </ul>

        {permissions.canManageCategories && (
          <>
            {!creating ? (
              <button type="button" className="attribute-popup-new-category" onClick={() => setCreating(true)}>
                + Yeni Kategori
              </button>
            ) : (
              <div className="category-manager-create-form">
                <input
                  className="attribute-popup-input"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Kategori adı"
                  autoFocus
                />
                <textarea
                  className="attribute-popup-textarea"
                  rows={2}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Kategori açıklaması (opsiyonel)"
                />
                <div className="attribute-popup-category-row">
                  <ColorSwatchInput
                    value={newColor}
                    onChange={setNewColor}
                    className="admin-role-color-input"
                    title="Kategori rengi"
                  />
                  <button type="button" className="attribute-popup-new-category" onClick={createCategory}>
                    Ekle
                  </button>
                  <button type="button" className="attribute-popup-new-category-cancel" onClick={() => { setCreating(false); setNewDescription(''); }}>
                    ✕
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div className="attribute-popup-actions">
          <button type="button" className="attribute-popup-confirm" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>

      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          onConfirm={() => {
            pendingConfirm.onConfirm();
            setPendingConfirm(null);
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}

export default CategoryManagerModal;

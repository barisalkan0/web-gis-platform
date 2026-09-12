import { useEffect, useState } from 'react';
import { authHeader } from '../auth';
import ConfirmDialog from './ConfirmDialog';

const TRASH_BASE = 'http://localhost:5276/api/Trash';

const TRASH_TYPES = [
  { mode: 'point', label: 'Noktalar', color: '#2563eb' },
  { mode: 'line', label: 'Çizgiler', color: '#ea580c' },
  { mode: 'polygon', label: 'Alanlar', color: '#16a34a' },
];

async function authedFetch(url, options = {}) {
  return fetch(url, { ...options, headers: { ...authHeader(), ...(options.headers || {}) } });
}

// "Çöp kutusu yönetim panelinde olmasın, ayarların yanında aynı boyutta bir ikon olsun,
// tıklayınca ayarlardaki gibi bir pencere açılsın" isteği — Ayarlar'la aynı modal deseni.
// Sadece admin paneline erişimi olanlara gösteriliyor (bkz. MapPage: isAdmin() && ...).
function TrashPanel({ onClose, onRestore }) {
  const [trashType, setTrashType] = useState('point');
  const [trashItems, setTrashItems] = useState({ point: [], line: [], polygon: [] });
  const [loading, setLoading] = useState(true);
  // window.confirm() yerine kendi onay penceremiz
  const [pendingConfirm, setPendingConfirm] = useState(null);

  useEffect(() => {
    let ignore = false;
    Promise.all(TRASH_TYPES.map((t) => authedFetch(`${TRASH_BASE}/${t.mode}`)))
      .then((responses) => Promise.all(responses.map((r) => (r.ok ? r.json() : []))))
      .then(([point, line, polygon]) => {
        if (!ignore) setTrashItems({ point, line, polygon });
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  function confirmRestore(mode, item) {
    setPendingConfirm({
      title: `"${item.name || `#${item.id}`}" geri getirilsin mi?`,
      message: 'Öğe tekrar haritada ve listede görünür olacak.',
      confirmLabel: 'Evet, geri getir',
      danger: false,
      onConfirm: async () => {
        // Restore isteğini biz değil, MapPage'in restoreItemToMap'i atıyor — hem çöp
        // kutusundan çıkarıyor hem de aynı anda haritaya/Çizilenler listesine feature'ı
        // geri ekliyor. Önceden burada ayrı bir fetch atılıyordu; bu yüzden geri getirilen
        // öğe haritada anında görünmüyor, ancak sayfa yenilenince (loadExistingShapes tekrar
        // çalışınca) ortaya çıkıyordu.
        try {
          await onRestore(mode, item);
          setTrashItems((cur) => ({ ...cur, [mode]: cur[mode].filter((i) => i.id !== item.id) }));
        } catch {
          // geri getirme başarısız oldu — öğeyi çöp kutusu listesinden çıkarma
        }
      },
    });
  }

  function confirmPermanentDelete(mode, item) {
    setPendingConfirm({
      title: `"${item.name || `#${item.id}`}" kalıcı olarak silinsin mi?`,
      message: 'Bu işlem geri alınamaz.',
      onConfirm: async () => {
        const response = await authedFetch(`${TRASH_BASE}/${mode}/${item.id}`, { method: 'DELETE' });
        if (!response.ok) return;
        setTrashItems((cur) => ({ ...cur, [mode]: cur[mode].filter((i) => i.id !== item.id) }));
      },
    });
  }

  function confirmEmptyTrash(mode) {
    if (trashItems[mode].length === 0) return;
    const typeInfo = TRASH_TYPES.find((t) => t.mode === mode);
    setPendingConfirm({
      title: `${typeInfo.label} çöp kutusunu boşalt`,
      message: `${trashItems[mode].length} öğe kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      onConfirm: async () => {
        const response = await authedFetch(`${TRASH_BASE}/${mode}`, { method: 'DELETE' });
        if (!response.ok) return;
        setTrashItems((cur) => ({ ...cur, [mode]: [] }));
      },
    });
  }

  const activeItems = trashItems[trashType] || [];
  const activeType = TRASH_TYPES.find((t) => t.mode === trashType);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal trash-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-header">
          <div>
            <h1>🗑️ Çöp Kutusu</h1>
            <p className="admin-subtitle">Silinen nokta, çizgi ve alanları yönet</p>
          </div>
          <div className="admin-header-actions">
            <button className="settings-close-button" onClick={onClose} title="Kapat">
              ✕
            </button>
          </div>
        </div>

        <div className="admin-trash-tabs">
          {TRASH_TYPES.map((t) => (
            <button
              key={t.mode}
              className={`admin-trash-tab${trashType === t.mode ? ' admin-trash-tab-active' : ''}`}
              onClick={() => setTrashType(t.mode)}
            >
              <span className="admin-trash-tab-dot" style={{ background: t.color }} />
              {t.label} ({trashItems[t.mode].length})
            </button>
          ))}
        </div>

        {loading ? (
          <p className="admin-hint">Yükleniyor…</p>
        ) : activeItems.length === 0 ? (
          <p className="admin-hint">{activeType?.label} çöp kutusu boş.</p>
        ) : (
          <ul className="admin-trash-list">
            {activeItems.map((item) => (
              <li key={`${trashType}-${item.id}`} className="admin-trash-item">
                <span className="admin-trash-item-dot" style={{ background: item.color || activeType?.color }} />
                <span className="admin-trash-item-text">
                  <span className="admin-trash-item-title">{item.name || `#${item.id}`}</span>
                  {item.place && <span className="admin-trash-item-place">{item.place}</span>}
                </span>
                <button className="admin-trash-restore" onClick={() => confirmRestore(trashType, item)}>
                  Geri getir
                </button>
                <button className="admin-trash-delete" onClick={() => confirmPermanentDelete(trashType, item)}>
                  Kalıcı sil
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          className="admin-trash-empty trash-panel-empty"
          disabled={activeItems.length === 0}
          onClick={() => confirmEmptyTrash(trashType)}
        >
          {activeType?.label} çöp kutusunu boşalt
        </button>
      </div>

      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          danger={pendingConfirm.danger !== false}
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

export default TrashPanel;

import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

// Görev #75 (kullanıcının kendi isteği: "harita silme geri getirme fln gelsin is_delete
// gibi olsun o da") — TrashPanel.jsx'teki (nokta/çizgi/alan çöp kutusu) AYNI görsel desen
// ve CSS sınıfları (.settings-overlay/.admin-trash-*) yeniden kullanılıyor, ama TrashPanel
// admin-only'ydi; bu FARKLI: her kullanıcı sadece KENDİ sildiği haritaları görüp geri
// getirebiliyor/kalıcı silebiliyor — özel bir yetki gerekmiyor.
function MapTrashModal({ deletedMaps, loading, onRestore, onPermanentDelete, onClose }) {
  const [pendingConfirm, setPendingConfirm] = useState(null);

  function confirmRestore(map) {
    setPendingConfirm({
      title: `"${map.name}" geri getirilsin mi?`,
      message: 'Harita tekrar Haritalarım listende görünür olacak.',
      confirmLabel: 'Evet, geri getir',
      danger: false,
      onConfirm: () => onRestore(map),
    });
  }

  function confirmPermanentDelete(map) {
    setPendingConfirm({
      title: `"${map.name}" kalıcı olarak silinsin mi?`,
      message: 'Bu işlem geri alınamaz.',
      onConfirm: () => onPermanentDelete(map),
    });
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal trash-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-header">
          <div>
            <h1>🗑️ Harita Çöp Kutusu</h1>
            <p className="admin-subtitle">Sildiğin haritaları geri getir ya da kalıcı olarak sil</p>
          </div>
          <div className="admin-header-actions">
            <button className="settings-close-button" onClick={onClose} title="Kapat">
              ✕
            </button>
          </div>
        </div>

        {loading ? (
          <p className="admin-hint">Yükleniyor…</p>
        ) : deletedMaps.length === 0 ? (
          <p className="admin-hint">Çöp kutusu boş.</p>
        ) : (
          <ul className="admin-trash-list">
            {deletedMaps.map((m) => (
              <li key={m.id} className="admin-trash-item">
                <span className="admin-trash-item-text">
                  <span className="admin-trash-item-title">{m.name}</span>
                  {m.description && <span className="admin-trash-item-place">{m.description}</span>}
                </span>
                <button type="button" className="admin-trash-restore" onClick={() => confirmRestore(m)}>
                  Geri getir
                </button>
                <button type="button" className="admin-trash-delete" onClick={() => confirmPermanentDelete(m)}>
                  Kalıcı sil
                </button>
              </li>
            ))}
          </ul>
        )}
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

export default MapTrashModal;

// Tarayıcının çirkin "Bu site diyor ki…" native confirm() penceresi yerine uygulama
// içi, stilini tamamen kontrol ettiğimiz bir onay penceresi. Silme/geri getirme gibi geri
// dönüşü olan ya da olmayan işlemlerden önce kullanılıyor.
function ConfirmDialog({ title, message, confirmLabel = 'Evet, eminim', danger = true, onConfirm, onCancel }) {
  // Bu pencere çoğu zaman başka bir modalin (Ayarlar, Çöp Kutusu, Kategori Yönetimi...)
  // İÇİNDEN açılıyor — arka plana tıklamayı durdurmazsak (stopPropagation) olay dıştaki
  // modalin kendi overlay'ine de sızıp onu da kapatıyordu.
  return (
    <div
      className="attribute-popup-overlay confirm-dialog-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="attribute-popup confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="attribute-popup-title">{title}</div>
        {message && <p className="admin-hint confirm-dialog-message">{message}</p>}
        <div className="attribute-popup-actions">
          <button type="button" className="attribute-popup-cancel" onClick={onCancel}>
            Vazgeç
          </button>
          <button
            type="button"
            className={danger ? 'settings-danger-button' : 'attribute-popup-confirm'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authHeader, getAuth, clearAuth } from '../auth';

const ACCOUNT_BASE = 'http://localhost:5276/api/Account';
const CONFIRMATION_PHRASE = 'HESABIMI SİL';

async function authedFetch(url, options = {}) {
  return fetch(url, { ...options, headers: { ...authHeader(), ...(options.headers || {}) } });
}

// Herkese açık ayarlar penceresi — Discord'daki gibi açılır bir pencere (masaüstünde),
// telefonda ise CSS medya sorgusuyla tam ekrana geçiyor (bkz. App.css .settings-overlay).
// Şifre değiştirme ve hesabı kalıcı kapatma (Tehlikeli Bölge) gerçek işlevsel; henüz
// hazır olmayan özellikler "yakında" rozetiyle ve silik (settings-section-soon) görünüyor.
function SettingsPage() {
  const navigate = useNavigate();
  const username = getAuth()?.username || '?';
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);

  function closeSettings() {
    navigate('/');
  }

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [deletePassword, setDeletePassword] = useState('');
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleModalKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        navigate('/');
        return;
      }
      if (e.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [navigate]);

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');
    setPasswordLoading(true);

    try {
      const response = await authedFetch(`${ACCOUNT_BASE}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setPasswordError(data?.message || 'Şifre değiştirilemedi.');
        return;
      }

      setPasswordMessage('Şifren güncellendi.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch {
      setPasswordError('Sunucuya bağlanılamadı.');
    } finally {
      setPasswordLoading(false);
    }
  }

  async function handleDeleteAccount(e) {
    e.preventDefault();
    setDeleteError('');
    setDeleteLoading(true);

    try {
      const response = await authedFetch(`${ACCOUNT_BASE}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword, confirmationPhrase: deletePhrase }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setDeleteError(data?.message || 'Hesap kapatılamadı.');
        return;
      }

      clearAuth();
      navigate('/login');
    } catch {
      setDeleteError('Sunucuya bağlanılamadı.');
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={closeSettings}>
      <div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="admin-header">
          <div>
            <h1 id="settings-title">⚙️ Ayarlar</h1>
            <p className="admin-subtitle">{username} hesabı</p>
          </div>
          <div className="admin-header-actions">
            <button ref={closeButtonRef} className="settings-close-button" onClick={closeSettings} title="Kapat" aria-label="Ayarları kapat">
              ✕
            </button>
          </div>
        </div>

        <div className="settings-sections">
          <section className="settings-section">
            <h2>🔑 Şifre Değiştir</h2>
            <form className="settings-form" onSubmit={handleChangePassword}>
              <label className="settings-field">
                Mevcut şifre
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              <label className="settings-field">
                Yeni şifre
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className="settings-field">
                Yeni şifre (tekrar)
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              {passwordError && <p className="admin-error">{passwordError}</p>}
              {passwordMessage && <p className="settings-success">{passwordMessage}</p>}
              <button type="submit" className="settings-submit" disabled={passwordLoading}>
                {passwordLoading ? 'Kaydediliyor…' : 'Şifreyi Güncelle'}
              </button>
            </form>
          </section>

          <section className="settings-section settings-section-soon">
            <h2>
              📱 İki Faktörlü Doğrulama <span className="settings-soon-badge">yakında</span>
            </h2>
          </section>

          <section className="settings-section settings-section-soon">
            <h2>
              🔔 Bildirim Tercihleri <span className="settings-soon-badge">yakında</span>
            </h2>
          </section>

          <section className="settings-section settings-section-soon">
            <h2>
              💻 Oturum Açılan Cihazlar <span className="settings-soon-badge">yakında</span>
            </h2>
          </section>

          <section className="settings-section settings-section-soon">
            <h2>
              🎨 Görünüm <span className="settings-soon-badge">yakında</span>
            </h2>
          </section>

          <section className="settings-section settings-section-danger">
            <h2>⚠️ Tehlikeli Bölge</h2>
            <p className="admin-hint">
              Hesabını kapatırsan verilerin 30 gün boyunca saklanır ve bu süre içinde bize ulaşarak geri
              alabilirsin. 30 gün sonunda kalıcı olarak silinir.
            </p>

            {!confirmingDelete ? (
              <button className="settings-danger-button" onClick={() => setConfirmingDelete(true)}>
                Hesabımı Kapat
              </button>
            ) : (
              <form className="settings-form" onSubmit={handleDeleteAccount}>
                <label className="settings-field">
                  Şifren
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </label>
                <label className="settings-field">
                  Onaylamak için tam olarak yaz: <strong>{CONFIRMATION_PHRASE}</strong>
                  <input
                    type="text"
                    value={deletePhrase}
                    onChange={(e) => setDeletePhrase(e.target.value)}
                    required
                  />
                </label>
                {deleteError && <p className="admin-error">{deleteError}</p>}
                <div className="settings-danger-actions">
                  <button
                    type="button"
                    className="settings-cancel"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeleteError('');
                      setDeletePassword('');
                      setDeletePhrase('');
                    }}
                  >
                    Vazgeç
                  </button>
                  <button type="submit" className="settings-danger-button" disabled={deleteLoading}>
                    {deleteLoading ? 'Kapatılıyor…' : 'Hesabımı Kalıcı Olarak Kapat'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;

import { useEffect, useRef, useState } from 'react';

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

// Görev #74 (kullanıcının kendi isteği): dişliye basınca eskiden Haritalarım listesinin
// İÇİNDE küçük bir akordeon açılıyordu; ad/açıklama kutuları onBlur'da OTOMATİK
// kaydediyordu, "Kaydet" butonu yoktu. Kullanıcı özellikle "ortaya başka bir sekme/panel
// gelsin, kaydet butonu olsun, kaydetmeden Esc'e basarsa kaydedilmemiş değişiklikleriniz
// var diye uyarsın, esc çalışsın burada" istedi. Bu yüzden artık EKRANIN ORTASINDA açılan,
// kendi "kirli mi" (dirty) durumunu takip eden, EXPLICIT kaydetme gerektiren bir modal.
//
// Esc davranışı: değişiklik YOKSA direkt kapanır; VARSA önce bir onay adımı gösterir —
// "vazgeç" (modalda kal) ya da "değişiklikleri kaybet" (kapat). Yani Esc HER ZAMAN bir
// şey yapar (kullanıcının "esc çalışsın" isteği), sadece "hemen kapat" ile "önce uyar"
// arasında dirty durumuna göre seçim yapıyor.
function MapSettingsModal({
  map,
  shares,
  canDeleteMap,
  duplicating,
  activity = [],
  activityLoading = false,
  onOpenActivity,
  geoRestrictions = [],
  onOpenGeoRestriction,
  onPauseShare,
  onRemoveShare,
  onSave,
  onDuplicate,
  onSetDefault,
  onOpenShare,
  onDelete,
  onClose,
}) {
  const [name, setName] = useState(map.name);
  const [description, setDescription] = useState(map.description || '');
  const [saving, setSaving] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  // Kullanıcının kendi isteği: "harita aktivite/loglarını paylaş yerinden görebiliyoruz çok
  // saçma" + "aktivite yerine girince geri gelme tuşu fln olmalı" — eskiden ana içeriğin
  // İÇİNE açılan bir akordeondu (bu da açıklama kutusunun flex-shrink ile sıkışmasına yol
  // açıyordu, "açıklama yeri görünmüyor" bug'ı buradan geliyordu). Artık 'main'/'logs' iki
  // AYRI GÖRÜNÜM — Loglar'dayken Ad/Açıklama/Paylaşılanlar hiç render edilmiyor, "← Geri"
  // ile ana görünüme dönülüyor. İlk açılışta lazy-load ediliyor (bkz. onOpenActivity).
  const [view, setView] = useState('main'); // 'main' | 'logs'
  const nameInputRef = useRef(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const dirty = name.trim() !== map.name || (description.trim() || '') !== (map.description || '');

  function requestClose() {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (confirmingClose) {
        setConfirmingClose(false); // ikinci Esc: uyarıyı da kapat, modalda kal (yanlışlıkla art arda basınca kaybolmasın)
        return;
      }
      // Kullanıcının kendi isteği: Loglar görünümündeyken Esc modalı KAPATMASIN, önce ana
      // görünüme GERİ dönsün — "geri gelme tuşu" isteğinin klavye karşılığı.
      if (view === 'logs') {
        setView('main');
        return;
      }
      requestClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, confirmingClose, view]);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const ok = await onSave({ name: name.trim(), description: description.trim() || null });
    setSaving(false);
    if (ok) setConfirmingClose(false);
  }

  return (
    <div className="map-settings-modal-backdrop" onClick={requestClose}>
      <div className="map-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="map-settings-modal-header">
          {view === 'logs' ? (
            <span className="map-settings-modal-header-nav">
              <button type="button" className="map-settings-modal-back" onClick={() => setView('main')} aria-label="Geri">
                ←
              </button>
              📜 Loglar
            </span>
          ) : (
            <span>⚙️ Harita Ayarları</span>
          )}
          <button type="button" className="map-settings-modal-close" onClick={requestClose} aria-label="Kapat">
            ×
          </button>
        </div>

        {view === 'logs' && !confirmingClose ? (
          <div className="map-tab-settings-shared map-settings-logs-view">
            {activityLoading && <div className="admin-hint">Yükleniyor…</div>}
            {!activityLoading && activity.length === 0 && <div className="admin-hint">Henüz log yok.</div>}
            {!activityLoading && activity.length > 0 && (
              <ul className="admin-log-list map-share-activity-list">
                {activity.map((log) => (
                  <li key={log.id} className="admin-log-item">
                    <span className="admin-log-actor">{log.actorUsername}</span>
                    <span className="admin-log-details">{log.details}</span>
                    <span className="admin-log-date">{formatDateTime(log.createdDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : confirmingClose ? (
          <div className="map-settings-modal-confirm">
            <p>Kaydedilmemiş değişikliklerin var. Yine de çıkmak istiyor musun?</p>
            <div className="map-settings-modal-confirm-actions">
              <button type="button" className="attribute-popup-cancel" onClick={() => setConfirmingClose(false)}>
                Vazgeç, düzenlemeye devam et
              </button>
              <button type="button" className="map-tab-settings-item map-tab-settings-item-danger" onClick={onClose}>
                Evet, değişiklikleri kaybet
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Kullanıcının kendi isteği: "ayarlardan istediğim mapi varsayılan
                yapabilmeliyim otomatik onunla açılır fln". */}
            {map.isDefault ? (
              <div className="map-settings-default-badge">⭐ Bu senin varsayılan haritan — girişte otomatik açılır</div>
            ) : (
              <button type="button" className="map-settings-default-set-btn" onClick={onSetDefault}>
                ⭐ Varsayılan Yap
              </button>
            )}

            <label className="new-map-field-label" htmlFor="settings-map-name">
              Ad
            </label>
            <input
              id="settings-map-name"
              ref={nameInputRef}
              className="new-map-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <label className="new-map-field-label" htmlFor="settings-map-desc">
              Açıklama
            </label>
            <textarea
              id="settings-map-desc"
              className="new-map-textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bu harita ne için kullanılıyor?"
            />

            <div className="map-settings-modal-actions">
              <button type="button" className="map-tab-settings-item" disabled={duplicating} onClick={onDuplicate}>
                ⧉ Çoğalt
              </button>
              <button type="button" className="map-tab-settings-item" onClick={onOpenShare}>
                🔗 Kişi Ekle / Paylaş
              </button>
              <button
                type="button"
                className="map-tab-settings-item"
                onClick={() => {
                  onOpenActivity?.();
                  setView('logs');
                }}
              >
                📜 Loglar
              </button>
              <button
                type="button"
                className="map-tab-settings-item map-tab-settings-item-danger"
                disabled={!canDeleteMap}
                title={!canDeleteMap ? 'Son haritanı silemezsin' : undefined}
                onClick={onDelete}
              >
                🗑️ Sil
              </button>
            </div>

            {/* Kullanıcının kendi tespiti: "çok kötü görünüyor hiç estetik değil" — düz
                metin listesi yerine kart tabanlı, ikonlu/rozetli bir tasarım. */}
            <div className="map-tab-settings-shared">
              <div className="map-tab-settings-shared-title">Paylaşılanlar</div>
              {shares.length === 0 ? (
                <div className="admin-hint">Henüz kimseyle/hiçbir role paylaşılmamış.</div>
              ) : (
                <ul className="map-settings-share-cards">
                  {shares.map((s) => {
                    const paused = s.status === 'Accepted' && s.canView === false;
                    const badgeLabel = s.status === 'Pending' ? 'Bekliyor' : paused ? 'Duraklatıldı' : 'Aktif';
                    const badgeClass = s.status === 'Pending' ? 'pending' : paused ? 'paused' : 'active';
                    // Kullanıcının kendi isteği: "buradan tamamen yönetilebilmeli" — bu
                    // kişi/rol için coğrafi kısıt var mı, varsa duraklatılmış mı, kartın
                    // KENDİSİNDE görünsün (ayrı bir yere gitmeye gerek kalmadan).
                    const geoRows = geoRestrictions.filter((g) =>
                      s.targetType === 'Role' ? g.roleId === s.roleId : g.userId === s.invitedUserId
                    );
                    const hasGeoRestriction = geoRows.length > 0;
                    const geoAllPaused = hasGeoRestriction && geoRows.every((g) => g.isPaused);
                    const targetId = s.targetType === 'Role' ? s.roleId : s.invitedUserId;
                    return (
                      <li key={s.id} className="map-settings-share-card">
                        <div className="map-settings-share-card-row">
                          {s.targetType === 'Role' ? (
                            <span className="map-settings-share-card-icon" style={{ background: s.roleColor || '#6b7280' }}>
                              {(s.roleName || '?').charAt(0).toUpperCase()}
                            </span>
                          ) : (
                            <span className="map-settings-share-card-icon map-settings-share-card-icon-person">👤</span>
                          )}
                          <span className="map-settings-share-card-name">
                            {s.targetType === 'Role' ? `${s.roleName} rolü` : s.invitedUsername}
                            {s.targetType === 'Role' && <span className="map-settings-share-card-sub">{s.roleUserCount} kişi</span>}
                          </span>
                          <span className={`map-settings-share-card-badge map-settings-share-card-badge-${badgeClass}`}>{badgeLabel}</span>
                        </div>
                        {/* Kullanıcının isteği (9. tur): sıralama Coğrafi Yetki Tanımla -
                            Duraklat - Kaldır olacak, yan yana (Paylaş modalındaki
                            .map-share-row-actions ile AYNI sıralama/mantık). Kısıtlı-alan
                            rozeti artık ayrı, kendi satırında (buton değil, sadece bilgi). */}
                        {s.status === 'Accepted' && hasGeoRestriction && (
                          <div className="map-settings-share-card-geo-row">
                            <span className={`map-settings-share-card-geo-badge${geoAllPaused ? ' map-settings-share-card-geo-badge-paused' : ''}`}>
                              🗺️ {geoAllPaused ? 'Kısıtlı (duraklatıldı)' : `Kısıtlı · ${geoRows.length} alan`}
                            </span>
                          </div>
                        )}
                        {/* Kullanıcının kendi isteği: "Kullanıcı rolü yazan yerde
                            duraklatabilme fln da yapılabilmeli veya kaldırabilmeliyim onay
                            dahilinde hepsi" — Paylaş modalına gitmeye gerek kalmadan buradan
                            da duraklat/kaldır (ikisi de onay diyaloğu üzerinden). */}
                        <div className="map-settings-share-card-actions">
                          {s.status === 'Accepted' && targetId != null && (
                            <button
                              type="button"
                              className="map-settings-share-card-geo-btn"
                              onClick={() =>
                                onOpenGeoRestriction?.({
                                  type: s.targetType === 'Role' ? 'role' : 'user',
                                  id: targetId,
                                  label: s.targetType === 'Role' ? `'${s.roleName}' rolü` : `'${s.invitedUsername}' kullanıcısı`,
                                })
                              }
                            >
                              🗺️ {hasGeoRestriction ? 'Yönet' : 'Coğrafi Yetki Tanımla'}
                            </button>
                          )}
                          {s.status === 'Accepted' && (
                            <button
                              type="button"
                              className={`map-settings-share-card-pause-btn${paused ? ' map-settings-share-card-pause-btn-active' : ''}`}
                              onClick={() => onPauseShare?.(s, paused)}
                            >
                              {paused ? '▶ Devam Ettir' : '⏸ Duraklat'}
                            </button>
                          )}
                          <button type="button" className="map-settings-share-card-remove-btn" onClick={() => onRemoveShare?.(s)}>
                            {s.status === 'Pending' ? '↩ Geri Çek' : '🗑️ Kaldır'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="admin-hint map-settings-modal-share-hint">
                Yeni kişi/rol eklemek ya da izinleri değiştirmek için "🔗 Paylaş"ı kullan.
              </p>
            </div>

            <div className="map-settings-modal-footer">
              {dirty && <span className="map-settings-modal-dirty-hint">● Kaydedilmemiş değişiklikler var</span>}
              <button type="button" className="attribute-popup-cancel" onClick={requestClose}>
                Kapat
              </button>
              <button type="button" className="attribute-popup-confirm" disabled={!name.trim() || saving || !dirty} onClick={handleSave}>
                {saving ? 'Kaydediliyor…' : '✓ Kaydet'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MapSettingsModal;

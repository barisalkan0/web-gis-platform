import { useState } from 'react';

const SHARE_STATUS_LABELS = {
  Pending: 'Bekliyor',
  Accepted: 'Kabul etti',
};

// Görev #76 (kullanıcının kendi isteği): "paylaşılan kişilerin üzerine tıklayınca ekrana
// bi bar gelsin kullanıcı hakkında bilgiler görülebilsin, o kullanıcıyla hangi mapler
// paylaşılmış görülebilsin ve oradan da istek atılabilsin" — Paylaş modalındaki bir kişi
// satırına ya da harita ayarları modalındaki "Paylaşılanlar" listesindeki bir kişiye
// tıklayınca açılan küçük profil kartı.
function UserProfileCard({ username, data, loading, myMaps, onInvite, onClose }) {
  const [pickedMapId, setPickedMapId] = useState('');

  const sharedMapIds = new Set((data?.sharedMaps || []).map((m) => m.mapId));
  const shareableMaps = (myMaps || []).filter((m) => !sharedMapIds.has(m.id));

  return (
    <div className="attribute-popup-overlay" onClick={onClose}>
      <div className="attribute-popup user-profile-card" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <p className="admin-hint">Yükleniyor…</p>
        ) : !data ? (
          <p className="admin-hint">Kullanıcı bulunamadı.</p>
        ) : (
          <>
            <div className="user-profile-card-header">
              <span className="user-profile-card-avatar" style={{ background: data.roleColor || '#6b7280' }}>
                {data.username.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div className="user-profile-card-name">{data.username}</div>
                {data.roleName && (
                  <span className="user-profile-card-role" style={{ color: data.roleColor || undefined }}>
                    {data.roleName}
                  </span>
                )}
              </div>
            </div>

            <div className="new-map-field-label" style={{ marginTop: 12 }}>
              Bu kişiyle paylaştığın haritalar
            </div>
            {data.sharedMaps.length === 0 ? (
              <p className="admin-hint">Henüz hiçbir haritanı bu kişiyle paylaşmamışsın.</p>
            ) : (
              <ul className="user-profile-card-map-list">
                {data.sharedMaps.map((m) => (
                  <li key={m.mapId}>
                    <span>{m.mapName}</span>
                    <span className="admin-hint">
                      {SHARE_STATUS_LABELS[m.status] || m.status}
                      {m.status === 'Accepted' && m.canView === false ? ' (duraklatıldı)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {shareableMaps.length > 0 && (
              <>
                <div className="new-map-field-label" style={{ marginTop: 12 }}>
                  Yeni bir harita daha paylaş
                </div>
                <div className="user-profile-card-invite-row">
                  <select
                    className="new-map-input"
                    value={pickedMapId}
                    onChange={(e) => setPickedMapId(e.target.value)}
                  >
                    <option value="">Harita seç…</option>
                    {shareableMaps.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="attribute-popup-confirm"
                    disabled={!pickedMapId}
                    onClick={() => {
                      onInvite(Number(pickedMapId), username);
                      setPickedMapId('');
                    }}
                  >
                    Davet Gönder
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <div className="new-map-popover-actions">
          <button type="button" className="attribute-popup-cancel" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

export default UserProfileCard;

import { useEffect, useState } from 'react';

// Hoca ödevi (Akıllı Ulaşım Modülü): "Durak Ekleme: Operatör için haritada 'Durak Ekle'
// (Point) aracı oluşturun. Durak ismi girilsin ve mevcut güzergahlar dropdown üzerinden
// seçilsin." — PoiFormPopup.jsx'in sade bir varyantı (sadece isim + güzergah).
//
// lockedRouteId: Güzergah Yönetimi panelindeki "Haritadan Ekle" akışından gelindiğinde
// (hoca ödevi: "Haritada seçilen bir nokta doğrudan güzergaha durak olarak eklenebilmelidir")
// dropdown hiç gösterilmez, durak doğrudan o güzergaha eklenir.
//
// allStops / getSuggestedIndex: kullanıcının kendi isteği — "haritadan durak eklerken tüm
// durakların sıralaması görünsün, anlık olarak direkt oradan sırasını ayarlayabilelim kaçıncı
// durak olacağını." MapPage'in coğrafi tahmini (getSuggestedIndex — noktanın hangi segmente en
// yakın olduğuna bakan hesap) başlangıç değeri olarak kullanılıyor, ama admin isterse bu
// öneriyi görüp aşağıdaki sıra listesinden farklı bir pozisyon seçebiliyor (ör. tahmin yanlış
// çıktıysa, ya da bilerek en başa/sona eklemek istiyorsa).
function StopFormPopup({ routes, lockedRouteId, allStops, getSuggestedIndex, onConfirm, onCancel }) {
  const [name, setName] = useState('');
  const [routeId, setRouteId] = useState(lockedRouteId || (routes[0]?.id ?? ''));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // 1-tabanlı: kullanıcıya "kaçıncı durak" olarak gösteriliyor, backend'e giderken 0-tabanlı
  // insertIndex'e çevriliyor (bkz. handleConfirm).
  const [position, setPosition] = useState(1);

  const lockedRoute = lockedRouteId ? routes.find((r) => r.id === lockedRouteId) : null;
  const finalRouteId = lockedRouteId || routeId;
  const siblings = (allStops || [])
    .filter((s) => s.routeId === finalRouteId && !s.isPaused)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Güzergah seçimi (kilitli değilse dropdown'dan) değişince önerilen sırayı yeniden hesapla —
  // her güzergahın kendi durak dizilimi farklı olduğu için önceki güzergahın önerisi anlamsız.
  // Güzergah seçimi değişince önerilen sırayı bir defaya mahsus hesaplayıp yazıyoruz —
  // döngüsel bir güncelleme değil, MapPage.jsx'teki AYNI eslint-disable deseni.
  useEffect(() => {
    if (!finalRouteId || typeof getSuggestedIndex !== 'function') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosition(1);
      return;
    }
    const suggested = getSuggestedIndex(finalRouteId);
    // getSuggestedIndex 0-tabanlı insertIndex döndürüyor (computeInsertIndexForNewStop ile
    // AYNI), null ise "2'den az durak var, sona ekle" demek.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition(suggested == null ? siblings.length + 1 : suggested + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalRouteId]);

  async function handleConfirm() {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('İsim boş olamaz.');
      return;
    }
    if (!finalRouteId) {
      setError('Bir güzergah seçmelisin.');
      return;
    }
    setSaving(true);
    const clampedPosition = Math.max(1, Math.min(Number(position) || 1, siblings.length + 1));
    // 0-tabanlı insertIndex'e çevir — confirmStopDraw (MapPage.jsx) bunu doğrudan reorder
    // uç noktasına gönderiyor.
    await onConfirm(trimmed, Number(finalRouteId), clampedPosition - 1);
  }

  return (
    <div className="attribute-popup-overlay">
      <div className="attribute-popup stop-form-popup">
        <div className="attribute-popup-title">🚏 Durak bilgileri</div>

        <label className="attribute-popup-label" htmlFor="stop-form-name">
          İsim
        </label>
        <input
          id="stop-form-name"
          className="attribute-popup-input"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          placeholder="Örn. Cumhuriyet Meydanı"
          autoFocus
        />

        <div className="attribute-popup-label">Güzergah</div>
        {lockedRoute ? (
          <div className="stop-form-locked-route">
            <span className="stop-form-route-dot" style={{ background: lockedRoute.color }} />
            {lockedRoute.name}
          </div>
        ) : (
          <select
            className="attribute-popup-select"
            value={routeId}
            onChange={(e) => setRouteId(e.target.value ? Number(e.target.value) : '')}
            aria-label="Durak eklenecek güzergah"
          >
            {routes.length === 0 && <option value="">Önce bir güzergah oluşturun</option>}
            {routes.map((route) => (
              <option key={route.id} value={route.id}>{route.name}</option>
            ))}
          </select>
        )}

        {finalRouteId && (
          <>
            <div className="attribute-popup-label" htmlFor="stop-form-position">
              Sıra (kaçıncı durak olacak)
            </div>
            <select
              id="stop-form-position"
              className="attribute-popup-select"
              value={position}
              onChange={(e) => setPosition(Number(e.target.value))}
              aria-label="Yeni durağın sıra numarası"
            >
              {Array.from({ length: siblings.length + 1 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}. sıra{n === siblings.length + 1 ? ' (en sona ekle)' : ''}</option>
              ))}
            </select>

            {/* Kullanıcının kendi isteği: "tüm durakların sıralaması görünsün" — yeni durağın
                nereye gireceği listede vurgulanarak gösteriliyor, admin karar vermeden önce
                bağlamı görsün diye. */}
            {siblings.length > 0 && (
              <ol className="stop-form-order-preview">
                {siblings.slice(0, position - 1).map((s, i) => (
                  <li key={s.id}>{i + 1}. {s.name}</li>
                ))}
                <li className="stop-form-order-preview-new">{position}. {name.trim() || '(yeni durak)'} ← burada eklenecek</li>
                {siblings.slice(position - 1).map((s, i) => (
                  <li key={s.id}>{position + i + 1}. {s.name}</li>
                ))}
              </ol>
            )}
          </>
        )}

        {error && <p className="admin-error">{error}</p>}

        <div className="attribute-popup-actions">
          <button type="button" className="attribute-popup-cancel" onClick={onCancel} disabled={saving}>
            Vazgeç
          </button>
          <button type="button" className="attribute-popup-confirm" onClick={handleConfirm} disabled={saving || routes.length === 0}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StopFormPopup;

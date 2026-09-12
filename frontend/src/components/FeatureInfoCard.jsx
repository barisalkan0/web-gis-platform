import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getCardPosition, setCardPosition, getCardCollapsed, setCardCollapsed } from '../auth';

// Haritada bir nokta/çizgi/alana (ya da geçici Envanter Analizi poligonuna) tıklayınca
// eskiden sadece "#12 seçili" yazan küçük bir çubuk açılıyordu — artık tip, konum
// (enlem/boylam ya da uzunluk/alan), kategori, eklenme tarihi gibi tüm bilgileri gösteren
// gerçek bir kart. rows/actions tamamen dışarıdan (MapPage) veriliyor ki hem normal
// çizimler hem geçici analiz poligonu için aynı bileşen kullanılabilsin.
//
// Şekil düzenleme modunda (VertexCoordinateEditor children olarak eklenince) kart çok yer
// kaplayabiliyor — bu yüzden başlık çubuğundan sürüklenebilir ve daraltılabilir yapıldı.
// MapPage her farklı obje seçildiğinde `key={item.key}` ile YENİDEN mount ediyor, bu yüzden
// daraltma durumu (collapsed) her yeni seçimde bilinçli olarak sıfırlanıyor. Sürüklenen
// KONUM (pos) ise kullanıcı isteğiyle farklı davranıyor: bu artık component'in kendi
// state'inde değil `auth.js`teki modül seviyesindeki bir değişkende tutuluyor — böylece
// yeniden mount olsa bile son bırakılan yerde açılıyor, sadece çıkış yapınca (clearAuth)
// varsayılana dönüyor.
function FeatureInfoCard({ title, color, rows, actions, onClose, children, narrowContent }) {
  // Varsayılan olarak DARALTILMIŞ açılıyor — kart aniden büyük/tam açık belirip
  // görünüşü bozmasın diye. Kart zaten alt kenardan (bottom) sabitlendiği için
  // genişleyince yukarı doğru büyüyor, daralınca aşağı doğru küçülüyor. AMA: pozisyonda
  // olduğu gibi (bkz. pos state'i) kullanıcı önceki seçimde kartı genişletmişse, düzenleme
  // modundayken başka bir noktaya tıklayınca yeni kart da aynı şekilde AÇIK gelsin istendi —
  // bu yüzden sabit `true` yerine auth.js'teki modül seviyesi değeri okunuyor.
  const [collapsed, setCollapsedState] = useState(() => getCardCollapsed());
  function setCollapsed(next) {
    setCollapsedState((cur) => {
      const value = typeof next === 'function' ? next(cur) : next;
      setCardCollapsed(value);
      return value;
    });
  }
  const [pos, setPos] = useState(() => getCardPosition()); // null = varsayılan (ortada, CSS ile) konum
  const cardRef = useRef(null);
  const dragRef = useRef(null);

  function handlePointerDown(e) {
    if (e.target.closest('button')) return; // kapat/daralt butonlarına tıklarken sürükleme başlamasın
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return;
    const { startX, startY, startLeft, startTop } = dragRef.current;
    const card = cardRef.current;
    const maxLeft = window.innerWidth - (card?.offsetWidth || 0) - 8;
    const maxTop = window.innerHeight - (card?.offsetHeight || 0) - safeBottomInset();
    const nextLeft = Math.min(Math.max(8, startLeft + (e.clientX - startX)), Math.max(8, maxLeft));
    const safeTop = safeTopInset();
    const nextTop = Math.min(Math.max(safeTop, startTop + (e.clientY - startY)), Math.max(safeTop, maxTop));
    const next = { left: nextLeft, top: nextTop };
    setPos(next);
    setCardPosition(next); // sonraki seçimde/yeniden mount'ta da aynı yerde açılsın
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  const style = pos ? { left: pos.left, top: pos.top, bottom: 'auto', transform: 'none' } : undefined;

  function safeBottomInset() {
    return window.innerWidth <= 780 ? 76 : 94;
  }

  function safeTopInset() {
    return window.innerWidth <= 780 ? 8 : 78;
  }

  const keepCardInViewport = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const safeTop = safeTopInset();
    const next = {
      left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - rect.width - 8)),
      top: Math.min(Math.max(safeTop, rect.top), Math.max(safeTop, window.innerHeight - rect.height - safeBottomInset())),
    };
    if (Math.abs(next.left - rect.left) > 0.5 || Math.abs(next.top - rect.top) > 0.5) {
      setPos(next);
      setCardPosition(next);
    }
  }, []);

  // Kullanıcının bildirdiği bug ("kart yarıya bölünüyor"), 2. tur: ilk düzeltme (children'ı
  // deps'ten çıkarmak) yetmedi çünkü asıl kök sebep BAŞKAYDI. keepCardInViewport çağrıldığı
  // an kartı CSS'in doğal "alt kenara sabit, içeriğe göre yukarı büyür" davranışından
  // (bkz. .feature-info-card { position:absolute; bottom:88px }) koparıp PİKSEL-SABİT
  // top/left'e kilitliyor (bkz. `style` — pos doluysa bottom:'auto' oluyor). Bu kilitlenme
  // BİR KERE olsa bile (ör. içerik ilk açıldığında biraz taşıyor gibi ölçüldüğü için),
  // sonrasında kart artık CSS'in "içerik küçülünce doğal olarak küçül" akışında DEĞİL —
  // sabit bir top'a pinlenmiş oluyor. Ama .feature-info-card zaten
  // max-height: calc(100svh - 176px) ile sınırlı ve bottom:88px'e sabit; bu ikisi birlikte
  // top'un HER ZAMAN güvenli bir aralıkta kalacağını MATEMATİKSEL olarak garanti ediyor
  // (top = 100svh - 88 - yükseklik ≥ 100svh - 88 - (100svh-176) = 88px) — yani normal
  // (hiç sürüklenmemiş) bir kart için bu kilitleme mekanizmasına HİÇ gerek yok, sadece risk
  // ekliyor. Artık SADECE kullanıcı kartı en az bir kez elle sürüklediyse (pos !== null,
  // artık piksel-sabit konumda yaşıyor) pencere küçülünce ekran dışına taşmasın diye
  // yeniden kenetliyoruz — varsayılan (sürüklenmemiş) kart tamamen CSS'e bırakılıyor.
  const hasChildren = Boolean(children);
  useLayoutEffect(() => {
    if (pos == null) return;
    keepCardInViewport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, hasChildren, keepCardInViewport]);

  useEffect(() => {
    window.addEventListener('resize', keepCardInViewport);
    return () => window.removeEventListener('resize', keepCardInViewport);
  }, [keepCardInViewport]);

  return (
    <div
      className={`feature-info-card${children ? ' feature-info-card-has-content' : ''}${children && narrowContent ? ' feature-info-card-narrow-content' : ''}`}
      style={style}
      ref={cardRef}
    >
      <div
        className="feature-info-card-header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Taşımak için sürükle"
      >
        <span className="feature-info-card-dot" style={{ background: color }} />
        <span className="feature-info-card-title">{title}</span>
        <button
          className="feature-info-card-collapse"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Genişlet' : 'Daralt'}
          aria-label={collapsed ? 'Bilgi kartını genişlet' : 'Bilgi kartını daralt'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        {onClose && (
          <button className="feature-info-card-close" onClick={onClose} title="Kapat" aria-label="Bilgi kartını kapat">
            ✕
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="feature-info-card-body">
          {rows.length > 0 && (
            <div className="feature-info-card-rows">
              {rows.map((row) => (
                <div key={row.label} className="feature-info-card-row">
                  <span className="feature-info-card-row-label">{row.label}</span>
                  <span className="feature-info-card-row-value">{row.value}</span>
                </div>
              ))}
            </div>
          )}

          {children && <div className="feature-info-card-content">{children}</div>}

          {actions.length > 0 && (
            <div className="feature-info-card-actions">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={`feature-info-card-action${action.variant ? ` feature-info-card-action-${action.variant}` : ''}`}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  title={action.title}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FeatureInfoCard;

import { useEffect, useRef, useState } from 'react';

// Faz 3.2 (kullanıcının kendi isteği, redesign): "Kişi veya rol ekle" tek arama kutusu
// kafa karıştırıcıydı — kullanıcı özellikle "gene artı olsun oradan kullanıcı adı
// yazabilsin, rollerde ise filtreleme olsun tüm roller görünsün orada" dedi. Yani:
//   - Kişiler: "+" butonuyla açılan, kullanıcı adı yazılan ayrı bir arama alanı.
//   - Roller: baştan TÜM roller listeli (arama beklemeden), üstte opsiyonel filtre kutusu.
function NewMapPopover({ pickableRoles, searchUsers, onCreate, onClose, creating }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]); // [{id, username, roleName, roleColor}]
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');

  // Kullanıcının kendi isteği (harita şeridi polish turu): "Kişiler ve roller kısmı Paylaş
  // isimli bir bölümde olsun açıp kapanabilsin otomatik açık olsun" — eskiden bu iki blok
  // hep açık, ayrı ayrı duruyordu; artık tek bir katlanabilir "🔗 Paylaş" başlığı altında,
  // varsayılan AÇIK (kullanıcının "otomatik açık olsun" isteği).
  const [shareSectionOpen, setShareSectionOpen] = useState(true);

  // Kişi ekleme "+" ile açılıp kapanan ayrı bir alt-durum — roller bölümünden bağımsız.
  const [addingPerson, setAddingPerson] = useState(false);
  const [personQuery, setPersonQuery] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const nameInputRef = useRef(null);
  const personInputRef = useRef(null);
  const searchTimerRef = useRef(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (addingPerson) personInputRef.current?.focus();
  }, [addingPerson]);

  // Kullanıcı her harf yazdıkça canlı filtrele — backend'i her tuşta yormamak için 200ms
  // debounce. Tüm setState çağrıları setTimeout callback'inin İÇİNDE (effect body'sinde
  // SENKRON değil) — React'in "effect içinde senkron setState cascading render'a yol açar"
  // uyarısını tetiklememek için (bu projede daha önce de karşılaşılmış, yerleşik bir desen).
  useEffect(() => {
    if (!addingPerson) return undefined;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const trimmed = personQuery.trim();
    searchTimerRef.current = setTimeout(async () => {
      if (!trimmed) {
        setUserResults([]);
        return;
      }
      setSearching(true);
      const results = await searchUsers(trimmed);
      setUserResults(results || []);
      setSearching(false);
    }, 200);
    return () => searchTimerRef.current && clearTimeout(searchTimerRef.current);
  }, [personQuery, addingPerson, searchUsers]);

  const pickedUserIds = new Set(selectedUsers.map((u) => u.id));
  const filteredUserResults = userResults.filter((u) => !pickedUserIds.has(u.id));

  const filteredRoles = roleFilter.trim()
    ? pickableRoles.filter((r) => r.name.toLowerCase().includes(roleFilter.trim().toLowerCase()))
    : pickableRoles;

  function pickUser(user) {
    setSelectedUsers((cur) => [...cur, user]);
    setPersonQuery('');
    setUserResults([]);
    setAddingPerson(false);
  }

  function removeUser(id) {
    setSelectedUsers((cur) => cur.filter((u) => u.id !== id));
  }

  function toggleRole(roleId) {
    setSelectedRoleIds((cur) => (cur.includes(roleId) ? cur.filter((r) => r !== roleId) : [...cur, roleId]));
  }

  function handleSubmit() {
    if (!name.trim() || creating) return;
    onCreate({
      name: name.trim(),
      description: description.trim() || null,
      users: selectedUsers,
      roleIds: selectedRoleIds,
      // Görev (kullanıcının kendi isteği: "harita üzerinden sınırlama belirleyebileceğim"):
      // roleIds sadece davet POST'u için yeterliydi (id yeter), ama oluşturma sonrası
      // "kısıtlama ekle" adımının rol adı/rengini GÖSTEREBİLMESİ için TAM rol nesnesi de
      // lazım — ayrı bir API çağrısı yapmamak için burada, zaten elimizdeki pickableRoles'tan.
      roles: selectedRoleIds.map((id) => pickableRoles.find((r) => r.id === id)).filter(Boolean),
    });
  }

  return (
    <div className="new-map-popover" onClick={(e) => e.stopPropagation()}>
      <div className="new-map-popover-title">🗺️ Yeni Harita</div>

      <label className="new-map-field-label" htmlFor="new-map-name">
        Ad
      </label>
      <input
        id="new-map-name"
        ref={nameInputRef}
        className="new-map-input"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="ör. Saha Ekibi Haritası"
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
      />

      <label className="new-map-field-label" htmlFor="new-map-desc">
        Açıklama <span className="new-map-field-optional">(opsiyonel)</span>
      </label>
      <textarea
        id="new-map-desc"
        className="new-map-textarea"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Bu harita ne için kullanılıyor?"
        rows={2}
      />

      {/* Kullanıcının kendi isteği: Kişiler+Roller artık katlanabilir "Paylaş" bölümünde. */}
      <button
        type="button"
        className="new-map-share-section-toggle"
        onClick={() => setShareSectionOpen((v) => !v)}
      >
        <span>🔗 Paylaş <span className="new-map-field-optional">(opsiyonel)</span></span>
        <span className="new-map-share-section-summary">
          {selectedUsers.length > 0 && `${selectedUsers.length} kişi`}
          {selectedUsers.length > 0 && selectedRoleIds.length > 0 && ', '}
          {selectedRoleIds.length > 0 && `${selectedRoleIds.length} rol`}
          <span className={`new-map-share-section-chevron${shareSectionOpen ? ' new-map-share-section-chevron-open' : ''}`}>▾</span>
        </span>
      </button>

      {shareSectionOpen && (
        <div className="new-map-share-section-body">
      {/* Kişiler — "+" ile açılan ayrı arama alanı. */}
      <div className="new-map-section-head">
        <span className="new-map-field-label" style={{ marginTop: 0 }}>
          Kişiler <span className="new-map-field-optional">(opsiyonel)</span>
        </span>
        <button
          type="button"
          className="new-map-add-btn"
          onClick={() => setAddingPerson((v) => !v)}
          aria-label="Kişi ekle"
          title="Kişi ekle"
        >
          {addingPerson ? '×' : '+'}
        </button>
      </div>

      {addingPerson && (
        <div className="new-map-search-wrap">
          <input
            ref={personInputRef}
            className="new-map-input"
            type="text"
            value={personQuery}
            onChange={(e) => setPersonQuery(e.target.value)}
            placeholder="Kullanıcı adı yaz…"
            onKeyDown={(e) => e.key === 'Escape' && setAddingPerson(false)}
          />
          {personQuery.trim() && (
            <div className="new-map-search-dropdown">
              {searching && <div className="new-map-search-empty">Aranıyor…</div>}
              {!searching && filteredUserResults.length === 0 && (
                <div className="new-map-search-empty">Sonuç yok.</div>
              )}
              {!searching &&
                filteredUserResults.map((u) => (
                  <button type="button" key={`user-${u.id}`} className="new-map-search-item" onClick={() => pickUser(u)}>
                    👤 {u.username}
                    {u.roleName && (
                      <span className="new-map-search-item-hint" style={{ color: u.roleColor || undefined }}>
                        {u.roleName}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {selectedUsers.length > 0 && (
        <div className="new-map-chips">
          {selectedUsers.map((u) => (
            <span key={`chip-user-${u.id}`} className="new-map-chip">
              👤 {u.username}
              <button type="button" onClick={() => removeUser(u.id)} aria-label="Kaldır">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Roller — baştan tüm roller listeli, üstte opsiyonel filtre. */}
      <label className="new-map-field-label" htmlFor="new-map-role-filter">
        Roller <span className="new-map-field-optional">(opsiyonel — rol seçilince o roldeki herkes erişir)</span>
      </label>
      {pickableRoles.length > 4 && (
        <input
          id="new-map-role-filter"
          className="new-map-input"
          type="text"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          placeholder="Rol filtrele…"
        />
      )}
      <div className="new-map-role-list">
        {filteredRoles.length === 0 && <div className="new-map-search-empty">Rol yok.</div>}
        {filteredRoles.map((r) => {
          const active = selectedRoleIds.includes(r.id);
          return (
            <button
              type="button"
              key={`role-${r.id}`}
              className={`new-map-role-row${active ? ' new-map-role-row-active' : ''}`}
              onClick={() => toggleRole(r.id)}
            >
              <span className="new-map-role-check">{active ? '✓' : ''}</span>
              <span className="new-map-role-dot" style={{ background: r.color }} />
              <span className="new-map-role-row-name">{r.name}</span>
              <span className="new-map-search-item-hint">{r.userCount} kişi</span>
            </button>
          );
        })}
      </div>
        </div>
      )}

      <div className="new-map-popover-actions">
        <button type="button" className="attribute-popup-cancel" onClick={onClose}>
          Vazgeç
        </button>
        <button type="button" className="attribute-popup-confirm" disabled={!name.trim() || creating} onClick={handleSubmit}>
          {creating ? 'Oluşturuluyor…' : 'Oluştur'}
        </button>
      </div>
    </div>
  );
}

export default NewMapPopover;

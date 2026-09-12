import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { categoryColorForId } from '../poiCategoryUtils';

// Kullanıcının kendi isteği: "ana kategoriler listelensin başta, üzerine tıklayınca seçsin,
// küçük üçgenden ise açılabilir şey olsun açınca alt şeyleri de olsun. bide güzel görünsün
// hepsinin kendine özgü arka planı ve simgeleri olsun." — options zaten (bkz. poiCategoryUtils.
// buildPoiCategoryOptions) DFS sırasıyla + depth bilgisiyle geliyor; burada depth'e göre bir
// stack algoritmasıyla gerçek bir ağaca geri çeviriyoruz (parentId flat listede yok, ama DFS
// sırası + depth tek başına ağacı kaybetmeden yeniden kurmaya yetiyor).
function buildCategoryTree(options) {
  const roots = [];
  const stack = []; // { node, depth }
  options.forEach((option) => {
    const node = { ...option, children: [] };
    while (stack.length && stack[stack.length - 1].depth >= option.depth) stack.pop();
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }
    stack.push({ node, depth: option.depth });
  });
  return roots;
}

// Sadece klavye ile gezinme (ArrowUp/Down/Enter) için — o an EKRANDA GÖRÜNEN satırların düz
// bir listesi (kapalı bir dalın çocukları listeye hiç girmiyor).
function flattenVisible(nodes, expandedIds, depth = 0, out = []) {
  nodes.forEach((node) => {
    out.push({ ...node, depth });
    if (node.children.length > 0 && expandedIds.has(node.id)) {
      flattenVisible(node.children, expandedIds, depth + 1, out);
    }
  });
  return out;
}

function ancestorChainIds(options, targetId) {
  // Seçili kategorinin üst kategorilerini bulup otomatik açık göstermek için — depth'e göre
  // geriye doğru tarayarak targetId'ye kadarki "üstteki daha düşük depth'li son görülenler"i
  // topluyoruz (buildCategoryTree'nin dayandığı AYNI stack mantığı, ters yönde).
  const index = options.findIndex((o) => String(o.id) === String(targetId));
  if (index === -1) return [];
  const chain = [];
  let currentDepth = options[index].depth;
  for (let i = index - 1; i >= 0 && currentDepth > 0; i--) {
    if (options[i].depth < currentDepth) {
      chain.push(options[i].id);
      currentDepth = options[i].depth;
    }
  }
  return chain;
}

function CategoryIcon({ option }) {
  const color = categoryColorForId(option.id);
  return (
    <span className="category-tree-icon" style={{ background: color }}>
      {option.icon || '📍'}
    </span>
  );
}

function CategoryRow({ option, depth, hasChildren, expanded, isSelected, isActive, onToggleExpand, onSelect }) {
  // Kullanıcının kendi isteği: "kriter olarak bişeyi seçince başka kriter seçme ekranında yok
  // olmasın sadece deaktif olsun silik görünsün" — disabled bir kategori LİSTEDEN ÇIKARILMIYOR,
  // sadece tıklanamıyor ve solgun görünüyor. Alt kategorileri açıp gezmek (caret) yine de
  // ÇALIŞIR — sadece SEÇMEK engelli, "bu dalda ne var" görmeyi engellemiyoruz.
  const disabled = !!option.disabled;
  return (
    <div className="category-tree-row" style={{ paddingLeft: 4 + depth * 18 }}>
      {hasChildren ? (
        <button
          type="button"
          className="category-tree-caret-btn"
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleExpand}
          aria-label={expanded ? `${option.name} — daralt` : `${option.name} — genişlet`}
        >
          <span className={`category-tree-caret${expanded ? ' is-open' : ''}`}>▶</span>
        </button>
      ) : (
        <span className="category-tree-caret-spacer" />
      )}
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        aria-disabled={disabled}
        disabled={disabled}
        title={disabled ? 'Bu kategori başka bir kriterde zaten seçili' : undefined}
        className={`category-tree-select${isActive ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={disabled ? undefined : onSelect}
      >
        <CategoryIcon option={option} />
        <span className="category-tree-labels">
          <span className="category-tree-name">{option.name}</span>
          {option.description && <span className="category-tree-desc">{option.description}</span>}
        </span>
      </button>
    </div>
  );
}

function CategoryTreeNode({ node, depth, expandedIds, toggleExpand, value, activeId, onSelect }) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  return (
    <>
      <CategoryRow
        option={node}
        depth={depth}
        hasChildren={hasChildren}
        expanded={expanded}
        isSelected={String(node.id) === String(value)}
        isActive={String(node.id) === String(activeId)}
        onToggleExpand={() => toggleExpand(node.id)}
        onSelect={() => onSelect(node)}
      />
      {hasChildren && expanded && node.children.map((child) => (
        <CategoryTreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          value={value}
          activeId={activeId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

// Kullanıcının kendi isteği: "kriter seçerken minicik yer kalıyor mouse ile aşağı kaydırıyorum.
// daha efektif daha kullanıcı dostu olsun ya. belki biraz daha sağda başka kart olarak
// açılabilir... net şekilde tek seferde tüm ana şeyleri görebileyim." — Konum Analizi panelinin
// KENDİSİ dar (300px) ve dikey scroll'lu olduğu için, menü panelin İÇİNDE absolute konumlanırsa
// panelin overflow-y:auto'su onu kırpıyor (bkz. .location-analysis-panel { overflow-y: auto }).
// Bu yüzden `floating` prop'u AÇIKKEN menü artık input'un DOM ağacındaki yerine değil,
// viewport'a göre `position: fixed` ile (input'un o anki ekran konumundan hesaplanan) panelin
// SAĞINA (veya sığmıyorsa SOLUNA) açılıyor — kendi overflow'undan tamamen bağımsız, çok daha
// büyük bir kart. Sadece Konum Analizi kriter satırlarında (floating prop ile) devreye giriyor;
// PoiFormPopup/AdminPage'deki eski küçük-panel-içi davranış DEĞİŞMİYOR (floating=false varsayılan).
// Kullanıcının kendi isteği (2. tur): "ekranın altına taşmamalı veya alt nav bar ile
// çakışmamalı" — haritanın altındaki çizim araç çubuğu (.draw-toolbar: bottom:24px, ~56px
// yükseklik) ve tarayıcı kenarı için altta sabit bir pay bırakıyoruz. Kart ÖNCE input'un
// hizasında açılmayı deniyor; sığmıyorsa yukarı kaydırılıyor; hâlâ sığmıyorsa yüksekliği
// kısaltılıp kendi içinde kaydırılabilir kalıyor. Yani kart hiçbir durumda bu güvenli alanın
// dışına taşamıyor.
const FLOATING_MENU_WIDTH = 340;
const FLOATING_MENU_GAP = 10;
const FLOATING_MENU_MARGIN = 12;
const FLOATING_MENU_BOTTOM_RESERVE = 96; // alt araç çubuğu + nefes payı
const FLOATING_MENU_MIN_HEIGHT = 200;

function computeFloatingMenuPosition(inputEl) {
  const rect = inputEl.getBoundingClientRect();
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const topLimit = FLOATING_MENU_MARGIN;
  const bottomLimit = viewportH - FLOATING_MENU_BOTTOM_RESERVE;
  const available = Math.max(FLOATING_MENU_MIN_HEIGHT, bottomLimit - topLimit);

  let left = rect.right + FLOATING_MENU_GAP;
  if (left + FLOATING_MENU_WIDTH > viewportW - FLOATING_MENU_MARGIN) {
    left = rect.left - FLOATING_MENU_WIDTH - FLOATING_MENU_GAP;
  }
  left = Math.max(FLOATING_MENU_MARGIN, Math.min(left, viewportW - FLOATING_MENU_WIDTH - FLOATING_MENU_MARGIN));

  // İstenen yükseklik: güvenli alana sığdığı kadarı (en fazla 520px).
  const maxHeight = Math.min(520, available);
  // Kart input'un hizasında başlasın; ama alt sınırı aşıyorsa yukarı çekilsin.
  let top = rect.top;
  if (top + maxHeight > bottomLimit) top = bottomLimit - maxHeight;
  top = Math.max(topLimit, top);

  return { top, left, width: FLOATING_MENU_WIDTH, maxHeight };
}

function SearchableCategorySelect({ options, value, onChange, emptyLabel = 'Kategorisiz', ariaLabel = 'Kategori seç', floating = false }) {
  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);
  const selected = options.find((option) => String(option.id) === String(value));
  const [query, setQuery] = useState(selected?.label || '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  // Başlangıçta zaten seçili bir kategori varsa üst kategorilerini otomatik açık göster —
  // kullanıcı panele geri döndüğünde seçtiği alt kategoriyi görmek için tekrar tıklamasın diye.
  // NOT: bu bir effect DEĞİL — value'nun bu bileşenin DIŞINDAN değişebileceği tek an ilk mount
  // (parent zaten seçili bir kriteri düzenlemeye açtığında); sonraki tüm değişiklikler zaten
  // choose() içinden geliyor, orada da AYNI genişletme ELLE yapılıyor (bkz. aşağısı) — bu yüzden
  // "value değişince tekrar hesapla" reaktif bir effect'e hiç gerek yok.
  const [expandedIds, setExpandedIds] = useState(() => new Set(ancestorChainIds(options, value)));

  function toggleExpand(id) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const term = query.trim().toLocaleLowerCase('tr');
  const isSearching = !!term && selected?.label !== query;

  // Arama YOKKEN: ana kategorilerden başlayan, tıklayınca genişleyen bir ağaç (kullanıcının
  // isteği). Arama VARKEN: eski düz, eşleşen-her-derinlikten liste — bir arama sonucunu bulmak
  // için ebeveynleri tek tek açmaya gerek kalmasın diye.
  const tree = useMemo(() => buildCategoryTree(options), [options]);
  const flatMatches = useMemo(() => {
    if (!isSearching) return [];
    return options.filter((option) => `${option.name} ${option.description || ''}`.toLocaleLowerCase('tr').includes(term));
  }, [options, term, isSearching]);

  // Klavye gezinmesi (Yukarı/Aşağı/Enter) için ekranda GÖRÜNEN satırların düz listesi — kapalı
  // dalların çocukları bu listeye hiç girmiyor, arama modundaysa zaten flatMatches kullanılıyor.
  // NOT: useMemo koşulsuz çağrılıyor (React Hooks kuralı) — hangisinin kullanılacağı SEÇİMİ
  // (isSearching) sonradan yapılıyor, hook'un kendisi değil.
  const visibleTreeList = useMemo(() => flattenVisible(tree, expandedIds), [tree, expandedIds]);
  const visibleList = isSearching ? flatMatches : visibleTreeList;

  function choose(option) {
    if (option?.disabled) return; // Enter ile de deaktif bir satır seçilemesin (bkz. CategoryRow'daki disabled)
    onChange(option?.id || '');
    setQuery(option?.label || option?.name || '');
    setOpen(false);
    // Seçilen bir alt kategoriyse üst kategorilerini de açık bırak — panele geri dönüldüğünde
    // seçim ağaçta gömülü kalmasın, görünür olsun.
    if (option) {
      const chain = ancestorChainIds(options, option.id);
      if (chain.length > 0) {
        setExpandedIds((current) => {
          const next = new Set(current);
          chain.forEach((id) => next.add(id));
          return next;
        });
      }
    }
  }

  // floating açıkken menünün konumu input'un ekrandaki gerçek yerine göre hesaplanıyor —
  // panel kayarsa (scroll) veya pencere boyutu değişirse menü input'un yanında kalmaya devam
  // etsin diye `open` süresince dinleniyor. `scroll` olayı kapsayan (capture) modda dinleniyor
  // çünkü .location-analysis-panel'in kendi iç scroll'u window'a doğal olarak "bubble" etmiyor.
  useEffect(() => {
    if (!floating || !open || !inputRef.current) {
      setMenuPos(null);
      return undefined;
    }
    const update = () => setMenuPos(computeFloatingMenuPosition(inputRef.current));
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [floating, open]);

  return (
    <div className="searchable-category" ref={rootRef}>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={open ? query : selected?.label || ''}
        placeholder={emptyLabel}
        onFocus={() => { setQuery(selected?.label || ''); setOpen(true); setActiveIndex(0); }}
        onClick={(event) => event.currentTarget.select()}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); if (!event.target.value) onChange(''); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(visibleList.length, index + 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
          if (event.key === 'Enter') { event.preventDefault(); choose(activeIndex === 0 ? null : visibleList[activeIndex - 1]); }
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      <span className="searchable-category-icon" aria-hidden="true">⌕</span>
      {open && (
        <div
          className={`searchable-category-menu category-tree-menu${floating ? ' category-tree-menu-floating' : ''}`}
          id={listId}
          role="listbox"
          style={floating && menuPos ? {
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            right: 'auto',
            width: menuPos.width,
            maxHeight: menuPos.maxHeight,
          } : undefined}
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={`category-tree-clear${activeIndex === 0 ? ' is-active' : ''}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(null)}
          >
            {emptyLabel}
          </button>
          {isSearching ? (
            flatMatches.length > 0 ? (
              flatMatches.map((option, index) => (
                <CategoryRow
                  key={option.id}
                  option={option}
                  depth={0}
                  hasChildren={false}
                  expanded={false}
                  isSelected={String(option.id) === String(value)}
                  isActive={activeIndex === index + 1}
                  onToggleExpand={() => {}}
                  onSelect={() => choose(option)}
                />
              ))
            ) : (
              <p className="category-tree-empty">Aramayla eşleşen kategori yok.</p>
            )
          ) : (
            tree.map((node) => (
              <CategoryTreeNode
                key={node.id}
                node={node}
                depth={0}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                value={value}
                activeId={visibleList[activeIndex - 1]?.id}
                onSelect={choose}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default SearchableCategorySelect;

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { roleOptionStyle } from '../colorUtils';

// Native <select> açılır listesi tarayıcı/işletim sistemi temasını kullanıyor — koyu tema
// arayüzde beyaz/parlak bir kutu olarak açılıyordu, uygulamanın geri kalanıyla uyumsuz
// duruyordu (bkz. admin panel ekran görüntüleri). Bu, kendi CSS'imizle tam kontrol
// edebildiğimiz bir buton + liste. Liste document.body'ye portal ile basılıyor ki
// `.admin-table-wrap`'in `overflow-x: auto`'su (bu da örtük olarak overflow-y'yi de
// auto yapar) listeyi kesmesin — tabloya gömülü olsaydı satır kaydırma alanının
// dışına taşan kısmı görünmezdi.
function SelectMenu({ value, options, onChange, triggerClassName = '', triggerStyle, triggerLabel }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  function openMenu() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (listRef.current?.contains(e.target)) return;
      setOpen(false);
    }

    function reposition() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setRect(r);
    }

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`select-menu-trigger ${triggerClassName}`}
        style={triggerStyle}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
      >
        <span className="select-menu-trigger-label">{triggerLabel ?? (selected ? selected.label : '')}</span>
        <span className="select-menu-caret">▾</span>
      </button>
      {open &&
        rect &&
        createPortal(
          <ul
            ref={listRef}
            className="select-menu-list"
            style={{ top: rect.bottom + 4, left: rect.left, minWidth: rect.width }}
            onClick={(e) => e.stopPropagation()}
          >
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  className={`select-menu-option${String(o.value) === String(value) ? ' select-menu-option-active' : ''}`}
                  style={o.color ? roleOptionStyle(o.color) : undefined}
                  aria-current={String(o.value) === String(value) ? 'true' : undefined}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.color && <span className="select-menu-color-dot" style={{ backgroundColor: o.color }} aria-hidden="true" />}
                  <span>{o.label}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  );
}

export default SelectMenu;

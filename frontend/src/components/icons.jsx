// Emoji yerine gerçek ikon istenen birkaç yer için küçük, bağımlılıksız inline SVG'ler.
// Herhangi bir ikon paketine (lucide-react vb.) ihtiyaç duymuyor.

// Material Design "logout" ikonu — kapıdan çıkan ok.
export function LogoutIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </svg>
  );
}

// Çizim araç çubuğu ikonları — "gerçekten çizilmiş gibi" istendiği için her ikon
// kendi geometri tipini taklit ediyor (nokta = dolu daire, çizgi = uç noktalı çizgi,
// alan = gerçek bir beşgen, envanter analizi = büyüteçle taranan bir şekil).
// Hepsi `color` prop'u alıyor ki mevcut draw-button-dot renk mantığı (tip rengi /
// seçiliyken beyaz) aynen korunsun.

export function PointToolIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5" fill={color} />
    </svg>
  );
}

export function LineToolIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <line x1="3" y1="13" x2="13" y2="3" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="3" cy="13" r="1.8" fill={color} />
      <circle cx="13" cy="3" r="1.8" fill={color} />
    </svg>
  );
}

export function PolygonToolIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <polygon
        points="8,1.5 14.5,6.5 12,13.5 4,13.5 1.5,6.5"
        fill={color}
        fillOpacity="0.28"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Envanter analizi: büyüteç + içinde taranan küçük bir şekil.
export function AnalysisToolIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke={color} strokeWidth="1.6" />
      <polygon
        points="6.5,4 8.6,6 7.8,8.6 5.2,8.6 4.4,6"
        fill={color}
        fillOpacity="0.35"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <line x1="9.8" y1="9.8" x2="14" y2="14" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// Sol üstte "geri al / ileri al" butonları için (bkz. MapPage undo/redo).
export function UndoIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
    </svg>
  );
}

export function RedoIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.06-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z" />
    </svg>
  );
}

// Faz 3.1 (kullanıcının kendi isteği: "harita ayarları şeyi olsun"): her harita sekmesinin
// yanındaki dişli — tıklayınca o haritaya özel açılır/kapanır ayarlar paneli (Sil, Paylaş,
// paylaşılan kişiler) açılıyor. bkz. MapPage.jsx map-tab-settings-btn.
export function GearIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.66 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.05.3-.08.63-.08.94s.02.64.07.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.4.32.6.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.48 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.01-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
    </svg>
  );
}

// Faz 3.1: "davetler mesaj simgesi gibi görünsün, yanıp sönsün" — Benimle Paylaşılanlar
// butonunun ikonu. Bekleyen (Pending) davet varsa MapPage bu ikona 'map-tabs-blink' class'ı
// ekliyor (CSS animasyonu App.css'te).
export function MessageIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

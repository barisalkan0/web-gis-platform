import { useEffect, useRef } from 'react';

// Fareyi yay/sürtünme fiziğiyle takip eden bir jet uçağı çizen canvas efekti.
// Kaynak: kullanıcının "derin-website" projesindeki PlaneTrail.jsx, buraya taşındı.
const ACCENT = { r: 79, g: 195, b: 247 };
const TRAIL_MAX = 90;
const FOLLOW_FORCE = 0.028;
const DAMPING = 0.35;
const SHOCK_TRIGGER_SPEED = 6;
const SHOCK_DURATION = 90;

function drawPlane(ctx, x, y, angle, scale = 16, onLight = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Kullanıcının kendi isteği (3 Eylül): "imleci takip eden uçak var uçak net görünsün yani
  // en azından." — eskiden gövde neredeyse şeffaftı (fill 0.12) ve 1px çizgiyle çiziliyordu,
  // açık zeminde kaybolup gidiyordu. Artık: dolu gövde, beyaz kontur ve arkasında hafif bir
  // parıltı (shadow) var; hem koyu tanıtım panelinde hem beyaz form panelinde net okunuyor.
  // Açık zeminde beyaz kontur kaybolduğu için koyu lacivert kontura geçiyoruz (bkz.
  // isOnLightBackground) — uçak her iki panelde de net.
  ctx.shadowColor = onLight ? 'rgba(30,64,175,0.45)' : `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},0.85)`;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = onLight ? 'rgba(30,58,138,0.9)' : 'rgba(255,255,255,0.95)';
  ctx.fillStyle = onLight ? 'rgba(37,99,235,0.95)' : `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},0.95)`;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const s = scale;

  ctx.beginPath();
  ctx.moveTo(s * 1.3, 0);
  ctx.lineTo(s * 0.1, -s * 0.14);
  ctx.lineTo(-s * 0.8, -s * 0.12);
  ctx.lineTo(-s * 1.05, 0);
  ctx.lineTo(-s * 0.8, s * 0.12);
  ctx.lineTo(s * 0.1, s * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s * 0.2, 0);
  ctx.lineTo(-s * 0.3, -s * 1.0);
  ctx.lineTo(-s * 0.65, -s * 1.0);
  ctx.lineTo(-s * 0.55, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s * 0.2, 0);
  ctx.lineTo(-s * 0.3, s * 1.0);
  ctx.lineTo(-s * 0.65, s * 1.0);
  ctx.lineTo(-s * 0.55, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-s * 0.62, 0);
  ctx.lineTo(-s * 0.88, -s * 0.42);
  ctx.lineTo(-s * 1.05, -s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-s * 0.62, 0);
  ctx.lineTo(-s * 0.88, s * 0.42);
  ctx.lineTo(-s * 1.05, s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Motor alevi/parıltısı — gövdeden ayrı, gölge kapalıyken çiziliyor ki bulanıklaşmasın.
  ctx.shadowBlur = 0;
  const grd = ctx.createRadialGradient(-s * 1.1, 0, 0, -s * 1.1, 0, s * 0.5);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},0.65)`);
  grd.addColorStop(1, `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},0)`);
  ctx.beginPath();
  ctx.arc(-s * 1.1, 0, s * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  ctx.restore();
}

// Kullanıcının kendi isteği (3 Eylül): "beyaz kısımda uçağın ses hızını aşıncaki efekti
// görünmüyor gri olduğu için" — şok dalgası BEYAZ çiziliyordu, koyu tanıtım panelinde harika
// görünüyor ama beyaz form panelinde tamamen kayboluyordu. Artık uçağın ekranın hangi
// yarısında olduğuna bakıp (koyu panel solda, form paneli sağda) şok dalgasının ve gövde
// konturunun rengini ona göre seçiyoruz.
function isOnLightBackground(x) {
  const visual = document.querySelector('.auth-visual');
  if (!visual) return true; // panel yoksa (ör. mobil) sayfa beyaz kabul edilir
  const rect = visual.getBoundingClientRect();
  if (rect.width === 0) return true;
  return x > rect.right;
}

function drawShock(ctx, x, y, angle, life, onLight) {
  if (life <= 0) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const t = life;
  const opacity = (0.1 + t * 0.26) * (onLight ? 2.6 : 1);
  const wingPull = 14 + t * 8;
  const tailPull = 26 + t * 10;
  const reach = 26 + t * 10;

  const shockRgb = onLight ? '30,64,175' : '255,255,255';
  ctx.strokeStyle = `rgba(${shockRgb},${opacity})`;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.bezierCurveTo(1, -40, -wingPull, -30, -tailPull, -16);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.bezierCurveTo(1, 40, -wingPull, 30, -tailPull, 16);
  ctx.stroke();

  ctx.strokeStyle = onLight ? `rgba(79,195,247,${opacity * 1.6})` : `rgba(0,0,0,${opacity * 2})`;
  ctx.lineWidth = 0.9;

  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.bezierCurveTo(7, -3, -wingPull + 4, -7, -tailPull + 4, -11);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.bezierCurveTo(7, 3, -wingPull + 4, 7, -tailPull + 4, 11);
  ctx.stroke();

  const grd = ctx.createRadialGradient(2, 0, 0, -100, 0, reach);
  grd.addColorStop(0, `rgba(${shockRgb},${opacity * 0.16})`);
  grd.addColorStop(0.4, `rgba(${shockRgb},${opacity * 0.4})`);
  grd.addColorStop(1, `rgba(${shockRgb},0)`);

  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.bezierCurveTo(6, -2, -wingPull, -12, -tailPull, -18);
  ctx.bezierCurveTo(-tailPull + 2, -8, -tailPull + 2, 8, -tailPull, 16);
  ctx.bezierCurveTo(6, 2, -wingPull, 12, -tailPull, 18);
  ctx.closePath();
  ctx.fillStyle = grd;
  ctx.fill();

  ctx.restore();
}

export default function PlaneCursor() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Uçak tüm sayfada (hem koyu tanıtım panelinde hem beyaz form panelinde) gezinsin
    // diye canvas'ı tüm pencereye (window) göre boyutlandırıp konumluyoruz — tek bir
    // panele değil, tüm sayfaya "fixed" olarak yerleşiyor (bkz. .plane-cursor-canvas CSS).
    // Retina/HiDPI netliği: canvas'ın piksel tamponunu devicePixelRatio ile büyütüp çizim
    // ölçeğini geri küçültüyoruz. Bu yapılmazsa uçak yüksek DPI ekranlarda (kullanıcının
    // "uçak net görünsün" şikayetinin asıl teknik sebebi) bulanık çiziliyordu.
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * ratio);
      canvas.height = Math.floor(window.innerHeight * ratio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // NOT: koordinatlar CSS pikselinde (fare olayları da öyle) — canvas.width artık cihaz
    // pikseli olduğu için buraya window boyutlarını kullanıyoruz.
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let planeX = mouseX;
    let planeY = mouseY;
    let velX = 0;
    let velY = 0;
    let angle = 0;
    let speed = 0;
    let shockFrames = 0;
    const trail = [];

    const onMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', onMove);

    let animId;

    const tick = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const dx = mouseX - planeX;
      const dy = mouseY - planeY;

      velX += dx * FOLLOW_FORCE;
      velY += dy * FOLLOW_FORCE;
      velX *= DAMPING;
      velY *= DAMPING;

      planeX += velX;
      planeY += velY;

      speed = Math.sqrt(velX * velX + velY * velY);

      if (speed > 0.3) {
        angle = Math.atan2(velY, velX);
      }
      if (speed > SHOCK_TRIGGER_SPEED) {
        shockFrames = SHOCK_DURATION;
      } else if (shockFrames > 0) {
        shockFrames--;
      }

      if (speed > 2) {
        const count = speed > 20 ? 3 : speed > 8 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const ex = planeX - Math.cos(angle) * 14 + (Math.random() - 0.5) * 3;
          const ey = planeY - Math.sin(angle) * 14 + (Math.random() - 0.5) * 3;
          trail.push({ x: ex, y: ey, age: 0, size: Math.random() * 2.2 + 0.6 });
        }
      }

      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        p.age++;
        if (p.age > TRAIL_MAX) {
          trail.splice(i, 1);
          continue;
        }
        const life = 1 - p.age / TRAIL_MAX;
        const opacity = life * life * 0.65;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * life, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${opacity})`;
        ctx.fill();
      }

      if (trail.length > 6) {
        ctx.beginPath();
        ctx.moveTo(trail[trail.length - 1].x, trail[trail.length - 1].y);
        const from = Math.max(0, trail.length - 20);
        for (let i = trail.length - 2; i >= from; i--) {
          ctx.lineTo(trail[i].x, trail[i].y);
        }
        const lineOpacity = Math.min(speed / 60, 0.35);
        ctx.strokeStyle = `rgba(${ACCENT.r},${ACCENT.g},${ACCENT.b},${lineOpacity})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      const onLight = isOnLightBackground(planeX);
      if (shockFrames > 0) {
        drawShock(ctx, planeX, planeY, angle, shockFrames / SHOCK_DURATION, onLight);
      }

      drawPlane(ctx, planeX, planeY, angle, 16, onLight);

      animId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="plane-cursor-canvas" />;
}

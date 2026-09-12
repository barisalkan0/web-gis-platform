import { useEffect, useRef, useState, useCallback } from 'react';
import { TextureLoader, ShaderMaterial, Vector2, Mesh, SphereGeometry, MeshPhongMaterial } from 'three';
import Globe from 'react-globe.gl';
import * as solar from 'solar-calculator';

// MapLibre + gerçek uydu görüntüsü denemesi "plastik top" gibi durdu çünkü
// s2cloudless bulutsuz/gündüz-only bir mozaik — atmosfer, gece ışıkları ve
// aydınlık/karanlık sınırı yok. Bunun yerine react-globe.gl (three.js) ile,
// react-globe.gl'ın resmi "day-night-cycle" ve "clouds" örneklerindeki teknikleri
// birleştiriyoruz: gerçek güneş konumuna göre gündüz/gece dokularını harmanlayan
// özel bir shader + ayrı, yavaş dönen yarı saydam bir bulut katmanı.
// https://vasturiano.github.io/react-globe.gl/example/day-night-cycle/
// https://vasturiano.github.io/react-globe.gl/example/clouds/
const DAY_TEXTURE_URL = '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg';
const NIGHT_TEXTURE_URL = '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg';
const BUMP_TEXTURE_URL = '//cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png';
const CLOUDS_TEXTURE_URL = 'https://cdn.jsdelivr.net/gh/turban/webgl-earth/images/fair_clouds_4k.png';
const CLOUDS_ALTITUDE = 0.006;
const CLOUDS_ROTATION_SPEED = -0.006; // derece/kare

// Başarsoft merkez (Ankara) + dünyanın dört bir yanına yayılan bolca rota —
// "her yere dağıtılıyormuş gibi" görünsün diye önceki 3 yerine 8 hedef.
const HOME = { lat: 39.93, lng: 32.86, name: 'Ankara', isHome: true };
const POINTS = [
  HOME,
  { lat: 51.51, lng: -0.13, name: 'Londra' },
  { lat: 48.86, lng: 2.35, name: 'Paris' },
  { lat: 40.71, lng: -74.01, name: 'New York' },
  { lat: -23.55, lng: -46.63, name: 'São Paulo' },
  { lat: 35.68, lng: 139.69, name: 'Tokyo' },
  { lat: -33.87, lng: 151.21, name: 'Sidney' },
  { lat: 1.35, lng: 103.82, name: 'Singapur' },
  { lat: 25.2, lng: 55.27, name: 'Dubai' },
];
const ARCS = POINTS.filter((p) => !p.isHome).map((p) => ({
  startLat: HOME.lat,
  startLng: HOME.lng,
  endLat: p.lat,
  endLng: p.lng,
}));
// Ankara'dan sinyal gibi yayılan, tekrar eden halkalar — "her yere
// dağıtılıyormuş gibi" hissini arçlardan bağımsız olarak da güçlendiriyor.
const RINGS = [HOME];

// Gündüz/gece harmanlama shader'ı — resmi react-globe.gl day-night-cycle örneğinden.
const dayNightShader = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    #define PI 3.141592653589793
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform vec2 sunPosition;
    uniform vec2 globeRotation;
    varying vec3 vNormal;
    varying vec2 vUv;

    float toRad(in float a) {
      return a * PI / 180.0;
    }

    vec3 Polar2Cartesian(in vec2 c) { // [lng, lat]
      float theta = toRad(90.0 - c.x);
      float phi = toRad(90.0 - c.y);
      return vec3(
        sin(phi) * cos(theta),
        cos(phi),
        sin(phi) * sin(theta)
      );
    }

    void main() {
      float invLon = toRad(globeRotation.x);
      float invLat = -toRad(globeRotation.y);
      mat3 rotX = mat3(
        1, 0, 0,
        0, cos(invLat), -sin(invLat),
        0, sin(invLat), cos(invLat)
      );
      mat3 rotY = mat3(
        cos(invLon), 0, sin(invLon),
        0, 1, 0,
        -sin(invLon), 0, cos(invLon)
      );
      vec3 rotatedSunDirection = rotX * rotY * Polar2Cartesian(sunPosition);
      float intensity = dot(normalize(vNormal), normalize(rotatedSunDirection));
      vec4 dayColor = texture2D(dayTexture, vUv);
      vec4 nightColor = texture2D(nightTexture, vUv);
      float blendFactor = smoothstep(-0.1, 0.1, intensity);
      gl_FragColor = mix(nightColor, dayColor, blendFactor);
    }
  `,
};

function sunPosAt(dt) {
  const day = new Date(+dt).setUTCHours(0, 0, 0, 0);
  const t = solar.century(dt);
  const longitude = ((day - dt) / 864e5) * 360 - 180;
  return [longitude - solar.equationOfTime(t) / 4, solar.declination(t)];
}

function Earth3D({ size = 820 }) {
  const globeRef = useRef();
  const [globeMaterial, setGlobeMaterial] = useState(null);
  const dtRef = useRef(Date.now());

  // Gündüz/gece dokularını yükleyip özel shader materyalini kuruyoruz.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      new TextureLoader().loadAsync(DAY_TEXTURE_URL),
      new TextureLoader().loadAsync(NIGHT_TEXTURE_URL),
    ]).then(([dayTexture, nightTexture]) => {
      if (cancelled) return;
      setGlobeMaterial(
        new ShaderMaterial({
          uniforms: {
            dayTexture: { value: dayTexture },
            nightTexture: { value: nightTexture },
            sunPosition: { value: new Vector2(...sunPosAt(dtRef.current)) },
            globeRotation: { value: new Vector2() },
          },
          vertexShader: dayNightShader.vertexShader,
          fragmentShader: dayNightShader.fragmentShader,
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Gerçek güneş konumunu zamanla ilerletiyoruz. Önceki sürüm "her karede sabit
  // X ms ilerlet" yapıyordu — bu, ekranın gerçek FPS'ine bağlı olduğu için
  // yüksek yenileme hızlı ekranlarda beklenenden çok daha hızlı akıyordu.
  // Bunun yerine gerçek geçen süreye (delta time) göre ilerletiyoruz: FPS ne
  // olursa olsun aynı hızda, ~25 dakikada bir tam gün/gece döngüsü.
  useEffect(() => {
    const FULL_CYCLE_REAL_MS = 25 * 60 * 1000; // 25 dakikada 24 saatlik simülasyon
    const SIM_MS_PER_REAL_MS = (24 * 60 * 60 * 1000) / FULL_CYCLE_REAL_MS;
    let raf;
    let stopped = false;
    let lastTime = performance.now();
    const tick = (now) => {
      if (stopped) return;
      const realDelta = now - lastTime;
      lastTime = now;
      dtRef.current += realDelta * SIM_MS_PER_REAL_MS;
      globeMaterial?.uniforms.sunPosition.value.set(...sunPosAt(dtRef.current));
      raf = requestAnimationFrame(tick);
    };
    if (globeMaterial) {
      lastTime = performance.now();
      raf = requestAnimationFrame(tick);
    }
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [globeMaterial]);

  const handleZoom = useCallback(
    ({ lng, lat }) => {
      globeMaterial?.uniforms.globeRotation.value.set(lng, lat);
    },
    [globeMaterial]
  );

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return undefined;

    // Bulutlar: dünyanın biraz üstünde, yarı saydam, kendi ekseninde bağımsız
    // ve yavaşça dönen ayrı bir küre (resmi "clouds" örneğindeki teknik).
    let cloudsFrame;
    let clouds;
    let disposed = false;
    new TextureLoader().load(CLOUDS_TEXTURE_URL, (cloudsTexture) => {
      if (disposed) return;
      clouds = new Mesh(
        new SphereGeometry(globe.getGlobeRadius() * (1 + CLOUDS_ALTITUDE), 75, 75),
        new MeshPhongMaterial({ map: cloudsTexture, transparent: true })
      );
      globe.scene().add(clouds);
      (function rotateClouds() {
        clouds.rotation.y += (CLOUDS_ROTATION_SPEED * Math.PI) / 180;
        cloudsFrame = requestAnimationFrame(rotateClouds);
      })();
    });

    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.17; // ~6 dakikada bir tur
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableRotate = true; // kullanıcı isterse yumuşakça sürükleyebilsin

    globe.pointOfView({ lat: 30, lng: 15, altitude: 2.4 });

    return () => {
      disposed = true;
      cancelAnimationFrame(cloudsFrame);
      if (clouds) globe.scene().remove(clouds);
    };
  }, []);

  return (
    // NOT: burada düz (equirectangular) dünya dokusunu CSS background-image
    // olarak koyup dairesel kırpmıştık — bu, gerçek 3D küre render'ının
    // ARKASINDAN görünüp "iki dünya iç içe" gibi çirkin bir görsel hataya yol
    // açtı (düz harita ile küresel render aynı anda görünüyordu). Yükleme
    // sırasında sade koyu bir daire yeterli, ekstra doku koymuyoruz.
    <div
      className="auth-earth-3d"
      style={{
        position: 'relative',
        width: size,
        height: size,
        background: '#05070d',
        borderRadius: '50%',
        overflow: 'hidden',
      }}
    >
      <div className={`earth-loading${globeMaterial ? ' earth-loading-hidden' : ''}`}>
        <div className="earth-loading-ring" />
      </div>
      <Globe
        ref={globeRef}
        width={size}
        height={size}
        backgroundColor="rgba(0,0,0,0)"
        backgroundImageUrl="//cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png"
        globeMaterial={globeMaterial || undefined}
        bumpImageUrl={BUMP_TEXTURE_URL}
        showAtmosphere
        atmosphereColor="#3b82f6"
        atmosphereAltitude={0.2}
        onZoom={handleZoom}
        pointsData={POINTS}
        pointLat="lat"
        pointLng="lng"
        pointColor={(d) => (d.isHome ? '#fbbf24' : '#7dd3fc')}
        pointAltitude={0.012}
        pointRadius={(d) => (d.isHome ? 0.55 : 0.32)}
        pointsMerge={false}
        arcsData={ARCS}
        arcColor={() => ['rgba(148,220,255,0.95)', 'rgba(56,189,248,0.2)']}
        arcDashLength={0.35}
        arcDashGap={0.8}
        arcDashInitialGap={() => Math.random() * 3}
        arcDashAnimateTime={2200}
        arcStroke={0.55}
        arcAltitudeAutoScale={0.32}
        ringsData={RINGS}
        ringLat="lat"
        ringLng="lng"
        ringColor={() => (t) => `rgba(251, 191, 36, ${1 - t})`}
        ringMaxRadius={9}
        ringPropagationSpeed={2.4}
        ringRepeatPeriod={900}
        rendererConfig={{ antialias: true, alpha: true }}
      />
    </div>
  );
}

export default Earth3D;

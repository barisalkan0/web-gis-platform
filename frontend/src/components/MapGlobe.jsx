import { useEffect, useRef } from 'react';
// maplibre-gl v6 sadece named export veriyor (export default yok) — "import
// maplibregl from 'maplibre-gl'" ile maplibregl 'undefined' oluyor ve
// "new maplibregl.Map(...)" satırında sessizce patlayıp React'i (error
// boundary olmadığı için) beyaz ekrana düşürüyordu. Namespace import kullanıyoruz.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Başarsoft'un iş alanını (haritalama/GIS) doğrudan temsil eden, kendi ekseninde
// dönen gerçek bir 3D dünya. Görüntü elle boyanmış bir doku değil — EOX IT
// Services'in ücretsiz s2cloudless WMTS servisinden gerçek Sentinel-2 uydu
// mozaiği. MapLibre GL JS'in resmi "globe + atmosphere" örneğine dayanıyor:
// https://maplibre.org/maplibre-gl-js/docs/examples/display-a-globe-with-an-atmosphere/
const HUBS = [
  { name: 'Ankara', lng: 32.86, lat: 39.93, isHome: true },
  { name: 'Londra', lng: -0.13, lat: 51.51 },
  { name: 'New York', lng: -74.01, lat: 40.71 },
  { name: 'Tokyo', lng: 139.69, lat: 35.68 },
  { name: 'Sidney', lng: 151.21, lat: -33.87 },
  { name: 'Singapur', lng: 103.82, lat: 1.35 },
  { name: 'Kahire', lng: 31.24, lat: 30.04 },
];

const HUBS_GEOJSON = {
  type: 'FeatureCollection',
  features: HUBS.map((h) => ({
    type: 'Feature',
    properties: { name: h.name, isHome: !!h.isHome },
    geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
  })),
};

const SECONDS_PER_REVOLUTION = 180;
const MAX_SPIN_ZOOM = 5;
const SLOW_SPIN_ZOOM = 3;

function MapGlobe() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const map = new maplibregl.Map({
      container: containerRef.current,
      interactive: false,
      attributionControl: false,
      zoom: 0.9,
      center: [32.86, 39.93],
      style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {
          satellite: {
            type: 'raster',
            tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'],
            attribution: '© EOX IT Services GmbH — Sentinel-2 cloudless',
          },
          hubs: { type: 'geojson', data: HUBS_GEOJSON },
        },
        layers: [
          { id: 'satellite', type: 'raster', source: 'satellite' },
          {
            id: 'hub-glow',
            type: 'circle',
            source: 'hubs',
            paint: {
              'circle-radius': 11,
              'circle-color': '#38bdf8',
              'circle-opacity': 0.28,
              'circle-blur': 1,
            },
          },
          {
            id: 'hub-dot',
            type: 'circle',
            source: 'hubs',
            paint: {
              'circle-radius': ['case', ['get', 'isHome'], 5, 3.2],
              'circle-color': ['case', ['get', 'isHome'], '#fbbf24', '#7dd3fc'],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#ffffff',
            },
          },
        ],
        sky: {
          'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
        },
        light: { anchor: 'map', position: [1.5, 90, 80] },
      },
    });

    // Dönüşü "moveend" olayına zincirleyerek tetiklemek (resmi Mapbox/MapLibre
    // örneğindeki desen) tarayıcıda güvenilmez çıktı — olay bir yerde kopunca
    // dünya donuk kalıyordu. Bunun yerine sabit bir setInterval ile her saniye
    // doğrudan tetikliyoruz; olay zincirine bağımlı değil, garantili çalışıyor.
    let stopped = false;
    function spinGlobe() {
      if (stopped) return;
      const zoom = map.getZoom();
      if (zoom < MAX_SPIN_ZOOM) {
        let distancePerSecond = 360 / SECONDS_PER_REVOLUTION;
        if (zoom > SLOW_SPIN_ZOOM) {
          distancePerSecond *= (MAX_SPIN_ZOOM - zoom) / (MAX_SPIN_ZOOM - SLOW_SPIN_ZOOM);
        }
        const center = map.getCenter();
        center.lng -= distancePerSecond;
        map.easeTo({ center, duration: 1000, easing: (n) => n });
      }
    }

    const intervalId = setInterval(spinGlobe, 1000);
    map.on('load', spinGlobe);

    return () => {
      stopped = true;
      clearInterval(intervalId);
      map.remove();
    };
  }, []);

  return <div ref={containerRef} className="auth-map-globe" />;
}

export default MapGlobe;

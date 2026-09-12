import { useEffect, useRef } from 'react';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import OSM from 'ol/source/OSM';
import VectorSource from 'ol/source/Vector';
import WKT from 'ol/format/WKT';
import Style from 'ol/style/Style';
import Icon from 'ol/style/Icon';
import Modify from 'ol/interaction/Modify';
import 'ol/ol.css';

function parsePointCoordinates(wkt) {
  const match = /POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i.exec(wkt || '');
  return match ? { longitude: Number(match[1]), latitude: Number(match[2]) } : null;
}

const PIN_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44"><path d="M17 2C8.7 2 2 8.7 2 17c0 10.5 15 25 15 25s15-14.5 15-25C32 8.7 25.3 2 17 2Z" fill="#db2777" stroke="#fff" stroke-width="3"/><path d="M11 13h12v9H11zM14 10h6v3h-6z" fill="#fff"/></svg>')}`;

function PoiPreviewMap({ wkt, name, editable = false, onWktChange, items = null }) {
  const targetRef = useRef(null);
  const onWktChangeRef = useRef(onWktChange);
  const itemsRef = useRef(items);
  const itemSignature = Array.isArray(items) ? items.map((item) => `${item.id}:${item.wkt}`).join('|') : '';

  useEffect(() => {
    onWktChangeRef.current = onWktChange;
  }, [onWktChange]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!targetRef.current || (!wkt && !itemSignature)) return undefined;
    const format = new WKT();
    const previewItems = Array.isArray(itemsRef.current) && itemsRef.current.length > 0
      ? itemsRef.current
      : [{ id: 'single', wkt, name }];
    const features = previewItems.map((item) => {
      const feature = format.readFeature(item.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
      feature.set('name', item.name || 'POI');
      return feature;
    });
    const feature = features[0];
    const geometry = feature.getGeometry();
    const source = new VectorSource({ features });
    const map = new OlMap({
      target: targetRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        new VectorLayer({
          source,
          style: new Style({
            image: new Icon({ src: PIN_URL, anchor: [0.5, 1], scale: 0.72 }),
          }),
        }),
      ],
      view: new View({ center: geometry.getCoordinates(), zoom: 15 }),
    });
    if (features.length > 1) {
      map.getView().fit(source.getExtent(), { padding: [38, 38, 38, 38], maxZoom: 15 });
    }
    if (editable) {
      const modify = new Modify({ source });
      modify.on('modifyend', () => {
        const nextWkt = new WKT().writeFeature(feature, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });
        onWktChangeRef.current?.(nextWkt);
      });
      map.addInteraction(modify);
    }
    map.updateSize();
    return () => map.setTarget(undefined);
  }, [wkt, editable, itemSignature, name]);

  const coordinates = parsePointCoordinates(wkt);
  return (
    <div className="admin-poi-preview-wrap">
      <div ref={targetRef} className="admin-poi-preview-map" aria-label={`${name} POI harita önizlemesi`} />
      {Array.isArray(items) && items.length > 0 ? (
        <div className="admin-poi-exact-location"><span>Haritada gösterilen</span><strong>{items.length} POI</strong></div>
      ) : <div className="admin-poi-exact-location">
        <span>Tam konum</span>
        <strong>{coordinates ? `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}` : 'Belirtilmemiş'}</strong>
        {editable && <small>Noktayı haritada tutup sürükleyerek taşıyabilirsin.</small>}
      </div>}
    </div>
  );
}

export default PoiPreviewMap;

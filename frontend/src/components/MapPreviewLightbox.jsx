import { useEffect, useRef, useState } from 'react';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import ImageWMS from 'ol/source/ImageWMS';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { createEmpty, extend as extendExtent, isEmpty as isEmptyExtent } from 'ol/extent';
import { fromLonLat } from 'ol/proj';
import 'ol/ol.css';
import { authHeader } from '../auth';

const geoJsonFormat = new GeoJSON();

const CONFIG_URL = 'http://localhost:5276/api/GeoServerConfig';
const WMS_LAYER_NAMES = ['tbl_point', 'tbl_line', 'tbl_polygon'];
// Kullanıcının kendi bildirdiği bug: "önizlemedeki alanlar solid gri renk olmuş, şeffaflık ve
// renkler falan olduğu gibi kalsa olmaz mı hatta isimleri de görünse". Asıl çözüm hazır:
// docs/tbl_point-colored.sld, tbl_line-colored.sld, tbl_polygon-colored.sld — her feature'ın
// KENDİ "color" sütununu kullanan, "name" sütununu etiket olarak gösteren ve iç içe geçen
// etiketleri otomatik gizleyen (conflictResolution) 3 SLD dosyası. AMA GeoServer'a "Additional
// Styles" olarak henüz YÜKLENMEDİ (kullanıcı: "başka zaman yaparız") — STYLES parametresi bu
// isimlere referans verirse GeoServer WMS isteği tamamen BOŞ dönüyor (üstteki gri varsayılandan
// bile kötü). O yüzden STYLES'ı bilinçli olarak GÖNDERMİYORUZ; GeoServer kurulumu tamamlanınca
// (bkz. docs/onizleme-renklendirme-kurulumu.md) WMS_STYLE_NAMES'i geri ekleyip aşağıdaki
// updateParams çağrısına STYLES satırını eklemek yeterli.
const WMS_STYLE_NAMES = null;

// Hocanın 2. tur ödevi: "Verilerin haritadaki genel gösterimlerinde WMS ... tercih edin."
// Önizleme lightbox'ı salt-okunur (Draw/Modify yok, sadece pan/zoom) — yani "genel gösterim"
// tanımına birebir uyan, çizim/etkileşim GEREKTİRMEYEN tek ekran. Bu yüzden eskiden burada
// olan (WFS ile nokta/çizgi/alanı ayrı ayrı çekip OL feature'a çeviren) yaklaşım yerine artık
// GeoServer'ın WMS servisinden DOĞRUDAN hazır raster görüntü isteniyor — backend'e SADECE
// yetki+CQL_FILTER almak için bir kere uğranıyor (GeoServerConfigController), asıl harita
// verisi tarayıcıdan doğrudan GeoServer'a gidiyor.
function MapPreviewLightbox({ mapId, mapName }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const wmsSourcesRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Başlangıçta url ayarlanmıyor (undefined) — ImageWMS url'siz istek atmaz. Aşağıdaki
    // [mapId] effect'i config'i (baseUrl/workspace/cqlFilter) çekince setUrl+updateParams ile
    // dolduruyor. GeoServer'ın baseUrl/workspace bilgisini burada SABİTLEMİYORUZ: appsettings.
    // json'daki GeoServer:BaseUrl/Workspace değişirse (ör. sunucu taşınırsa) tek değişiklik
    // noktası backend kalsın diye, url de her seferinde config'ten geliyor.
    const wmsSources = WMS_LAYER_NAMES.map(
      (layerName) => new ImageWMS({ params: { LAYERS: layerName, TRANSPARENT: true }, ratio: 1 })
    );
    wmsSourcesRef.current = wmsSources;

    const map = new OlMap({
      target: mapDivRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        ...wmsSources.map((source) => new ImageLayer({ source })),
      ],
      view: new View({ center: fromLonLat([35.5, 39.0]), zoom: 5.2 }),
      controls: [],
    });
    mapRef.current = map;
    setTimeout(() => map.updateSize(), 0); // lightbox açılış layout gecikmesine karşı güvenlik ağı
    return () => map.setTarget(undefined);
  }, []);

  // mapId değişince (hover başka bir haritaya kayınca) o haritaya özel CQL_FILTER'ı backend'den
  // taze çekip WMS katmanlarına uyguluyoruz — böylece her önizleme SADECE o haritanın (ve o
  // kullanıcının görme hakkı olan) kayıtlarını gösterir, WFS yolundakiyle BİREBİR aynı kural.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setErrorMsg('');

    (async () => {
      try {
        const response = await fetch(`${CONFIG_URL}/${mapId}`, { headers: authHeader() });
        if (cancelled) return;
        if (!response.ok) {
          setErrorMsg('Önizleme yüklenemedi.');
          setLoading(false);
          return;
        }
        const config = await response.json();
        if (cancelled) return;

        const wmsUrl = `${config.baseUrl}/${config.workspace}/wms`;
        wmsSourcesRef.current.forEach((source, i) => {
          source.setUrl(wmsUrl);
          source.updateParams({
            LAYERS: `${config.workspace}:${WMS_LAYER_NAMES[i]}`,
            // GeoServer'a renkli style'lar yüklenene kadar STYLES kasıtlı olarak boş —
            // bkz. WMS_STYLE_NAMES yorumu. Boş bırakınca GeoServer kendi jenerik (gri ama
            // ÇALIŞAN) varsayılanını kullanır.
            ...(WMS_STYLE_NAMES ? { STYLES: `${config.workspace}:${WMS_STYLE_NAMES[i]}` } : {}),
            CQL_FILTER: config.cqlFilter,
          });
        });
        mapRef.current?.updateSize();

        // Kullanıcının kendi tespiti: "önizlemede çizimler görünmüyor" — asıl kök sebep renk
        // DEĞİL, görünüm HER ZAMAN sabit Türkiye-geneli zoom'da (5.2) açılıyordu. Küçük bir
        // haritanın 3-4 çizimi o zoom'da neredeyse tek piksel, gözle görülemeyecek kadar küçük
        // kalıyordu (MapPage'deki Konum Analizi/arama sonrası "extent'e fit" ile AYNI kök
        // sebep, bkz. #66/#92'deki notlar). WMS raster kendi extent'ini vermiyor (sadece bir
        // resim), o yüzden SADECE bounding-box hesaplamak için AYNI CQL_FILTER'la hafif bir WFS
        // GetFeature isteği atıp geometrilerin toplam extent'ine "fit" yapıyoruz — asıl GÖSTERİM
        // hâlâ WMS raster (hocanın "genel gösterimde WMS tercih edin" şartı bozulmuyor, WFS
        // burada sadece görünmez bir ölçüm için kullanılıyor).
        const wfsUrl = `${config.baseUrl}/${config.workspace}/wfs`;
        const extent = createEmpty();
        await Promise.all(
          WMS_LAYER_NAMES.map(async (layerName) => {
            try {
              const params = new URLSearchParams({
                service: 'WFS',
                version: '1.0.0',
                request: 'GetFeature',
                typeName: `${config.workspace}:${layerName}`,
                outputFormat: 'application/json',
                cql_filter: config.cqlFilter,
              });
              const wfsResponse = await fetch(`${wfsUrl}?${params.toString()}`);
              if (!wfsResponse.ok) return;
              const geojson = await wfsResponse.json();
              const features = geoJsonFormat.readFeatures(geojson, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
              });
              features.forEach((feature) => {
                const geometry = feature.getGeometry();
                if (geometry) extendExtent(extent, geometry.getExtent());
              });
            } catch {
              // Bir katmanın extent ölçümü başarısız olursa diğer katmanların fit'ini
              // bozmasın diye sessizce yutuluyor — WMS raster zaten ayrıca deneniyor.
            }
          })
        );
        if (cancelled) return;

        if (!isEmptyExtent(extent)) {
          mapRef.current?.getView().fit(extent, { padding: [28, 28, 28, 28], maxZoom: 15, duration: 0 });
        } else {
          // Hiç çizim yoksa (boş harita) eski Türkiye-geneli görünüme dön.
          mapRef.current?.getView().setCenter(fromLonLat([35.5, 39.0]));
          mapRef.current?.getView().setZoom(5.2);
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setErrorMsg('Sunucuya bağlanılamadı.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapId]);

  return (
    <div className="map-thumb-lightbox">
      <div className="map-thumb-lightbox-canvas-wrap">
        <div ref={mapDivRef} className="map-thumb-lightbox-canvas" />
        {loading && <div className="map-thumb-lightbox-status">Yükleniyor…</div>}
        {!loading && errorMsg && <div className="map-thumb-lightbox-status">{errorMsg}</div>}
      </div>
      <div className="map-thumb-lightbox-label">{mapName}</div>
    </div>
  );
}

export default MapPreviewLightbox;

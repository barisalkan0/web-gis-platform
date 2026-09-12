import { useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
// DİKKAT: bilerek OlMap olarak adlandırıldı — "Map" ismiyle içe aktarılsaydı dosyanın
// GERİ KALANINDA JavaScript'in yerleşik Map (sözlük) sınıfının yerini görünmez şekilde
// alırdı (variable shadowing). Bu gerçekten olmuş bir hataydı: featuresByKeyRef bir JS
// Map değil boş bir OpenLayers harita nesnesiymiş; .set()/.get() OL'nin kendi genel
// özellik sistemi sayesinde tesadüfen çalışıyordu ama .delete()/.clear() gibi gerçek
// Map metodları yoktu (.delete() zaten bir try/catch içindeydi, sessizce yutuluyordu).
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import ImageLayer from 'ol/layer/Image';
import ImageWMS from 'ol/source/ImageWMS';
import HeatmapLayer from 'ol/layer/Heatmap';
import OSM from 'ol/source/OSM';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Collection from 'ol/Collection';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import LineString from 'ol/geom/LineString';
import CircleGeom from 'ol/geom/Circle';
import WKT from 'ol/format/WKT';
import Style from 'ol/style/Style';
import CircleStyle from 'ol/style/Circle';
import RegularShape from 'ol/style/RegularShape';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Text from 'ol/style/Text';
import Icon from 'ol/style/Icon';
import { fromLonLat, toLonLat } from 'ol/proj';
import { createEmpty, extend as extendExtent, getCenter, isEmpty as isEmptyExtent } from 'ol/extent';
import { easeOut } from 'ol/easing';
import { getArea, getLength, getDistance } from 'ol/sphere';
import 'ol/ol.css';
import { getAuth, clearAuth, authHeader, isAdmin, getPermissions, refreshMe, getMyUserId } from '../auth';
import AttributePopup from '../components/AttributePopup';
import ItemEditRow from '../components/ItemEditRow';
import MapShareSettingsRow from '../components/MapShareSettingsRow';
import MapSettingsModal from '../components/MapSettingsModal';
import MapTrashModal from '../components/MapTrashModal';
import UserProfileCard from '../components/UserProfileCard';
import NewMapPopover from '../components/NewMapPopover';
import SelectMenu from '../components/SelectMenu';
import CategoryManagerModal from '../components/CategoryManagerModal';
import TrashPanel from '../components/TrashPanel';
import ConfirmDialog from '../components/ConfirmDialog';
import FeatureInfoCard from '../components/FeatureInfoCard';
import VertexCoordinateEditor from '../components/VertexCoordinateEditor';
import AttributesEditFields from '../components/AttributesEditFields';
import GeoRestrictionModal from '../components/GeoRestrictionModal';
import MapPreviewLightbox from '../components/MapPreviewLightbox';
import { followRoute } from '../realtime/transitSimulationConnection';
import PoiFormPopup from '../components/PoiFormPopup';
import StopFormPopup from '../components/StopFormPopup';
import IconPicker from '../components/IconPicker';
import PoiSearchBar from '../components/PoiSearchBar';
import PoiScheduleEditor from '../components/PoiScheduleEditor';
import PoiScheduleSummary from '../components/PoiScheduleSummary';
import PoiScheduleExceptionEditor from '../components/PoiScheduleExceptionEditor';
import LocationAnalysisPanel from '../components/LocationAnalysisPanel';
import { groupPoiSchedule, normalizePoiSchedule } from '../poiScheduleUtils';
import SearchableCategorySelect from '../components/SearchableCategorySelect';
import { buildPoiCategoryOptions, categoryColorForId } from '../poiCategoryUtils';
import {
  LogoutIcon,
  PointToolIcon,
  LineToolIcon,
  PolygonToolIcon,
  AnalysisToolIcon,
  UndoIcon,
  RedoIcon,
  GearIcon,
  MessageIcon,
} from '../components/icons';

// Çizim modu -> backend endpoint eşlemesi (OpenLayers'ın geometri tipi isimleriyle birebir)
const DRAW_TYPES = [
  { mode: 'Point', label: 'Nokta', endpoint: 'point', permKey: 'canDrawPoint' },
  { mode: 'LineString', label: 'Çizgi', endpoint: 'line', permKey: 'canDrawLine' },
  { mode: 'Polygon', label: 'Alan', endpoint: 'polygon', permKey: 'canDrawPolygon' },
];

const TYPE_COLORS = {
  Point: '#2563eb',
  LineString: '#ea580c',
  Polygon: '#16a34a',
};

// "Liquid glass" (iOS 26 / AndroidLiquidGlass tarzı) panel efekti için kırılma haritası
// (bump map). Düz feTurbulence (rastgele gürültü) her yerde eşit oranda dağılıp "bulanık/
// statik" görünüyordu — gerçek cam hissi MERKEZDE NET, KENARLARDA BÜKÜLMÜŞ olmasından
// geliyor (lens gibi). Bu yüzden feTurbulence yerine, merkezi nötr gri (=sıfır kayma),
// kenarlara doğru beyaza açılan (=artan kayma) bir radyal gradyan kullanıyoruz —
// feDisplacementMap bu görüntüyü R/G kanallarından okuyup arkadaki haritayı SADECE
// kenarlara yakın yerlerde kaydırıyor, ortası bozulmadan kalıyor.
const LIQUID_GLASS_BUMP_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>
  <defs>
    <radialGradient id='g' cx='50%' cy='50%' r='72%'>
      <stop offset='55%' stop-color='#808080'/>
      <stop offset='100%' stop-color='#ffffff'/>
    </radialGradient>
  </defs>
  <rect width='240' height='240' fill='#808080'/>
  <rect width='240' height='240' fill='url(#g)'/>
</svg>`;
const LIQUID_GLASS_BUMP_URL = `data:image/svg+xml;utf8,${encodeURIComponent(LIQUID_GLASS_BUMP_SVG)}`;

// Her çizim moduna, o geometriyi gerçekten çizilmiş gibi taklit eden ikon —
// "noktanın solunda nokta, çizginin solunda çizgi, alanın solunda beşgen olsun" isteği.
const TYPE_ICONS = {
  Point: PointToolIcon,
  LineString: LineToolIcon,
  Polygon: PolygonToolIcon,
};
const SELECTED_COLOR = '#dc2626';
const HIDDEN_STYLE = new Style(); // hiçbir şey çizmeyen boş stil — şehir filtresine uymayan şekilleri gizlemek için
// "En İyi Ev Konumları" puanlamasında ve haritadaki vurgulamada kullanılan ortak yarıçap.
// Kullanıcının kendi isteği: "1km yarıçap mantıksız olabilir belki 250m yarıçap daha iyi olur".
const HOUSE_SPOT_RADIUS_METERS = 400;
// Ulaşım gibi SEYREK kriterlerde kullanılan geniş yürüme yarıçapı (~10 dk yürüyüş).
const SPARSE_CRITERION_RADIUS_METERS = 800;
// Kullanıcının kendi tespiti (3 Eylül): "ev noktaların konumu her yer olamaz. gidip avmnin
// içini seçmiş ev konumu önerisi olarak." — bir POI'nin (AVM/hastane/okul gibi büyük tesisler
// dahil) TAM ÜSTÜNDEKİ bir grid noktası fiziksel olarak "ev" olamaz. Bu mesafeden yakın
// adaylar eleniyor: bina/parsel verimiz olmadığı için bu, elimizdeki veriyle yapılabilecek en
// makul mantık kontrolü (POI'ler zaten binaların merkezinde duruyor).
const HOUSE_SPOT_MIN_POI_DISTANCE_METERS = 70;
// Büyük tesislerin (AVM/hastane/üniversite/stadyum) yerleşkesi daha geniş, onlara daha da
// uzak durulması gerekiyor.
const HOUSE_SPOT_MIN_LANDMARK_DISTANCE_METERS = 180;

// Hoca ödevi (GeoServer POI Entegrasyonu): "Haritada belirli bir zoom seviyesine
// yakınlaşıldığında POI isimlerinin nokta üzerinde görünmesini sağlayın." OpenLayers
// resolution'ı (harita birimi/piksel) zoom ile ters orantılı — EPSG:3857'de zoom 14'e
// karşılık gelen ~9.55 resolution'ı eşik olarak seçtik (bir mahalle/cadde ölçeği, "iyice
// yakınlaşınca" hissini veriyor). Bundan uzaktaysa (resolution büyükse) sadece ikon görünür.
const POI_LABEL_MAX_RESOLUTION = 9.6;

// Kullanıcının kendi isteği ("ikon ekleme de olacak poilere"): pinin içine artık POI'nin
// (ya da kategorisinin) seçtiği emoji basılıyor — önceden burada anlamsız sabit bir "kart"
// şekli vardı, hiçbir bilgi taşımıyordu. icon boşsa (server zaten "📍" fallback'i veriyor,
// ama yine de burada da bir güvenlik ağı olarak) düz bir daire çiziyoruz.
function poiPinDataUrl(fill, stroke, icon) {
  const glyph = icon && icon.trim() ? icon.trim() : '📍';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
    <path d="M18 2C9.7 2 3 8.7 3 17c0 11.1 15 26 15 26s15-14.9 15-26C33 8.7 26.3 2 18 2Z" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
    <text x="18" y="21" font-size="16" text-anchor="middle" dominant-baseline="central">${glyph}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Kullanıcının kendi isteği (2 Eylül): "isimler üst üste biniyor, poiler üst üste falan.
// üst üste binenler 1 tane görünse daha iyi olabilir. daha büyük, yaygın olan öne çıksın...
// sıfır donma istiyorum." — ÜÇ ayrı mekanizma birlikte çalışıyor:
//   1) ÖNEM (importance): her POI yüklenirken 1-3 arası bir skor alıyor (bkz. poiImportance);
//      zincir markalar/AVM/hastane gibi "yaygın ve büyük" olanlar 3, temel tesisler 2, geri
//      kalan 1. Skor hem pin BOYUTUNU hem de aşağıdaki iki mekanizmayı besliyor.
//   2) ZOOM ELEMESİ: uzak zoom'larda SADECE yüksek önemli POI'ler çiziliyor (eski id % N
//      "thinning"i rastgele bir alt küme seçiyordu — Burger King gizlenip isimsiz bir büfe
//      görünebiliyordu; artık eleme anlamlı).
//   3) DECLUTTER: poiLayer'da declutter:true açık (bkz. new VectorLayer). OpenLayers üst üste
//      binen ikon/etiketleri otomatik eliyor ve zIndex'i YÜKSEK olanı tutuyor — bu yüzden
//      zIndex'i önem skoruna bağlıyoruz: çakışma olduğunda büyük/yaygın olan hayatta kalıyor.
// Kullanıcının kendi isteği: "uzaktan bakınca haritada öne çıkan poiler öncelikli olarak tarihi
// yerler olarak görünsün mesela anıtkabir vesaire, yakınlaştıkça derinleşsin." — dört kademeli
// bir önem piramidi: 4 = simge yapı/tarihi yer (en uzaktan bile görünür), 3 = büyük tesis veya
// bilinen zincir, 2 = temel günlük ihtiyaç, 1 = geri kalan her şey.
const POI_LANDMARK_CATEGORY_KEYWORDS = ['müze', 'anıt', 'tarihi', 'kale', 'saray', 'turistik', 'ören', 'cami'];
const POI_LANDMARK_NAME_KEYWORDS = ['anıtkabir', 'kocatepe', 'kalesi', 'anadolu medeniyetleri', 'atakule', 'cumhurbaşkanlığı', 'meclis', 'gençlik parkı', 'genç parkı', 'müzesi'];
const POI_MAJOR_CATEGORY_KEYWORDS = ['alışveriş merkezi', 'avm', 'hastane', 'üniversite', 'havalimanı', 'metro', 'otogar', 'tren', 'stadyum', 'terminal', 'istasyon'];
const POI_MID_CATEGORY_KEYWORDS = ['süpermarket', 'market', 'banka', 'okul', 'otel', 'benzin', 'eczane', 'park', 'sinema', 'spor'];

function poiImportance(name, categoryName) {
  const category = (categoryName || '').toLocaleLowerCase('tr');
  const label = (name || '').toLocaleLowerCase('tr');
  // Simge yapılar: hem kategori (Müze/Turistik Yerler) hem de isim bazlı — "Anıtkabir" OSM'de
  // farklı kategorilerde etiketlenmiş olabiliyor, isim eşleşmesi güvenlik ağı.
  if (POI_LANDMARK_NAME_KEYWORDS.some((keyword) => label.includes(keyword))) return 4;
  if (POI_LANDMARK_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))) {
    // Her cami simge yapı değil; sadece büyük/bilinen olanlar 4, diğer ibadet yerleri 2.
    if (category.includes('cami')) return label.includes('kocatepe') || label.includes('hacı bayram') ? 4 : 2;
    return 4;
  }
  if (POI_MAJOR_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))) return 3;
  if (isWellKnownBrand(name)) return 3;
  if (POI_MID_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))) return 2;
  return 1;
}

// resolution = harita birimi (m) / piksel. Türkiye geneli ~2000+, şehir ~100-400, mahalle ~20,
// sokak <10. "Yakınlaştıkça derinleşsin": her kademede bir alt önem seviyesi daha devreye giriyor.
// Kullanıcının kendi tespiti (3 Eylül): "zoom in zoom out yaparken aşırı donuyor Ankara'ya.
// bi anda noktalar çok olup sonra görünmüyor falan böyle buglar var" — kök sebep: şehir
// ölçeğinde görüş alanına 8.700 POI'nin BÜYÜK BİR KISMI giriyordu ve hepsi tek bir
// declutter'lı katmanda çiziliyordu. Declutter (çakışma çözümü) her karede tüm bu nesneler
// için çarpışma testi yapıyor — asıl donma buradan geliyordu.
//
// Çözüm iki parçalı:
//   1) AYNI kaynağı paylaşan İKİ katman (bkz. poiOverviewLayer / poiLayer): uzak-orta zoom'da
//      declutter'sız, etiketsiz, sadece küçük nokta çizen UCUZ katman; yakın zoom'da (görüş
//      alanında zaten az POI kalınca) declutter'lı, pinli-etiketli DETAY katmanı.
//   2) Seyreltme (sampling): orta zoom'da düşük önemli POI'lerin sadece deterministik bir
//      alt kümesi çiziliyor (id % n) — her karede AYNI alt küme, yani titreme/"bir anda
//      görünüp kaybolma" olmadan yoğunluk düşüyor.
const POI_DETAIL_MAX_RESOLUTION = 25; // bu değerin altında detay katmanı (pin+etiket+declutter)

function poiSamplingDivisor(importance, resolution) {
  if (importance >= 4) return 1; // simge yapılar hiçbir zaman seyreltilmez
  if (resolution > 300) return importance >= 3 ? 6 : 0;
  if (resolution > 120) return importance >= 3 ? 3 : 0;
  if (resolution > 45) return importance >= 3 ? 1 : importance >= 2 ? 4 : 0;
  return 1;
}

function poiImportanceVisible(importance, resolution, poiId) {
  // Google Haritalar ülke ölçeğinde HİÇBİR POI göstermiyor, şehir ölçeğinde sadece
  // Anıtkabir/Ankara Kalesi/AVM gibi simge yapılar çıkıyor, yakınlaştıkça kademeli açılıyor.
  if (resolution > 900) return false; // ülke ölçeği: hiçbir POI yok (Google gibi)
  if (resolution > 120 && importance < 4) {
    // şehir ölçeği: simge yapılar + büyük tesislerin seyreltilmiş bir kısmı
    const divisor = poiSamplingDivisor(importance, resolution);
    return divisor > 0 && Math.abs(Number(poiId) || 0) % divisor === 0;
  }
  if (resolution > 45 && importance < 3) return false; // ilçe ölçeği: sadece büyükler
  if (resolution > 12 && importance < 2) return false; // mahalle ölçeği: temel ihtiyaçlar
  if (resolution > 45) return true;
  if (resolution > 12) {
    const divisor = poiSamplingDivisor(importance, resolution);
    return divisor <= 1 || Math.abs(Number(poiId) || 0) % divisor === 0;
  }
  return true; // sokak ölçeği: her şey
}

const POI_TEXT_FILL = new Fill({ color: '#1f2937' });
const POI_TEXT_FILL_DIM = new Fill({ color: '#64748b' });
const POI_TEXT_STROKE = new Stroke({ color: '#ffffff', width: 3.5 });

// Performans: eskiden her POI için AYRI bir Style nesnesi cache'leniyordu (cache anahtarında
// POI'nin ADI vardı) — 2500+ POI'de 2500+ Style + Text nesnesi demekti ve zoom sırasında
// donmanın ana sebeplerindendi. Artık cache SADECE görsel varyanta göre (renk/halka/ikon/
// boyut/opaklık) — tipik olarak birkaç düzine nesne — ve etiket metni her çağrıda PAYLAŞILAN
// stilin üzerine yazılıyor. OpenLayers stil nesnesini render sırasında hemen okuduğu için bu
// (OL'nin kendi örneklerinde de kullanılan) güvenli bir desen.
const POI_STYLE_CACHE = new Map();

// Kullanıcının kendi isteği (3 Eylül): "3,4,5. sslerdeki gibi görünse, google mapsten aldım
// görselleri" — Google Haritalar uzak/orta zoom'da kocaman damla-pin çizmiyor; küçük renkli bir
// nokta + yanında/altında ismi gösteriyor, pinler ancak iyice yaklaşınca çıkıyor. Bu yüzden
// POI'ler artık İKİ farklı biçimde çiziliyor: POI_PIN_MAX_RESOLUTION altında (yakın zoom) klasik
// emoji'li pin, üstünde ise bu kompakt nokta+etiket biçimi.
const POI_PIN_MAX_RESOLUTION = 9;
const POI_COMPACT_STYLE_CACHE = new Map();

function poiCompactStyle(color, radius, opacity) {
  const key = `${color}|${radius}|${opacity}`;
  let style = POI_COMPACT_STYLE_CACHE.get(key);
  if (!style) {
    style = new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: `rgba(255,255,255,${opacity})`, width: 2 }),
      }),
      text: new Text({
        text: '',
        font: '600 12px sans-serif',
        offsetY: 15,
        textAlign: 'center',
        fill: POI_TEXT_FILL,
        stroke: POI_TEXT_STROKE,
      }),
    });
    POI_COMPACT_STYLE_CACHE.set(key, style);
  }
  return style;
}

function poiSharedStyle(color, ring, icon, scale, opacity) {
  const key = `${color}|${ring}|${icon}|${scale}|${opacity}`;
  let style = POI_STYLE_CACHE.get(key);
  if (!style) {
    style = new Style({
      image: new Icon({
        src: poiPinDataUrl(color, ring, icon),
        anchor: [0.5, 1],
        scale,
        opacity,
      }),
      text: new Text({
        text: '',
        font: '600 12px sans-serif',
        offsetY: -40,
        textAlign: 'center',
        fill: POI_TEXT_FILL,
        stroke: POI_TEXT_STROKE,
      }),
    });
    POI_STYLE_CACHE.set(key, style);
  }
  return style;
}

// UZAK/ORTA ZOOM katmanı (declutter KAPALI, etiket YOK): sadece küçük renkli noktalar.
// Buradaki tek maliyet küçük bir daire çizmek — binlerce nesnede bile akıcı kalıyor.
// Etiket sadece simge yapılara (importance 4) ve onlar da azınlıkta olduğu için ucuz.
const POI_OVERVIEW_LABEL_CACHE = new Map();

function poiOverviewLabelStyle(name) {
  let style = POI_OVERVIEW_LABEL_CACHE.get('shared');
  if (!style) {
    style = new Style({
      text: new Text({
        text: '',
        font: '700 12.5px sans-serif',
        offsetY: 16,
        textAlign: 'center',
        fill: POI_TEXT_FILL,
        stroke: POI_TEXT_STROKE,
      }),
      zIndex: 60,
    });
    POI_OVERVIEW_LABEL_CACHE.set('shared', style);
  }
  style.getText().setText(name || '');
  return style;
}

function buildPoiOverviewStyle(feature, resolution) {
  if (resolution <= POI_DETAIL_MAX_RESOLUTION) return HIDDEN_STYLE; // bu ölçekte detay katmanı çiziyor
  if (feature.get('poiHidden')) return HIDDEN_STYLE;
  const importance = feature.get('importance') || 1;
  if (!poiImportanceVisible(importance, resolution, feature.get('poiId'))) return HIDDEN_STYLE;
  const color = categoryColorForId(feature.get('categoryId'));
  const radius = importance >= 4 ? 6.5 : importance >= 3 ? 5 : 4;
  const dot = poiCompactStyle(color, radius, 1);
  dot.getText().setText(''); // nokta katmanında isim yok (etiket ayrı stille geliyor)
  // Simge yapılar (Anıtkabir, müzeler, AVM'ler) şehir ölçeğinde isimleriyle görünsün —
  // sayıları az olduğu için maliyeti düşük.
  if (importance >= 4 && resolution <= 400) {
    return [dot, poiOverviewLabelStyle(feature.get('name'))];
  }
  return dot;
}

function buildPoiLayerStyle(feature, resolution) {
  if (resolution > POI_DETAIL_MAX_RESOLUTION) return HIDDEN_STYLE; // uzak zoom'da genel bakış katmanı çiziyor
  if (feature.get('poiHidden')) return HIDDEN_STYLE;
  const importance = feature.get('importance') || 1;
  // Kullanıcının kendi isteği: "yarıçapın içindeki poiler öne çıksın, dışındakiler... silik
  // görünsün" — analiz sonrası seçilen ev noktasının yarıçapı dışında kalanlar poiDimmed ile
  // işaretleniyor (bkz. applyHouseSpotEmphasis). Silik olanlar zoom elemesine takılmıyor ki
  // "görünmez olmasın" isteği korunsun, ama küçük ve soluk kalıyorlar.
  const dimmed = feature.get('poiDimmed') === true;
  const highlighted = feature.get('poiHighlighted') === true;
  if (!highlighted && !dimmed && !poiImportanceVisible(importance, resolution, feature.get('poiId'))) return HIDDEN_STYLE;
  if (dimmed && resolution > 120) return HIDDEN_STYLE; // silikler sadece yakın zoom'da anlamlı
  const isOwn = feature.get('isOwnPoi');
  const isActive = feature.get('isActive') !== false;
  // Hoca ödevi (GeoServer POI Entegrasyonu): pin RENGİ kategoriye göre — "kendi POI'm"
  // ayrımı rengi değil sadece halkayı (stroke) etkiliyor, ikisi çakışmasın diye.
  const color = categoryColorForId(feature.get('categoryId'));
  const ring = highlighted ? '#16a34a' : !isActive ? '#94a3b8' : isOwn ? '#f59e0b' : '#ffffff';
  const icon = feature.get('icon') || '📍';
  const baseScale = importance >= 4 ? 1.05 : importance >= 3 ? 0.92 : importance >= 2 ? 0.82 : 0.7;
  const scale = highlighted ? 1.1 : dimmed ? 0.55 : baseScale;
  // Kullanıcının kendi isteği: "seçilen yerler dışındakiler silik olmuş ama hiç görünmüyor
  // neredeyse biraz görünebilir." — silik opaklık 0.35'ten 0.62'ye çıkarıldı.
  const opacity = dimmed ? 0.62 : isActive ? 1 : 0.55;
  // Uzak/orta zoom'da Google tarzı kompakt nokta, yakında klasik pin (bkz. POI_PIN_MAX_RESOLUTION).
  const compact = !highlighted && resolution > POI_PIN_MAX_RESOLUTION;
  const style = compact
    ? poiCompactStyle(color, dimmed ? 3.5 : importance >= 4 ? 7 : importance >= 3 ? 6 : 5, opacity)
    : poiSharedStyle(color, ring, icon, scale, opacity);
  // Etiket: önemli olanlar daha uzaktan da isimlerini gösteriyor (Google Maps mantığı).
  const labelResolution = highlighted
    ? Infinity
    : importance >= 4
      ? POI_LABEL_MAX_RESOLUTION * 40 // simge yapılar: şehir ölçeğinde de isimleri okunur
      : importance >= 3
        ? POI_LABEL_MAX_RESOLUTION * 4
        : importance >= 2
          ? POI_LABEL_MAX_RESOLUTION * 1.6
          : POI_LABEL_MAX_RESOLUTION;
  const text = style.getText();
  if (resolution <= labelResolution) {
    text.setText(`${!isActive ? '⏸ ' : ''}${feature.get('name') || ''}`);
    text.setFont(dimmed ? '500 10px sans-serif' : importance >= 4 ? '800 14px sans-serif' : importance >= 3 ? '700 13px sans-serif' : '600 12px sans-serif');
    text.setFill(dimmed ? POI_TEXT_FILL_DIM : POI_TEXT_FILL);
    // Kompakt (nokta) biçiminde etiket noktanın ALTINA, pin biçiminde pinin ÜSTÜNE yazılıyor.
    text.setOffsetY(compact ? (dimmed ? 12 : 15) : dimmed ? -26 : -40);
  } else {
    text.setText('');
  }
  // Declutter önceliği: çakışan iki POI'den zIndex'i büyük olan hayatta kalır.
  style.setZIndex((highlighted ? 100 : 0) + importance * 10 + (isOwn ? 5 : 0) - (dimmed ? 20 : 0));
  return style;
}

// Hoca ödevi (Akıllı Ulaşım Modülü): "Google Maps ile aynı yapabilirsin" isteği — Google
// Maps'in transit gösterimindeki gibi küçük, beyaz dolgulu ve güzergah rengiyle çerçeveli
// dairecik + isim etiketi. buildPoiLayerStyle ile AYNI stil-cache mantığı kullanılmıyor
// çünkü durak sayısı POI'ler kadar büyük olmayacak (performans kaygısı yok).
// Kullanıcının kendi isteği (3 Eylül): "haritaya uzaktan bakınca güzergahlar da saçma
// görünüyor, durak isimleri ne kadar uzaklaşsam da görünüyor ve üst üste biniyor, ayrıca çok
// fazla güzergah olduğu senaryoda tüm güzergahları uzaktan görmek istemezdim."
//   - resolution > TRANSIT_MAX_RESOLUTION  → hat ve duraklar HİÇ çizilmiyor (odaklanılan hat
//     hariç: kullanıcı bir hatta odaklandıysa her zoom'da görünür kalmalı).
//   - resolution > STOP_DOT_MAX_RESOLUTION → durak sadece küçük bir nokta (isim/numara yok).
//   - resolution > STOP_LABEL_MAX_RESOLUTION → durak emojisi + numara var, İSİM yok.
const TRANSIT_MAX_RESOLUTION = 160; // ~şehir ölçeğinden uzakta hatlar tamamen kapanıyor
const STOP_DOT_MAX_RESOLUTION = 40;
const STOP_LABEL_MAX_RESOLUTION = 12;

function buildStopLayerStyle(feature, resolution) {
  // Kullanıcının kendi isteği: "güzergahların yanında bilgi şeyi olsun tıklayınca...
  // haritada sadece o hatlar olacak şekilde göstersin" — selectedPoi izolasyonuyla AYNI
  // 'hidden' flag deseni (bkz. buildPoiLayerStyle: feature.get('poiHidden')).
  if (feature.get('transitHidden')) return HIDDEN_STYLE;
  const focused = feature.get('transitFocused') === true;
  const dimmed = feature.get('transitDimmed') === true;
  if (!focused && resolution > TRANSIT_MAX_RESOLUTION) return HIDDEN_STYLE;
  const color = feature.get('routeColor') || '#2563eb';
  const orderLabel = feature.get('sortOrder') != null ? String(feature.get('sortOrder') + 1) : '';

  // Uzakta: sadece küçük bir nokta — isim yığını olmasın.
  if (!focused && resolution > STOP_DOT_MAX_RESOLUTION) {
    return new Style({
      image: new CircleStyle({
        radius: 3.5,
        fill: new Fill({ color: dimmed ? 'rgba(148,163,184,0.5)' : color }),
      }),
    });
  }

  const showName = focused || resolution <= STOP_LABEL_MAX_RESOLUTION;
  // Kullanıcının kendi isteği: "duraklarda pin simgesi değil başka bir emoji olsun durak
  // emojisi fln." — durak dairesinin içinde artık 🚏 (odaklı hatta 🚉) duruyor; sıra numarası
  // dairenin sağ üstüne küçük bir rozet gibi kaydırıldı.
  const stopGlyph = focused ? '🚉' : '🚏';
  const alpha = dimmed ? 0.35 : 1;
  return [
    new Style({
      image: new CircleStyle({
        radius: focused ? 11 : 9,
        fill: new Fill({ color: dimmed ? 'rgba(255,255,255,0.55)' : '#ffffff' }),
        stroke: new Stroke({ color: dimmed ? 'rgba(148,163,184,0.55)' : color, width: focused ? 3.5 : 3 }),
      }),
      text: new Text({
        text: stopGlyph,
        font: focused ? '13px sans-serif' : '11px sans-serif',
        textBaseline: 'middle',
        fill: new Fill({ color: `rgba(15,23,42,${alpha})` }),
      }),
      zIndex: focused ? 40 : dimmed ? 5 : 20,
    }),
    new Style({
      text: new Text({
        text: showName ? feature.get('name') || '' : '',
        font: focused ? '700 12.5px sans-serif' : '600 12px sans-serif',
        offsetY: -22,
        textAlign: 'center',
        fill: new Fill({ color: dimmed ? 'rgba(100,116,139,0.6)' : '#1e293b' }),
        stroke: new Stroke({ color: `rgba(255,255,255,${dimmed ? 0.6 : 1})`, width: 3 }),
      }),
      zIndex: focused ? 41 : 21,
    }),
    new Style({
      text: new Text({
        text: orderLabel,
        font: '700 9.5px sans-serif',
        offsetX: 11,
        offsetY: -10,
        textAlign: 'center',
        textBaseline: 'middle',
        fill: new Fill({ color: dimmed ? 'rgba(148,163,184,0.7)' : color }),
        stroke: new Stroke({ color: `rgba(255,255,255,${alpha})`, width: 2.5 }),
      }),
      zIndex: focused ? 42 : 22,
    }),
  ];
}

// Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): "Rota yönü harita üzerinde ok
// işaretleri ile gösterilmelidir." — LineString üzerinde eşit aralıklı birkaç noktada
// (fraction 0.15..0.85) getCoordinateAt(fraction) ile örnekleme yapıp, o noktanın hemen
// öncesi/sonrasındaki küçük bir delta ile yön vektörünü (dx, dy) çıkarıyoruz. rotation =
// atan2(dx, dy) — OL'de RegularShape rotation'ı SAAT YÖNÜNDE, kuzeyden (yukarıdan) ölçülür;
// atan2'nin argümanlarını (dx, dy) sırasıyla vermek bu "kuzeyden saat yönünde" pusula
// açısını doğrudan verir (standart atan2(y,x) yerine).
function buildRouteArrowStyles(line, color) {
  const length = line.getLength();
  if (!length || length <= 0) return [];
  const arrowCount = length > 2000 ? 6 : length > 600 ? 4 : 2;
  const styles = [];
  const delta = Math.min(0.02, 1 / (arrowCount * 4));
  for (let i = 1; i <= arrowCount; i++) {
    const fraction = i / (arrowCount + 1);
    const before = Math.max(0, fraction - delta);
    const after = Math.min(1, fraction + delta);
    const p1 = line.getCoordinateAt(before);
    const p2 = line.getCoordinateAt(after);
    if (!p1 || !p2) continue;
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    if (dx === 0 && dy === 0) continue;
    const rotation = Math.atan2(dx, dy);
    const point = line.getCoordinateAt(fraction);
    styles.push(
      new Style({
        geometry: new Point(point),
        image: new RegularShape({
          points: 3,
          radius: 7,
          rotation,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: '#fff', width: 1 }),
        }),
      })
    );
  }
  return styles;
}

// Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma): "ilk duraktan son durağa doğru
// hareket eden bir araç ikonu/resmi haritada anlık konumuyla gösterilsin." — ekstra bir görsel
// dosyaya ihtiyaç duymamak için basit bir daire + 🚌 emoji kombinasyonu (POI/durak
// ikonlarındaki AYNI CircleStyle+Text deseni).
function buildSimulationVehicleStyle(feature) {
  const color = feature.get('routeColor') || '#2563eb';
  return new Style({
    image: new CircleStyle({
      radius: 12,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#fff', width: 2 }),
    }),
    text: new Text({
      text: '🚌',
      font: '14px sans-serif',
      textBaseline: 'middle',
    }),
  });
}

// Kullanıcının kendi isteği ("asıl amaç güzel konumda ev bulmak"): Konum Analizi'nin ürettiği
// eşleşen-POI listesinden, kriterlere göre en avantajlı birkaç NOKTAYı (sürekli bir ısı haritası
// değil, somut "işte burası iyi" pinleri) öne çıkarıyoruz. buildStopLayerStyle'daki İKİ-Style
// (daire+emoji, ayrı sıra/puan etiketi) deseniyle AYNI mantık.
function buildHouseSpotStyle(feature) {
  // Kullanıcının kendi isteği: "hesaplamaya kattığı, yarıçapın içindeki poiler öne çıksın" —
  // seçili ev noktasının 250 m'lik yarıçapı haritada kesikli bir daire olarak da çiziliyor ki
  // "bu puan neye göre" görsel olarak anlaşılsın.
  if (feature.get('isSpotRadius')) {
    return new Style({
      stroke: new Stroke({ color: 'rgba(22,163,74,0.9)', width: 2, lineDash: [6, 6] }),
      fill: new Fill({ color: 'rgba(22,163,74,0.08)' }),
    });
  }
  const rank = feature.get('rank');
  const score = feature.get('score');
  const selected = feature.get('isSelectedSpot') === true;
  return [
    new Style({
      image: new CircleStyle({
        radius: selected ? 16 : 12,
        fill: new Fill({ color: selected ? '#15803d' : '#16a34a' }),
        stroke: new Stroke({ color: '#fff', width: selected ? 3.5 : 2.5 }),
      }),
      text: new Text({ text: '🏡', font: selected ? '17px sans-serif' : '14px sans-serif', textBaseline: 'middle' }),
      zIndex: selected ? 20 : 10,
    }),
    new Style({
      text: new Text({
        text: `${rank}. ${Math.round(score)}/100`,
        font: selected ? '800 12px sans-serif' : '700 11px sans-serif',
        offsetY: selected ? -26 : -22,
        textAlign: 'center',
        fill: new Fill({ color: '#14532d' }),
        stroke: new Stroke({ color: '#fff', width: 3.5 }),
      }),
      zIndex: selected ? 21 : 11,
    }),
  ];
}

// Kullanıcının kendi tespiti (ilk versiyon çok basitti): "pide evi var diye onu direkt olarak
// almışsın... çeşit sayısının yakınlığı daha önemli olsun, bilindik restoranlar/cafeler/AVM'ler/
// ulaşım yerleri daha mantıklı olacaktır." — tek bir küçük/bilinmeyen işletmenin (ör. tek bir
// "Pide Evi") en yakın olması artık YETERLİ değil; bilinen zincir/marka isimleri (case-insensitive
// alt-dizi eşleşmesi) daha ağır basıyor. Bu liste kapsamlı olmak ZORUNDA değil — amaç "gerçekten
// tanınan bir yer mi" için kaba ama makul bir sinyal, POI verisindeki GERÇEK isimlerle (OSM
// kaynaklı, bkz. #76) çalışıyor.
const WELL_KNOWN_BRAND_KEYWORDS = [
  // Fast-food / restoran zincirleri
  'burger king', 'mcdonald', 'kfc', 'popeyes', 'domino', 'pizza hut', 'subway', 'simit sarayı',
  'usta dönerci', 'köfteci yusuf', 'çiya', 'nusr-et',
  // Kafe zincirleri
  'starbucks', 'kahve dünyası', 'gloria jean', 'caribou', 'espresso lab', 'kahve durağı',
  // Süpermarket / market zincirleri
  'migros', 'carrefour', 'bim', 'a101', 'şok', 'file market', 'metro', 'macrocenter', 'real',
  // AVM'ler (Ankara ağırlıklı, genel de kapsıyor)
  'ankamall', 'armada', 'panora', 'cepa', 'antares', 'kentpark', 'gordion', 'forum', 'akköprü',
  'mall of istanbul', 'istinye park', 'kanyon', 'city\'s',
  // Akaryakıt / ulaşım
  'shell', 'opet', 'total', 'petrol ofisi', 'bp ', 'aytemiz', 'ego', 'aski', 'thy', 'havalimanı',
  'otogar', 'metro istasyon', 'ankaray',
  // Bankalar
  'ziraat bankası', 'iş bankası', 'garanti bbva', 'akbank', 'yapı kredi', 'vakıfbank', 'halkbank',
  'qnb', 'denizbank', 'teb ', 'ing bank',
  // Eczane/hastane zincirleri
  'medical park', 'acıbadem', 'memorial',
];

function isWellKnownBrand(name) {
  if (!name) return false;
  const normalized = name.toLocaleLowerCase('tr');
  return WELL_KNOWN_BRAND_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

// Grid-tarama tabanlı "en iyi konum" bulucu — Konum Analizi'nin ürettiği ısı haritası SADECE
// eşleşen POI'lerin YOĞUNLUĞUNU gösteriyordu, "şu nokta iyi" diye somut bir öneri vermiyordu.
// Bu fonksiyon, seçilen alanın (matched POI'lerin bbox'ı, poligon modundaysa poligonla da
// kesişimi) içine bir ızgara (grid) seriyor; her ızgara noktası için HER kriterin YAKINDAKİ
// (arama yarıçapı içindeki) TÜM eşleşen POI'lerine bakıyor — sadece en yakın tekil POI'ye değil.
// Kullanıcının kendi isteği: "çeşit sayısının yakınlığı daha önemli olsun" — o yüzden puan,
// "en yakın ne kadar uzakta" (proximity) ile "yakında kaç seçenek var" (variety) bileşenlerinin
// ağırlıklı ortalaması; variety daha baskın (0.65). Bilinen zincir/marka isimleri variety
// hesabında normal bir POI'den daha "ağır" sayılıyor (BRAND_UNIT_BONUS), yani "3 bilinmeyen
// dükkan" ile "2 bilinen zincir" karşılaştırıldığında ikincisi öne çıkabiliyor. En yüksek puanlı
// noktalar, birbirine çok yakın kümelenmesin diye (aynı mahalle iki kere önerilmesin) minimum
// bir mesafe şartıyla (greedy) seçiliyor. Backend'e HİÇ gitmiyor — POI'ler zaten tarayıcıda
// (bkz. startLocationAnalysis), tamamen client-side, ekstra bir istek maliyeti yok.
function computeTopHouseSpots({
  extent3857,
  polygonGeom,
  criteria,
  poisByCriterion,
  poiCategories,
  gridSize = 18,
  topN = 5,
  minSpacingMeters = 350,
  // Yarıçap tek bir yerden yönetiliyor (HOUSE_SPOT_RADIUS_METERS) — hem puanlama hem de
  // haritadaki vurgulama/daire aynı değeri kullansın diye.
  // Kullanıcının kendi isteği: "1km yarıçap mantıksız olabilir belki 250m yarıçap daha iyi
  // olur" — 1km'de "yakın" sayılan bir POI aslında yürüme mesafesinin çok dışında kalabiliyordu
  // (örn. Şok aslında ~950m uzaktaydı ama "yakında" gösteriliyordu). 250m gerçekçi bir yürüme
  // mesafesi (~3 dk). Bunun BEDELİ: yarıçap küçüldükçe içine giren POI sayısı da azalır, bu
  // yüzden varietyTargetUnits (puanın 1.0'a doyduğu eşik) da 4'ten 3'e indirildi — yoksa 250m
  // içinde 4 "kalite birimi" bulmak çoğu noktada imkansızlaşıp tüm puanlar yapay şekilde düşük
  // çıkardı. Gerçek yoğunluk arttıkça (bkz. docs/ankara-poi-osm-restoran-pastane-eczane.json)
  // bu eşik yeniden yükseltilebilir.
  varietyRadiusMeters = HOUSE_SPOT_RADIUS_METERS,
  varietyTargetUnits = 3, // bu kadar "kalite birimi" (bkz. BRAND_UNIT_BONUS) yakınsa variety puanı 1.0'a doyar
}) {
  const BRAND_UNIT_BONUS = 1.6; // bilinen bir zincir, sıradan bir POI'ye göre variety hesabında 1.6 katı ağırlıkta sayılıyor
  const [minX, minY, maxX, maxY] = extent3857;
  if (!(maxX - minX > 1) || !(maxY - minY > 1)) return []; // tüm POI'ler aynı noktadaysa ("çizgisel" bbox) taramanın anlamı yok
  const scored = [];

  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const x = minX + ((maxX - minX) * i) / gridSize;
      const y = minY + ((maxY - minY) * j) / gridSize;
      if (polygonGeom && !polygonGeom.intersectsCoordinate([x, y])) continue;
      const [lon, lat] = toLonLat([x, y]);

      let weightedScoreSum = 0;
      let usedWeight = 0;
      // "Bu nokta bir binanın/AVM'nin tam üstünde mi?" kontrolü (bkz.
      // HOUSE_SPOT_MIN_POI_DISTANCE_METERS): bir POI'ye aşırı yakın adaylar ev olarak
      // önerilemez, aday tamamen eleniyor.
      let insideBuilding = false;
      const breakdown = [];
      criteria.forEach((c) => {
        const points = poisByCriterion.get(c.categoryId) || [];
        if (points.length === 0) return; // bu kriterin hiç eşleşen POI'si yoksa puanlamaya hiç katılmasın

        // Her POI'nin bu noktaya mesafesini bir kere hesaplayıp hem "en yakın" hem "yarıçap
        // içindeki tümü" için tekrar kullanıyoruz (gereksiz ikinci bir tarama yapmayalım diye).
        const withDistance = points.map((poi) => ({ poi, distanceMeters: getDistance([lon, lat], [poi.lon, poi.lat]) }));
        withDistance.sort((a, b) => a.distanceMeters - b.distanceMeters);
        const nearest = withDistance[0];
        // Ev, bir POI'nin (özellikle AVM/hastane gibi büyük tesislerin) tam üstünde olamaz.
        const landmarkLimit = isWellKnownBrand(nearest.poi.name) ? HOUSE_SPOT_MIN_LANDMARK_DISTANCE_METERS : HOUSE_SPOT_MIN_POI_DISTANCE_METERS;
        if (nearest.distanceMeters < landmarkLimit) insideBuilding = true;
        // Kullanıcının kendi tespiti (3 Eylül): "yeme-içme ve ulaşım seçince sıfır görünüyor,
        // duraklara uzaklığı da olsun, yarıçapı büyütebilirsin, yürüme mesafesinde yakın olsun."
        // — Ulaşım gibi SEYREK kriterlerde (bir mahallede tek metro durağı olur) 250 m'lik
        // çeşitlilik yarıçabı hemen hep 0 çıkıyordu ve puanı çökertiyordu. Artık:
        //   * seyrek kriterlerde (yakında <2 nokta) yarıçap yürüme mesafesine (800 m ~ 10 dk)
        //     genişliyor ve puan ÇEŞİTLİLİK yerine YAKINLIK üzerinden veriliyor,
        //   * yoğun kriterlerde (yeme-içme, market) eski çeşitlilik ağırlıklı model duruyor.
        const nearby = withDistance.filter((p) => p.distanceMeters <= varietyRadiusMeters);
        const sparse = nearby.length < 2;
        const effectiveRadius = sparse ? SPARSE_CRITERION_RADIUS_METERS : varietyRadiusMeters;
        const nearbyEffective = sparse ? withDistance.filter((p) => p.distanceMeters <= effectiveRadius) : nearby;
        const nearbyBrands = nearbyEffective.filter((p) => isWellKnownBrand(p.poi.name));

        // Yakınlık bileşeni: yürüme mesafesi ölçeğinde (400 m'de yarıya düşen) bir yakınlık puanı.
        const proximityScore = 1 / (1 + nearest.distanceMeters / 400);
        // Çeşitlilik bileşeni: yarıçap içindeki POI sayısı (bilinen zincirler daha ağır sayılıyor),
        // varietyTargetUnits'te 1.0'a doyuyor — "3 bilinmeyen dükkan" ile "2 bilinen zincir"
        // (2*1.6=3.2 birim) karşılaştırıldığında bilinen zincirler öne çıkabiliyor.
        const varietyUnits = (nearbyEffective.length - nearbyBrands.length) * 1 + nearbyBrands.length * BRAND_UNIT_BONUS;
        const varietyScore = Math.min(1, varietyUnits / varietyTargetUnits);
        const componentScore = sparse
          ? proximityScore * 0.8 + varietyScore * 0.2
          : proximityScore * 0.35 + varietyScore * 0.65;

        weightedScoreSum += c.weight * componentScore;
        usedWeight += c.weight;
        breakdown.push({
          categoryId: c.categoryId,
          categoryName: poiCategories.find((cat) => cat.id === c.categoryId)?.name || '?',
          distanceMeters: nearest.distanceMeters,
          poiName: nearest.poi.name,
          nearbyCount: nearbyEffective.length,
          radiusMeters: Math.round(effectiveRadius),
          // Listede önce bilinen zincirler görünsün (kullanıcının "bilindik" vurgusu), en fazla 3 isim.
          nearbyNames: nearbyEffective
            .slice()
            .sort((a, b) => (isWellKnownBrand(b.poi.name) ? 1 : 0) - (isWellKnownBrand(a.poi.name) ? 1 : 0) || a.distanceMeters - b.distanceMeters)
            .slice(0, 3)
            .map((p) => p.poi.name),
        });
      });
      if (usedWeight === 0) continue;
      if (insideBuilding) continue; // bir tesisin tam üstü ev önerisi olamaz
      // Kriterlerden biri bu bölgede hiç veri sunmuyorsa toplam puanı KALAN ağırlığa göre
      // normalize ediyoruz — yoksa "5 kriterden 3'ü karşılandı" bir nokta hep gereksiz düşük
      // puanlı görünür, oysa elimizdeki veriyle kıyaslarsak iyi bir aday olabilir.
      const score = (weightedScoreSum / usedWeight) * 100;
      scored.push({ lon, lat, score, breakdown });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const selected = [];
  for (const candidate of scored) {
    const tooClose = selected.some((s) => getDistance([s.lon, s.lat], [candidate.lon, candidate.lat]) < minSpacingMeters);
    if (tooClose) continue;
    selected.push(candidate);
    if (selected.length >= topN) break;
  }
  return selected;
}

// Güzergahı bağlayan çizgi — her güzergahın kendi rengiyle (route.color), Google Maps'teki
// transit hattı çizgisine benzer kalın, yuvarlak uçlu bir çizgi. Hoca ödevi: yön okları hattın
// kaynağından (OSRM rotası / elle bükülmüş hat / düz çizgi) bağımsız, HER durumda gösterilir.
function buildRouteLineStyle(feature, resolution) {
  if (feature.get('transitHidden')) return HIDDEN_STYLE;
  const focused = feature.get('transitFocused') === true;
  const dimmed = feature.get('transitDimmed') === true;
  // Uzakta (şehir dışı ölçek) hatlar tamamen kapanıyor — odaklanılan hat istisna (bkz.
  // TRANSIT_MAX_RESOLUTION yorumu).
  if (!focused && resolution > TRANSIT_MAX_RESOLUTION) return HIDDEN_STYLE;
  const color = feature.get('routeColor') || '#2563eb';
  // Kullanıcının kendi isteği: "herhangi bir güzergaha tıklayınca geri kalan her şey silikleşsin
  // ve o güzergah öne çıksın" — odaklı hat kalın + beyaz kontur (halo) ile, diğerleri soluk gri.
  if (dimmed) {
    return new Style({ stroke: new Stroke({ color: 'rgba(148,163,184,0.35)', width: 2.5, lineCap: 'round', lineJoin: 'round' }) });
  }
  const styles = [];
  if (focused) {
    styles.push(new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.9)', width: 10, lineCap: 'round', lineJoin: 'round' }), zIndex: 8 }));
  }
  styles.push(new Style({
    stroke: new Stroke({ color, width: focused ? 6 : 4, lineCap: 'round', lineJoin: 'round' }),
    zIndex: focused ? 9 : 3,
  }));
  const geometry = feature.getGeometry();
  if (geometry && geometry.getType() === 'LineString') {
    styles.push(...buildRouteArrowStyles(geometry, color));
  }
  return styles;
}

// Kullanıcının kendi isteği: "Ortak Görünüm"da kullanıcı başına GARANTİLİ TEKİL bir renk —
// isim tabanlı basit bir hash'i HSL çemberine (360°) yayıyoruz, böylece aynı kullanıcı adı
// HER ZAMAN aynı rengi alıyor (oturumlar/yenilemeler arası tutarlı, sunucudan renk tablosu
// çekmeye gerek yok). "Garantili tekil" kelimesi burada "çakışma İHTİMALİ çok düşük" anlamında
// — matematiksel olarak kesin tekillik istenirse (ör. binlerce kullanıcı) bir renk kayıt
// tablosu gerekir, bu ölçekte (okul projesi, onlarca kullanıcı) hash yeterli.
function hashUsernameToColor(username) {
  const str = username || '?';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 45%)`;
}

// Kullanıcının kendi isteği: "filtreleme de yapılabilsin çizime, kişiye göre" — bu fonksiyon
// modül seviyesinde (component dışında) tanımlı olduğu için component state'ine doğrudan
// erişemiyor; harita katmanı kurulurken (bkz. map-init effect) style fonksiyonu
// `(feature) => buildCombinedViewStyle(feature, combinedViewFiltersRef.current)` şeklinde
// SARMALANARAK çağrılıyor, güncel filtre değerleri böyle geçiriliyor.
function buildCombinedViewStyle(feature, filters) {
  if (filters) {
    if (filters.owner && feature.get('ownerUsername') !== filters.owner) return null;
    if (filters.mode && feature.getGeometry()?.getType() !== filters.mode) return null;
  }
  const color = feature.get('ownerColor') || '#6b7280';
  const geomType = feature.getGeometry()?.getType();
  const label = feature.get('ownerUsername') || '';
  const textStyle = label
    ? new Text({
        text: label,
        font: '600 11px sans-serif',
        fill: new Fill({ color: '#111827' }),
        stroke: new Stroke({ color: '#fff', width: 3 }),
        offsetY: -14,
      })
    : undefined;
  if (geomType === 'Point') {
    return new Style({
      image: new CircleStyle({ radius: 7, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
      text: textStyle,
    });
  }
  if (geomType === 'LineString') {
    return new Style({ stroke: new Stroke({ color, width: 3 }), text: textStyle });
  }
  // Bug fix (kullanıcı bildirdi, ekran görüntüsü): "çizimler siyahlaşıyor" — hashUsernameToColor
  // bir hsl(...) STRING'i döndürüyor, `${color}33` (hex-alpha eki) SADECE #rrggbb formatında
  // çalışır; "hsl(210, 70%, 45%)33" geçersiz bir CSS rengi olduğu için tarayıcı sessizce siyaha
  // düşüyordu. hsl(...) -> hsla(..., alpha) çevirimi doğru şeffaflığı veriyor.
  const fillColor = color.startsWith('hsl(') ? color.replace('hsl(', 'hsla(').replace(')', ', 0.22)') : `${color}33`;
  return new Style({
    stroke: new Stroke({ color, width: 2 }),
    fill: new Fill({ color: fillColor }),
    text: textStyle,
  });
}

const API_BASE = 'http://localhost:5276/api/Geometry';
const ANALYSIS_API_BASE = 'http://localhost:5276/api/Analysis';
const CATEGORY_API_BASE = 'http://localhost:5276/api/Category';
const TRASH_BASE = 'http://localhost:5276/api/Trash'; // undo(sil)/redo(oluştur) geri getirme için (TrashPanel'dekiyle aynı uç nokta)
const MAP_BASE = 'http://localhost:5276/api/Map'; // Faz 1a: birden fazla harita (kullanıcının kendi fikri)
const MAP_SHARE_BASE = 'http://localhost:5276/api/MapShare'; // Faz 2: harita paylaşımı
const SHARE_POLL_INTERVAL_MS = 4000; // AdminPage'deki loglarla aynı fikir — WebSocket yerine polling (bilinçli tercih)

// Hocanın Coğrafi Yetki Tanımlama görevi: kullanıcının çizim yapabileceği alan dışını
// gri maskeliyoruz. EPSG:3857'de tüm dünyayı kaplayan bir dış halka + izinli alanın
// halkasını "delik" olarak veren bir Polygon — OpenLayers çoklu halkalı Polygon'u otomatik
// delik olarak render eder (bir ülke poligonunun içindeki göl deliği gibi).
const GEO_RESTRICTION_BASE = 'http://localhost:5276/api/GeoRestriction';
const GEOSERVER_CONFIG_BASE = 'http://localhost:5276/api/GeoServerConfig'; // Isı Haritası + WMS önizleme için (bkz. MapPreviewLightbox)
// Hoca ödevi (POI/Rol/Operatör): POI'ler haritaya (Map/mapId) özel DEĞİL — bkz. Poi.cs'teki
// "kasıtlı olarak yok sayılan" notu — bu yüzden mapId almıyor, herkese aynı tek katman.
const POI_BASE = 'http://localhost:5276/api/Poi';
const POI_CATEGORY_BASE = 'http://localhost:5276/api/PoiCategory';
// Hoca ödevi (Akıllı Ulaşım Modülü): Durak/Güzergah yönetimi — POI ile AYNI mimari (kendi
// VectorSource'u, kendi Draw aracı), ama backend tarafında tamamen ayrı bir varlık (TransitRoute/
// TransitStop). Güzergah listesi herkese açık (auth gerekmez), durak listesi ViewRoutes/
// ManageRoutes/ManageAdmin izni gerektiriyor (bkz. auth.js getPermissions().canViewRoutes).
const TRANSIT_ROUTE_BASE = 'http://localhost:5276/api/TransitRoute';
const TRANSIT_STOP_BASE = 'http://localhost:5276/api/TransitStop';
const TRANSIT_SIMULATION_BASE = 'http://localhost:5276/api/TransitSimulation'; // Hoca ödevi (31 Ağustos)
// Kullanıcının kendi isteği (8. tur): "Diğer'den ana kategoriyi seçince 0 sonuç gösteriyor" —
// POI'ler sadece YAPRAK (leaf) kategori id'sine sahip (bkz. CreatePoiDto.CategoryId), bir üst
// kategori seçilince tek başına eşleşme aramak hep boş dönüyordu. Bu, seçilen kategori id'si +
// TÜM alt-ağacındaki (children, torunlar...) id'leri tek bir Set'e genişletiyor — admin
// panelindeki countPoisInCategoryTree ile AYNI mantık, burada filtreleme için.
function expandCategoryFilterIds(poiCategories, filterId) {
  if (!filterId) return null;
  const ids = new Set([String(filterId)]);
  let added = true;
  while (added) {
    added = false;
    for (const c of poiCategories) {
      if (c.parentId != null && ids.has(String(c.parentId)) && !ids.has(String(c.id))) {
        ids.add(String(c.id));
        added = true;
      }
    }
  }
  return ids;
}

// Isı Haritası SLD'sindeki (bkz. docs/) renk duraklarıyla BİREBİR AYNI olmalı — lejant ile
// haritadaki gerçek renkler UYUŞMAZSA kullanıcı yanlış yoğunluk okur. Tek doğruluk kaynağı
// burası; SLD dosyası bu diziyi elle kopyalayarak yazıldı, biri değişirse diğeri de güncellenmeli.
const HEATMAP_COLOR_STOPS = [
  { offset: 0, color: '#2563eb' }, // düşük yoğunluk — mavi
  { offset: 0.35, color: '#22d3ee' },
  { offset: 0.6, color: '#84cc16' },
  { offset: 0.8, color: '#facc15' },
  { offset: 1, color: '#dc2626' }, // yüksek yoğunluk — kırmızı
];
const WORLD_EXTENT_3857 = [-20037508.34, -20037508.34, 20037508.34, 20037508.34];
const GEO_MASK_STYLE = new Style({
  fill: new Fill({ color: 'rgba(24, 24, 27, 0.6)' }),
});
const GEO_BOUNDARY_STYLE = new Style({
  stroke: new Stroke({ color: '#22c55e', width: 3, lineDash: [10, 6] }),
});
const GEO_WARNING_DURATION_MS = 3000;

// Aktif çizim taslağı (henüz bitmemiş — köşe köşe tıklanırken) için OL'nin ÇİRKİN/ANLAMSIZ
// varsayılan "gri" taslak stili yerine, tipin kendi rengini kullanan bir önizleme —
// kullanıcı "sınır dışında gri bir şey kalıyor" diye şikayet etti; aslında o hiç bitmemiş,
// henüz drawend'e ulaşmamış bir taslaktı (OL'nin varsayılan stili gerçekten soluk gridir).
// Kendi rengiyle göstermek en azından "bu benim çiziyor olduğum şekil" algısını netleştiriyor;
// sınır dışına çıkıldığında ASIL red işlemi hâlâ drawend'de (bkz. handleDrawEnd) anında oluyor.
function buildSketchStyle(mode) {
  const color = TYPE_COLORS[mode] || '#2563eb';
  return new Style({
    fill: new Fill({ color: `${color}33` }),
    stroke: new Stroke({ color, width: 2, lineDash: [6, 6] }),
    image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: '#fff', width: 1.5 }) }),
  });
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const FLY_PREF_KEY = 'mapFlyAnimationEnabled';
const wktFormat = new WKT();

// Öznitelik pop-up'ındaki renk paleti — kullanıcı bunlardan birini seçebilir ya da
// serbest renk seçici ile kendi rengini belirleyebilir.
const COLOR_PRESETS = [
  '#2563eb', '#dc2626', '#16a34a', '#ea580c',
  '#9333ea', '#0891b2', '#ca8a04', '#db2777',
];

// fetch, sunucu hiç cevap vermezse süresiz beklemeye devam eder — belirtilen süre sonunda
// vazgeçip anlamlı bir hata fırlatması için AbortController ile bir zaman aşımı ekliyoruz.
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Authorization header'ı burada merkezi olarak ekliyoruz — çizim kaydetme (POST)
    // uç noktaları artık [Authorize], token'sız istek 401 döner. Token yoksa authHeader()
    // boş obje döndürür, hiçbir şey değişmez.
    return await fetch(url, {
      ...options,
      headers: { ...authHeader(), ...(options.headers || {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function hexToRgba(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Her geometri tipi kendi rengiyle çizilsin, üzerinde veritabanındaki GERÇEK id'si yazsın.
// Bunu bilerek sıraya göre (1,2,3...) değil kalıcı id'ye göre yapıyoruz: sıraya göre numara
// verirsek bir öğe silinince ondan sonrakilerin numarası kayar, "3 numaralı çizgi" dediğin
// şey zamanla başka bir çizgiye işaret etmeye başlar. id hep aynı şekli gösterir, güvenilir.
// customColor: kullanıcının öznitelik pop-up'ında seçtiği renk — boşsa tipin varsayılan
// rengine (TYPE_COLORS) düşer, eski kayıtlarla geriye dönük uyumlu olsun diye.
// name verilmişse haritadaki etikette id yerine o gösterilir ("nokta adı haritada da
// görünmeli" isteği).
// Envanter analizi kesişiminde kalan kayıtlar için sabit "neon" vurgu rengi — kaydın kendi
// rengi ne olursa olsun (mavi/turuncu/yeşil...) her zaman aynı, göz alıcı tonla öne çıksın.
const NEON_GLOW_COLOR = '#00f0ff';

// OpenLayers'ın Style API'si canvas shadowBlur'a doğrudan izin vermiyor; bu yüzden aynı
// geometrinin üstüne dıştan içe kararan/incelen yarı saydam halkalar (stroke) üst üste
// bindirilerek "neon glow" görünümü taklit ediliyor — klasik OL çözümü. Bu katmanlar ana
// stilin HEMEN ALTINDA (daha düşük zIndex) çizilir ki asıl şekil/renk üstte net kalsın.
function buildGlowLayers(mode, glowZIndex) {
  const rings = [
    { width: 18, alpha: 0.1 },
    { width: 11, alpha: 0.22 },
    { width: 5, alpha: 0.42 },
  ];

  if (mode === 'Point') {
    return rings.map(
      (ring) =>
        new Style({
          image: new CircleStyle({
            radius: 7 + ring.width / 1.5,
            stroke: new Stroke({ color: hexToRgba(NEON_GLOW_COLOR, ring.alpha), width: ring.width }),
          }),
          zIndex: glowZIndex,
        })
    );
  }

  return rings.map(
    (ring) =>
      new Style({
        stroke: new Stroke({ color: hexToRgba(NEON_GLOW_COLOR, ring.alpha), width: ring.width }),
        zIndex: glowZIndex,
      })
  );
}

// isGlowing: "Envanter Analizi" çalıştırıldığında bu kaydın çizilen poligonla kesiştiği
// (analysisResult.pointIds/lineIds/polygonIds içinde olduğu) anlamına gelir — etrafına
// neon halka eklenir ("kesişimin içinde kalanlar parlasın" isteği).
function buildStyle(mode, id, isSelected, customColor, name, isGlowing) {
  const color = isSelected ? SELECTED_COLOR : customColor || TYPE_COLORS[mode];
  const text = new Text({
    text: name || String(id),
    font: 'bold 12px system-ui, sans-serif',
    fill: new Fill({ color: '#fff' }),
    stroke: new Stroke({ color, width: 3 }),
    offsetY: mode === 'Point' ? -16 : 0,
    // overflow:false (varsayılan) OpenLayers'ı etiketi SADECE geometrinin kendi alanına
    // sığıyorsa çizmeye zorluyor — küçük bir çizgi/poligon uzaktan (düşük zoom'da) bu
    // yüzden hiç etiket göstermiyordu. overflow:true ile boyuttan bağımsız her zaman
    // çizilir, "çizgi/alan isimleri de uzaktan okunabilsin" isteğinin karşılığı.
    overflow: true,
  });

  // Nokta, çizgi ve alan etiketleri aynı katmanda üst üste gelebiliyor — nokta etiketi
  // daha küçük bir alanı işaret ettiği ve genelde daha "önemli" kabul edildiği için
  // zIndex'i en yüksek: "noktanın çok yakınında iseler nokta öne çıksın" isteği.
  const baseZIndex = mode === 'Point' ? 3 : mode === 'LineString' ? 2 : 1;
  const zIndex = isSelected ? baseZIndex + 10 : baseZIndex;

  let mainStyle;
  if (mode === 'Point') {
    mainStyle = new Style({
      image: new CircleStyle({
        radius: isSelected ? 9 : 7,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
      text,
      zIndex,
    });
  } else if (mode === 'LineString') {
    mainStyle = new Style({
      stroke: new Stroke({ color, width: isSelected ? 5 : 3 }),
      text,
      zIndex,
    });
  } else {
    mainStyle = new Style({
      stroke: new Stroke({ color, width: isSelected ? 4 : 2 }),
      fill: new Fill({ color: hexToRgba(color, 0.22) }),
      text,
      zIndex,
    });
  }

  if (!isGlowing) return mainStyle;
  return [...buildGlowLayers(mode, zIndex - 1), mainStyle];
}

// OpenStreetMap'in ücretsiz Nominatim servisiyle koordinattan yer adı (ilçe, il) bulur.
// Bu servis kişisel/öğrenim amaçlı düşük hacimli kullanım için ücretsizdir ama saniyede
// 1 istekten fazlasını istemiyor — bu yüzden çağıran taraf (processGeocodeQueue) sıraya alıp
// aralarında bekliyor.
// Kullanıcının kendi isteği (Ulaşım Modülü FAZ 2): "il ilçe mahalle vs otomatik oluştursun" —
// POI akışı zoom=10 (il/ilçe seviyesi) kullanıyordu, mahalle (neighbourhood) seviyesi için
// Nominatim'in çok daha DAR bir zoom (18'e yakın) istemesi gerekiyor, o yüzden zoom artık
// parametreli — POI çağrıları eski davranışı (zoom=10) korurken, güzergah/durak akışı mahalle
// için zoom=18 gönderiyor. neighborhood alanı POI tarafında kullanılmıyor, sadece transit
// akışında okunuyor.
async function reverseGeocode(lon, lat, zoom = 10) {
  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=${zoom}&accept-language=tr`;
    const response = await fetchWithTimeout(url, {}, 6000);
    if (!response.ok) return null;

    const data = await response.json();
    const address = data.address || {};
    const district = address.county || address.town || address.municipality || address.district || address.suburb;
    const province = address.province || address.state || null;
    const neighborhood = address.neighbourhood || address.suburb || address.quarter || address.residential || null;
    const place = [district, province].filter(Boolean).join(', ') || province;

    return place ? { place, province, district: district || null, neighborhood } : null;
  } catch (err) {
    console.error('Konum adı alınamadı:', err);
    return null;
  }
}

// view.fit() içeride bir extent'i (sağdaki paneli hesaba katarak) ekrana sığdırmak için
// hangi zoom'u seçtiğine yakın bir hesap — iki aşamalı "uzaklaş-sonra-yaklaş" animasyonunda
// hedef zoom'u tek bir fit() çağrısı olmadan kendimiz bulmamız gerekiyor.
function computeFitZoom(view, mapSize, extent, maxZoom) {
  if (!mapSize) return maxZoom;
  const [width, height] = mapSize;
  const paddedWidth = Math.max(1, width - 60 - 220); // sağdaki panel için ekstra boşluk
  const paddedHeight = Math.max(1, height - 60 - 60);
  const extentWidth = extent[2] - extent[0];
  const extentHeight = extent[3] - extent[1];
  if (extentWidth <= 0 && extentHeight <= 0) return maxZoom; // nokta gibi sıfır boyutlu extent
  const resolution = Math.max(extentWidth / paddedWidth, extentHeight / paddedHeight);
  return Math.min(view.getZoomForResolution(resolution), maxZoom);
}

// Bir noktaya "uçarak" gidiyormuş hissi veren iki aşamalı animasyon. Tepe noktası
// (en uzaklaşılan an) hedefin tam üstünde DEĞİL, kalkış ve varış noktasının ortasında —
// böylece hem "nereden kalktığı" hem "nereye gittiği" akıcı bir şekilde görülüyor, tam
// hedefe zıplamış gibi olmuyor. 1. aşama (easeOut) ortaya kadar uzaklaşıp kayıyor,
// 2. aşama de easeOut (ESKİDEN easeIn'di — kullanıcının "smoothluk yok, sol tarafta
// görünüp bir anda oluyor" tespiti tam da buydu: easeIn hedefe doğru HIZLANIP tam varışta
// aniden duruyor, bu da "zıplama/snap" hissi veriyor. easeOut ise tersine hızlı başlayıp
// hedefe doğru YAVAŞLAYARAK yumuşak iniş yapıyor — harita uygulamalarındaki "fly to" hissi
// bu şekilde).
// onComplete varsayılanı landingPulse — çizilen şekiller için "iniş halkası" efekti. POI
// arama barı (bkz. PoiSearchBar/zoomToPoi) gibi landingPulse'ın varsaydığı çizim stil
// sistemine (buildStyle/mode) hiç ait olmayan feature'lar için boş bir callback geçilir —
// landingPulse feature.setStyle() ile POI'nin kendi ikon stilini kalıcı olarak ezerdi.
function flyToFeature(map, feature, onComplete = () => landingPulse(feature)) {
  const view = map.getView();
  const size = map.getSize();
  const targetExtent = feature.getGeometry().getExtent();
  const targetCenter = getCenter(targetExtent);
  const currentCenter = view.getCenter() || targetCenter;
  const currentZoom = view.getZoom() ?? 7;
  const midCenter = [
    (currentCenter[0] + targetCenter[0]) / 2,
    (currentCenter[1] + targetCenter[1]) / 2,
  ];

  const comboExtent = createEmpty();
  extendExtent(comboExtent, [currentCenter[0], currentCenter[1], currentCenter[0], currentCenter[1]]);
  extendExtent(comboExtent, targetExtent);

  const comboZoom = computeFitZoom(view, size, comboExtent, 18);
  const peakZoom = Math.max(4, Math.min(currentZoom - 1.4, comboZoom - 0.8));
  const targetZoom = computeFitZoom(view, size, targetExtent, 15);

  view.animate(
    { center: midCenter, zoom: peakZoom, duration: 420, easing: easeOut },
    { center: targetCenter, zoom: targetZoom, duration: 620, easing: easeOut },
    (complete) => {
      if (complete) onComplete();
    }
  );
}

// Uçuş bitince hedefte kısa süreli, genişleyip sönen bir "iniş" halkası — sadece noktalar
// için (çizgi/alan geometrilerinde anlamlı bir merkez halkası olmuyor).
function landingPulse(feature) {
  const mode = feature.get('mode');
  const id = feature.get('id');
  const color = feature.get('color');
  const name = feature.get('name');
  const start = performance.now();
  const duration = 700;

  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const styles = [buildStyle(mode, id, true, color, name)];
    if (mode === 'Point') {
      styles.push(
        new Style({
          image: new CircleStyle({
            radius: 8 + t * 24,
            stroke: new Stroke({ color: hexToRgba(SELECTED_COLOR, 1 - t), width: 2.5 }),
          }),
        })
      );
    }
    feature.setStyle(styles);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      feature.setStyle(buildStyle(mode, id, true, color, name));
    }
  }
  requestAnimationFrame(step);
}

function formatTime(totalSeconds) {
  if (totalSeconds === null) return '--:--';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

// Kullanıcının kendi isteği: "son değiştirme tarihi ve saati yazsın örneğin son değiştirme
// 01:52 - 20.08.2026 gibi" — verdiği örnek formatın BİREBİR aynısı (formatDateTime'ın
// 'medium' stili ile örtüşmüyor, o yüzden ayrı bir yardımcı).
function formatModifiedShort(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${hh}:${mm} - ${dd}.${mo}.${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function formatLength(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters.toFixed(0)} m`;
}

function formatArea(squareMeters) {
  return squareMeters >= 1e6 ? `${(squareMeters / 1e6).toFixed(2)} km²` : `${squareMeters.toFixed(0)} m²`;
}

// Bilgi kartındaki "Konum" satırı — tipe göre enlem/boylam ya da uzunluk/alan.
// ol/sphere'in getLength/getArea'sı EPSG:3857 gibi bir projeksiyon verildiğinde dünyanın
// küre yaklaşımına göre GERÇEK metre/m² hesabı yapıyor (NTS'in düz .Length/.Area'sı SRID
// 4326'da derece cinsinden olur, anlamsız kalırdı) — bu yüzden hesap tamamen istemci
// tarafında, backend'e hiç gitmeden yapılabiliyor.
function describeGeometry(mode, geometry) {
  if (!geometry) return '—';

  if (mode === 'Point') {
    const [lon, lat] = toLonLat(geometry.getCoordinates());
    return `Enlem ${lat.toFixed(5)} · Boylam ${lon.toFixed(5)}`;
  }

  if (mode === 'LineString') {
    const vertexCount = geometry.getCoordinates().length;
    const length = getLength(geometry, { projection: 'EPSG:3857' });
    return `${vertexCount} nokta · ${formatLength(length)}`;
  }

  const rings = geometry.getCoordinates();
  const vertexCount = rings && rings[0] ? rings[0].length - 1 : 0; // ilk/son nokta aynı (kapalı halka)
  const area = getArea(geometry, { projection: 'EPSG:3857' });
  return `${vertexCount} köşe · ${formatArea(area)}`;
}

// Bir halkanın (ring) yönünü belirlemek için shoelace formülü — pozitif = saat yönünün
// tersi (CCW), negatif = saat yönü (CW). Gri maskede delik-halka yön normalizasyonu için
// kullanılıyor (bkz. aşağıdaki restrictedAreas effect'i).
function ringSignedArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

// Bir Polygon ya da MultiPolygon geometrisinin TÜM parçalarının DIŞ halkalarını döner —
// v2'de bir alan Nominatim'den gelen bir MultiPolygon olabiliyor (adalı/parçalı ülkeler),
// gri maskede her parça ayrı bir "delik" olmalı. Bilinçli sadeleştirme: bir alanın kendi
// içindeki delikler (ör. bir ülkenin içindeki enklav) burada yok sayılıyor — sadece dış
// sınır maskeye delik olarak işleniyor, bu görev kapsamında önemsiz bir edge-case.
function extractOuterRings(geometry) {
  const type = geometry.getType();
  if (type === 'Polygon') {
    return [geometry.getCoordinates()[0]];
  }
  if (type === 'MultiPolygon') {
    return geometry.getCoordinates().map((polygonCoords) => polygonCoords[0]);
  }
  return [];
}

function MapPage() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawSourceRef = useRef(null);
  const drawLayerRef = useRef(null); // "Ortak Görünüm" açılınca kendi haritanın katmanını gizlemek için (bkz. openCombinedAdminView)
  const poiLayerRef = useRef(null);
  // Uzak/orta zoom'daki ucuz POI katmanı (bkz. buildPoiOverviewStyle) — görünürlük ve
  // yeniden çizim için poiLayer ile birlikte yönetiliyor.
  const poiOverviewLayerRef = useRef(null);
  const layerVisibilityRef = useRef({ Point: true, LineString: true, Polygon: true, Poi: true, Routes: true });
  // Hocanın Coğrafi Yetki görevi: gri maske + sınır çizgisi katmanlarının kaynakları, ve
  // handleDrawEnd'in kapanış (closure) bayatlaması yaşamadan HER ZAMAN GÜNCEL sınırı
  // okuyabilmesi için geometri bir ref'te tutuluyor (state değil — MapPage.jsx'teki
  // latestRef deseniyle aynı gerekçe, ama tek bir değer için tam ceremony gereksiz).
  const geoMaskSourceRef = useRef(null);
  const geoBoundarySourceRef = useRef(null);
  const restrictedAreaGeomsRef = useRef([]); // v2: TEK geometri değil, izinli alanların LİSTESİ (herhangi birinin içi yeterli)
  const geoWarningTimerRef = useRef(null);
  const analysisSourceRef = useRef(null); // "Envanter Analizi" aracının geçici (kaydedilmeyen) poligonu
  const heatmapSourceRef = useRef(null); // Isı Haritası: GeoServer WMS (STYLES=heatmap) katmanının kaynağı
  const heatmapLayerRef = useRef(null); // aynı katmanın OL Image katmanı — aç/kapa sadece setVisible
  // Kullanıcının kendi isteği ("asıl amaç güzel konumda ev bulmak"): Konum Analizi sonucundan
  // türetilen somut "en iyi N nokta" pinleri — locationHeatmapSource'tan TAMAMEN ayrı (o sürekli
  // bir yoğunluk gösterimi, bu ise ayrık öneri noktaları), bkz. computeTopHouseSpots.
  const houseSpotSourceRef = useRef(null);
  const houseSpotLayerRef = useRef(null);
  const [locationAnalysisTopSpots, setLocationAnalysisTopSpots] = useState([]);
  const [selectedHouseSpotIndex, setSelectedHouseSpotIndex] = useState(null); // haritadan/listeden tıklanan noktanın detay popup'ı
  // Hoca ödevi (25 Ağustos — Konum Analizi): "İller listesinden seçim yapma veya haritada
  // Poligon çizme yöntemi ile sınır belirlenebilir." Poligon modu Envanter Analizi'yle AYNI
  // desen (kendi geçici VectorSource'u, backend'e hiç gitmiyor) ama karışmasın diye TAMAMEN
  // ayrı bir kaynak/katman. Poligonun kendisi state DEĞİL, ref'te tutuluyor (her POI filtresi
  // hesaplanırken .intersectsCoordinate ile okunuyor) — sadece "var mı yok mu" bilgisi
  // (hasLocationPolygon) state, UI güncellemesi için yeterli.
  const locationPolygonSourceRef = useRef(null);
  const locationPolygonGeomRef = useRef(null);
  // Ağırlıklı ısı haritası: GeoServer'a hiç gitmiyor — POI listesi zaten tarayıcıda (arama
  // barı için tüm katalog bir kerede çekiliyor), bu yüzden alan+kriter filtresi VE
  // görselleştirme (ol/layer/Heatmap, per-feature `weight`) tamamen client-side. Mevcut
  // (GeoServer WMS tabanlı, ağırlıksız) "Isı Haritası Analizi" aracıyla KARIŞTIRILMASIN —
  // o tbl_point (çizilen tüm noktalar) üzerinde çalışıyor, bu ise SADECE POI'ler + ağırlık.
  const locationHeatmapSourceRef = useRef(null);
  const locationHeatmapLayerRef = useRef(null);
  // Isı haritası yarıçabını zoom'a göre güncelleyen fonksiyon (harita kurulumunda atanıyor) —
  // hem view'in 'change:resolution' olayı hem de analiz başlatma anı bunu çağırıyor.
  const heatmapRadiusSyncRef = useRef(null);
  // Güzergah odağı açılmadan ÖNCEKİ katman görünürlüğü — odak kapanınca geri yüklemek için.
  const preFocusLayerVisibilityRef = useRef(null);
  // focusRoute fonksiyonu bileşenin ALTINDA tanımlı; harita 'click' handler'ı mount anında
  // kurulduğu için (kapanış/closure bayatlaması) onu doğrudan çağıramıyor — ref üzerinden
  // erişiyoruz (editingRoutePathIdRef ile AYNI desen).
  const focusRouteRef = useRef(null);
  const poiSourceRef = useRef(null); // Hoca ödevi (POI): tbl_point'ten TAMAMEN ayrı, kendi VectorSource'u
  // Hoca ödevi (Akıllı Ulaşım Modülü): POI ile AYNI izole desen — durak noktaları kendi
  // VectorSource/VectorLayer'ında, güzergah çizgileri (LineString) ayrı bir kaynakta.
  const stopSourceRef = useRef(null);
  const stopLayerRef = useRef(null);
  // "Ortak Görünüm" (bkz. openCombinedAdminView) — admin-only, salt okunur, tüm
  // kullanıcıların çizimlerini bir arada gösteren izole katman.
  const combinedViewSourceRef = useRef(null);
  const combinedViewLayerRef = useRef(null);
  const [combinedViewActive, setCombinedViewActive] = useState(false);
  const [combinedViewLoading, setCombinedViewLoading] = useState(false);
  const [combinedViewStats, setCombinedViewStats] = useState(null); // { userCount, itemCount }
  // Kullanıcının kendi isteği: "sağdaki çizilenler kısmında herkesinkiler listelensin çizen
  // ismiyle birlikte" — normal Çizilenler paneli (drawnItems) sadece AKTİF haritanın kendi
  // şekillerini biliyor, Ortak Görünüm'ün ayrı/izole kaynağını (combinedViewSourceRef) hiç
  // görmüyordu. Bu, panel'in Ortak Görünüm modunda göstereceği AYRI liste.
  const [combinedViewItems, setCombinedViewItems] = useState([]);
  // Kullanıcının kendi isteği: "filtreleme de yapılabilsin çizime, kişiye göre" — owner: seçili
  // kullanıcı adı ('' = tümü), mode: 'Point'/'LineString'/'Polygon' ('' = tümü). Style
  // fonksiyonu modül seviyesinde olduğu için (component state'ine erişemiyor) güncel filtre
  // buradan bir ref üzerinden okunuyor (bkz. aşağıdaki effect ve map-init effect'teki wrapper).
  const [combinedViewOwnerFilter, setCombinedViewOwnerFilter] = useState('');
  const [combinedViewTypeFilter, setCombinedViewTypeFilter] = useState('');
  const combinedViewFiltersRef = useRef({ owner: '', mode: '' });
  // Kullanıcının kendi isteği: "çizilenlerin üzerine tıklayınca kimin hangi haritası olduğu
  // görülebilsin" — bir listeye/öğeye tıklanınca bu state doluyor, küçük bir detay popup'ı açılıyor.
  const [combinedViewDetailKey, setCombinedViewDetailKey] = useState(null);
  // Ortak Görünüm'deki kişi/tip filtresi değişince harita katmanının stilini yeniden çizdiriyor
  // (bkz. buildCombinedViewStyle'ın filters parametresi). combinedViewOwnerFilter/TypeFilter
  // yukarıda tanımlandığı İÇİN bu effect onlardan SONRA gelmeli — sırası ters olursa "Cannot
  // access before initialization" hatası verir (const'lar hoisting yapmaz, let/const TDZ kuralı).
  useEffect(() => {
    combinedViewFiltersRef.current = { owner: combinedViewOwnerFilter, mode: combinedViewTypeFilter };
    combinedViewSourceRef.current?.changed();
  }, [combinedViewOwnerFilter, combinedViewTypeFilter]);
  const routeLineSourceRef = useRef(null);
  const routeLineLayerRef = useRef(null);
  // Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma + SignalR Canlı Veri Yayını):
  // hareket eden araç ikonları için POI/duraklardan TAMAMEN ayrı, minik bir katman —
  // simulationSnapshots state'inden (SignalR'dan gelen PositionUpdated olaylarıyla
  // güncelleniyor) türetiliyor.
  const simulationVehicleSourceRef = useRef(null);
  const simulationVehicleLayerRef = useRef(null);
  // routeId -> { isRunning, percentComplete, lon, lat, routeName, routeColor } — SADECE
  // "Takip Et" dediğimiz (followedRouteIds'te olan) güzergahlar için dolduruluyor, o yüzden
  // sistemdeki her simülasyonu dinlemek zorunda kalmıyoruz (bkz. transitSimulationConnection.js).
  const [simulationSnapshots, setSimulationSnapshots] = useState({});
  const [followedRouteIds, setFollowedRouteIds] = useState(() => new Set());
  const unfollowFnsRef = useRef({}); // routeId -> followRoute()'dan dönen temizlik fonksiyonu
  const [simulationActionRouteId, setSimulationActionRouteId] = useState(null); // Başlat/Durdur'a basılıp yanıt beklenirken
  // Bir güzergahın "Simülasyonu Başlat/Durdur" düğmesinin hangi durumda görüneceğini bilmek
  // için (SignalR grup'una hiç katılmadan) GET .../state ile tek seferlik sorgulanan sonuç.
  const [simulationRunningState, setSimulationRunningState] = useState({}); // routeId -> boolean
  const [selectedSimulationRouteId, setSelectedSimulationRouteId] = useState(null); // araca tıklanınca açılan popup
  // Kullanıcının kendi isteği: "zafer 2'den binip zafer 5'te inecek biri için toplam süre fln
  // da yazsın geri sayım olsun" — yolcunun seçtiği biniş/iniş durağı, araç popup'ı içindeki
  // küçük "yolculuk planlayıcı"da kullanılıyor. Araç değişince (başka bir güzergaha tıklanınca)
  // sıfırlanıyor, eski seçim yeni güzergahta anlamsız kalmasın diye.
  const [boardingStopId, setBoardingStopId] = useState(null);
  const [destinationStopId, setDestinationStopId] = useState(null);
  // Kullanıcının kendi isteği: "duraklatınca görünmesinler" — fetchStops() içindeki
  // filtreleme routes state'inin GÜNCEL halini senkron okuyabilsin diye (state kapanışı
  // gecikebilir) routes AYNI ANDA bu ref'e de yazılıyor (bkz. fetchRoutes).
  const routesRef = useRef([]);
  const vertexLabelSourceRef = useRef(null); // şekil düzenlerken köşelerin üstünde 1,2,3... yazan geçici katman
  const analysisGlowKeysRef = useRef(new Set()); // analysisResult ile kesişen "mode-id" anahtarları (neon vurgu)
  const hoveredItemKeyRef = useRef(null); // Çizilenler panelinde üzerine gelinen öğe — haritada aynı neon vurguyu tetikler
  const featuresByKeyRef = useRef(new Map()); // "mode-id" -> ol Feature
  const selectedKeyRef = useRef(null);
  const drawModeRef = useRef(null);
  const editingGeometryRef = useRef(null); // map 'click' listener'ı mount'ta bir kere kuruluyor, güncel değeri ref'ten okuyor
  // Kullanıcının kendi isteği: "hattı düzenleme haritadan hatta tıklayınca olsun" — map 'click'
  // listener'ı mount'ta BİR KERE kuruluyor (aşağıdaki editingGeometryRef ile AYNI sebep), bu
  // yüzden editingRoutePathId'nin güncel değerini bir ref üzerinden okuyoruz.
  const editingRoutePathIdRef = useRef(null);
  const geocodeQueueRef = useRef([]);
  const geocodingRef = useRef(false);
  const navigate = useNavigate();
  const myUserId = getMyUserId();

  // Geri al / ileri al geçmişi — yığınlar ref'te tutuluyor (her push'ta re-render gerekmiyor),
  // sadece buton disabled durumları için ayrıca sayaç state'i tutuyoruz (bkz. syncHistoryCounts).
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const isReplayingHistoryRef = useRef(false); // undo/redo replay sırasında yeni kayıt itilmesin diye
  const activeDrawRef = useRef(null); // Esc ile iptal edebilmek için o an aktif Draw interaction'ı
  const sketchActiveRef = useRef(false); // Draw'ın yarım kalmış bir taslağı var mı (drawstart/drawend/drawabort ile senkron)

  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [drawMode, setDrawMode] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  // Hocanın Coğrafi Yetki görevi (v2: birden fazla alan olabilir) — kullanıcının efektif
  // çizim alanları ({ wkt, name }[], boş liste = sınırsız) ve sınır dışına çizim
  // denenince 3 saniyeliğine görünen uyarı.
  const [restrictedAreas, setRestrictedAreas] = useState([]);
  const [geoWarning, setGeoWarning] = useState(null);
  const [drawnItems, setDrawnItems] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [deletingKeys, setDeletingKeys] = useState(new Set());
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // Kullanıcının kendi isteği: "güzergahlar, noktalar fln açılıp kapanabilir olsun yazının
  // üzerine tıklayınca" — Çizilenler panelindeki her kategori (Güzergahlar/Nokta/Çizgi/Alan)
  // başlığına tıklayınca AYRI AYRI açılıp kapanabiliyor (panelCollapsed'ten bağımsız, panel
  // zaten açıkken içindeki tek tek kategoriler daraltılabiliyor).
  const [collapsedCategories, setCollapsedCategories] = useState(() => new Set());
  function toggleCategoryCollapse(key) {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  const [layerFilterOpen, setLayerFilterOpen] = useState(false);
  // Kullanıcının kendi isteği: "POI filtresi kendi içinde açılır kapanır olsun, başlangıçta
  // kapalı olsun" — Haritada gösterilenler paneli içindeki alt-bölüm.
  const [poiFilterOpen, setPoiFilterOpen] = useState(false);
  // Kullanıcının kendi isteği: "Haritada gösterilenler paneli haritaya/admin paneline/
  // ayarlara tıklayınca veya Esc'e basınca otomatik kapansın" — panelin DIŞINA yapılan HER
  // tıklama (harita dahil, çünkü harita canvas'ı bu ref'in içinde DEĞİL) paneli kapatıyor.
  const layerFilterRef = useRef(null);
  useEffect(() => {
    if (!layerFilterOpen) return undefined;
    function handleOutsideClick(e) {
      if (layerFilterRef.current && !layerFilterRef.current.contains(e.target)) {
        setLayerFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [layerFilterOpen]);
  const [layerVisibility, setLayerVisibility] = useState({ Point: true, LineString: true, Polygon: true, Poi: true, Routes: true });
  const [selectedProvince, setSelectedProvince] = useState('');
  const [mapLoading, setMapLoading] = useState(true);
  const [pendingDraw, setPendingDraw] = useState(null); // { mode, feature, typeInfo, wkt } — öznitelik pop-up'ı onay bekliyor
  const [analysisToolActive, setAnalysisToolActive] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisSelected, setAnalysisSelected] = useState(false); // haritada analiz poligonuna tıklanınca alttaki "Kaldır" barı için
  const [analysisLoading, setAnalysisLoading] = useState(false);
  // Hoca ödevi (2. tur — Isı Haritası Analizi): açık/kapalı bilgisinden fazlası gerekmiyor,
  // katmanın kendisi (heatmapLayerRef) her zaman haritada duruyor, sadece görünürlüğü
  // değişiyor — bkz. toggleHeatmap. Diğer araçlarla (çizim/Envanter Analizi) KARIŞTIRILMADI:
  // bu bir GİRİŞ aracı değil, sadece görüntüleme katmanı, o yüzden onları kapatmıyor.
  const [heatmapActive, setHeatmapActive] = useState(false);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  // Kullanıcının kendi tespiti: "sağda bir bar çıkıyor, başka bir şey olmuyor" — lejant
  // eskiden sadece heatmapActive'e bakıp çiziliyordu, GeoServer'dan gelen GÖRÜNTÜNÜN
  // gerçekten yüklenip yüklenmediğine hiç bakmıyordu (GeoServer bir hata XML'i dönse bile
  // lejant sanki her şey yolundaymış gibi görünüyordu). Artık ImageWMS kaynağının kendi
  // 'imageloaderror' olayını dinleyip lejantı SADECE görüntü gerçekten yüklendiyse gösteriyoruz.
  const [heatmapImageError, setHeatmapImageError] = useState(false);
  // Hoca ödevi (POI/Rol/Operatör): "haritada POI ekleme aracı (Point)" — Envanter Analizi
  // aracıyla AYNI izole desen (kendi Draw interaction'ı, backend'e sadece POI POST ediyor).
  const [poiToolActive, setPoiToolActive] = useState(false);
  const [poiCategories, setPoiCategories] = useState([]);
  const [pois, setPois] = useState([]);
  // Hoca ödevi (Akıllı Ulaşım Modülü): "Operatör için haritada 'Durak Ekle' (Point) aracı
  // oluşturun." — POI aracıyla AYNI desen. lockedStopRouteId, Güzergah Yönetimi panelindeki
  // "Haritadan Ekle" akışında (bkz. sessionStorage 'pendingStopRouteId') dolduruluyor —
  // dolu olduğunda StopFormPopup'ta güzergah dropdown'ı gizlenip durak doğrudan o güzergaha
  // eklenir ("Haritada seçilen bir nokta doğrudan güzergaha durak olarak eklenebilmelidir.").
  const [stopToolActive, setStopToolActive] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  // Hat bükme sırasında (aşağıdaki [editingRoutePathId] Modify effect'i) mount-zamanlı
  // kapanışların bayatlamasını önlemek için stops'un güncel halini bir ref'te de tutuyoruz —
  // routesRef ile AYNI desen.
  const stopsRef = useRef([]);
  useEffect(() => {
    stopsRef.current = stops;
  }, [stops]);
  const [pendingStopDraw, setPendingStopDraw] = useState(null); // { feature, wkt } — form pop-up'ı onay bekliyor
  const [lockedStopRouteId, setLockedStopRouteId] = useState(null);
  const [selectedStop, setSelectedStop] = useState(null); // tıklanan durağın bilgi paneli için
  const [editingStopId, setEditingStopId] = useState(null);
  const [editStopName, setEditStopName] = useState('');
  const [editStopRouteId, setEditStopRouteId] = useState('');
  const [savingStop, setSavingStop] = useState(false);
  // Kullanıcının kendi isteği: "bizim eklediğimiz güzergahlar düz çizgi olarak birleşiyor...
  // en kötü ihtimalle aralarındaki çizgileri tutup kırabiliyor olalım bükebilelim. ctrl z ile
  // geri alsın." — gerçek yol-takipli routing (OSRM/GraphHopper gibi bir servis) bu projede
  // YOK, entegre etmek kapsamı ciddi genişletir; bu yüzden kullanıcının kendi önerdiği
  // "fallback" uygulandı: ol/interaction/Modify ile TEK bir güzergah çizgisi üzerinde elle
  // köşe sürükleme/segment ortasından yeni köşe ekleme, Alt+tık ile köşe silme. Kaydedilince
  // mevcut undo/redo yığınına (pushHistory/performUndo/performRedo — bkz. yukarısı) AYNI
  // {undo, redo} deseniyle tek bir kayıt düşer (vertex-vertex değil, "kaydet" bazında —
  // uygulamadaki TÜM diğer şekil düzenlemeleriyle AYNI granülerlik).
  const [editingRoutePathId, setEditingRoutePathId] = useState(null);
  const [savingRoutePath, setSavingRoutePath] = useState(false);
  // Kullanıcının kendi isteği: "kaydettikten sonra tekrar bu düzenleme ekranına gelince
  // sıfırla tuşu deaktif olsun ama herhangi bir değişiklik yapınca sıfırlanabilsin" —
  // düzenleme oturumu başlarken false, ilk gerçek sürükleme (durak taşıma ya da serbest
  // bükülme) olunca true oluyor.
  const [routePathDirty, setRoutePathDirty] = useState(false);
  // Kullanıcının kendi isteği: hat düzenleme kartında da "Rota Oluştur" olsun.
  const [generatingRoutePathId, setGeneratingRoutePathId] = useState(null);
  const routePathModifyRef = useRef(null);
  const routePathBaselineWktRef = useRef(null); // düzenleme başlarken hattın WKT'si (Vazgeç/Undo'nun "önceki" değeri)
  // Kullanıcının kendi isteği: "bir durağın olduğu köşeyi tutunca çizgi durağı bırakıp
  // ayrılıyor" — Modify interaction'ı LineString'in köşelerini durak noktalarından habersiz
  // sürüklüyordu. Her modifyend'de köşe koordinatlarını bu ref'teki ÖNCEKİ haliyle
  // karşılaştırıp, değişen köşe bir durağın konumuyla eşleşiyorsa bunu bir "hat bükme
  // noktası" değil "durağı taşı" eylemi olarak ele alıyoruz (bkz. aşağıdaki [editingRoutePathId] effect'i).
  const routePathPrevCoordsRef = useRef(null);
  // Kullanıcının kendi isteği: "güzergahların yanında bilgi şeyi olsun tıklayınca tüm
  // durakları falan haritada sadece o hatlar olacak şekilde ve oraya yakınlaşmış şekilde
  // göstersin" — selectedPoi izolasyonuyla AYNI fikir (bkz. buildStopLayerStyle/
  // buildRouteLineStyle: feature.get('transitHidden')), AdminPage'in "ℹ️ Bilgi" butonundan
  // sessionStorage 'focusRouteId' ile tetikleniyor (goToMapForStop ile AYNI handoff deseni).
  const [focusedRouteId, setFocusedRouteId] = useState(null);
  const routeFocusFitDoneRef = useRef(false); // her focus oturumunda SADECE bir kez zoom-fit yap
  const editRoutePathFitDoneRef = useRef(false); // hat düzenleme oturumunda SADECE bir kez zoom-fit yap
  // "Haritadan Durak Ekle" — izolasyon yapmadan sadece mevcut duraklara zoom-fit (bkz. aşağıdaki
  // 'fitStopRouteId' handoff effect'i).
  const [stopFitRouteId, setStopFitRouteId] = useState(null);
  const stopFitDoneRef = useRef(false);
  // Hoca ödevi (25 Ağustos — Konum Analizi): panel açık/kapalı, alan seçimi (il ya da
  // poligon), 2-5 kategori bazlı kriter (ağırlık toplamı tam 100 olmalı) ve sonucun
  // (ağırlıklı ısı haritası) o an gösterilip gösterilmediği. `locationAnalysisActive` panel
  // görünürlüğü, `locationAnalysisResultActive` ısı haritası katmanının görünürlüğü — ikisi
  // BAĞIMSIZ (Envanter Analizi'ndeki analysisToolActive/analysisResult ayrımıyla AYNI mantık):
  // panel kapatılsa bile üretilmiş ısı haritası "Temizle"ye basılana kadar haritada kalır.
  const [locationAnalysisActive, setLocationAnalysisActive] = useState(false);
  const [locationAnalysisAreaMode, setLocationAnalysisAreaMode] = useState('province');
  const [locationAnalysisProvince, setLocationAnalysisProvince] = useState('');
  const [locationAnalysisDrawing, setLocationAnalysisDrawing] = useState(false);
  const [hasLocationPolygon, setHasLocationPolygon] = useState(false);
  const [locationAnalysisCriteria, setLocationAnalysisCriteria] = useState([
    { categoryId: '', weight: 50 },
    { categoryId: '', weight: 50 },
  ]);
  const [locationAnalysisResultActive, setLocationAnalysisResultActive] = useState(false);
  const [locationAnalysisMatchedCount, setLocationAnalysisMatchedCount] = useState(null);
  const [locationAnalysisMatchedBreakdown, setLocationAnalysisMatchedBreakdown] = useState([]);
  // Kullanıcının kendi isteği (8. tur): "kriterler neler ise sadece onlar görünse daha iyi
  // olur haritada diğer poiler görünmesin analiz yapınca" — eşleşen POI id'lerini ayrıca
  // tutuyoruz ki aşağıdaki poiHidden izolasyon effect'i (bkz. selectedPoi != null dalıyla
  // AYNI mekanizma) sadece bunları göstersin, geri kalan tüm POI'leri gizlesin.
  const [locationAnalysisMatchedIds, setLocationAnalysisMatchedIds] = useState(null);
  const [pendingPoiDraw, setPendingPoiDraw] = useState(null); // { feature, wkt } — form pop-up'ı onay bekliyor
  const [selectedPoi, setSelectedPoi] = useState(null); // tıklanan POI'nin bilgi paneli için
  const [editingPoiId, setEditingPoiId] = useState(null);
  const [editPoiName, setEditPoiName] = useState('');
  const [editPoiCategoryId, setEditPoiCategoryId] = useState('');
  const [editPoiSchedule, setEditPoiSchedule] = useState([]);
  const [editPoiScheduleExceptions, setEditPoiScheduleExceptions] = useState([]);
  const [editPoiNote, setEditPoiNote] = useState('');
  const [editPoiIcon, setEditPoiIcon] = useState('');
  const [poiCategoryFilter, setPoiCategoryFilter] = useState('');
  const [poiOwnerFilter, setPoiOwnerFilter] = useState('all');
  const [poiStatusFilter, setPoiStatusFilter] = useState('all');
  const [savingPoi, setSavingPoi] = useState(false);
  const editingPoiIdRef = useRef(null);
  const editingPoiOriginalGeometryRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [editingKey, setEditingKey] = useState(null); // Çizilenler panelinde inline düzenlenen öğe
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false); // admin olmayan ama kategori izni olanlar için mini panel
  const [trashOpen, setTrashOpen] = useState(false); // sadece adminler görür — ayarlarla aynı boyutta ikon, modal açar
  // window.confirm() yerine kendi onay penceremiz — { title, message, onConfirm }
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [editingGeometryKey, setEditingGeometryKey] = useState(null); // bilgi kartındaki "Düzenle" ile şekil sürükleme modu
  // Şekil düzenleme modunda haritada tıklanan köşenin sıra numarası — VertexCoordinateEditor
  // listesindeki karşılığını highlight etmek için (bkz. aşağıdaki vertexLabelLayer click'i).
  const [selectedVertexIndex, setSelectedVertexIndex] = useState(null);
  const [savingGeometry, setSavingGeometry] = useState(false);
  // Bilgi kartındaki Düzenle modunda isim/renk/kategori alanları — geometriyle BİRLİKTE,
  // aynı Kaydet butonundan kaydediliyor (bkz. saveEditedFeature).
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const editingOriginalGeometryRef = useRef(null); // "Vazgeç" denince şekli eski haline döndürmek için
  const [flyAnimationEnabled, setFlyAnimationEnabled] = useState(() => {
    const stored = localStorage.getItem(FLY_PREF_KEY);
    return stored === null ? true : stored === 'true';
  });
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  function toggleLayerVisibility(key) {
    const next = { ...layerVisibilityRef.current, [key]: !layerVisibilityRef.current[key] };
    layerVisibilityRef.current = next;
    setLayerVisibility(next);
    if (next[key] === false) {
      if (key === 'Poi') setSelectedPoi(null);
      else {
        const selectedItem = drawnItems.find((item) => item.key === selectedKeyRef.current);
        if (selectedItem?.mode === key) selectFeature(null);
      }
    }
  }

  // Kullanıcının kendi isteği (düzeltme): "3. ssdeki ise sadece güzergahlar olmayacak.
  // güzergahlar yazısı olacak diğerleri gibi, Noktalar, Çizgiler fln gibi olacak yani aynı
  // mantık" — önceki "Sadece Güzergahlar" İZOLASYON modu (diğer TÜM katmanları kapatan özel
  // bir toggle) kaldırıldı. Artık "Güzergahlar" da diğerleriyle (Noktalar/Çizgiler/Alanlar/
  // POI) AYNI toggleLayerVisibility mekanizmasını kullanan sıradan bir liste öğesi — bkz.
  // aşağıdaki [layerVisibility.Routes] effect'i (durak+hat katmanlarının setVisible'ı).

  // Faz 1a: "birden fazla harita" (kullanıcının kendi fikri). activeMapId null iken
  // henüz /api/Map cevap vermemiş demektir — bu sırada şekil yükleme effect'i bekliyor
  // (bkz. aşağıdaki [activeMapId] effect'i), sayfa boş haritayla açılıp hemen ardından
  // "yanlış" bir listeyle çakışmasın diye.
  const [maps, setMaps] = useState([]);
  const [activeMapId, setActiveMapId] = useState(null);
  const [duplicatingMap, setDuplicatingMap] = useState(false);

  // Faz 2: harita paylaşımı (Faz 1a'nın devamı, kullanıcının kendi fikri). shareModalMapId:
  // "Paylaş" penceresi hangi harita için açık (null = kapalı). sharedWithMe: her zaman
  // arka planda dolu tutulan "Benimle Paylaşılanlar" listesi (Pending + Accepted) — hem
  // rozet sayısı hem panel içeriği için. viewingSharedMap: aktif sekmenin BENİM haritam
  // olmadığı (paylaşılan bir haritayı görüntülediğim) durum — polling'i ve "kendi
  // haritalarıma dön" şeridini tetikliyor.
  const [shareModalMapId, setShareModalMapId] = useState(null);
  // Görev #7 (kullanıcının kendi isteği): Paylaş modalındaki bir kişi/rol satırından YA DA
  // yeni harita oluşturma sonrası "Kısıtlama Ekle" adımından açılan haritaya-özel çizim
  // kısıtlaması modalı — { mapId, mapName, type, id, label, returnTo } | null. returnTo:
  // 'share' | 'postCreate' — kapanınca NEREYE geri dönüleceğini belirtir (aşağıdaki onClose).
  // Ardışık-modal deseni: açılırken kaynak modalı KAPATIYORUZ (MapSettingsModal → Paylaş
  // geçişindeki onOpenShare ile aynı yaklaşım) — z-index yığılması/çift-Esc belirsizliği
  // olmasın diye aynı anda tek modal açık kalıyor.
  const [geoRestrictTarget, setGeoRestrictTarget] = useState(null);

  // Görev (kullanıcının kendi isteği: "artı butonuna basınca... harita üzerinden sınırlama
  // belirleyebileceğim"): yeni harita oluşturulup en az bir kişi/rolle paylaşıldıktan HEMEN
  // sonra gösterilen opsiyonel "İstersen kısıtlama ekle" adımı — { mapId, mapName, users,
  // roles } | null. Harita zaten oluşmuş olduğu için Esc/atla bu adımı sadece GİZLER,
  // haritayı SİLMEZ — "esc ile bozulabilsin" isteğini veri kaybı riski olmadan karşılıyor.
  const [postCreateFollowup, setPostCreateFollowup] = useState(null);
  const [mapActivity, setMapActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Kullanıcının kendi isteği: "buradan (Harita Ayarları) tamamen yönetilebilmeli" —
  // Paylaşılanlar kartlarında hangi kişi/rolün kısıtlı/duraklatılmış olduğunu rozet olarak
  // gösterebilmek için, Ayarlar açılırken (Aktivite'nin aksine LAZY DEĞİL, hemen) çekiliyor.
  const [mapGeoRestrictions, setMapGeoRestrictions] = useState([]);
  const [shareUsername, setShareUsername] = useState('');
  const [roleShareSelection, setRoleShareSelection] = useState('');
  const [mapShares, setMapShares] = useState([]);
  const [inviting, setInviting] = useState(false);
  const [sharedWithMe, setSharedWithMe] = useState([]);
  // Kullanıcının kendi isteği: "adminler herkesin haritasını görebilecek istediği takdirde" —
  // admin-only 3. sekme, sahiplik/paylaşım aranmaksızın TÜM haritaları listeler (bkz.
  // GET /api/Map/admin/all). Sadece switcherTab === 'adminAll' iken lazımlı, tembel yükleniyor.
  const [adminAllMaps, setAdminAllMaps] = useState([]);
  const [adminAllMapsLoaded, setAdminAllMapsLoaded] = useState(false);
  // FAZ 3 (kullanıcının kendi isteği): "Tüm Haritalar"da kullanıcı adı ve rolüne göre
  // filtre olsun, kullanıcı başına toplam istatistik kartı gösterilsin — client-side, liste
  // zaten tek seferde yüklü (poiProvinceFilter/transitProvinceFilter ile AYNI desen).
  const [adminAllUserFilter, setAdminAllUserFilter] = useState('');
  const [adminAllRoleFilter, setAdminAllRoleFilter] = useState('');
  // Görev #77 (kullanıcının kendi isteği: "paylaşılan haritaları sonradan arşive
  // atabilmeliyim, favorileyebilmeliyim veya onlara not ekleyebilmeliyim bir kullanıcı
  // olarak"): arşivlenen paylaşımlar varsayılan olarak listeden gizleniyor, bu toggle
  // ile geri gösteriliyor. Not düzenleme için hangi share'in notu açık, id tutuyor.
  const [showArchivedShares, setShowArchivedShares] = useState(false);
  const [editingShareNoteId, setEditingShareNoteId] = useState(null);
  const [shareNoteDraft, setShareNoteDraft] = useState('');
  const lastOwnMapIdRef = useRef(null); // "kendi haritalarıma dön" için son ziyaret edilen kendi haritam

  // Faz 3.1 (kullanıcının kendi isteği: "haritalara tıklandığında harita özelinde ayarlar
  // şeyi olsun"): hangi haritanın ayarlar MODALI açık — null = hiçbiri. Görev #74'ten
  // ÖNCE bu, listenin İÇİNDE genişleyen bir akordeondu (satır-içi, onBlur'da otomatik
  // kaydeden); kullanıcı "ortaya başka bir sekme gelsin, kaydet butonu olsun" isteyince
  // ekranın ortasında açılan MapSettingsModal'a taşındı (bkz. aşağıdaki render).
  const [mapSettingsOpenId, setMapSettingsOpenId] = useState(null);

  // Görev #75 (kullanıcının kendi isteği): harita çöp kutusu — dişli/ayarlar modalından
  // bağımsız, "Haritalarım" sekmesinin altındaki "+" ekle butonunun yanında ayrı bir giriş.
  const [mapTrashOpen, setMapTrashOpen] = useState(false);
  const [deletedMaps, setDeletedMaps] = useState([]);
  const [mapTrashLoading, setMapTrashLoading] = useState(false);

  // Görev #76 (kullanıcının kendi isteği): paylaşılan bir kişiye tıklayınca açılan profil
  // kartı — username null = kapalı.
  const [profileCardUsername, setProfileCardUsername] = useState(null);
  const [profileCardData, setProfileCardData] = useState(null);
  const [profileCardLoading, setProfileCardLoading] = useState(false);

  // Faz 3.2 (kullanıcının kendi isteği: "durduk yere diğer haritaları her zaman yukarıda
  // görmeme gerek yok, istediğim zaman görebilmeliyim"): tüm harita şeridi artık TEK,
  // varsayılan KAPALI bir açılır/kapanır bar (bkz. .map-switcher). switcherTab: içindeki
  // "Haritalarım" / "Paylaşılanlar" sekmesi.
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherTab, setSwitcherTab] = useState('maps');
  // Kullanıcının kendi isteği: "kullanıcı son değiştirmeye göre filtreleyebilsin windowstaki
  // klasörler gibi. isme göre fln da filtreleyebilsin" — 'manual' = elle sürükle-bırak sırası
  // (favori/SortOrder/CreatedDate, backend'in verdiği sıra), 'name'/'modified' = düz istemci
  // tarafı sıralama (bkz. aşağıdaki sortedMaps). Varsayılan HER ZAMAN en üstte — hangi mod
  // seçili olursa olsun (kullanıcının önceki "her zaman en üstte" isteği bozulmuyor).
  const [mapSortMode, setMapSortMode] = useState('manual');
  const switcherRef = useRef(null);
  // Görev #77: sürükle-bırak sıralama sırasında hangi harita taşınıyor — native HTML5
  // drag-drop event'leri arasında state'e (re-render'a) gerek yok, ref yeterli.
  const draggedMapIdRef = useRef(null);
  // Kullanıcının kendi isteği: canlı sürükleme önizlemesi için — dragOriginalOrderRef
  // sürükleme BAŞLARKEN sırayı yedekler (bırakılmadan iptal edilirse geri dönmek için),
  // dragOverTargetIdRef aynı satır üzerinde tekrar tekrar ateşlenen dragover'larda
  // gereksiz yeniden sıralamayı önler (sadece HEDEF satır değişince yeniden hesaplanır).
  const dragOriginalOrderRef = useRef(null);
  const dragOverTargetIdRef = useRef(null);
  const dragDroppedRef = useRef(false);

  // Faz 3.2: "+" baloncuğu için önceden yüklenmiş rol listesi (bkz. fetchPickableRoles) —
  // roller az sayıda olduğu için baloncuk her açıldığında değil, switcher ilk açıldığında
  // bir kez çekiliyor.
  const [pickableRoles, setPickableRoles] = useState([]);
  const [newMapPopoverOpen, setNewMapPopoverOpen] = useState(false);

  // Harita önizlemeleri (kullanıcının kendi isteği: "haritaların önizlemelerini
  // görebilmeliyim") — ID bazlı, o oturumda GEZİLMİŞ haritalar için client-side canvas
  // görüntüsü (bkz. captureActiveMapThumbnail). Hiç ziyaret edilmemiş bir harita için
  // burada kayıt yoktur, kart bunun yerine jenerik bir simge gösterir.
  const [mapThumbnails, setMapThumbnails] = useState({});

  // Görev #73 (kullanıcının kendi isteği: "haritaların üzerine mouse getirip 1,5 saniye
  // bekleyince ekranın ortasında... büyük... önizleme açılsın, imleci başka yere getirince
  // gitsin"): küçük 44x34 kartın üstünde 1,5sn bekleyince aynı dataUrl'i (zaten map viewport
  // çözünürlüğünde, sadece CSS'te küçük gösteriliyordu) ekranın ortasında büyük gösteriyoruz.
  const [hoverPreviewMap, setHoverPreviewMap] = useState(null); // { id, name } | null
  const hoverPreviewTimerRef = useRef(null);
  const hoverPreviewCloseTimerRef = useRef(null);

  function handleThumbHoverStart(map) {
    clearTimeout(hoverPreviewTimerRef.current);
    clearTimeout(hoverPreviewCloseTimerRef.current);
    // Kullanıcının kendi isteği (harita şeridi polish turu): "1,5 saniye yerine 0,5 saniye
    // olsun" — daha "direkt" hissettirsin diye.
    hoverPreviewTimerRef.current = setTimeout(() => {
      setHoverPreviewMap({ id: map.id, name: map.name });
    }, 500);
  }

  function handleThumbHoverEnd() {
    clearTimeout(hoverPreviewTimerRef.current);
    hoverPreviewCloseTimerRef.current = setTimeout(() => setHoverPreviewMap(null), 220);
  }

  function keepThumbPreviewOpen() {
    clearTimeout(hoverPreviewCloseTimerRef.current);
  }

  useEffect(
    () => () => {
      clearTimeout(hoverPreviewTimerRef.current);
      clearTimeout(hoverPreviewCloseTimerRef.current);
    },
    []
  );

  // Kullanıcının kendi isteği: "önizleme ile harita açılınca esc ile kapatılabilsin" —
  // switcher'ın kendi Esc davranışından bağımsız, sadece lightbox açıkken devreye giriyor.
  useEffect(() => {
    if (!hoverPreviewMap) return undefined;
    function handleLightboxEscape(e) {
      if (e.key === 'Escape') {
        clearTimeout(hoverPreviewTimerRef.current);
        clearTimeout(hoverPreviewCloseTimerRef.current);
        setHoverPreviewMap(null);
      }
    }
    window.addEventListener('keydown', handleLightboxEscape);
    return () => window.removeEventListener('keydown', handleLightboxEscape);
  }, [hoverPreviewMap]);

  // Kullanıcının kendi isteği: "esc ile bu bozulabilsin" — post-create "Kısıtlama Ekle"
  // adımı Esc ile de kapanabilsin. GeoRestrictionModal AÇIKKEN devre dışı (kendi Esc
  // davranışı var, ikisi birden tetiklenmesin — bkz. render koşulundaki AYNI kontrol).
  useEffect(() => {
    if (!postCreateFollowup || geoRestrictTarget) return undefined;
    function handleFollowupEscape(e) {
      if (e.key === 'Escape') setPostCreateFollowup(null);
    }
    window.addEventListener('keydown', handleFollowupEscape);
    return () => window.removeEventListener('keydown', handleFollowupEscape);
  }, [postCreateFollowup, geoRestrictTarget]);

  // BUG FİX (kullanıcının kendi tespiti): "harita seçim menüsünü kapatmama rağmen önizleme
  // karşımda duruyor" — switcher, kart üzerinden fare AYRILMADAN kapanırsa (ör. "Bu haritaya
  // geç"e tıklayınca kart DOM'dan kaldırılıyor, tarayıcı artık var olmayan bir elemandan
  // mouseleave ATEŞLEMİYOR, dolayısıyla handleThumbHoverEnd hiç çağrılmıyordu) lightbox
  // açık kalıyordu. Switcher her kapandığında (nasıl kapanırsa kapansın: dışarı tıklama,
  // Esc, harita seçme) önizlemeyi de zorla kapatıyoruz.
  // switcher kapandığında (dışarı tıklama/Esc/harita seçme gibi HANGİ yoldan olursa olsun)
  // lightbox'ın da kapanmasını garanti eden bilinçli senkronizasyon, bkz. yukarıdaki bug açıklaması.
  useEffect(() => {
    if (!switcherOpen) {
      clearTimeout(hoverPreviewTimerRef.current);
      clearTimeout(hoverPreviewCloseTimerRef.current);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHoverPreviewMap(null);
    }
  }, [switcherOpen]);

  // Faz 3: paylaşılan bir haritayı görüntülerken KENDİ ayarlarım (renk kısıtlaması var mı) —
  // owner'da ya da kısıtlaması olmayan paylaşımlarda allowedColors null gelir (sınırsız).
  const [myShareSettings, setMyShareSettings] = useState(null);

  // Aktif sekmenin BENİM haritam olup olmadığı — `maps` sadece SAHİBİ olduklarımı içeriyor
  // (bkz. backend MapController.GetMine -> GetMyMapsAsync), paylaşılan bir haritayı
  // görüntülerken activeMapId bu listede YOKTUR. "Paylaş" butonunu gizlemek, polling'i
  // açmak ve "kendi haritalarıma dön" şeridini göstermek için kullanılıyor.
  const viewingSharedMap = activeMapId != null && maps.length > 0 && !maps.some((m) => m.id === activeMapId);

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => {
    editingGeometryRef.current = editingGeometryKey;
  }, [editingGeometryKey]);

  useEffect(() => {
    editingRoutePathIdRef.current = editingRoutePathId;
  }, [editingRoutePathId]);

  // Faz 3.2: switcher dışına tıklayınca kapansın — önceki tasarımdaki tam-sayfa "backdrop"
  // div'i (z-index bug'ına yol açmıştı, bkz. mapSettingsOpenId yorumu) yerine document'a
  // tek bir mousedown listener. Yeni harita baloncuğu açıkken kapatmıyoruz (o kendi Vazgeç
  // butonuyla kapanır, dışarı tıklamak yanlışlıkla formu kaybettirmesin).
  useEffect(() => {
    if (!switcherOpen) return undefined;
    function handleOutside(e) {
      if (newMapPopoverOpen) return;
      // Görev #74 bug fix: MapSettingsModal artık document.body'ye PORTAL ile basılıyor
      // (bkz. MapSettingsModal.jsx), yani DOM'da switcherRef'in DIŞINDA. Bu koruma
      // olmasaydı modaldeki Ad kutusuna tıklamak bile "switcher dışına tıklandı" sanılıp
      // hem switcher'ı hem AÇIK modalı anında kapatırdı — modal kendi Esc/backdrop
      // mantığını kendi yönetiyor, burada hiç dokunmuyoruz.
      if (mapSettingsOpenId != null) return;
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false);
        setMapSettingsOpenId(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [switcherOpen, newMapPopoverOpen, mapSettingsOpenId]);

  // Rol listesi switcher ilk açıldığında bir kez çekiliyor (roller az sayıda, sık değişmiyor).
  // Görev #78: paylaşma artık ManageMultipleMaps'ten AYRI bir izin (ShareMap) olduğu için,
  // ikisinden SADECE biri olan bir kullanıcı da (ör. sadece ShareMap — kendi tek haritasını
  // paylaşabilir ama yeni harita açamaz) rol listesine ihtiyaç duyabilir. Sadece
  // canManageMultipleMaps'e bakmak, o kullanıcının Paylaş modalındaki "Role paylaş"
  // seçicisini boş bırakırdı.
  useEffect(() => {
    const perms = getPermissions();
    if (switcherOpen && pickableRoles.length === 0 && (perms.canManageMultipleMaps || perms.canShareMap)) {
      fetchPickableRoles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [switcherOpen]);

  // Kullanıcının kendi isteği: "haritaların önizlemelerini görebilmeliyim". Dürüst bir
  // sınırla: gerçek zamanlı, backend'de SAKLANAN bir önizleme değil — bu oturumda GEZİLMİŞ
  // haritanın anlık canvas görüntüsü, sadece tarayıcı belleğinde tutuluyor (sayfa
  // yenilenince kaybolur). OpenLayers'ın resmi "export map" deseni: tüm katman
  // canvas'larını (taban harita + vektör çizimler) tek bir canvas'a, kendi transform
  // matrisleriyle birlikte kopyalayıp küçük bir JPEG'e çeviriyoruz.
  function captureActiveMapThumbnail() {
    const map = mapRef.current;
    if (!map || activeMapId == null) return;
    try {
      map.once('rendercomplete', () => {
        try {
          const size = map.getSize();
          if (!size || size[0] === 0 || size[1] === 0) return;
          const mapCanvas = document.createElement('canvas');
          mapCanvas.width = size[0];
          mapCanvas.height = size[1];
          const mapContext = mapCanvas.getContext('2d');
          const layerCanvases = map.getViewport().querySelectorAll('.ol-layer canvas, canvas.ol-layer');
          layerCanvases.forEach((canvas) => {
            if (canvas.width <= 0) return;
            const opacity = canvas.parentNode?.style?.opacity || canvas.style.opacity;
            mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);
            const transform = canvas.style.transform;
            const match = transform && transform.match(/^matrix\(([^)]*)\)$/);
            if (match) {
              const matrix = match[1].split(',').map(Number);
              mapContext.setTransform(...matrix);
            } else {
              mapContext.setTransform(1, 0, 0, 1, 0, 0);
            }
            mapContext.drawImage(canvas, 0, 0);
          });
          mapContext.setTransform(1, 0, 0, 1, 0, 0);
          const dataUrl = mapCanvas.toDataURL('image/jpeg', 0.55);
          setMapThumbnails((cur) => ({ ...cur, [activeMapId]: dataUrl }));
        } catch (err) {
          // Sessizce yoksay — bir önizleme eksik kalması işlevi bozmaz, sadece placeholder gösterilir.
          console.error('Harita önizlemesi oluşturulamadı:', err);
        }
      });
      map.renderSync();
    } catch (err) {
      console.error('Harita önizlemesi tetiklenemedi:', err);
    }
  }

  // Aktif harita değiştiğinde ya da üzerindeki çizim sayısı değiştiğinde (yeni şekil
  // eklendi/silindi) önizlemeyi tazele — 900ms debounce ile, her tek çizimde değil.
  useEffect(() => {
    if (activeMapId == null) return undefined;
    const t = setTimeout(() => captureActiveMapThumbnail(), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapId, drawnItems.length]);

  // Token süresi dolunca haritadayken bile otomatik çıkış yapmak için sayaç
  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      navigate('/login');
      return;
    }

    const expiresAtMs = new Date(auth.expiresAt).getTime();

    function tick() {
      const secondsLeft = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
      setRemainingSeconds(secondsLeft);
      return secondsLeft;
    }

    tick();

    const intervalId = setInterval(() => {
      const secondsLeft = tick();
      if (secondsLeft <= 0) {
        clearInterval(intervalId);
        clearAuth();
        navigate('/login');
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [navigate]);

  // Sayfa ilk açıldığında /me'yi bir kez tazeliyoruz — token hâlâ geçerli olsa bile,
  // localStorage'daki izin bilgisi ESKİ bir login'den kalma olabilir (ör. backend'de
  // izin/rol veri şekli değişmiş olabilir, bkz. Gün 6 permissionCodes geçişi). Bu olmadan
  // kullanıcı çıkış/giriş yapmadan sayfayı yenilemesine rağmen dişli/admin gibi izin bazlı
  // UI öğeleri yanlışlıkla eski (stale) veriye göre gizli kalabiliyordu. isAdmin()/
  // getPermissions() localStorage'ı doğrudan okuyor, React state değil — bu yüzden
  // refreshMe() bitince bir yeniden render tetiklemek gerekiyor.
  const [, forceRerenderForAuth] = useReducer((c) => c + 1, 0);
  useEffect(() => {
    refreshMe().then(() => forceRerenderForAuth());
  }, []);

  // Kategori listesini bir kere çekiyoruz — öznitelik pop-up'ındaki seçim ve haritadaki
  // kategori filtresi bunu kullanıyor. Herkese açık bir uç nokta, giriş gerekmiyor.
  useEffect(() => {
    let ignore = false;
    fetchWithTimeout(CATEGORY_API_BASE)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!ignore) setCategories(data);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  function toggleFlyAnimation() {
    setFlyAnimationEnabled((current) => {
      const next = !current;
      localStorage.setItem(FLY_PREF_KEY, String(next));
      return next;
    });
  }

  // Kategori panelden (Admin > Kategoriler) eklendiğinde bu sayfa haberdar olsun diye
  // dışarıdan tetiklenebilecek basit bir yeniden yükleme yardımcısı.
  function reloadCategories() {
    fetchWithTimeout(CATEGORY_API_BASE)
      .then((res) => (res.ok ? res.json() : []))
      .then(setCategories)
      .catch(() => {});
  }

  // featuresByKeyRef bir sebepten (ör. geliştirme sunucusunun sıcak yenilemesi) geçerli
  // bir Map olmaktan çıkarsa, haritadaki gerçek şekillerden (asıl doğru kaynak) yeniden
  // kurar. Böylece .get/.set/.delete her zaman güvenle çağrılabilir, uygulama çökmez.
  function getFeaturesMap() {
    if (featuresByKeyRef.current instanceof Map) {
      return featuresByKeyRef.current;
    }
    console.warn('featuresByKeyRef bozulmuştu, haritadaki mevcut şekillerden yeniden kuruluyor.');
    const rebuilt = new Map();
    const source = drawSourceRef.current;
    if (source) {
      source.getFeatures().forEach((f) => {
        const key = f.get('key');
        if (key) rebuilt.set(key, f);
      });
    }
    featuresByKeyRef.current = rebuilt;
    return rebuilt;
  }

  // Bir feature'ı seçili/seçili-değil olarak yeniden boyar; önceki seçimi eski haline döndürür
  function selectFeature(key) {
    const prevKey = selectedKeyRef.current;
    if (prevKey && prevKey !== key) {
      const prevFeature = getFeaturesMap().get(prevKey);
      if (prevFeature) {
        prevFeature.setStyle(
          buildStyle(
            prevFeature.get('mode'),
            prevFeature.get('id'),
            false,
            prevFeature.get('color'),
            prevFeature.get('name'),
            analysisGlowKeysRef.current.has(prevKey)
          )
        );
      }
    }
    if (key) {
      const feature = getFeaturesMap().get(key);
      if (feature) {
        feature.setStyle(
          buildStyle(
            feature.get('mode'),
            feature.get('id'),
            true,
            feature.get('color'),
            feature.get('name'),
            analysisGlowKeysRef.current.has(key)
          )
        );
      }
    }
    selectedKeyRef.current = key;
    setSelectedKey(key);
  }

  // Bir koordinat için yer adı arama isteğini kuyruğa ekler; kuyruk saniyede 1 istekten
  // hızlı işlemez (Nominatim'in ücretsiz servisinin kullanım kuralına saygı için).
  // SADECE veritabanında henüz yer adı kaydedilmemiş şekiller için çağrılmalı — zaten
  // bulunmuş bir yer adı bir daha asla yeniden sorulmuyor.
  function enqueueGeocode(key, id, endpoint, lon, lat) {
    geocodeQueueRef.current.push({ key, id, endpoint, lon, lat });
    processGeocodeQueue();
  }

  async function processGeocodeQueue() {
    if (geocodingRef.current) return;
    geocodingRef.current = true;

    while (geocodeQueueRef.current.length > 0) {
      const { key, id, endpoint, lon, lat } = geocodeQueueRef.current.shift();
      const result = await reverseGeocode(lon, lat);
      if (result) {
        setDrawnItems((current) =>
          current.map((i) => (i.key === key ? { ...i, place: result.place, province: result.province } : i))
        );
        // Bulduğumuz yer adını kalıcı olsun diye veritabanına da yazıyoruz — bir daha
        // sayfa yenilense bile bu nokta/çizgi/alan için Nominatim'e tekrar sorulmayacak.
        try {
          // eslint-disable-next-line no-await-in-loop
          await fetchWithTimeout(`${API_BASE}/${endpoint}/${id}/place`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ place: result.place, province: result.province }),
          });
        } catch (err) {
          console.error('Yer adı kaydedilemedi:', err);
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    geocodingRef.current = false;
  }

  // Şehir filtresi seçiliyken haritada SADECE o şehre ait şekiller görünsün — uymayanları
  // görünmez stille (HIDDEN_STYLE) boyuyoruz. Veri değiştikçe (yeni şekil, yer adı geldikçe)
  // de tekrar hesaplanır ki yeni eklenen bir şekil de filtreye uyuyorsa doğru görünsün.
  useEffect(() => {
    if (selectedKeyRef.current) {
      const selectedItem = drawnItems.find((i) => i.key === selectedKeyRef.current);
      if (selectedItem && selectedProvince && selectedItem.province !== selectedProvince) {
        selectFeature(null); // filtre, seçili şekli gizliyorsa seçim çubuğu da kapansın
      }
    }
    poiLayerRef.current?.setVisible(layerVisibility.Poi);
    poiOverviewLayerRef.current?.setVisible(layerVisibility.Poi); // aynı kaynağın uzak-zoom katmanı
    // Kullanıcının kendi isteği: "Güzergahlar" artık diğer katmanlarla AYNI sıradan
    // aç/kapa toggle'ı — durak+hat katmanlarının görünürlüğü buradan yönetiliyor.
    stopLayerRef.current?.setVisible(layerVisibility.Routes !== false);
    routeLineLayerRef.current?.setVisible(layerVisibility.Routes !== false);

    drawnItems.forEach((item) => {
      const feature = getFeaturesMap().get(item.key);
      if (!feature) return;
      const matchesProvince = !selectedProvince || item.province === selectedProvince;
      const matchesCategory = !selectedCategoryId || item.categoryId === selectedCategoryId;
      const matchesLayer = layerVisibility[item.mode] !== false;
      feature.setStyle(
        matchesProvince && matchesCategory && matchesLayer
          ? buildStyle(
              item.mode,
              item.id,
              selectedKeyRef.current === item.key,
              item.color,
              item.name,
              analysisGlowKeysRef.current.has(item.key)
            )
          : HIDDEN_STYLE
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnItems, selectedProvince, selectedCategoryId, layerVisibility]);

  useEffect(() => {
    const categoryFilterIds = expandCategoryFilterIds(poiCategories, poiCategoryFilter);
    // Performans (kullanıcının "sıfır donma istiyorum" isteği): eskiden her POI için
    // source.getFeatures().find(...) çağrılıyordu — 2500 POI'de 6 milyon karşılaştırma, üstelik
    // her feature'da ayrı feature.changed() ile ayrı bir yeniden çizim tetikleniyordu. Artık
    // id -> feature sözlüğü BİR KEZ kuruluyor ve tek bir layer.changed() ile toplu yeniden
    // çizim yapılıyor.
    const featureById = new Map();
    poiSourceRef.current?.getFeatures().forEach((item) => {
      const id = item.get('poiId');
      if (id != null) featureById.set(id, item);
    });
    // Kullanıcının kendi isteği: "önerilen eve tıklayınca... haritada hesaplamaya kattığı,
    // yarıçapın içindeki poiler öne çıksın, yarıçap dışındakiler... silik görünsün" —
    // seçili ev noktası varsa her POI'nin o noktaya uzaklığına bakıp vurgulu/silik işaretliyoruz.
    const spot = selectedHouseSpotIndex != null ? locationAnalysisTopSpots[selectedHouseSpotIndex] : null;
    pois.forEach((poi) => {
      const feature = featureById.get(poi.id);
      if (!feature) return;
      let visible;
      if (selectedPoi != null) {
        // Kullanıcının kendi isteği: "bi poi seçildiğinde haritada üzerinde sadece o
        // görünecek ve geri kalanlar pasif duruma geçecek görünmeyecek, ta ki esc basana
        // veya iptal edene kadar." Kategori/sahiplik/durum filtreleri bu moddayken devre dışı —
        // seçili POI dışındaki her şey gizleniyor.
        visible = poi.id === selectedPoi;
      } else if (locationAnalysisMatchedIds != null) {
        // Kullanıcının kendi isteği: Konum Analizi (il seçerek veya poligon çizerek) sonucu
        // varken haritada SADECE kriterlere uyan POI'ler görünsün, geri kalanı karışıklık
        // yaratmasın — selectedPoi izolasyonuyla AYNI mekanizma, farklı kaynak.
        visible = locationAnalysisMatchedIds.has(poi.id);
      } else {
        const matchesCategory = !categoryFilterIds || categoryFilterIds.has(String(poi.categoryId || ''));
        const matchesOwner = poiOwnerFilter !== 'mine' || poi.userId === myUserId;
        const matchesStatus = poiStatusFilter === 'all'
          || (poiStatusFilter === 'active' && poi.isActive !== false)
          || (poiStatusFilter === 'paused' && poi.isActive === false);
        visible = matchesCategory && matchesOwner && matchesStatus;
      }
      // PERFORMANS (kullanıcının "aşırı donuyor" tespitinin ikinci büyük sebebi): feature.set()
      // varsayılan olarak her çağrıda 'change' olayı yayınlıyor; VectorSource bunu dinleyip
      // katmanı yeniden çizmeye zorluyor. 8.700 POI × 5 özellik = ~43.000 olay ve o kadar
      // yeniden çizim isteği demekti. Üçüncü parametre (silent=true) olayı bastırıyor; tek bir
      // toplu layer.changed() (aşağıda) yeterli.
      feature.set('poiHidden', !visible, true);
      feature.set('isOwnPoi', poi.userId === myUserId, true);
      feature.set('isActive', poi.isActive !== false, true);
      if (spot && visible) {
        const coord = feature.getGeometry()?.getCoordinates();
        if (coord) {
          const [lon, lat] = toLonLat(coord);
          const inRadius = getDistance([spot.lon, spot.lat], [lon, lat]) <= HOUSE_SPOT_RADIUS_METERS;
          feature.set('poiHighlighted', inRadius, true);
          feature.set('poiDimmed', !inRadius, true);
        }
      } else {
        feature.set('poiHighlighted', false, true);
        feature.set('poiDimmed', false, true);
      }
    });
    // Tek toplu yeniden çizim (yukarıdaki performans notu).
    poiLayerRef.current?.changed();
    poiOverviewLayerRef.current?.changed();
    // Seçili POI silinmiş/artık listede yoksa (ör. başka biri sildi) seçim takılı kalmasın.
    if (selectedPoi != null && !pois.some((poi) => poi.id === selectedPoi)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPoi(null);
    }
  }, [pois, poiCategories, poiCategoryFilter, poiOwnerFilter, poiStatusFilter, myUserId, selectedPoi, locationAnalysisMatchedIds, selectedHouseSpotIndex, locationAnalysisTopSpots]);

  // Kullanıcının kendi isteği: "önerilen eve tıklayınca... haritada hesaplamaya kattığı,
  // yarıçapın içindeki poiler öne çıksın" — seçili ev noktasının 250 m'lik yarıçapı kesikli
  // bir daire olarak çiziliyor, seçili pin de büyütülüyor. Daire, ev pinleriyle AYNI kaynakta
  // (houseSpotSource) ayrı bir feature olarak duruyor (isSpotRadius bayrağı — bkz.
  // buildHouseSpotStyle), böylece analiz temizlenince otomatik olarak o da siliniyor.
  useEffect(() => {
    const source = houseSpotSourceRef.current;
    if (!source) return;
    source.getFeatures()
      .filter((feature) => feature.get('isSpotRadius'))
      .forEach((feature) => source.removeFeature(feature));
    source.getFeatures().forEach((feature) => {
      feature.set('isSelectedSpot', feature.get('spotIndex') === selectedHouseSpotIndex);
    });
    const spot = selectedHouseSpotIndex != null ? locationAnalysisTopSpots[selectedHouseSpotIndex] : null;
    if (spot) {
      // EPSG:3857'de mesafeler enleme göre gerilir (Mercator) — gerçek 250 m'yi çizebilmek için
      // yarıçabı 1/cos(enlem) ile ölçekliyoruz.
      const radius3857 = HOUSE_SPOT_RADIUS_METERS / Math.cos((spot.lat * Math.PI) / 180);
      const circle = new Feature({ geometry: new CircleGeom(fromLonLat([spot.lon, spot.lat]), radius3857) });
      circle.set('isSpotRadius', true);
      source.addFeature(circle);
    }
  }, [selectedHouseSpotIndex, locationAnalysisTopSpots]);

  // Kullanıcının kendi isteği: AdminPage'in "ℹ️ Bilgi" butonu — SADECE odaklanılan güzergahın
  // durakları/hattı görünsün (buildStopLayerStyle/buildRouteLineStyle: 'transitHidden' flag'i,
  // selectedPoi izolasyonuyla AYNI mekanizma), ve o güzergahın durak extent'ine bir kez zoom-fit yap.
  useEffect(() => {
    const stopSource = stopSourceRef.current;
    const lineSource = routeLineSourceRef.current;
    // Kullanıcının kendi isteği (3 Eylül): "herhangi bir güzergaha tıklayınca geri kalan her şey
    // silikleşsin ve o güzergah öne çıksın" — diğer hatlar artık tamamen GİZLENMİYOR (eskiden
    // transitHidden ile yok oluyorlardı), silik (transitDimmed) çiziliyor: hattın şehir
    // içindeki bağlamı korunuyor ama odak net.
    const markFocus = (feature) => {
      const isTarget = focusedRouteId != null && feature.get('routeId') === focusedRouteId;
      feature.set('transitHidden', false);
      feature.set('transitFocused', isTarget);
      feature.set('transitDimmed', focusedRouteId != null && !isTarget);
    };
    stopSource?.getFeatures().forEach(markFocus);
    stopSource?.changed();
    lineSource?.getFeatures().forEach(markFocus);
    lineSource?.changed();

    // NOT: katman görünürlüğü (sadece Güzergahlar açık kalsın) BURADA değil, odağı AÇAN/KAPATAN
    // fonksiyonlarda ayarlanıyor (bkz. focusRoute / clearRouteFocus) — effect içinde setState
    // çağırmak cascading render'a yol açıyor (react-hooks/set-state-in-effect).

    if (focusedRouteId != null && !routeFocusFitDoneRef.current) {
      const matchingStops = stops.filter((s) => s.routeId === focusedRouteId);
      if (matchingStops.length > 0) {
        const extent = createEmpty();
        matchingStops.forEach((stop) => {
          try {
            const feature = wktFormat.readFeature(stop.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
            extendExtent(extent, feature.getGeometry().getExtent());
          } catch {
            // bozuk geometri — yoksay
          }
        });
        if (!isEmptyExtent(extent) && mapRef.current) {
          mapRef.current.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 16, duration: 500 });
          routeFocusFitDoneRef.current = true;
        }
      }
    }
  }, [stops, routes, focusedRouteId]);

  // Kullanıcının kendi isteği: "sağdaki çizilenler kısmından güzergaha tıklayınca haritada o
  // güzergahı yakınlaştırsın ... sanki haritadan güzergaha tıklamışız gibi olsun" — yönetici
  // için sağ panelden tıklamak startRoutePathEdit'i (hat düzenleme) tetikliyor, focusedRouteId
  // DEĞİL; o yüzden yukarıdaki zoom-fit effect'i (focusedRouteId'ye bağlı) burada devreye
  // girmiyor. Aynı zoom-fit'i editingRoutePathId için de (izolasyon OLMADAN — düzenlerken
  // civardaki diğer güzergahları/durakları görmek faydalı) ayrıca yapıyoruz.
  useEffect(() => {
    editRoutePathFitDoneRef.current = false;
  }, [editingRoutePathId]);

  useEffect(() => {
    if (editingRoutePathId == null || editRoutePathFitDoneRef.current) return;
    const matchingStops = stops.filter((s) => s.routeId === editingRoutePathId);
    if (matchingStops.length === 0) return;
    const extent = createEmpty();
    matchingStops.forEach((stop) => {
      try {
        const feature = wktFormat.readFeature(stop.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
        extendExtent(extent, feature.getGeometry().getExtent());
      } catch {
        // bozuk geometri — yoksay
      }
    });
    if (!isEmptyExtent(extent) && mapRef.current) {
      mapRef.current.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 16, duration: 500 });
      editRoutePathFitDoneRef.current = true;
    }
  }, [stops, editingRoutePathId]);

  // Hoca ödevi (31 Ağustos, SignalR Canlı Veri Yayını): simulationSnapshots her
  // PositionUpdated olayında güncelleniyor (bkz. toggleFollowRoute) — bu effect o state'i
  // haritadaki gerçek araç feature'larına yansıtıyor. SADECE isRunning=true olan ve hâlâ
  // takip edilen (followedRouteIds'te olan) güzergahlar için bir feature var; simülasyon
  // bitince veya takipten çıkılınca ilgili feature kaldırılıyor.
  useEffect(() => {
    const source = simulationVehicleSourceRef.current;
    if (!source) return;
    source.clear();
    Object.values(simulationSnapshots).forEach((snapshot) => {
      if (!snapshot || !snapshot.isRunning || !followedRouteIds.has(snapshot.routeId)) return;
      const feature = new Feature({ geometry: new Point(fromLonLat([snapshot.lon, snapshot.lat])) });
      feature.set('isSimulationVehicle', true);
      feature.set('routeId', snapshot.routeId);
      feature.set('routeColor', snapshot.routeColor);
      source.addFeature(feature);
    });
  }, [simulationSnapshots, followedRouteIds]);

  // Kullanıcının kendi isteği (hoca metni): "Diğer kullanıcılar aynı güzergaha tıkladığında
  // 'Takip Et' butonu çıksın ve aracı canlı olarak harita üzerinde takip edebilsinler.
  // 'Takibi Bırak' butonu ile takipten çıkılabilsin." — tek bir toggle fonksiyonu: hâlâ takip
  // etmiyorsak SignalR grubuna katılıp gelen her PositionUpdated'i simulationSnapshots'a
  // yazıyoruz; zaten takip ediyorsak grup'tan çıkıp o route'un feature'ını kaldırıyoruz.
  async function toggleFollowRoute(routeId) {
    if (followedRouteIds.has(routeId)) {
      const unfollow = unfollowFnsRef.current[routeId];
      if (unfollow) await unfollow();
      delete unfollowFnsRef.current[routeId];
      setFollowedRouteIds((current) => {
        const next = new Set(current);
        next.delete(routeId);
        return next;
      });
      setSimulationSnapshots((current) => {
        const next = { ...current };
        delete next[routeId];
        return next;
      });
      return;
    }

    try {
      const unfollow = await followRoute(
        routeId,
        (snapshot) => {
          setSimulationSnapshots((current) => ({ ...current, [routeId]: snapshot }));
        },
        (snapshot) => {
          // Simülasyon bitti (SimulationCompleted) — araç son konumda %100 görünsün, birkaç
          // saniye sonra haritadan kaldır (kullanıcı "bitti"yi görebilsin diye anında silmiyoruz).
          setSimulationSnapshots((current) => ({ ...current, [routeId]: snapshot }));
          setSimulationRunningState((current) => ({ ...current, [routeId]: false }));
          setTimeout(() => {
            setSimulationSnapshots((current) => {
              const next = { ...current };
              delete next[routeId];
              return next;
            });
          }, 4000);
        }
      );
      unfollowFnsRef.current[routeId] = unfollow;
      setFollowedRouteIds((current) => new Set(current).add(routeId));
    } catch (err) {
      console.error('Güzergah takip edilemedi:', err);
      setStatusMessage('Canlı takip bağlantısı kurulamadı.');
    }
  }

  // Hoca ödevi: "Simülasyonu Başlat" (Admin/Ulaşım Operatörü — ManageRoutes izni backend'de
  // zaten kontrol ediliyor). Başlatan kullanıcı otomatik olarak takibe de başlar (kendi
  // başlattığı simülasyonu görmek için ayrıca "Takip Et"e basmasına gerek kalmasın).
  async function startSimulation(routeId) {
    setSimulationActionRouteId(routeId);
    try {
      const response = await fetchWithTimeout(`${TRANSIT_SIMULATION_BASE}/${routeId}/start`, {
        method: 'POST',
        headers: authHeader(),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatusMessage(body?.message || 'Simülasyon başlatılamadı.');
        return;
      }
      setSimulationRunningState((current) => ({ ...current, [routeId]: true }));
      if (!followedRouteIds.has(routeId)) await toggleFollowRoute(routeId);
    } catch (err) {
      console.error('Simülasyon başlatılamadı:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    } finally {
      setSimulationActionRouteId(null);
    }
  }

  async function stopSimulation(routeId) {
    setSimulationActionRouteId(routeId);
    try {
      const response = await fetchWithTimeout(`${TRANSIT_SIMULATION_BASE}/${routeId}/stop`, {
        method: 'POST',
        headers: authHeader(),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatusMessage(body?.message || 'Simülasyon durdurulamadı.');
        return;
      }
      setSimulationRunningState((current) => ({ ...current, [routeId]: false }));
      setSimulationSnapshots((current) => {
        const next = { ...current };
        delete next[routeId];
        return next;
      });
    } catch (err) {
      console.error('Simülasyon durdurulamadı:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    } finally {
      setSimulationActionRouteId(null);
    }
  }

  // Bir güzergaha odaklanınca (transit-focus-banner açılınca) VEYA hat düzenleme moduna
  // girince (route-path-edit-card, yöneticinin çizgiye tıklayınca açtığı kart — kullanıcının
  // kendi isteği: "haritadan o güzergaha tıklayınca da simülasyon başlat görünsün") "Başlat" mı
  // "Durdur" mu gösterileceğini bilmek için tek seferlik bir REST sorgusu — SignalR grubuna
  // katılmadan.
  useEffect(() => {
    const targetRouteId = focusedRouteId ?? editingRoutePathId;
    if (targetRouteId == null) return;
    let ignore = false;
    fetchWithTimeout(`${TRANSIT_SIMULATION_BASE}/${targetRouteId}/state`)
      .then((res) => (res.ok ? res.json() : null))
      .then((snapshot) => {
        if (!ignore && snapshot) {
          setSimulationRunningState((current) => ({ ...current, [targetRouteId]: snapshot.isRunning }));
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [focusedRouteId, editingRoutePathId]);

  // Sayfadan ayrılınca (route değişimi/logout) açık kalan tüm SignalR gruplarından çık —
  // aksi halde sunucu tarafında yayın yapılmaya devam eder (gereksiz trafik).
  useEffect(() => {
    return () => {
      Object.values(unfollowFnsRef.current).forEach((unfollow) => unfollow());
    };
  }, []);

  // "Envanter Analizi" sonucu geldiğinde (veya "Kaldır" ile temizlendiğinde) kesişen
  // nokta/çizgi/alan kayıtlarının etrafına neon halka ekler/kaldırır. Backend id listesini
  // (pointIds/lineIds/polygonIds) "mode-id" anahtarlarına çevirip diğer stil kararlarının
  // (seçili/filtreli) kullandığı aynı anahtar biçimiyle (item.key) eşleştiriyoruz.
  useEffect(() => {
    const keys = new Set();
    if (analysisResult) {
      (analysisResult.pointIds || []).forEach((id) => keys.add(`Point-${id}`));
      (analysisResult.lineIds || []).forEach((id) => keys.add(`LineString-${id}`));
      (analysisResult.polygonIds || []).forEach((id) => keys.add(`Polygon-${id}`));
    }
    analysisGlowKeysRef.current = keys;

    drawnItems.forEach((item) => {
      const feature = getFeaturesMap().get(item.key);
      if (!feature) return;
      const matchesProvince = !selectedProvince || item.province === selectedProvince;
      const matchesCategory = !selectedCategoryId || item.categoryId === selectedCategoryId;
      const matchesLayer = layerVisibilityRef.current[item.mode] !== false;
      if (!matchesProvince || !matchesCategory || !matchesLayer) return; // filtre zaten gizliyor, dokunma
      feature.setStyle(
        buildStyle(item.mode, item.id, selectedKeyRef.current === item.key, item.color, item.name, keys.has(item.key))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisResult]);

  // Bir şehir SEÇİLDİĞİNDE (filtre değiştiğinde) haritayı o şehirdeki şekillerin tümünü
  // kapsayacak şekilde hızlıca kaydırıp yakınlaştırır.
  useEffect(() => {
    if (!selectedProvince) return;
    const map = mapRef.current;
    if (!map) return;

    const extent = createEmpty();
    let any = false;
    drawnItems.forEach((item) => {
      if (item.province !== selectedProvince) return;
      const feature = getFeaturesMap().get(item.key);
      if (!feature) return;
      extendExtent(extent, feature.getGeometry().getExtent());
      any = true;
    });

    if (any) {
      map.getView().fit(extent, {
        duration: 350, // hızlı animasyon
        maxZoom: 14,
        padding: [60, 220, 60, 60], // sağdaki panel şekli kapatmasın diye sağ boşluk fazla
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvince]);

  // Harita kurulumu (bir kere). Şekil yükleme artık burada değil — bkz. fetchMaps() ve
  // aşağıdaki [activeMapId] effect'i (Faz 1a: hangi haritanın yükleneceği önce bilinmeli).
  useEffect(() => {
    const drawSource = new VectorSource();
    drawSourceRef.current = drawSource;

    const drawLayer = new VectorLayer({ source: drawSource });
    drawLayerRef.current = drawLayer;

    // Envanter Analizi aracının geçici poligonu — kesikli turuncu, kaydedilenlerden
    // görsel olarak ayrılsın diye ayrı bir katmanda tutuluyor, backend'e hiç gitmiyor.
    const analysisSource = new VectorSource();
    analysisSourceRef.current = analysisSource;
    const analysisLayer = new VectorLayer({
      source: analysisSource,
      style: new Style({
        stroke: new Stroke({ color: '#f59e0b', width: 2, lineDash: [8, 6] }),
        fill: new Fill({ color: 'rgba(245, 158, 11, 0.15)' }),
      }),
    });

    // Şekil düzenleme modunda her köşenin üstüne küçük bir sıra numarası basan katman —
    // "1 numaralı köşe hangisi" isteğine karşılık, elle giriş listesindeki numaralarla
    // haritadaki köşeler eşleşsin diye (bkz. aşağıdaki editingGeometryKey effect'i).
    const vertexLabelSource = new VectorSource();
    vertexLabelSourceRef.current = vertexLabelSource;
    const vertexLabelLayer = new VectorLayer({ source: vertexLabelSource });

    // Hocanın Coğrafi Yetki görevi: izinli alan dışını gri maskeleyen katman + sınırı
    // belirgin çizen katman. Taban harita ile çizim katmanı ARASINDA — hem maske çizimlerin
    // ALTINDA kalsın (kendi şekillerini gizlemesin) hem de taban haritanın ÜSTÜNDE olsun.
    const geoMaskSource = new VectorSource();
    geoMaskSourceRef.current = geoMaskSource;
    const geoMaskLayer = new VectorLayer({ source: geoMaskSource, style: GEO_MASK_STYLE });

    const geoBoundarySource = new VectorSource();
    geoBoundarySourceRef.current = geoBoundarySource;
    const geoBoundaryLayer = new VectorLayer({ source: geoBoundarySource, style: GEO_BOUNDARY_STYLE });

    // Hoca ödevi (2. tur — Isı Haritası Analizi): GeoServer'ın kendi ürettiği WMS raster'ı,
    // taban haritanın ÜSTÜNDE ama çizimlerin ALTINDA — kullanıcı kendi çizdiği/kaydettiği
    // şekilleri ısı haritası altında kaybetmesin. url/LAYERS/CQL_FILTER başta boş, "Isı
    // Haritası Analizi" ilk açıldığında (bkz. [heatmapActive, activeMapId] effect'i) doldurulur
    // — o ana kadar visible:false, hiç istek atılmaz.
    const heatmapSource = new ImageWMS({ params: { LAYERS: 'tbl_point', STYLES: 'heatmap', TRANSPARENT: true }, ratio: 1 });
    heatmapSourceRef.current = heatmapSource;
    const heatmapLayer = new ImageLayer({ source: heatmapSource, visible: false });
    heatmapLayerRef.current = heatmapLayer;

    // Config isteği (mapId'ye özel cql_filter) başarılı olsa bile GeoServer'ın kendisi
    // GetMap isteğine bir hata (ör. "böyle bir style yok") dönebilir — bu durumda tarayıcı
    // gelen içeriği resim olarak açamaz ("EncodingError: source image cannot be decoded"
    // konsol hatası tam olarak bu). imageloaderror bu durumu net bir kullanıcı mesajına çeviriyor.
    heatmapSource.on('imageloadstart', () => setHeatmapImageError(false));
    heatmapSource.on('imageloadend', () => setHeatmapImageError(false));
    heatmapSource.on('imageloaderror', () => {
      setHeatmapImageError(true);
      setStatusMessage('Isı haritası görüntüsü yüklenemedi — GeoServer\'da "heatmap" style kurulu mu? (bkz. docs/geoserver-sql-view-ve-heatmap.md)');
    });

    // Hoca ödevi (25 Ağustos — Konum Analizi): "Haritada Poligon çizme" alan modu — Envanter
    // Analizi'yle AYNI görsel dil (kesikli çizgi + hafif dolgu) ama farklı bir renkte (mor)
    // ki iki araç aynı anda kullanılsa bile görsel olarak karışmasın.
    const locationPolygonSource = new VectorSource();
    locationPolygonSourceRef.current = locationPolygonSource;
    const locationPolygonLayer = new VectorLayer({
      source: locationPolygonSource,
      style: new Style({
        stroke: new Stroke({ color: '#7c3aed', width: 2, lineDash: [8, 6] }),
        fill: new Fill({ color: 'rgba(124, 58, 237, 0.12)' }),
      }),
    });

    // Ağırlıklı ısı haritası: her feature'ın `weight` özelliği (0-1) o POI'nin kriterdeki
    // ağırlığı/100 — OpenLayers bunu yerleşik olarak kullanıyor, GeoServer'a hiç gitmiyor
    // (bkz. yukarıdaki ref tanımının yorumu). Renk skalası mevcut Isı Haritası Analizi'yle
    // (HEATMAP_COLOR_STOPS) TUTARLI olsun diye aynı renkleri gradient olarak kullanıyoruz.
    const locationHeatmapSource = new VectorSource();
    locationHeatmapSourceRef.current = locationHeatmapSource;
    const locationHeatmapLayer = new HeatmapLayer({
      source: locationHeatmapSource,
      weight: (feature) => feature.get('weight') ?? 0,
      radius: 18,
      blur: 22,
      gradient: HEATMAP_COLOR_STOPS.map((s) => s.color),
      visible: false,
      // Kullanıcının kendi isteği: ısı haritası "çok aşırı yoğun" görünmesin — yarı saydam
      // katman altındaki sokak/POI bilgisi okunur kalıyor, renk de yumuşuyor.
      opacity: 0.55,
    });
    locationHeatmapLayerRef.current = locationHeatmapLayer;
    // Kullanıcının kendi isteği: "o bölgeye çok uzaklaşınca kıpkırmızı oluyor harita, bide o
    // bölgelere aşırı yaklaşınca hiç kırmızılık kalmıyor" — bu, sabit PİKSEL yarıçapının
    // doğrudan sonucu: uzaklaşınca tüm noktalar aynı 18px'lik lekede üst üste yığılıp doyuyor
    // (kıpkırmızı), yakınlaşınca noktalar birbirinden yüzlerce piksel uzaklaşıp lekeler
    // kayboluyor. Çözüm: yarıçap/bulanıklık zoom'a göre uyarlanıyor — DÜNYA ölçeğinde sabit
    // bir mesafeye (~yaklaşık 400 m) karşılık gelen piksel yarıçabı hesaplanıp makul bir
    // aralığa (8-60 px) sıkıştırılıyor. Böylece her zoom'da "aynı coğrafi alanı" temsil eden
    // tutarlı bir ısı görüntüsü çıkıyor.
    const syncHeatmapRadius = () => {
      if (!locationHeatmapLayer.getVisible()) return;
      const resolution = mapRef.current?.getView()?.getResolution();
      if (!resolution) return;
      const pixelsFor250m = 250 / resolution;
      const radius = Math.max(6, Math.min(34, pixelsFor250m));
      locationHeatmapLayer.setRadius(radius);
      locationHeatmapLayer.setBlur(radius * 1.6); // daha yumuşak geçiş, keskin kırmızı leke yok
    };
    heatmapRadiusSyncRef.current = syncHeatmapRadius;

    // "En İyi Ev Konumları" pinleri — bkz. computeTopHouseSpots ve buildHouseSpotStyle. Ayrı
    // bir kaynak/katman (locationHeatmapSource'la KARIŞTIRILMASIN), boşken zaten hiçbir şey
    // çizmiyor, visible=true bırakmak yeterli (heatmap gibi ayrı bir aç/kapa anahtarı yok).
    const houseSpotSource = new VectorSource();
    houseSpotSourceRef.current = houseSpotSource;
    const houseSpotLayer = new VectorLayer({
      source: houseSpotSource,
      style: buildHouseSpotStyle,
    });
    houseSpotLayerRef.current = houseSpotLayer;

    // Hoca ödevi (POI/Rol/Operatör): tbl_point'ten TAMAMEN ayrı bir katman — POI'ler
    // haritaya (mapId) özel değil, kullanıcının kendi çizim undo/redo'suna/kategorisine/
    // gizlilik sistemine hiç girmiyor, kasıtlı olarak izole (bkz. Poi.cs yorumu).
    const poiSource = new VectorSource();
    poiSourceRef.current = poiSource;
    // Kullanıcının kendi tespiti: "zoom in zoom out yaparken aşırı donuyor" — POI'ler artık
    // AYNI KAYNAĞI paylaşan İKİ katmanda çiziliyor (bkz. buildPoiOverviewStyle yorumu):
    //   * poiOverviewLayer: uzak/orta zoom, declutter YOK, etiket yok, sadece küçük nokta →
    //     binlerce POI'de bile ucuz.
    //   * poiLayer: yakın zoom (resolution <= POI_DETAIL_MAX_RESOLUTION), declutter VAR,
    //     pin + etiket → bu ölçekte görüş alanında zaten az POI olduğu için maliyeti düşük.
    // Kaynak ortak olduğu için tıklama/seçme/düzenleme akışları (poiId ile feature bulma)
    // hiç değişmiyor.
    const poiOverviewLayer = new VectorLayer({
      source: poiSource,
      style: buildPoiOverviewStyle,
      declutter: false,
      // Bu katman zaten sadece uzak zoom'da çiziyor; OL'nin de boşuna uğraşmaması için
      // katman düzeyinde de sınırlıyoruz (minResolution dahil değil, maxResolution hariç).
      minResolution: POI_DETAIL_MAX_RESOLUTION,
      maxResolution: 900,
      // Zoom/pan animasyonu SIRASINDA yeniden çizme — OL önceki kareyi ölçekleyerek gösterir,
      // animasyon boyunca binlerce nesneyi yeniden hesaplamaz (donmanın büyük kısmı buydu).
      updateWhileAnimating: false,
      updateWhileInteracting: false,
      renderBuffer: 40,
    });
    poiOverviewLayerRef.current = poiOverviewLayer;

    const poiLayer = new VectorLayer({
      source: poiSource,
      style: buildPoiLayerStyle,
      // Kullanıcının kendi isteği: "isimler üst üste biniyor... üst üste binenler 1 tane
      // görünse daha iyi olabilir" — OpenLayers'ın declutter'ı çakışan ikon/etiketleri eliyor,
      // hangisinin kalacağına stilin zIndex'ine bakarak karar veriyor (bkz. buildPoiLayerStyle:
      // zIndex = önem skoru). Artık SADECE yakın zoom'da devrede.
      declutter: true,
      maxResolution: POI_DETAIL_MAX_RESOLUTION,
      updateWhileAnimating: false,
      updateWhileInteracting: false,
      renderBuffer: 60,
    });
    poiLayerRef.current = poiLayer;

    // Hoca ödevi (Akıllı Ulaşım Modülü): güzergah çizgileri duraklardan ÖNCE (altta) çizilsin
    // diye layers dizisinde duraktan önce ekleniyor — Google Maps'teki transit hattı gibi.
    const routeLineSource = new VectorSource();
    routeLineSourceRef.current = routeLineSource;
    const routeLineLayer = new VectorLayer({
      source: routeLineSource,
      style: buildRouteLineStyle,
    });
    routeLineLayerRef.current = routeLineLayer;

    const stopSource = new VectorSource();
    stopSourceRef.current = stopSource;
    const stopLayer = new VectorLayer({
      source: stopSource,
      style: buildStopLayerStyle,
    });
    stopLayerRef.current = stopLayer;

    // Hoca ödevi (31 Ağustos): hareket eden araç ikonu — duraklardan/güzergah çizgisinden
    // sonra (üstte) çizilsin diye layers dizisinde onlardan sonra ekleniyor.
    const simulationVehicleSource = new VectorSource();
    simulationVehicleSourceRef.current = simulationVehicleSource;
    const simulationVehicleLayer = new VectorLayer({
      source: simulationVehicleSource,
      style: buildSimulationVehicleStyle,
    });
    simulationVehicleLayerRef.current = simulationVehicleLayer;

    // Kullanıcının kendi isteği: "Ortak Görünüm" — tüm kullanıcıların çizimlerini SALT
    // OKUNUR gösteren ayrı bir katman. Bilinçli tasarım: mevcut drawSource/editing state
    // makinesine hiç dokunmuyoruz (dedup/renk/etiketleme mantığı sadece bu katmanda,
    // openCombinedAdminView içinde) — normal harita akışıyla karışmasın diye tamamen izole.
    const combinedViewSource = new VectorSource();
    combinedViewSourceRef.current = combinedViewSource;
    const combinedViewLayer = new VectorLayer({
      source: combinedViewSource,
      style: (feature) => buildCombinedViewStyle(feature, combinedViewFiltersRef.current),
    });
    combinedViewLayerRef.current = combinedViewLayer;

    const map = new OlMap({
      target: mapContainerRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        heatmapLayer,
        locationHeatmapLayer,
        geoMaskLayer,
        geoBoundaryLayer,
        drawLayer,
        analysisLayer,
        locationPolygonLayer,
        routeLineLayer,
        stopLayer,
        simulationVehicleLayer,
        poiOverviewLayer,
        poiLayer,
        houseSpotLayer,
        vertexLabelLayer,
        combinedViewLayer,
      ],
      view: new View({
        center: fromLonLat([35.2433, 38.9637]), // Türkiye'nin yaklaşık merkezi
        zoom: 7,
      }),
    });

    // Çizim modunda değilken haritadaki bir şekle tıklamak onu seçer/highlight eder.
    // Envanter Analizi'nin geçici poligonu drawSource'ta değil ayrı bir kaynakta olduğu
    // için normal seçim mantığına girmiyor — kendi "isAnalysisFeature" işaretiyle ayrı
    // ele alınıp alttaki basit "Kaldır" barını açıyor.
    map.on('click', (evt) => {
      if (drawModeRef.current) return;

      // Şekil düzenleme modundayken tıklamalar normal seçim mantığına girmiyor (Modify
      // interaction'ı zaten sürüklemeyi yönetiyor) — bunun yerine sadece köşe numarası
      // katmanına tıklanıp tıklanmadığına bakıp listedeki karşılığını highlight ediyoruz.
      // Savunma amaçlı ek kontrol (bkz. reloadShapesForMap'teki Görev #71 açıklaması): eğer
      // editingGeometryRef bir SEBEPTEN hâlâ dolu ama o key artık bu haritanın featuresMap'inde
      // yoksa (ör. reset kaçırılmışsa), düzenleme moduna sanki hâlâ aktifmiş gibi davranıp
      // tıklamayı sessizce yutmak yerine normal seçim mantığına devam ediyoruz.
      if (editingPoiIdRef.current != null) return;
      if (editingGeometryRef.current && getFeaturesMap().has(editingGeometryRef.current)) {
        const vertexFeature = map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
          hitTolerance: 8,
          layerFilter: (l) => l === vertexLabelLayer,
        });
        setSelectedVertexIndex(vertexFeature ? vertexFeature.get('vertexIndex') : null);
        return;
      }

      const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f, { hitTolerance: 8 });
      if (feature && feature.get('isAnalysisFeature')) {
        setAnalysisSelected(true);
        selectFeature(null);
        return;
      }
      // Hoca ödevi (31 Ağustos): "Hareket eden araca tıklandığında bilgi popup'ı açılsın ve
      // güzergahın yüzde kaçının tamamlandığı bilgisi gösterilsin."
      if (feature && feature.get('isSimulationVehicle')) {
        // Başka bir araca tıklanınca önceki güzergahtaki biniş/iniş durağı seçimi yeni
        // güzergahta anlamsız kalmasın diye sıfırlanıyor.
        setBoardingStopId(null);
        setDestinationStopId(null);
        setSelectedSimulationRouteId(feature.get('routeId'));
        return;
      }
      // "En İyi Ev Konumları" pinine tıklanınca kriter bazlı mesafe dökümünü göster.
      if (feature && feature.get('isHouseSpot')) {
        setSelectedHouseSpotIndex(feature.get('spotIndex'));
        return;
      }
      // Hoca ödevi (POI): "Eklenen POI'ye tıklandığında bilgi paneli açılmalıdır." — tbl_point'in
      // normal seçim mekanizmasından bağımsız, kendi işaretiyle (isPoiFeature) ayırt ediliyor.
      // Henüz kaydedilmemiş bir taslak (poiId yok) tıklanırsa bilgi paneli AÇILMASIN.
      if (feature && feature.get('isPoiFeature') && feature.get('poiId') != null) {
        setAnalysisSelected(false);
        selectFeature(null);
        setSelectedPoi(feature.get('poiId'));
        return;
      }
      // Hoca ödevi (Akıllı Ulaşım Modülü): "Duraklara tıklandığında bilgi kutucuğu açılmalıdır."
      // isPoiFeature ile AYNI desen, ayrı bir işaretle (isStopFeature) ayırt ediliyor.
      if (feature && feature.get('isStopFeature') && feature.get('stopId') != null) {
        setAnalysisSelected(false);
        selectFeature(null);
        setSelectedPoi(null);
        setSelectedStop(feature.get('stopId'));
        return;
      }
      // Kullanıcının kendi isteği: "hattı düzenleme haritadan hatta tıklayınca olsun... iki
      // çizginin arasına bir yere bi durak eklenecekse onu da düzenleme ekranından
      // ekleyebilelim." — güzergah çizgisi de durak gibi 'routeId' taşıyor, isStopFeature
      // OLMAYANI (yani hattın kendisini) burada ayırt ediyoruz. editingRoutePathIdRef,
      // startRoutePathEdit/pendingStopDraw ile AYNI mount-time closure sorunundan (bkz.
      // editingGeometryRef yorumu) kaçınmak için kullanılıyor.
      if (feature && feature.get('routeId') != null && !feature.get('isStopFeature')) {
        const clickedRouteId = feature.get('routeId');
        if (editingRoutePathIdRef.current === clickedRouteId) {
          const pointFeature = new Feature(new Point(evt.coordinate));
          stopSourceRef.current?.addFeature(pointFeature);
          const wkt = wktFormat.writeGeometry(pointFeature.getGeometry(), {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          });
          setPendingStopDraw({ feature: pointFeature, wkt });
          setLockedStopRouteId(clickedRouteId);
          return;
        }
        if (editingRoutePathIdRef.current == null && getPermissions().canManageRoutes) {
          startRoutePathEdit(clickedRouteId);
          return;
        }
        // Kullanıcının kendi isteği: "haritadan o güzergaha tıklayınca da simülasyon
        // başlatılabilsin" — yönetici olmayan (canManageRoutes'u OLMAYAN) roller çizgiye
        // tıklayınca eskiden hiçbir şey olmuyordu (aşağıdaki genel selectFeature'a düşüyordu).
        // Artık AdminPage'deki "Bilgi" ile AYNI şekilde odaklanıp banner'ı (Takip Et, izinliyse
        // Simülasyonu Başlat) açıyor.
        if (!getPermissions().canManageRoutes) {
          focusRouteRef.current?.(clickedRouteId);
          return;
        }
      }
      setAnalysisSelected(false);
      setSelectedPoi(null);
      setSelectedStop(null);
      selectFeature(feature ? feature.get('key') : null);
    });

    // PERFORMANS: hasFeatureAtPixel her fare hareketinde TÜM katmanlarda çarpışma testi yapıyor
    // (binlerce POI'de pahalı) — imleç şeklini güncellemek için saniyede ~15 kez yeterli, her
    // pikselde değil. Ayrıca sürükleme (harita kaydırma) sırasında hiç test etmiyoruz.
    let lastHitTestAt = 0;
    map.on('pointermove', (evt) => {
      if (drawModeRef.current || evt.dragging) return;
      const now = performance.now();
      if (now - lastHitTestAt < 66) return;
      lastHitTestAt = now;
      const hit = map.hasFeatureAtPixel(evt.pixel, { hitTolerance: 8 });
      map.getTargetElement().style.cursor = hit ? 'pointer' : '';
    });

    // Isı haritası yarıçapı zoom'a göre güncellensin (bkz. syncHeatmapRadius). 'change:resolution'
    // zoom animasyonu SIRASINDA da tetikleniyor; yaptığı iş iki setter olduğu için ucuz.
    map.getView().on('change:resolution', () => heatmapRadiusSyncRef.current?.());

    mapRef.current = map;

    // Faz 1a: eskiden burada doğrudan loadExistingShapes çağrılıp çizimler yükleniyordu —
    // artık HANGİ haritanın yükleneceğini bilmemiz gerekiyor, o yüzden önce /api/Map'i
    // çekip aktif haritayı belirliyoruz; asıl şekil yükleme aşağıdaki [activeMapId]
    // effect'inde oluyor (activeMapId netleşince otomatik tetiklenir).
    fetchMaps();
    fetchSharedWithMe(); // Faz 2: "Benimle Paylaşılanlar" rozeti/paneli için baştan yükle
    // Coğrafi Yetki (gri maske + sınır) artık aktif harita netleşince ayrı bir effect'te
    // çekiliyor (bkz. [activeMapId] effect'i) — Görev #7'den beri mapId'ye bağlı olabildiği için.
    fetchPoiCategories();
    fetchRoutes(); // Hoca ödevi (Akıllı Ulaşım Modülü): güzergah listesi herkese açık, mount'ta çekiliyor
    fetchStops();

    return () => {
      map.setTarget(undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hoca ödevi (Akıllı Ulaşım Modülü): "Haritada seçilen bir nokta doğrudan güzergaha durak
  // olarak eklenebilmelidir." — Güzergah Yönetimi panelindeki "🗺️ Haritadan Durak Ekle"
  // butonu AdminPage'de sessionStorage'a hedef güzergah id'sini yazıp buraya (/) yönlendiriyor.
  // Sayfa yeniden mount olduğunda bunu okuyup Durak Ekle aracını o güzergaha kilitli şekilde
  // otomatik açıyoruz.
  useEffect(() => {
    const pendingRouteId = sessionStorage.getItem('pendingStopRouteId');
    if (pendingRouteId == null) return;
    sessionStorage.removeItem('pendingStopRouteId');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLockedStopRouteId(Number(pendingRouteId));
    setStopToolActive(true);

    // Kullanıcının kendi isteği: "haritadan durak eklerken mevcut durakları sığdıracak
    // şekilde yakınlaşsın" — AdminPage bu güzergahın stopCount>0 olduğunu zaten kontrol edip
    // bu ikinci anahtarı SADECE o durumda yazıyor (bkz. AdminPage.jsx goToMapForStop).
    const fitRouteId = sessionStorage.getItem('fitStopRouteId');
    if (fitRouteId != null) {
      sessionStorage.removeItem('fitStopRouteId');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStopFitRouteId(Number(fitRouteId));
    }
  }, []);

  // goToMapForStop ile açılan "Haritadan Durak Ekle" akışında mevcut duraklara zoom-fit —
  // yukarıdaki focusedRouteId efektiyle AYNI extent hesaplama mantığı, ama katmanları
  // gizlemiyor (izolasyon YOK, sadece kamerayı ilgili bölgeye getiriyor).
  useEffect(() => {
    if (stopFitRouteId == null || stopFitDoneRef.current) return;
    const matchingStops = stops.filter((s) => s.routeId === stopFitRouteId && !s.isPaused);
    if (matchingStops.length === 0) return;
    const extent = createEmpty();
    matchingStops.forEach((stop) => {
      try {
        const feature = wktFormat.readFeature(stop.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
        extendExtent(extent, feature.getGeometry().getExtent());
      } catch {
        // bozuk geometri — yoksay
      }
    });
    if (!isEmptyExtent(extent) && mapRef.current) {
      mapRef.current.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 16, duration: 500 });
      stopFitDoneRef.current = true;
    }
  }, [stops, stopFitRouteId]);

  // Kullanıcının kendi isteği: AdminPage'deki "ℹ️ Bilgi" butonu — bkz. yukarıdaki
  // focusedRouteId yorumu.
  useEffect(() => {
    const focusRouteId = sessionStorage.getItem('focusRouteId');
    if (focusRouteId == null) return;
    sessionStorage.removeItem('focusRouteId');
    routeFocusFitDoneRef.current = false;
    const routeIdNum = Number(focusRouteId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusedRouteId(routeIdNum);

    // Kullanıcının kendi bildirdiği sorun: "admin panelden simülasyon başlatınca hiçbir şey
    // gözlemlemedim" — admin panelinde harita yok, aracı görebileceği tek yer harita. AdminPage
    // (goToMapForSimulation) 'autoFollowRouteId'yi de yazıyor — buradaysa haritaya varır varmaz
    // ekstra bir "Takip Et" tıklaması gerekmeden otomatik SignalR grubuna katılıp aracı gösteriyoruz.
    const autoFollowRouteId = sessionStorage.getItem('autoFollowRouteId');
    if (autoFollowRouteId != null) {
      sessionStorage.removeItem('autoFollowRouteId');
      if (Number(autoFollowRouteId) === routeIdNum) {
        toggleFollowRoute(routeIdNum);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Faz 2: "Benimle Paylaşılanlar" listesi periyodik yenileniyor (WebSocket yerine polling —
  // AdminPage'deki loglarla aynı bilinçli tercih) — yeni bir davet gelince ya da sahip
  // paylaşımı durdurunca kullanıcı sayfayı yenilemeden fark etsin diye.
  useEffect(() => {
    const timer = setInterval(fetchSharedWithMe, SHARE_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  // Faz 2: paylaşılan bir haritayı GÖRÜNTÜLERKEN (sahibi değilken) içeriği polling ile
  // güncel tut — "orada çizilen her şeyi anlık olarak görebilecek" isteği. Kendi haritanı
  // görüntülerken gereksiz (kimse başka çizmiyor, Faz 3'e kadar sadece sahip çizebiliyor).
  useEffect(() => {
    if (!viewingSharedMap || activeMapId == null) return undefined;
    const timer = setInterval(() => {
      reloadShapesForMap(activeMapId, () => false);
      fetchPois(activeMapId);
    }, SHARE_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingSharedMap, activeMapId]);

  // Faz 3: aktif harita değişince KENDİ ayarlarımı çekiyorum (renk kısıtlaması var mı) —
  // sahip olduğum haritalarda da sorguluyoruz (zararsız, backend boş/varsayılan döner),
  // ayrı bir "sahip miyim" dallanmasına gerek kalmasın diye.
  useEffect(() => {
    let ignore = false;
    (async () => {
      if (activeMapId == null) {
        if (!ignore) setMyShareSettings(null);
        return;
      }
      try {
        const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/map/${activeMapId}/my-settings`);
        if (ignore) return;
        if (!response.ok) {
          setMyShareSettings(null);
          return;
        }
        setMyShareSettings(await response.json());
      } catch (err) {
        if (!ignore) {
          console.error('Paylaşım ayarlarım okunamadı:', err);
          setMyShareSettings(null);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [activeMapId]);

  // Faz 3: sahip değilsem ve haritada bana özel bir renk kısıtlaması tanımlıysa, çizim
  // renk paletini bununla sınırlıyoruz — AttributePopup/ItemEditRow'a bu geçiliyor
  // (COLOR_PRESETS yerine).
  const effectiveColorPresets =
    myShareSettings?.allowedColors
      ? myShareSettings.allowedColors.split(',').map((c) => c.trim()).filter(Boolean)
      : COLOR_PRESETS;

  // Görev #70 (kullanıcının kendi isteği): "düzenlemeye izni yoksa Düzenle hiç görünmesin,
  // kısmi izinli ise deaktif olsun" — backend'deki GeometryController.RequireCanEditFeatureAsync
  // / RequireCanDeleteFeatureAsync ile BİREBİR AYNI kuralları burada tekrar ediyoruz (backend
  // zaten kesin kontrolü kendi tarafında yapıyor — bu SADECE anlık UI geri bildirimi, "izinsiz
  // buton gösterip 403 aldırma" değil).
  //   Düzenleme: harita sahibiyim VEYA bu şekli BEN çizdim VEYA CanEditOthers açık.
  //   Silme: harita sahibiyim VEYA (CanDelete açık VE (BEN çizdim VEYA CanEditOthers açık)).
  // myUserId henüz bilinmiyorsa (ör. /me çağrısı henüz dönmedi) yazarlığı VARSAYILAN KAPALI
  // tutuyoruz (güvenli taraf) — sadece sahiplik ile hâlâ tam yetki verilebiliyor.
  //
  // Silme için üç durumlu bir sonuç dönüyoruz (kullanıcının kendi isteği: "kısmi izinli ise
  // deaktif, hiç izni yok ise hiç görünmesin"): sahip CanDelete'i TAMAMEN kapatmışsa (map
  // seviyesinde) buton HİÇ görünmüyor — bu kişinin bu haritada silme diye bir yetkisi yok.
  // CanDelete açık ama bu ÖZEL öğe onun değilse (yazar değil, CanEditOthers de yok) buton
  // DEAKTİF görünüyor — "silme genel olarak açık ama bu öğe sana ait değil" mesajı net olsun.
  function getItemPermissions(item) {
    // Kullanıcının kendi isteği: "adminler her şeyi yapabilecek" — admin, kendisiyle hiç
    // paylaşılmamış bir haritayı (bkz. CanViewMapAsync'teki ManageAdmin bypass'ı) görüntülerken
    // de tam düzenleme/silme yetkisine sahip olmalı; myShareSettings burada zaten boş
    // kalacağı için (gerçek bir MapShare kaydı yok) admin'i normal "kısıtlı görüntüleyici"
    // mantığından ayrı tutuyoruz.
    if (!viewingSharedMap || isAdmin()) return { canEdit: true, deleteState: 'enabled' };
    const isAuthor = myUserId != null && item?.insertedUserId != null && item.insertedUserId === myUserId;
    const canEditOthers = !!myShareSettings?.canEditOthers;
    const canDeleteFlag = !!myShareSettings?.canDelete;
    const canEdit = isAuthor || canEditOthers;
    const deleteState = !canDeleteFlag ? 'hidden' : isAuthor || canEditOthers ? 'enabled' : 'disabled';
    return { canEdit, deleteState };
  }

  // Kendi haritalarımdan birine geçtiğimde "son ziyaret ettiğim kendi haritam" olarak
  // hatırla — "Kendi Haritalarıma Dön" şeridi buraya döner.
  useEffect(() => {
    if (activeMapId != null && maps.some((m) => m.id === activeMapId)) {
      lastOwnMapIdRef.current = activeMapId;
    }
  }, [activeMapId, maps]);

  // ---- Hocanın görevi: Coğrafi Yetki Tanımlama — gri maske, sınır çizgisi, uyarı --------
  // v2: kullanıcının BİRDEN FAZLA alanı olabilir (bkz. GeoRestrictionModal.jsx) — backend
  // artık { areas: [{ wkt, name }, ...] } dönüyor, tekil { wkt } değil.
  // Görev #7: artık mapId'ye göre de değişebiliyor (harita sahibi BU HARİTAYA özel bir kısıt
  // tanımlamış olabilir) — bu yüzden sabit bir kere değil, aktif harita her değiştiğinde
  // yeniden çekiliyor (bkz. aşağıdaki [activeMapId] effect'i).
  async function fetchMyGeoRestriction(mapId) {
    try {
      const url = mapId != null ? `${GEO_RESTRICTION_BASE}/mine?mapId=${mapId}` : `${GEO_RESTRICTION_BASE}/mine`;
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        setRestrictedAreas([]); // 204 (alan yok) dahil — sessizce "sınırsız" say
        return;
      }
      const data = await response.json();
      setRestrictedAreas(Array.isArray(data.areas) ? data.areas : []);
    } catch (err) {
      console.error('Coğrafi sınır yüklenemedi:', err);
    }
  }

  // Görev #7: aktif harita değişince (harita sahibi bu haritaya özel bir kısıt tanımlamış
  // olabilir) gri maske/sınırı YENİDEN çek — eskiden sadece sayfa açılışında bir kere
  // çekiliyordu (kısıtlar hep globaldi, harita bağımsızdı), artık öyle değil.
  // Dış API'den veri çekip setRestrictedAreas ile senkronize ediyor — React docs'un "Update
  // external systems with the latest state from React" maddesinin ters yönü, effect'in amacı bu.
  useEffect(() => {
    if (activeMapId == null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMyGeoRestriction(activeMapId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapId]);

  // restrictedAreas değişince (girişte bir kere, teorik olarak nadiren sonradan) maske +
  // sınır katmanlarını yeniden çiziyor ve handleDrawEnd'in okuduğu ref listesini güncelliyor.
  // Maske TEK bir Polygon olarak kuruluyor: dış halka dünya dikdörtgeni, iç halkalar ise
  // HER alanın (ve MultiPolygon'sa her parçasının) dış sınırı — OpenLayers çok-delikli bir
  // Polygon'u otomatik olarak "her delik ayrı boşluk" şeklinde render eder.
  useEffect(() => {
    const maskSource = geoMaskSourceRef.current;
    const boundarySource = geoBoundarySourceRef.current;
    if (!maskSource || !boundarySource) return;

    maskSource.clear();
    boundarySource.clear();

    if (restrictedAreas.length === 0) {
      restrictedAreaGeomsRef.current = [];
      return;
    }

    const allowedGeometries = restrictedAreas.map((a) =>
      wktFormat.readGeometry(a.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })
    );
    restrictedAreaGeomsRef.current = allowedGeometries;

    const outerRing = [
      [WORLD_EXTENT_3857[0], WORLD_EXTENT_3857[1]],
      [WORLD_EXTENT_3857[2], WORLD_EXTENT_3857[1]],
      [WORLD_EXTENT_3857[2], WORLD_EXTENT_3857[3]],
      [WORLD_EXTENT_3857[0], WORLD_EXTENT_3857[3]],
      [WORLD_EXTENT_3857[0], WORLD_EXTENT_3857[1]],
    ];
    // Canvas'ın "nonzero" dolgu kuralı: bir delik SADECE dış ve iç halka ZIT yönlerde
    // (biri saat yönü, diğeri tersi) sarılmışsa görünür — aynı yöndeyse delik değil,
    // dolu (bug!) render edilir. Admin çizim yönü (saat yönü/tersi) tıklama sırasına göre
    // DEĞİŞKEN olduğu için burada garanti edemeyiz — bu yüzden her delik halkasını dış
    // halkaya göre her zaman ZIT yöne normalize ediyoruz.
    const outerIsCCW = ringSignedArea(outerRing) > 0;
    const holeRings = allowedGeometries.flatMap((geom) =>
      extractOuterRings(geom).map((ring) => {
        const ringIsCCW = ringSignedArea(ring) > 0;
        return ringIsCCW === outerIsCCW ? [...ring].reverse() : ring;
      })
    );
    maskSource.addFeature(new Feature(new Polygon([outerRing, ...holeRings])));
    allowedGeometries.forEach((geom) => boundarySource.addFeature(new Feature(geom)));

    // "Kullanıcı her giriş yaptığında o kısma zoom yapsın, ekranı sadece çizebileceği kısım
    // doldursun" isteği — TÜM alanların BİRLEŞİK kapsama alanına yakınlaş (tek bir alanın
    // extent'i değil, çoklu-alan durumunda hepsini ekrana sığdırmak için).
    const unionExtent = createEmpty();
    allowedGeometries.forEach((geom) => extendExtent(unionExtent, geom.getExtent()));
    if (!isEmptyExtent(unionExtent)) {
      mapRef.current?.getView().fit(unionExtent, { padding: [40, 40, 40, 40], maxZoom: 14, duration: 400 });
    }
  }, [restrictedAreas]);

  // Bir geometrinin TÜM köşeleri izinli alanlardan HERHANGİ BİRİNİN içinde mi — sadece
  // hızlı/anlık UX geri bildirimi için (backend NTS ile aynı "Any(a => a.Contains(...))"
  // kontrolünü zaten TAM/kesin yapıyor, bkz. GeometryService.CreateAsync). Kısıt yoksa
  // (liste boşsa) her zaman true.
  function isWithinRestrictedArea(geometry) {
    const allowedList = restrictedAreaGeomsRef.current;
    if (!allowedList || allowedList.length === 0) return true;

    let coords;
    const type = geometry.getType();
    if (type === 'Point') {
      coords = [geometry.getCoordinates()];
    } else if (type === 'LineString') {
      coords = geometry.getCoordinates();
    } else {
      coords = geometry.getCoordinates()[0] || [];
    }
    return allowedList.some((allowed) => coords.every((c) => allowed.intersectsCoordinate(c)));
  }

  function showGeoWarning(message) {
    setGeoWarning(message);
    clearTimeout(geoWarningTimerRef.current);
    geoWarningTimerRef.current = setTimeout(() => setGeoWarning(null), GEO_WARNING_DURATION_MS);
  }
  // ---------------------------------------------------------------------------------------

  // Faz 1a: activeMapId netleşince (ilk yüklemede fetchMaps'in sonucuyla, ya da
  // switcher'dan başka bir sekmeye tıklanınca) o haritanın çizimlerini yükler. İlk
  // render'da activeMapId hâlâ null olduğu için bu effect bir kere boşa çalışır (no-op),
  // gerçek yükleme sadece id netleştiğinde olur — bu yüzden "önce null'a göre, sonra
  // gerçek id'ye göre" diye ÇİFT yükleme riski yok.
  useEffect(() => {
    if (activeMapId == null || !drawSourceRef.current) return undefined;
    let ignore = false;
    setSelectedPoi(null);
    cancelEditingPoi();
    reloadShapesForMap(activeMapId, () => ignore).then(() => {
      if (!ignore) setMapLoading(false);
    });
    fetchPois(activeMapId);
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapId]);

  useEffect(() => {
    if (activeMapId == null || editingPoiId != null || pendingPoiDraw != null || !getPermissions().canViewPoi) return undefined;
    const timer = window.setInterval(() => fetchPois(activeMapId), 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapId, editingPoiId, pendingPoiDraw]);

  // Kullanıcının kendi isteği: "durak eklediğimde otomatik hesaplıyor fakat sayfayı
  // yenilediğimde veya yönetim panelini aç kapa yapınca haritada güncelleniyor, onu anlık
  // yapsak çok daha iyi olur." — OSRM'in yeniden hesapladığı rota (veya admin panelinden
  // gelen herhangi bir durak/güzergah değişikliği) BAŞKA bir sekmede/oturumda (AdminPage,
  // ayrı bir route) olduğu için MapPage'e anlık haber gitmiyor; fetchPois ile AYNI polling
  // deseni burada da uygulanıyor. editingRoutePathId/pendingStopDraw doluyken (kullanıcı o an
  // hattı elle sürüklüyor veya yeni bir durak formunu dolduruyor) polling'i DURDURUYORUZ ki
  // sunucudan gelen taze veri, henüz kaydedilmemiş elle düzenlemenin üzerine yazıp onu
  // sessizce iptal etmesin.
  useEffect(() => {
    if (editingRoutePathId != null || pendingStopDraw != null || !getPermissions().canViewRoutes) return undefined;
    const timer = window.setInterval(() => fetchRoutes(), 8000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRoutePathId, pendingStopDraw]);

  // Hoca ödevi (2. tur — Isı Haritası Analizi): "Isı Haritası Analizi" AÇIKKEN aktif harita
  // değişirse (switcher'dan başka sekmeye geçilirse) katman eski haritanın verisiyle kalmasın
  // diye CQL_FILTER'ı yeni haritaya göre taze çekiyoruz. KAPALIYKEN activeMapId değişse bile
  // hiçbir istek atmıyoruz (visible:false zaten, gereksiz ağ trafiği yapmayalım).
  useEffect(() => {
    if (!heatmapActive || activeMapId == null) {
      heatmapLayerRef.current?.setVisible(false);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHeatmapImageError(false); // bir dahaki açılışta eski hata mesajı kalıntı olarak durmasın
      return undefined;
    }
    let cancelled = false;
    setHeatmapLoading(true);
    setHeatmapImageError(false);
    (async () => {
      try {
        const response = await fetch(`${GEOSERVER_CONFIG_BASE}/${activeMapId}`, { headers: authHeader() });
        if (cancelled) return;
        if (!response.ok) {
          setStatusMessage('Isı haritası yüklenemedi.');
          setHeatmapActive(false);
          return;
        }
        const config = await response.json();
        if (cancelled) return;
        const source = heatmapSourceRef.current;
        source.setUrl(`${config.baseUrl}/${config.workspace}/wms`);
        source.updateParams({ LAYERS: `${config.workspace}:tbl_point`, CQL_FILTER: config.cqlFilter });
        heatmapLayerRef.current?.setVisible(true);
      } catch {
        if (!cancelled) {
          setStatusMessage('Isı haritası için sunucuya bağlanılamadı.');
          setHeatmapActive(false);
        }
      } finally {
        if (!cancelled) setHeatmapLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapActive, activeMapId]);

  // Veritabanında zaten kayıtlı olan noktaları/çizgileri/alanları çekip haritaya + panele ekler.
  // GET uçları artık [Authorize] + kullanıcıya özel (bkz. backend GeometryController) — bu
  // özellikten ÖNCE alınmış eski bir token'da kullanıcı id'si claim'i olmadığı için 401
  // dönebilir; bu durumda sessizce boş harita göstermek yerine tekrar girişe yönlendiriyoruz.
  async function loadExistingShapes(drawSource, isIgnored, mapId) {
    for (const type of DRAW_TYPES) {
      // Kullanıcının kendi isteği: "operatör olan kişiler nokta, çizgi, poligon çizimlerine
      // sahip olmayacaklar, göremeyecekler o tarafı." Backend'in GET uçları (görüntüleme)
      // çizim izninden BAĞIMSIZ, sadece harita erişimine göre çalışıyor (bkz. CanViewMapAsync)
      // — yani Operatör kendi haritasında başkalarının şekillerini normalde YİNE görebilirdi.
      // Ayrı bir "ViewPoint/Line/Polygon" izni açmak yerine (kapsam dışı, gereksiz karmaşıklık)
      // mevcut Draw* iznini "bu türü görebilir mi" olarak da kullanıyoruz — 3 yerleşik rolde
      // (Admin/Kullanıcı: hepsi açık, Operatör: hiçbiri) zaten tam istenen sonucu veriyor.
      if (!getPermissions()[type.permKey]) continue;
      try {
        const url = mapId ? `${API_BASE}/${type.endpoint}?mapId=${mapId}` : `${API_BASE}/${type.endpoint}`;
        // eslint-disable-next-line no-await-in-loop
        const response = await fetchWithTimeout(url);
        if (response.status === 401) {
          if (!isIgnored()) {
            clearAuth();
            navigate('/login');
          }
          return;
        }
        if (!response.ok || isIgnored()) continue;
        // eslint-disable-next-line no-await-in-loop
        const items = await response.json();
        if (isIgnored()) continue;

        items.forEach((item) =>
          addShapeToMapAndList(
            drawSource,
            type,
            item.id,
            item.wkt,
            item.place,
            item.province,
            item.name,
            item.color,
            item.categoryId,
            item.createdDate,
            item.isPrivate,
            item.insertedUserId
          )
        );
      } catch (err) {
        // Sunucuya bağlanılamadıysa sayfa yine de açılabilsin diye sessizce geçiyoruz
        console.error(`${type.label} listesi yüklenemedi:`, err);
      }
    }
  }

  // Faz 1a: kullanıcının haritalarını çeker, aktif harita henüz seçilmemişse (ya da
  // artık listede yoksa — ör. başka bir sekmede silinmiş) varsayılan haritaya düşer.
  // /api/Map de [Authorize] olduğu için 401'i loadExistingShapes'teki AYNI mantıkla
  // ele alıyoruz — bağlantı/](sunucu) hatasında sonsuza kadar "harita hazırlanıyor"
  // ekranında takılı kalınmasın diye mapLoading'i her ihtimalde kapatıyoruz.
  async function fetchMaps() {
    try {
      const response = await fetchWithTimeout(MAP_BASE);
      if (response.status === 401) {
        clearAuth();
        navigate('/login');
        return;
      }
      if (!response.ok) {
        setMapLoading(false);
        return;
      }
      const data = await response.json();
      setMaps(data);
      if (data.length === 0) {
        // Normalde imkansız (backend artık her zaman en az bir varsayılan harita garanti
        // ediyor, bkz. MapService.GetMyMapsAsync), ama boş dönerse activeMapId hiç
        // netleşmeyip [activeMapId] effect'i asla tetiklenmez ve "harita hazırlanıyor"
        // ekranı sonsuza kadar takılı kalır — bu yüzden burada da bir güvenlik ağı var.
        setMapLoading(false);
        return;
      }
      setActiveMapId((current) => {
        if (current != null && data.some((m) => m.id === current)) return current;
        const def = data.find((m) => m.isDefault) || data[0];
        return def ? def.id : current;
      });
    } catch (err) {
      console.error('Haritalar yüklenemedi:', err);
      setMapLoading(false);
    }
  }

  // Aktif harita değişince (switcher'dan tıklama, çoğaltma sonrası otomatik geçiş vb.)
  // önceki haritanın çizimlerini haritadan/panelden temizleyip yenisini yüklüyor.
  //
  // BUG FIX (Görev #71, kullanıcının kendi raporu — "paylaşılan haritada ilk tıklama bilgi
  // kartını açmıyor, esc basmış gibi davranıyor"): eskiden burada SADECE selectFeature(null)
  // çağrılıyordu — editingGeometryKey/selectedVertexIndex/analysisSelected sıfırlanmıyordu.
  // Kullanıcı kendi haritasında bir şekli DÜZENLERKEN (editingGeometryKey dolu) başka bir
  // haritaya geçerse, o eski key artık YENİ haritanın featuresMap'inde YOK ama editingGeometryRef
  // hâlâ dolu kalıyordu. map.on('click') handler'ı `if (editingGeometryRef.current) {...}`
  // dalına giriyor, sadece köşe-etiketi katmanına bakıyor (hiç bulamıyor), selectFeature'ı HİÇ
  // çağırmadan return ediyordu — yani paylaşılan haritadaki şekle ilk tıklama sessizce
  // yutuluyordu ("esc basmış gibi"). İkinci tıklamada da aynı sorun sürerdi normalde, ama
  // kullanıcı arada başka bir şeye (ör. panel) tıklayıp editingGeometryKey'i dolaylı sıfırlamış
  // olabiliyordu — kararsız/şansa bağlı bir davranış. Artık harita değişiminde TÜM seçim/düzenleme
  // durumunu baştan temizliyoruz, bu ihtimal tamamen ortadan kalkıyor.
  async function reloadShapesForMap(mapId, isIgnored) {
    const drawSource = drawSourceRef.current;
    if (!drawSource) return;
    drawSource.clear();
    getFeaturesMap().clear();
    setDrawnItems([]);
    selectFeature(null);
    setEditingGeometryKey(null);
    setSelectedVertexIndex(null);
    setAnalysisSelected(false);
    await loadExistingShapes(drawSource, isIgnored, mapId);
  }

  // ---- Faz 1a: harita şeridi (switcher) — oluştur/yeniden adlandır/çoğalt --------------
  // Faz 3.2 (kullanıcının kendi isteği): "+" baloncuğu artık sadece isim değil, açıklama +
  // paylaşılacak kişi/rol listesiyle birlikte geliyor (bkz. NewMapPopover). Harita önce
  // oluşturuluyor, sonra seçilen her kişi/rol için ayrı paylaşım isteği atılıyor — biri
  // başarısız olsa bile harita zaten oluşmuş olur, kullanıcı sonradan Paylaş'tan tekrar dener.
  async function createNewMap({ name, description, users, roleIds, roles }) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    try {
      const response = await fetchWithTimeout(MAP_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, description: description || null }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatusMessage(data?.message || 'Harita oluşturulamadı.');
        return;
      }
      const created = await response.json();
      setMaps((cur) => [...cur, created]);
      setActiveMapId(created.id); // yeni haritayı oluşturunca doğrudan ona geç

      const invitePromises = (users || []).map((u) =>
        fetchWithTimeout(`${MAP_SHARE_BASE}/map/${created.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u.username }),
        }).catch(() => null)
      );
      const rolePromises = (roleIds || []).map((roleId) =>
        fetchWithTimeout(`${MAP_SHARE_BASE}/map/${created.id}/role`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleId }),
        }).catch(() => null)
      );
      if (invitePromises.length > 0 || rolePromises.length > 0) {
        await Promise.all([...invitePromises, ...rolePromises]);
        setStatusMessage(`'${trimmed}' oluşturuldu ve paylaşıldı.`);
      } else {
        setStatusMessage(`'${trimmed}' oluşturuldu.`);
      }

      // Kullanıcının kendi isteği: "harita üzerinden sınırlama belirleyebileceğim" — SADECE
      // en az bir kişi/rol paylaşıldıysa anlamlı (kısıtlanacak kimse yoksa gösterilmez, boş
      // haritada gereksiz bir adım eklememek için — "en kolay ve işlevli olan olmalı").
      if ((users || []).length > 0 || (roles || []).length > 0) {
        setPostCreateFollowup({ mapId: created.id, mapName: trimmed, users: users || [], roles: roles || [] });
      }
    } catch (err) {
      console.error('Harita oluşturulamadı:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }

  // Görev #74 (kullanıcının kendi isteği: "kaydet butonu falan da olsun"): ad + açıklamayı
  // TEK PATCH'te, EXPLICIT bir "Kaydet" tıklamasıyla birlikte kaydeder — eski renameMap/
  // updateMapDescription her alan için ayrı ayrı ve otomatik (onBlur) kaydediyordu, yeni
  // MapSettingsModal bunun yerine bunu kullanıyor.
  async function saveMapSettings(map, { name, description }) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return false;
    try {
      const response = await fetchWithTimeout(`${MAP_BASE}/${map.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, description: description || null }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatusMessage(data?.message || 'Harita ayarları kaydedilemedi.');
        return false;
      }
      setMaps((cur) => cur.map((m) => (m.id === map.id ? { ...m, name: trimmedName, description: description || null } : m)));
      setStatusMessage('Harita ayarları kaydedildi.');
      return true;
    } catch (err) {
      console.error('Harita ayarları kaydedilemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
      return false;
    }
  }

  // Boş bir harita değil, kaynak haritanın TÜM çizimlerinin gerçek bir kopyasını
  // oluşturuyor (bkz. backend MapService.DuplicateAsync) — "Copy (1)" isteği buydu.
  // Görev #77 (kullanıcının kendi isteği: "map favorileme gelsin"): iyimser (optimistic)
  // güncelleme — yıldıza basınca beklemeden anında değişsin, hata olursa geri al.
  async function toggleMapFavorite(map) {
    const next = !map.isFavorite;
    setMaps((cur) => cur.map((m) => (m.id === map.id ? { ...m, isFavorite: next } : m)));
    try {
      const response = await fetchWithTimeout(`${MAP_BASE}/${map.id}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: next }),
      });
      if (!response.ok) {
        setMaps((cur) => cur.map((m) => (m.id === map.id ? { ...m, isFavorite: !next } : m)));
        setStatusMessage('Favori durumu kaydedilemedi.');
      }
    } catch (err) {
      console.error('Favori durumu kaydedilemedi:', err);
      setMaps((cur) => cur.map((m) => (m.id === map.id ? { ...m, isFavorite: !next } : m)));
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }

  // Kullanıcının kendi isteği: "ayarlardan istediğim mapi varsayılan yapabilmeliyim otomatik
  // onunla açılır fln" — toggleMapFavorite ile aynı iyimser güncelleme deseni, ama TEK bir
  // harita "true" olabildiği için önce TÜM kendi haritalarımın IsDefault'unu kapatıp sonra
  // seçileni açıyoruz (hata olursa TÜM önceki listeyi geri yüklüyoruz — kısmi geri alma
  // birden fazla satırı senkron tutmaya çalışmaktan daha güvenilir).
  function setMapAsDefault(map) {
    if (map.isDefault) return; // zaten varsayılan — hızlı çift tıklamaya karşı da no-op
    // Kullanıcının kendi isteği: "başka haritayı varsayılan yapınca onay sorsun gene" —
    // deleteMap ile aynı ConfirmDialog deseni, ama tehlikeli bir işlem olmadığı için
    // danger: false (kırmızı değil, nötr onay butonu).
    const currentDefault = maps.find((m) => m.isDefault);
    setPendingConfirm({
      title: '⭐ Varsayılan Haritayı Değiştir',
      message: `'${map.name}' artık varsayılan haritan olacak — girişte otomatik bu açılacak.${
        currentDefault ? ` '${currentDefault.name}' artık varsayılan olmayacak.` : ''
      }`,
      confirmLabel: 'Varsayılan Yap',
      danger: false,
      onConfirm: () => applySetMapAsDefault(map),
    });
  }

  async function applySetMapAsDefault(map) {
    const snapshot = maps;
    setMaps((cur) => cur.map((m) => ({ ...m, isDefault: m.id === map.id })));
    try {
      const response = await fetchWithTimeout(`${MAP_BASE}/${map.id}/default`, { method: 'PATCH' });
      if (!response.ok) {
        setMaps(snapshot);
        setStatusMessage('Varsayılan harita güncellenemedi.');
      } else {
        setStatusMessage(`'${map.name}' artık varsayılan haritan.`);
      }
    } catch (err) {
      console.error('Varsayılan harita güncellenemedi:', err);
      setMaps(snapshot);
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }

  // Görev #77 (kullanıcının kendi isteği: "mapleri kendimiz tutup sürükleme mantığı ile
  // dizebilelim") + kullanıcının bu turdaki isteği: "gerçek zamanlı kaydıklarını
  // birbirlerinin yerine geçtiklerini daha kaydırırken görebilelim" — artık sıralama
  // SÜRÜKLERKEN (her yeni satırın üzerine gelindiğinde) canlı olarak hesaplanıp `maps`
  // state'ine yansıyor (bkz. aşağıdaki onDragOver); backend'e YALNIZCA bırakınca (onDrop)
  // TEK bir istek gidiyor — her dragover'da ağ isteği atmamak için ikiye bölündü.
  function computeDragReorder(sourceMaps, draggedId, targetId) {
    if (draggedId == null || draggedId === targetId) return sourceMaps;
    const draggedMap = sourceMaps.find((x) => x.id === draggedId);
    if (!draggedMap) return sourceMaps;
    const rest = sourceMaps.filter((x) => x.id !== draggedId);
    const targetIndex = rest.findIndex((x) => x.id === targetId);
    if (targetIndex === -1) return sourceMaps;
    rest.splice(targetIndex, 0, draggedMap);
    return rest;
  }

  async function persistMapOrder(orderedMaps) {
    try {
      await fetchWithTimeout(`${MAP_BASE}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: orderedMaps.map((m) => m.id) }),
      });
    } catch (err) {
      console.error('Sıralama kaydedilemedi:', err);
    }
  }

  async function duplicateMap(mapId) {
    if (!mapId || duplicatingMap) return;
    setDuplicatingMap(true);
    try {
      const response = await fetchWithTimeout(`${MAP_BASE}/${mapId}/duplicate`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatusMessage(data?.message || 'Harita çoğaltılamadı.');
        return;
      }
      const created = await response.json();
      setMaps((cur) => [...cur, created]);
      setActiveMapId(created.id); // çoğaltılan haritaya doğrudan geç, kopyayı hemen gör
    } catch (err) {
      console.error('Harita çoğaltılamadı:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    } finally {
      setDuplicatingMap(false);
    }
  }

  // Faz 3.1 (kullanıcının kendi isteği: "harita silme fln olsun"). Backend son haritayı
  // silmeyi zaten reddediyor (bkz. MapService.DeleteAsync) — burada sadece o hata mesajını
  // gösteriyoruz. Silinen sekme aktifse bir sonraki haritaya geçiyoruz ki kullanıcı boş
  // ekranda kalmasın; üzerindeki çizimler SİLİNMİYOR, sadece haritasız kalıyor (FK SetNull).
  // Görev #75: artık KALICI değil — harita çöp kutusuna düşüyor, "🗑️ Çöp kutusu"ndan geri
  // getirilebiliyor (bkz. openMapTrash/restoreDeletedMap).
  function deleteMap(map) {
    setPendingConfirm({
      title: '🗑️ Haritayı Sil',
      message: `'${map.name}' haritasını silmek istediğine emin misin? Üzerindeki çizimler kalıcı olarak silinmez ama bu haritayla ilişkisi kesilir, bu haritadaki paylaşımlar kalıcı olarak durur. Harita çöp kutusuna taşınacak, istersen sonra geri getirebilirsin.`,
      confirmLabel: 'Sil',
      danger: true,
      onConfirm: async () => {
        try {
          const response = await fetchWithTimeout(`${MAP_BASE}/${map.id}`, { method: 'DELETE' });
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            setStatusMessage(data?.message || 'Harita silinemedi.');
            return;
          }
          setMaps((cur) => {
            const remaining = cur.filter((m) => m.id !== map.id);
            if (activeMapId === map.id) setActiveMapId(remaining[0]?.id ?? null);
            return remaining;
          });
          setMapSettingsOpenId(null);
          setStatusMessage(`'${map.name}' çöp kutusuna taşındı.`);
        } catch (err) {
          console.error('Harita silinemedi:', err);
          setStatusMessage('Sunucuya bağlanılamadı.');
        }
      },
    });
  }

  // Görev #75: harita çöp kutusu — geometrilerdeki admin-only Trash'ten farklı, sahibin
  // KENDİ sildiği haritaları görüp geri getirebildiği/kalıcı silebildiği ayrı bir uç.
  async function openMapTrash() {
    setMapTrashOpen(true);
    setMapTrashLoading(true);
    try {
      const response = await fetchWithTimeout(`${MAP_BASE}/trash`);
      if (response.ok) setDeletedMaps(await response.json());
    } catch (err) {
      console.error('Harita çöp kutusu okunamadı:', err);
    } finally {
      setMapTrashLoading(false);
    }
  }

  async function restoreDeletedMap(map) {
    try {
      const response = await fetchWithTimeout(`${MAP_BASE}/${map.id}/restore`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatusMessage(data?.message || 'Harita geri getirilemedi.');
        return;
      }
      setDeletedMaps((cur) => cur.filter((m) => m.id !== map.id));
      await fetchMaps(); // geri gelen harita "Haritalarım" listesinde hemen görünsün
      setStatusMessage(`'${map.name}' geri getirildi.`);
    } catch (err) {
      console.error('Harita geri getirilemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }

  async function permanentDeleteMap(map) {
    try {
      const response = await fetchWithTimeout(`${MAP_BASE}/${map.id}/permanent`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatusMessage(data?.message || 'Harita kalıcı olarak silinemedi.');
        return;
      }
      setDeletedMaps((cur) => cur.filter((m) => m.id !== map.id));
      setStatusMessage(`'${map.name}' kalıcı olarak silindi.`);
    } catch (err) {
      console.error('Harita kalıcı olarak silinemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }
  // ---------------------------------------------------------------------------------------

  // ---- Faz 2: harita paylaşımı — davet/kabul/reddet/durdur, "Benimle Paylaşılanlar" -----
  // Hoca ödevi (POI/Rol/Operatör): kategori listesi dropdown (PoiFormPopup) ve admin panelinde
  // kullanılıyor — aktif ve erişilebilir haritaya göre yeniden yüklenir.
  async function fetchPoiCategories() {
    try {
      const response = await fetchWithTimeout(POI_CATEGORY_BASE);
      if (!response.ok) return;
      setPoiCategories(await response.json());
    } catch (err) {
      console.error('POI kategorileri yüklenemedi:', err);
    }
  }

  // Hoca ödevi (POI/Rol/Operatör): tüm POI'leri çekip hem state'e hem haritanın kendi
  // (tbl_point'ten ayrı) VectorSource'una yazar. isPoiFeature/poiId/name property'leri
  // click handler'ın ve poiLayer'ın stil fonksiyonunun okuduğu alanlar.
  async function fetchPois(mapId) {
    const source = poiSourceRef.current;
    if (!getPermissions().canViewPoi || mapId == null) {
      setPois([]);
      source?.clear();
      return;
    }
    try {
      const response = await fetchWithTimeout(`${POI_BASE}/catalog`);
      if (!response.ok) {
        setPois([]);
        source?.clear();
        return;
      }
      const data = await response.json();
      setPois(data);
      if (!source) return;
      source.clear();
      // PERFORMANS: 8.700 POI'yi tek tek addFeature ile eklemek her seferinde 'addfeature'
      // olayı + yeniden çizim isteği doğuruyordu. Önce diziye toplayıp TEK addFeatures
      // çağrısı yapıyoruz (OL bunu tek seferde indeksliyor).
      const loadedFeatures = [];
      data.forEach((poi) => {
        try {
          const feature = wktFormat.readFeature(poi.wkt, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          });
          feature.set('isPoiFeature', true);
          feature.set('poiId', poi.id);
          feature.set('name', poi.name);
          feature.set('userId', poi.userId);
          feature.set('categoryId', poi.categoryId);
          feature.set('icon', poi.effectiveIcon || '📍');
          feature.set('isActive', poi.isActive !== false);
          feature.set('isOwnPoi', poi.userId === myUserId);
          feature.set('poiHidden', false);
          // Önem skoru BİR KEZ burada hesaplanıyor (stil fonksiyonunda değil) — stil fonksiyonu
          // her render'da her POI için çağrılıyor, orada isim/kategori metni taramak binlerce
          // POI'de gereksiz iş olurdu.
          feature.set('importance', poiImportance(poi.name, poi.categoryName));
          loadedFeatures.push(feature);
        } catch (parseErr) {
          console.error('Bozuk POI geometrisi atlandı:', poi.id, parseErr);
        }
      });
      source.addFeatures(loadedFeatures);
    } catch (err) {
      console.error('POI\'ler yüklenemedi:', err);
    }
  }

  // Hoca ödevi (Akıllı Ulaşım Modülü): tüm aktif güzergahları çeker — GET /api/TransitRoute
  // herkese açık (auth gerekmez), Durak Ekle formundaki dropdown ve Güzergah Yönetimi paneli
  // için kullanılıyor.
  async function fetchRoutes() {
    try {
      const response = await fetchWithTimeout(TRANSIT_ROUTE_BASE);
      if (!response.ok) return;
      const data = await response.json();
      setRoutes(data);
      routesRef.current = data;
      // Route'lar YENİDEN gelince (örn. duraklatma/hat bükme sonrası) hat çizimi de
      // güncellenmeli — fetchStops zaten stops state'ini tekrar okuyup lineSource'u
      // yeniden kuruyor, burada tekrar tetikliyoruz.
      fetchStops();
    } catch (err) {
      console.error('Güzergahlar yüklenemedi:', err);
    }
  }

  // Hoca ödevi (Akıllı Ulaşım Modülü): fetchPois ile AYNI desen — tüm durakları çekip hem
  // state'e hem haritanın kendi (stopSourceRef) VectorSource'una yazar. Ayrıca her güzergahın
  // duraklarını SortOrder'a göre sıralayıp routeLineSourceRef'e bir LineString feature olarak
  // yazar (Google Maps tarzı: renkli güzergah çizgisi + duraklar).
  // Kullanıcının kendi isteği: "istediğimiz durağı veya güzergahı duraklatma şeyi de olsun
  // duraklatınca görünmesinler. durağı duraklatınca otomatik sonrakiyle birleşsin." —
  // duraklatılan bir GÜZERGAH tamamen gizlenir (durakları da); duraklatılan tek bir DURAK ise
  // sadece o nokta gizlenir, hat SortOrder sırasında onu atlayıp önceki/sonraki AKTİF durağı
  // doğrudan birleştirir (coords listesine hiç girmiyor). Ayrıca kullanıcının "aralarındaki
  // çizgileri tutup kırabiliyor olalım bükebilelim" isteği: route.pathWkt doluysa (admin
  // haritada hattı elle bükmüşse) o LineString AYNEN çizilir, düz-çizgi hesaplaması atlanır.
  async function fetchStops() {
    const source = stopSourceRef.current;
    const lineSource = routeLineSourceRef.current;
    if (!getPermissions().canViewRoutes) {
      setStops([]);
      source?.clear();
      lineSource?.clear();
      return;
    }
    try {
      const response = await fetchWithTimeout(TRANSIT_STOP_BASE);
      if (!response.ok) {
        setStops([]);
        source?.clear();
        lineSource?.clear();
        return;
      }
      const allData = await response.json();
      setStops(allData);

      const routesById = new Map(routesRef.current.map((r) => [r.id, r]));
      // Duraklatılmış güzergahın durakları haritada HİÇ görünmesin (route.isPaused = true).
      const visibleData = allData.filter((stop) => !(routesById.get(stop.routeId)?.isPaused));

      if (source) {
        source.clear();
        visibleData
          .filter((stop) => !stop.isPaused)
          .forEach((stop) => {
            try {
              const feature = wktFormat.readFeature(stop.wkt, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
              });
              feature.set('isStopFeature', true);
              feature.set('stopId', stop.id);
              feature.set('name', stop.name);
              feature.set('routeId', stop.routeId);
              feature.set('routeColor', stop.routeColor);
              // Kullanıcının kendi isteği: "harita üzerinde güzergah sıralaması numaralandırılmış
              // olarak görünsün, mümkünse noktaların içinde numaralı olsun" — bkz. buildStopLayerStyle.
              feature.set('sortOrder', stop.sortOrder);
              source.addFeature(feature);
            } catch (parseErr) {
              console.error('Bozuk durak geometrisi atlandı:', stop.id, parseErr);
            }
          });
      }

      if (lineSource) {
        lineSource.clear();
        const byRoute = new Map();
        visibleData.forEach((stop) => {
          if (!byRoute.has(stop.routeId)) byRoute.set(stop.routeId, []);
          byRoute.get(stop.routeId).push(stop);
        });
        byRoute.forEach((routeStops, routeId) => {
          const route = routesById.get(routeId);
          // Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): "Hesaplanan rotaları
          // ilgili güzergah için ... haritada gösterin." Render önceliği: OSRM'in gerçek yol
          // ağına göre hesapladığı route.routeGeometryWkt VARSA o gösterilir (en gerçekçi);
          // yoksa admin'in elle büktüğü route.pathWkt (mevcut davranış, DEĞİŞMEDİ); o da yoksa
          // duraklardan geçen düz çizgi (aşağıdaki eski fallback).
          if (route?.routeGeometryWkt) {
            try {
              const feature = wktFormat.readFeature(route.routeGeometryWkt, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
              });
              feature.set('routeId', routeId);
              feature.set('routeColor', route.color);
              feature.set('isOsrmRoute', true);
              lineSource.addFeature(feature);
            } catch (parseErr) {
              console.error('Güzergahın OSRM rotası okunamadı:', routeId, parseErr);
            }
            return;
          }
          // Elle bükülmüş hat varsa (route.pathWkt) AYNEN çiz — durak sırası/sayısı hattı
          // etkilemez, admin manuel olarak neyi çizdiyse o gösterilir.
          if (route?.pathWkt) {
            try {
              const feature = wktFormat.readFeature(route.pathWkt, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
              });
              feature.set('routeId', routeId);
              feature.set('routeColor', route.color);
              lineSource.addFeature(feature);
            } catch (parseErr) {
              console.error('Güzergahın elle bükülmüş hattı okunamadı:', routeId, parseErr);
            }
            return;
          }

          // Duraklatılmamış duraklar SortOrder'a göre sıralanıp düz çizgiyle birleştirilir —
          // duraklatılan bir durak bu listeye hiç girmediği için hat otomatik olarak
          // önceki/sonraki aktif durağı birleştirir.
          const active = routeStops.filter((stop) => !stop.isPaused).sort((a, b) => a.sortOrder - b.sortOrder);
          if (active.length < 2) return;
          try {
            const coords = active.map((stop) => {
              const feature = wktFormat.readFeature(stop.wkt, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857',
              });
              return feature.getGeometry().getCoordinates();
            });
            const lineFeature = new Feature({ geometry: new LineString(coords) });
            lineFeature.set('routeId', routeId);
            lineFeature.set('routeColor', active[0].routeColor);
            lineSource.addFeature(lineFeature);
          } catch (parseErr) {
            console.error('Güzergah çizgisi oluşturulamadı:', routeId, parseErr);
          }
        });
      }
    } catch (err) {
      console.error('Duraklar yüklenemedi:', err);
    }
  }

  async function fetchAdminAllMaps() {
    try {
      const response = await fetchWithTimeout(`${MAP_BASE}/admin/all`);
      if (!response.ok) return;
      setAdminAllMaps(await response.json());
      setAdminAllMapsLoaded(true);
    } catch (err) {
      console.error('Tüm haritalar yüklenemedi:', err);
    }
  }

  // Kullanıcının kendi isteği: "haritanın en başında sabitli olarak herkesin çizimlerinin
  // bir arada olduğu bir harita olsun" — "Ortak Görünüm". Bilinçli kapsam kararı (kullanıcıya
  // ayrıca açıklandı): salt okunur, POI/durak zaten global olduğu için (her haritada zaten
  // görünüyorlar) burada TEKRAR çekilmiyor/dedup edilmiyor — sadece harita-özel çizimler
  // (Point/LineString/Polygon) toplanıyor.
  async function openCombinedAdminView() {
    setCombinedViewLoading(true);
    setCombinedViewActive(true);
    setCombinedViewOwnerFilter('');
    setCombinedViewTypeFilter('');
    setCombinedViewDetailKey(null);
    // Normal harita katmanı karışmasın diye seçili şekil/düzenleme modlarını kapatıyoruz.
    selectFeature(null);
    setDrawMode(null);
    // Kullanıcının kendi isteği: "kimin hangi haritası olduğu görülebilsin" — harita İSİMLERİNİ
    // çözebilmek için adminAllMaps'in (Tüm Haritalar sekmesiyle AYNI uç, ownerUsername filtresi
    // OLMADAN TÜM haritaları döndürüyor) yüklenmiş olması gerekiyor.
    if (!adminAllMapsLoaded) fetchAdminAllMaps();
    try {
      const [pointsRes, linesRes, polygonsRes] = await Promise.all([
        fetchWithTimeout(`${API_BASE}/point/admin/all`),
        fetchWithTimeout(`${API_BASE}/line/admin/all`),
        fetchWithTimeout(`${API_BASE}/polygon/admin/all`),
      ]);
      if (!pointsRes.ok || !linesRes.ok || !polygonsRes.ok) {
        setStatusMessage('Ortak görünüm yüklenemedi.');
        setCombinedViewActive(false);
        return;
      }
      const [points, lines, polygons] = await Promise.all([pointsRes.json(), linesRes.json(), polygonsRes.json()]);
      // Kullanıcının kendi isteği: sağdaki panelde tip ikonlarıyla (Nokta/Çizgi/Alan)
      // gösterebilmek için, hangi uçtan geldiğini burada ETİKETLİYORUZ — backend bu üç
      // uçtan ayrı ayrı döndüğü için "mode" alanı kendiliğinden gelmiyor.
      const allItems = [
        ...points.map((p) => ({ ...p, mode: 'Point' })),
        ...lines.map((l) => ({ ...l, mode: 'LineString' })),
        ...polygons.map((pg) => ({ ...pg, mode: 'Polygon' })),
      ];

      const source = combinedViewSourceRef.current;
      source?.clear();
      const owners = new Set();
      const extent = createEmpty();
      const items = [];
      allItems.forEach((item) => {
        try {
          const feature = wktFormat.readFeature(item.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
          const owner = item.ownerUsername || 'Bilinmiyor';
          const ownerColor = hashUsernameToColor(owner);
          const key = `${item.mode}-${item.id}`;
          feature.set('ownerUsername', owner);
          feature.set('ownerColor', ownerColor);
          feature.set('combinedKey', key);
          owners.add(owner);
          source?.addFeature(feature);
          extendExtent(extent, feature.getGeometry().getExtent());
          items.push({
            key,
            mode: item.mode,
            id: item.id,
            name: item.name || null,
            ownerUsername: owner,
            ownerColor,
            mapId: item.mapId ?? null,
            isPrivate: !!item.isPrivate,
          });
        } catch (err) {
          console.error('Ortak görünüm: bozuk geometri atlandı', item.id, err);
        }
      });
      drawLayerRef.current?.setVisible(false);
      setCombinedViewStats({ userCount: owners.size, itemCount: allItems.length });
      setCombinedViewItems(items);
      if (!isEmptyExtent(extent) && mapRef.current) {
        mapRef.current.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: 15, duration: 500 });
      }
    } catch (err) {
      console.error('Ortak görünüm yüklenemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
      setCombinedViewActive(false);
    } finally {
      setCombinedViewLoading(false);
    }
  }

  // Kullanıcının kendi isteği: sağ paneldeki Ortak Görünüm listesinden bir çizime tıklayınca
  // haritada ona zoom-fit yapılsın (combinedViewSourceRef'teki feature'lar normal
  // drawnItems/getFeaturesMap() mekanizmasında YOK, o yüzden ayrı, basit bir zoom mantığı).
  function zoomToCombinedViewItem(key) {
    const feature = combinedViewSourceRef.current?.getFeatures().find((f) => f.get('combinedKey') === key);
    if (!feature || !mapRef.current) return;
    mapRef.current.getView().fit(feature.getGeometry().getExtent(), { padding: [100, 100, 100, 100], maxZoom: 16, duration: 500 });
  }

  function closeCombinedAdminView() {
    combinedViewSourceRef.current?.clear();
    setCombinedViewActive(false);
    setCombinedViewStats(null);
    setCombinedViewItems([]);
    setCombinedViewDetailKey(null);
    drawLayerRef.current?.setVisible(true);
  }

  // Kullanıcı gerçek bir haritaya geçerse (activeMapId değişirse) "Ortak Görünüm" otomatik
  // kapansın — iki görünüm aynı anda karışık kalmasın diye.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (combinedViewActive) closeCombinedAdminView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapId]);

  async function fetchSharedWithMe() {
    try {
      const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/shared-with-me`);
      if (!response.ok) return;
      setSharedWithMe(await response.json());
    } catch (err) {
      console.error('Benimle paylaşılanlar yüklenemedi:', err);
    }
  }

  async function fetchMapShares(mapId) {
    try {
      const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/map/${mapId}`);
      if (!response.ok) return;
      setMapShares(await response.json());
    } catch (err) {
      console.error('Paylaşımlar yüklenemedi:', err);
    }
  }

  // Faz 3: Paylaş modalındaki "Aktivite" sekmesi — harita sahibi admin OLMASA bile kendi
  // haritasındaki geometry.* aksiyonlarını (kim ne çizdi/düzenledi/sildi) görebilsin diye.
  async function fetchMapActivity(mapId) {
    setActivityLoading(true);
    try {
      const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/map/${mapId}/activity`);
      if (!response.ok) {
        setMapActivity([]);
        return;
      }
      setMapActivity(await response.json());
    } catch (err) {
      console.error('Aktivite kaydı yüklenemedi:', err);
      setMapActivity([]);
    } finally {
      setActivityLoading(false);
    }
  }

  // Kullanıcının kendi isteği: Harita Ayarları'ndaki Paylaşılanlar kartlarının "kısıtlı mı"
  // rozeti için — Ayarlar açılınca tek istekte o haritanın TÜM (role+user) kısıt satırları.
  async function fetchMapGeoRestrictions(mapId) {
    try {
      const response = await fetchWithTimeout(`${GEO_RESTRICTION_BASE}/map/${mapId}`);
      setMapGeoRestrictions(response.ok ? await response.json() : []);
    } catch (err) {
      console.error('Haritanın coğrafi kısıtları yüklenemedi:', err);
      setMapGeoRestrictions([]);
    }
  }

  // Görev #76: paylaşım satırındaki bir kişiye tıklayınca profil kartını açar + bilgisini çeker.
  async function openUserProfile(username) {
    setProfileCardUsername(username);
    setProfileCardData(null);
    setProfileCardLoading(true);
    try {
      const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/user/${encodeURIComponent(username)}`);
      if (response.ok) setProfileCardData(await response.json());
    } catch (err) {
      console.error('Kullanıcı bilgisi alınamadı:', err);
    } finally {
      setProfileCardLoading(false);
    }
  }

  function inviteToMap(mapId, username) {
    const trimmed = (username || '').trim();
    if (!trimmed || inviting) return;
    setPendingConfirm({
      title: '🔗 Haritayı Paylaş',
      message: `'${trimmed}' kullanıcısını bu haritaya davet etmek istediğine emin misin? Kabul ederse haritayı görüntüleyip üzerine çizim yapabilecek.`,
      confirmLabel: 'Davet Et',
      danger: false,
      onConfirm: async () => {
        setInviting(true);
        try {
          const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/map/${mapId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: trimmed }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            setStatusMessage(data?.message || 'Davet gönderilemedi.');
            return;
          }
          setShareUsername('');
          await fetchMapShares(mapId);
        } catch (err) {
          console.error('Davet gönderilemedi:', err);
          setStatusMessage('Sunucuya bağlanılamadı.');
        } finally {
          setInviting(false);
        }
      },
    });
  }

  // Faz 3.2 (kullanıcının kendi isteği: "rollere de paylaşabilelim"): mevcut haritayı bir
  // role toplu paylaşır — kabul/red yok, roldeki herkes anında erişir.
  async function shareMapWithRole(mapId, roleId) {
    try {
      const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/map/${mapId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatusMessage(data?.message || 'Rol ile paylaşılamadı.');
        return;
      }
      await fetchMapShares(mapId);
      setStatusMessage('Rol ile paylaşıldı.');
    } catch (err) {
      console.error('Rol ile paylaşılamadı:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }

  // Yeni harita baloncuğunda ve Paylaş modalındaki "role paylaş" seçicisinde kullanılan,
  // baştan yüklenip önbelleklenen rol listesi (roller az sayıda, sık değişmiyor).
  async function fetchPickableRoles() {
    try {
      const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/pickable-roles`);
      if (!response.ok) return;
      setPickableRoles(await response.json());
    } catch (err) {
      console.error('Roller yüklenemedi:', err);
    }
  }

  // Faz 3.2 (kullanıcının kendi isteği: "kullanıcı adının her harfini yazarken filtreleme
  // yapıp göstermeli"): NewMapPopover'ın ve rol-paylaşım kutusunun canlı arama çağrısı.
  async function searchUsersForShare(query) {
    try {
      const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/search-users?q=${encodeURIComponent(query)}`);
      if (!response.ok) return [];
      return await response.json();
    } catch (err) {
      console.error('Kullanıcı aranamadı:', err);
      return [];
    }
  }

  // Faz 3.1 (kullanıcının kendi isteği: "çizme/silme/görüntüleme ayrı izinler olsun"): sahibin
  // bir davetli için çizme/silme/"başkalarının çizimini de düzenleyebilir" ve renk kısıtlaması
  // ayarlarını kaydetmesi (bkz. MapShareSettingsRow). Görüntüleme (Duraklat) burada DEĞİL —
  // o ayrı, kalıcı olmayan bir uç (bkz. pauseShare).
  async function updateShareSettings(shareId, canDraw, canDelete, canEditOthers, allowedColors) {
    try {
      const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/${shareId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canDraw, canDelete, canEditOthers, allowedColors }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatusMessage(data?.message || 'İzinler kaydedilemedi.');
        return;
      }
      if (shareModalMapId != null) await fetchMapShares(shareModalMapId);
      setStatusMessage('Paylaşım izinleri güncellendi.');
    } catch (err) {
      console.error('Paylaşım izinleri kaydedilemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }

  // Faz 3.1 (kullanıcının kendi isteği: "kişiyi duraklatıp silebilelim"): davete/Status'a
  // dokunmadan TÜM erişimi (görüntüleme dahil) tek tıkla aç/kapa — kalıcı DEĞİL, tekrar
  // tıklayınca geri açılır. Kalıcı çıkarmak için hâlâ aşağıdaki removeShare var.
  // Kullanıcının kendi isteği: "duraklatabilme fln da yapılabilmeli veya kaldırabilmeliyim
  // onay dahilinde hepsi" — Duraklat/Devam Ettir de artık Kaldır ile aynı ConfirmDialog
  // akışından geçiyor (hem Paylaş modalındaki hem Harita Ayarları'ndaki buton BURADAN
  // çağırıyor — iki giriş noktası arasında davranış farkı olmasın diye).
  function confirmPauseShare(share, canView) {
    const targetLabel = share.targetType === 'Role' ? `'${share.roleName}' rolünün` : `'${share.invitedUsername}' kullanıcısının`;
    setPendingConfirm({
      title: canView ? '▶ Erişimi Geri Aç' : '⏸ Erişimi Duraklat',
      message: canView
        ? `${targetLabel} bu haritaya erişimini geri açmak istediğine emin misin?`
        : `${targetLabel} bu haritaya erişimini geçici olarak durdurmak istediğine emin misin? İstediğin zaman geri açabilirsin.`,
      confirmLabel: canView ? 'Geri Aç' : 'Duraklat',
      danger: false,
      onConfirm: () => pauseShare(share, canView),
    });
  }

  async function pauseShare(share, canView) {
    try {
      const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/${share.id}/pause`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canView }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setStatusMessage(data?.message || 'Paylaşım duraklatılamadı.');
        return;
      }
      // Harita Ayarları açıkken shareModalMapId null olduğu için eski kod listeyi hiç
      // yenilemiyordu. Backend doğru kaydetse bile rozet/buton ancak modal tekrar açılınca
      // değişiyordu. Başarılı cevaptan sonra aynı kaydı hemen güncelliyor, ardından hangi
      // paylaşım yüzeyi açıksa o haritayı sunucudan tekrar okuyarak state'i doğruluyoruz.
      setMapShares((current) =>
        current.map((item) => (item.id === share.id ? { ...item, canView } : item))
      );
      setStatusMessage(canView ? 'Paylaşım erişimi yeniden açıldı.' : 'Paylaşım erişimi duraklatıldı.');
      const mapIdToRefresh = share.mapId ?? mapSettingsOpenId ?? shareModalMapId;
      if (mapIdToRefresh != null) await fetchMapShares(mapIdToRefresh);
    } catch (err) {
      console.error('Paylaşım duraklatılamadı:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }

  function removeShare(share) {
    // BUG FİX (bu mesaj rol paylaşımları eklenmeden önce yazılmıştı — bir rolü kaldırırken
    // "'' kullanıcısını..." gibi boş bir isimle gösteriyordu, fark edip düzelttim): artık
    // targetType'a göre doğru etiketi kullanıyor.
    const targetLabel = share.targetType === 'Role' ? `'${share.roleName}' rolünü` : `'${share.invitedUsername}' kullanıcısını`;
    setPendingConfirm({
      title: '🗑️ Paylaşımı Kaldır',
      message: `${targetLabel} bu haritadan kalıcı olarak çıkarmak istediğine emin misin? Erişimini geri vermek için tekrar davet etmen/paylaşman gerekir.`,
      confirmLabel: 'Kaldır',
      danger: true,
      onConfirm: async () => {
        try {
          const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/${share.id}`, { method: 'DELETE' });
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            setStatusMessage(data?.message || 'Paylaşım kaldırılamadı.');
            return;
          }
          if (shareModalMapId != null) await fetchMapShares(shareModalMapId);
        } catch (err) {
          console.error('Paylaşım kaldırılamadı:', err);
          setStatusMessage('Sunucuya bağlanılamadı.');
        }
      },
    });
  }

  function respondToShare(share, accept) {
    setPendingConfirm({
      title: accept ? '✅ Daveti Kabul Et' : '❌ Daveti Reddet',
      message: accept
        ? `'${share.ownerUsername}' kullanıcısının '${share.mapName}' haritasını görüntülemeyi kabul ediyor musun?`
        : `'${share.ownerUsername}' kullanıcısının '${share.mapName}' harita davetini reddetmek istediğine emin misin?`,
      confirmLabel: accept ? 'Kabul Et' : 'Reddet',
      danger: !accept,
      onConfirm: async () => {
        try {
          const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/${share.shareId}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            setStatusMessage(data?.message || 'Davet yanıtlanamadı.');
            return;
          }
          await fetchSharedWithMe();
        } catch (err) {
          console.error('Davet yanıtlanamadı:', err);
          setStatusMessage('Sunucuya bağlanılamadı.');
        }
      },
    });
  }

  // Görev #77 (kullanıcının kendi isteği: "paylaşılan haritaları sonradan arşive
  // atabilmeliyim, favorileyebilmeliyim veya onlara not ekleyebilmeliyim bir kullanıcı
  // olarak"): bunlar ALICI tarafı tercihleri — sahibin (owner) ayarlarıyla karışmasın diye
  // backend'de ayrı alanlar (RecipientIsFavorite/RecipientIsArchived/RecipientNote) ve ayrı
  // bir endpoint (PATCH {id}/recipient-prefs) var. İyimser güncelleme, hata olursa geri al.
  async function setSharePrefs(share, patch) {
    const prev = sharedWithMe;
    setSharedWithMe((cur) => cur.map((s) => (s.shareId === share.shareId ? { ...s, ...patch } : s)));
    try {
      const body = {};
      if ('isFavorite' in patch) body.isFavorite = patch.isFavorite;
      if ('isArchived' in patch) body.isArchived = patch.isArchived;
      if ('note' in patch) {
        if (patch.note === null) body.clearNote = true;
        else body.note = patch.note;
      }
      const response = await fetchWithTimeout(`${MAP_SHARE_BASE}/${share.shareId}/recipient-prefs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setSharedWithMe(prev);
        setStatusMessage('Tercih kaydedilemedi.');
      }
    } catch (err) {
      console.error('Tercih kaydedilemedi:', err);
      setSharedWithMe(prev);
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }

  function toggleShareFavorite(share) {
    setSharePrefs(share, { isFavorite: !share.isFavorite });
  }

  function toggleShareArchived(share) {
    setSharePrefs(share, { isArchived: !share.isArchived });
  }

  function startEditingShareNote(share) {
    setEditingShareNoteId(share.shareId);
    setShareNoteDraft(share.note || '');
  }

  function saveShareNote(share) {
    const trimmed = shareNoteDraft.trim();
    setSharePrefs(share, { note: trimmed === '' ? null : trimmed });
    setEditingShareNoteId(null);
  }
  // ---------------------------------------------------------------------------------------

  // WKT'yi (EPSG:4326) haritanın projeksiyonuna (EPSG:3857) çevirip feature olarak ekler,
  // aynı zamanda "Çizilenler" panelinde gösterilecek listeye de kaydeder. Yer adı veritabanında
  // zaten kayıtlıysa (place dolu geldiyse) OLDUĞU GİBİ kullanılır, Nominatim'e tekrar sorulmaz —
  // sadece hiç çözülmemiş (place boş) şekiller için kuyruğa geocode isteği eklenir.
  function addShapeToMapAndList(
    drawSource,
    type,
    id,
    wkt,
    place = null,
    province = null,
    name = null,
    color = null,
    categoryId = null,
    createdDate = null,
    isPrivate = false,
    insertedUserId = null
  ) {
    const feature = wktFormat.readFeature(wkt, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });

    const key = `${type.mode}-${id}`;
    feature.set('key', key);
    feature.set('mode', type.mode);
    feature.set('id', id);
    feature.set('color', color);
    feature.set('name', name);
    feature.setStyle(buildStyle(type.mode, id, false, color, name));

    getFeaturesMap().set(key, feature);
    drawSource.addFeature(feature);

    setDrawnItems((current) => [
      ...current,
      {
        key,
        id,
        mode: type.mode,
        label: type.label,
        place,
        province,
        name,
        color,
        categoryId,
        createdDate,
        isPrivate: !!isPrivate,
        insertedUserId: insertedUserId ?? null,
      },
    ]);

    if (!place) {
      const [lon, lat] = toLonLat(getExtentCenter(feature.getGeometry().getExtent()));
      enqueueGeocode(key, id, type.endpoint, lon, lat);
    }
  }

  function getExtentCenter(extent) {
    return [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
  }

  // Seçilen çizim tipine göre Draw interaction'ını haritaya ekler/kaldırır
  useEffect(() => {
    const map = mapRef.current;
    const drawSource = drawSourceRef.current;
    if (!map || !drawSource || !drawMode) return;

    // Kullanıcının kendi isteği (önemli bug raporu): sınır dışına yapılan TIKLAMA anında
    // hata verip TÜM taslağı iptal etmeli — eskiden sadece drawend'de (şekil bitince) tam
    // kontrol yapılıyordu, ortadaki köşeler sınır dışına çıksa bile taslak griye boyanmış
    // halde ekranda kalmaya devam ediyordu. OL'nin `condition` seçeneği tam bu iş için var:
    // false dönersek o tıklama HİÇ işlenmez (köşe eklenmez); zaten başlamış bir taslak varsa
    // (sketchActiveRef true) aynı anda TÜMÜNÜ abortDrawing() ile iptal ediyoruz — abortDrawing
    // çağrısını setTimeout(...,0) ile bir tık ertelemek gerekiyor çünkü OL condition'ın
    // kendi tıklama işleme akışının ORTASINDA — senkron abort orayla çakışabilir.
    const draw = new Draw({
      source: drawSource,
      type: drawMode,
      style: buildSketchStyle(drawMode),
      condition: (event) => {
        const allowedList = restrictedAreaGeomsRef.current;
        if (!allowedList || allowedList.length === 0) return true;
        const isOutside = !allowedList.some((g) => g.intersectsCoordinate(event.coordinate));
        if (!isOutside) return true;

        showGeoWarning('Sadece belirlenen bölgeye çizim yapabilirsiniz.');
        if (sketchActiveRef.current) {
          setTimeout(() => draw.abortDrawing(), 0);
        }
        return false;
      },
    });
    draw.on('drawstart', (event) => {
      sketchActiveRef.current = true;
      // Hocanın Coğrafi Yetki görevi: kullanıcı hâlâ köşe köşe çizerken (drawend'e daha
      // ulaşmadan) fareyi sınır dışına götürürse anında bilgilendirici bir uyarı göster —
      // taslağı henüz SİLMİYORUZ (OL'nin canlı "sürüklenen uç nokta" güncellemesi her fare
      // hareketinde tetiklendiği için, agresif bir iptal kullanıcı sınıra yakın çalışırken
      // taslağı sürekli kaybetmesine yol açardı). Kesin ret hâlâ drawend'de (bkz.
      // handleDrawEnd) anında ve garantili şekilde oluyor.
      const sketchGeometry = event.feature.getGeometry();
      let lastWarnedOutside = false;
      sketchGeometry.on('change', () => {
        const allowedList = restrictedAreaGeomsRef.current;
        if (!allowedList || allowedList.length === 0) return;
        const coords = sketchGeometry.getCoordinates();
        const type = sketchGeometry.getType();
        let lastPoint;
        if (type === 'Point') lastPoint = coords;
        else if (type === 'LineString') lastPoint = coords[coords.length - 1];
        else lastPoint = (coords[0] || [])[coords[0].length - 1];
        if (!lastPoint) return;
        const isOutside = !allowedList.some((g) => g.intersectsCoordinate(lastPoint));
        if (isOutside && !lastWarnedOutside) {
          lastWarnedOutside = true;
          showGeoWarning('Sınır dışına çıkıyorsun — bu şekilde bitirirsen kaydedilmeyecek.');
        } else if (!isOutside) {
          lastWarnedOutside = false;
        }
      });
    });
    draw.on('drawend', (event) => {
      sketchActiveRef.current = false;
      handleDrawEnd(drawMode, event.feature);
    });
    draw.on('drawabort', () => {
      sketchActiveRef.current = false;
    });
    map.addInteraction(draw);
    activeDrawRef.current = draw; // Esc ile iptal edebilmek için (bkz. global keydown dinleyicisi)

    return () => {
      map.removeInteraction(draw);
      if (activeDrawRef.current === draw) activeDrawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode]);

  // "Envanter Analizi" aracı aktifken ayrı bir Poligon Draw interaction'ı — kendi geçici
  // kaynağına (analysisSourceRef) çiziyor, backend'e asla POST/DELETE göndermiyor. Yeni bir
  // analiz poligonu çizilince öncekini otomatik temizliyoruz (tek seferde bir tane olsun).
  useEffect(() => {
    const map = mapRef.current;
    const analysisSource = analysisSourceRef.current;
    if (!map || !analysisSource || !analysisToolActive) return;

    const draw = new Draw({ source: analysisSource, type: 'Polygon' });
    draw.on('drawstart', () => {
      sketchActiveRef.current = true;
    });
    draw.on('drawend', (event) => {
      sketchActiveRef.current = false;
      const olds = analysisSource.getFeatures().filter((f) => f !== event.feature);
      olds.forEach((f) => analysisSource.removeFeature(f));
      event.feature.set('isAnalysisFeature', true);
      setAnalysisSelected(false);
      runAnalysis(event.feature);
    });
    draw.on('drawabort', () => {
      sketchActiveRef.current = false;
    });
    map.addInteraction(draw);
    activeDrawRef.current = draw;

    return () => {
      map.removeInteraction(draw);
      if (activeDrawRef.current === draw) activeDrawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisToolActive]);

  // Hoca ödevi (25 Ağustos — Konum Analizi): "Haritada Poligon çizme" alan modu — Envanter
  // Analizi'yle BİREBİR AYNI desen (kendi geçici kaynağına çiziyor, backend'e hiç gitmiyor),
  // sadece SONUCU (POI filtresi) analiz sonucu göstermek yerine locationPolygonGeomRef'e
  // yazıyor — asıl filtreleme "Analizi Başlat"a basılınca (startLocationAnalysis) yapılıyor,
  // çizim bitince otomatik tetiklenmiyor (kullanıcı önce kriterleri de girmeli).
  useEffect(() => {
    const map = mapRef.current;
    const source = locationPolygonSourceRef.current;
    if (!map || !source || !locationAnalysisDrawing) return;

    const draw = new Draw({ source, type: 'Polygon' });
    draw.on('drawstart', () => {
      sketchActiveRef.current = true;
    });
    draw.on('drawend', (event) => {
      sketchActiveRef.current = false;
      const olds = source.getFeatures().filter((f) => f !== event.feature);
      olds.forEach((f) => source.removeFeature(f));
      locationPolygonGeomRef.current = event.feature.getGeometry();
      setHasLocationPolygon(true);
      setLocationAnalysisDrawing(false);
    });
    draw.on('drawabort', () => {
      sketchActiveRef.current = false;
      setLocationAnalysisDrawing(false);
    });
    map.addInteraction(draw);
    activeDrawRef.current = draw;

    return () => {
      map.removeInteraction(draw);
      if (activeDrawRef.current === draw) activeDrawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationAnalysisDrawing]);

  // Hoca ödevi (POI/Rol/Operatör): "Operatör için haritada POI ekleme aracı (Point) oluşturun."
  // Envanter Analizi aracıyla AYNI desen — kendi Draw interaction'ı, kendi kaynağı
  // (poiSourceRef), tbl_point'in draw/undo-redo/kategori-filtre mekanizmasına hiç girmiyor.
  // Nokta çizilir çizilmez PoiFormPopup açılsın diye aracı hemen kapatıyoruz (bkz. drawend).
  useEffect(() => {
    const map = mapRef.current;
    const poiSource = poiSourceRef.current;
    if (!map || !poiSource || !poiToolActive) return;

    const draw = new Draw({ source: poiSource, type: 'Point' });
    draw.on('drawstart', () => {
      sketchActiveRef.current = true;
    });
    draw.on('drawend', (event) => {
      sketchActiveRef.current = false;
      const wkt = wktFormat.writeGeometry(event.feature.getGeometry(), {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });
      setPendingPoiDraw({ feature: event.feature, wkt });
      setPoiToolActive(false); // art arda tıklayıp yeni nokta başlatmasın, önce bu formu bitirsin
    });
    draw.on('drawabort', () => {
      sketchActiveRef.current = false;
    });
    map.addInteraction(draw);
    activeDrawRef.current = draw;

    return () => {
      map.removeInteraction(draw);
      if (activeDrawRef.current === draw) activeDrawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poiToolActive]);

  // Hoca ödevi (Akıllı Ulaşım Modülü): "Operatör için haritada 'Durak Ekle' (Point) aracı
  // oluşturun." — yukarıdaki POI Draw effect'iyle BİREBİR AYNI desen (kendi Draw interaction'ı,
  // kendi kaynağı stopSourceRef, nokta çizilir çizilmez form açılsın diye aracı hemen kapatıyoruz).
  useEffect(() => {
    const map = mapRef.current;
    const stopSource = stopSourceRef.current;
    if (!map || !stopSource || !stopToolActive) return;

    const draw = new Draw({ source: stopSource, type: 'Point' });
    draw.on('drawstart', () => {
      sketchActiveRef.current = true;
    });
    draw.on('drawend', (event) => {
      sketchActiveRef.current = false;
      const wkt = wktFormat.writeGeometry(event.feature.getGeometry(), {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });
      setPendingStopDraw({ feature: event.feature, wkt });
      setStopToolActive(false);
    });
    draw.on('drawabort', () => {
      sketchActiveRef.current = false;
    });
    map.addInteraction(draw);
    activeDrawRef.current = draw;

    return () => {
      map.removeInteraction(draw);
      if (activeDrawRef.current === draw) activeDrawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopToolActive]);

  // Bilgi kartındaki "Düzenle" ile açılan şekil düzenleme modu — SADECE seçilen tek
  // feature'a bağlı bir Modify interaction'ı ekliyoruz (ayrı bir kaynak gerekmiyor,
  // Modify doğrudan Collection'daki feature'ları değiştirebiliyor). Kullanıcı köşe
  // noktalarını sürükledikçe feature'ın geometrisi CANLI değişiyor; "Kaydet" bu son
  // hâli WKT'ye çevirip backend'e gönderiyor, "Vazgeç" ise düzenlemeye başlarken
  // klonladığımız orijinal geometriyi geri yazıyor (bkz. cancelEditingGeometry).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !editingGeometryKey) return;
    const feature = getFeaturesMap().get(editingGeometryKey);
    if (!feature) return;

    const modify = new Modify({ features: new Collection([feature]) });
    map.addInteraction(modify);

    return () => map.removeInteraction(modify);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingGeometryKey]);

  // Kullanıcının kendi isteği: güzergah hattını elle bükme — editingGeometryKey'deki AYNI
  // Modify deseni, ama TransitRoute'un kendi routeLineSourceRef'indeki tek bir feature'a
  // bağlı (o kaynak drawnItems/getFeaturesMap sistemine hiç girmiyor, bu yüzden ayrı bir effect).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || editingRoutePathId == null) return undefined;
    const feature = routeLineSourceRef.current?.getFeatures().find((f) => f.get('routeId') === editingRoutePathId);
    if (!feature) return undefined;

    // Vazgeç/undo'nun "önceki" değeri — düzenlemeye başlarken hattın o anki WKT'sini sakla.
    routePathBaselineWktRef.current = wktFormat.writeGeometry(feature.getGeometry(), {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });
    routePathPrevCoordsRef.current = feature.getGeometry().getCoordinates().map((c) => [c[0], c[1]]);
    setRoutePathDirty(false);

    // Kullanıcının kendi isteği: Alt+tık ile köşe silme KALDIRILDI — "aralarındaki çizgiler
    // asla silinmeyecek" (her durak arası bağlantı garanti olmalı). Modify'ın varsayılanı
    // zaten köşe silmeyi kapalı bıraktığı için deleteCondition'ı hiç vermiyoruz.
    const modify = new Modify({ features: new Collection([feature]) });

    // Her sürükleme bittiğinde: değişen köşe bir DURAĞIN konumuyla mı çakışıyordu (eski
    // konumu), yoksa serbest bir bükülme noktası mıydı? Eşleşiyorsa çizgiyi eski konumuna
    // geri alıp bunun yerine durağın kendisini taşıyoruz — böylece çizgi durağı asla
    // "bırakmıyor", durakla birlikte hareket ediyor.
    // Kullanıcının kendi tespiti: "durakları tutup sürüklerken çizgiden ayrılıyorlar... duraklar
    // çizgiler ile birlikte hareket edecek her koşulda." — kök neden: OSRM'in ürettiği rota,
    // her durağı GERÇEK yol ağındaki en yakın noktaya "snap" ederek çiziyor; bu snap mesafesi
    // (kaldırım/bina girişinden yola kadar) sık sık eski 6 metrelik toleransı aşıyordu. Eşleşme
    // sessizce BAŞARISIZ oluyor, kod bunu "serbest bükülme noktası" sanıyor, durak yerinde
    // kalırken çizgi ondan kopuyordu. Toleransı OSRM'in tipik snap mesafelerini kapsayacak
    // şekilde büyüttük (50m — güzergahlardaki durak arası mesafenin (genelde yüzlerce metre)
    // çok altında kaldığı için yanlışlıkla başka bir durakla eşleşme riski düşük).
    const STOP_MATCH_TOLERANCE_SQ = 50 * 50;
    modify.on('modifyend', async () => {
      const geom = feature.getGeometry();
      const newCoords = geom.getCoordinates();
      const oldCoords = routePathPrevCoordsRef.current || [];

      if (newCoords.length !== oldCoords.length) {
        // Bir ara noktadan yeni köşe türetildi (mevcut bir durakla asla eşleşmez) — normal
        // bükülme noktası olarak kabul et, yalnızca baseline'ı güncelle.
        routePathPrevCoordsRef.current = newCoords.map((c) => [c[0], c[1]]);
        return;
      }

      let changedIndex = -1;
      for (let i = 0; i < newCoords.length; i++) {
        const dx = newCoords[i][0] - oldCoords[i][0];
        const dy = newCoords[i][1] - oldCoords[i][1];
        if (dx * dx + dy * dy > 0.0001) {
          changedIndex = i;
          break;
        }
      }
      if (changedIndex === -1) return; // gerçek bir değişiklik yok
      setRoutePathDirty(true);

      const routeId = editingRoutePathIdRef.current;
      const siblingStops = (stopsRef.current || []).filter((s) => s.routeId === routeId && !s.isPaused);
      // "İlk eşleşen" yerine "EN YAKIN" durağı buluyoruz — birden fazla durak toleransın içine
      // düşerse (ör. sık aralıklı duraklar), doğru olanı seçmek için.
      let matchedStop = null;
      let matchedDistSq = Infinity;
      for (const stop of siblingStops) {
        try {
          const stopCoord = wktFormat
            .readFeature(stop.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })
            .getGeometry()
            .getCoordinates();
          const dx = stopCoord[0] - oldCoords[changedIndex][0];
          const dy = stopCoord[1] - oldCoords[changedIndex][1];
          const distSq = dx * dx + dy * dy;
          if (distSq <= STOP_MATCH_TOLERANCE_SQ && distSq < matchedDistSq) {
            matchedStop = stop;
            matchedDistSq = distSq;
          }
        } catch {
          // WKT okunamadıysa bu durağı atla
        }
      }

      if (!matchedStop) {
        // Serbest bir bükülme noktası — normal davranış, baseline'ı güncelle.
        routePathPrevCoordsRef.current = newCoords.map((c) => [c[0], c[1]]);
        return;
      }

      // Durağa denk gelen köşeyi ESKİ konumuna geri al — bu, hattın kendi Path'inde bir
      // "manuel bükülme noktası" olarak kaydedilmesin diye. Asıl konum güncellemesi
      // durağın kendi kaydına (PATCH) gidiyor; hat, durak taşındıktan sonra fetchRoutes()
      // ile zaten o yeni konumdan geçecek şekilde yeniden kuruluyor.
      const revertedCoords = newCoords.map((c, i) => (i === changedIndex ? [...oldCoords[i]] : c));
      geom.setCoordinates(revertedCoords);
      routePathPrevCoordsRef.current = revertedCoords.map((c) => [c[0], c[1]]);

      try {
        const newStopWkt = wktFormat.writeGeometry(new Point(newCoords[changedIndex]), {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });
        const response = await fetchWithTimeout(`${TRANSIT_STOP_BASE}/${matchedStop.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ wkt: newStopWkt }),
        });
        if (!response.ok) {
          setStatusMessage('Durak konumu güncellenemedi.');
          return;
        }
        setStatusMessage(`"${matchedStop.name}" durağı taşındı.`);
        // Kullanıcının kendi tespiti (ekran görüntüsüyle): "durağı tutup sürükleyince çizgiyi
        // de peşinden getirmesi lazım ama yolu takip ederek bunu yapmıyor." — bu güzergahın
        // bir OSRM rotası varsa, backend (TransitStopService.UpdateAsync → sameRouteMove →
        // RegenerateRouteIfNeededAsync) yukarıdaki PATCH'in İÇİNDE zaten yeni bir OSRM isteği
        // atıp route.RouteGeometry'yi güncelledi. fetchStops() SADECE durakları çeker;
        // route.routeGeometryWkt'nin taze halini görmek için fetchRoutes() (o da içeride
        // fetchStops'u tekrar çağırıyor) gerekiyor — aksi halde harita, sunucuda artık geçersiz
        // olan ESKİ (yolu takip etmeyen) OSRM çizgisini göstermeye devam ederdi.
        await fetchRoutes();

        // Hat düzenleme oturumu hâlâ AÇIKSA (admin "Kaydet/Vazgeç"e basmadan başka bir durağı
        // da sürüklemeye devam edebilir), fetchRoutes() lineSource'u SIFIRDAN kurduğu için bu
        // route'un feature nesnesi de YENİLENDİ — Modify interaction'ının hâlâ ESKİ (artık
        // kaynaktan kaldırılmış) feature'a bağlı kalmaması için Collection'ı taze feature'a
        // yeniden bağlıyor, baseline'ı da (bu andan itibaren "başlangıç" burası olduğu için)
        // taze geometriyle güncelliyoruz.
        if (editingRoutePathIdRef.current === routeId && routePathModifyRef.current) {
          const freshFeature = routeLineSourceRef.current?.getFeatures().find((f) => f.get('routeId') === routeId);
          if (freshFeature) {
            const featuresCollection = routePathModifyRef.current.getFeatures();
            featuresCollection.clear();
            featuresCollection.push(freshFeature);
            routePathBaselineWktRef.current = wktFormat.writeGeometry(freshFeature.getGeometry(), {
              dataProjection: 'EPSG:4326',
              featureProjection: 'EPSG:3857',
            });
            routePathPrevCoordsRef.current = freshFeature.getGeometry().getCoordinates().map((c) => [c[0], c[1]]);
          }
        }
      } catch (err) {
        console.error('Durak taşınamadı:', err);
        setStatusMessage('Sunucuya bağlanılamadı.');
      }
    });

    map.addInteraction(modify);
    routePathModifyRef.current = modify;

    return () => {
      map.removeInteraction(modify);
      if (routePathModifyRef.current === modify) routePathModifyRef.current = null;
      routePathPrevCoordsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRoutePathId]);

  useEffect(() => {
    editingPoiIdRef.current = editingPoiId;
    const map = mapRef.current;
    if (!map || editingPoiId == null) return undefined;
    const feature = poiSourceRef.current?.getFeatures().find((item) => item.get('poiId') === editingPoiId);
    if (!feature) return undefined;
    const modify = new Modify({ features: new Collection([feature]) });
    map.addInteraction(modify);
    return () => map.removeInteraction(modify);
  }, [editingPoiId]);

  // Şekil düzenleme modundayken her köşenin üstüne 1,2,3... yazan geçici nokta katmanı —
  // aşağıdaki VertexCoordinateEditor listesindeki sıra numaralarıyla birebir eşleşir, hangi
  // haritadaki köşenin listede kaçıncı satır olduğu görülebilsin diye. Feature'ın 'change'
  // olayını dinliyoruz (Modify ile sürüklendikçe ya da liste üzerinden elle girildikçe).
  useEffect(() => {
    const source = vertexLabelSourceRef.current;
    if (!source || !editingGeometryKey) return undefined;
    const feature = getFeaturesMap().get(editingGeometryKey);
    if (!feature) return undefined;

    function rebuildLabels() {
      source.clear();
      const mode = feature.get('mode');
      const geometry = feature.getGeometry();
      if (!geometry) return;

      let coords;
      if (mode === 'Point') {
        coords = [geometry.getCoordinates()];
      } else if (mode === 'LineString') {
        coords = geometry.getCoordinates();
      } else {
        coords = (geometry.getCoordinates()[0] || []).slice(0, -1); // kapanış noktasını sayma
      }

      coords.forEach((coord, i) => {
        const labelFeature = new Feature(new Point(coord));
        labelFeature.set('vertexIndex', i);
        const selected = i === selectedVertexIndex;
        labelFeature.setStyle(
          new Style({
            image: new CircleStyle({
              radius: selected ? 10 : 8,
              fill: new Fill({ color: selected ? '#f59e0b' : '#111827' }),
              stroke: new Stroke({ color: '#fff', width: selected ? 2.5 : 1.5 }),
            }),
            text: new Text({
              text: String(i + 1),
              font: 'bold 10px system-ui, sans-serif',
              fill: new Fill({ color: '#fff' }),
            }),
            zIndex: selected ? 101 : 100,
          })
        );
        source.addFeature(labelFeature);
      });
    }

    rebuildLabels();
    feature.on('change', rebuildLabels);
    return () => {
      feature.un('change', rebuildLabels);
      source.clear();
    };
  }, [editingGeometryKey, selectedVertexIndex]);

  // Esc / Ctrl+Z / Ctrl+Y dinleyicisi mount'ta BİR KERE kuruluyor (drawModeRef/editingGeometryRef
  // gibi diğer mount-only listener'larla aynı sebepten: her render'da yeniden bağlamaya gerek
  // yok). Güncel fonksiyon/state'lere her zaman "en son" halleriyle erişmek için latestRef'i
  // her render'da (deps'siz useEffect) güncelliyoruz — klasik "en güncel ref" deseni.
  const latestRef = useRef({});
  useEffect(() => {
    latestRef.current = {
      pendingDraw,
      editingGeometryKey,
      drawMode,
      analysisToolActive,
      poiToolActive,
      pendingPoiDraw,
      cancelPendingDraw,
      cancelEditingGeometry,
      cancelPoiDraw,
      performUndo,
      performRedo,
      // Kullanıcının kendi isteği: POI arama/izolasyon modundan Esc ile çıkılabilsin.
      selectedPoi,
      poiCategoryFilter,
      // Hoca ödevi (Akıllı Ulaşım Modülü): Durak Ekle aracı/taslağı da AYNI Esc zincirine giriyor.
      stopToolActive,
      pendingStopDraw,
      cancelStopDraw,
      // Kullanıcının kendi isteği: "esc ve ctrl z düzgün çalışsın" — hat bükme modu da
      // editingGeometryKey ile AYNI önceliğe (Esc = Vazgeç) ve Ctrl+Z engelleme davranışına sahip.
      editingRoutePathId,
      cancelRoutePathEdit,
      // Kullanıcının kendi isteği: "Haritada gösterilenler" paneli Esc ile de kapansın.
      layerFilterOpen,
      // Kullanıcının kendi isteği: "Ortak Görünüm" salt-okunur modu da Esc ile kapansın.
      combinedViewActive,
      closeCombinedAdminView,
      // Kullanıcının kendi isteği (8. tur): "konum analizinde esc tuşu çalışsın, birkaç defa
      // esc basınca çizim poligonunu da temizlesin."
      locationAnalysisActive,
      locationAnalysisResultActive,
      hasLocationPolygon,
    };
  });

  useEffect(() => {
    function handleKeyDown(e) {
      const {
        pendingDraw: pd,
        editingGeometryKey: egk,
        drawMode: dm,
        analysisToolActive: ata,
        poiToolActive: pta,
        pendingPoiDraw: ppd,
        cancelPendingDraw: cpd,
        cancelEditingGeometry: ceg,
        cancelPoiDraw: cpoi,
        performUndo: pu,
        performRedo: pr,
        selectedPoi: spoi,
        poiCategoryFilter: pcf,
        locationAnalysisActive: laa,
        locationAnalysisResultActive: lar,
        hasLocationPolygon: hlp,
        stopToolActive: sta,
        pendingStopDraw: psd,
        cancelStopDraw: cstop,
        editingRoutePathId: erpi,
        cancelRoutePathEdit: crpe,
        layerFilterOpen: lfo,
        combinedViewActive: cva,
        closeCombinedAdminView: ccav,
      } = latestRef.current;

      if (e.key === 'Escape') {
        // Kullanıcının kendi isteği: bir POI seçiliyken (haritada izole gösterim + arama
        // çubuğunda pinlenmiş isim) veya kategori çipiyle filtrelenmişken Esc, arama
        // barındaki X ile AYNI şeyi yapsın — izolasyonu kaldırıp tüm POI'leri geri göster.
        // Diğer Esc önceliklerinden ÖNCE kontrol ediyoruz ki tek bir Esc her zaman hemen işe
        // yarasın (çizim modlarıyla nadiren çakışır ama çakışırsa önce arama izolasyonu kalksın).
        if (spoi != null || pcf) {
          setSelectedPoi(null);
          setPoiCategoryFilter('');
          return;
        }
        if (cva) {
          ccav();
          return;
        }
        // 1) Yarım kalmış bir çizim taslağı varsa: SADECE onu iptal et, araç seçili kalsın
        //    (kullanıcı hemen tekrar çizmeye devam edebilsin).
        if (activeDrawRef.current && sketchActiveRef.current) {
          activeDrawRef.current.abortDrawing();
          return;
        }
        if (pd) {
          cpd();
          return;
        }
        if (egk) {
          ceg();
          return;
        }
        // Kullanıcının kendi isteği: hat bükme modunda Esc = Vazgeç (Modify sürükleme
        // sırasında zaten olduğu gibi, editingGeometryKey ile AYNI öncelik).
        if (erpi != null) {
          crpe();
          return;
        }
        // Hoca ödevi (POI): form açıkken Esc, taslak noktayı da haritadan silerek kapatsın.
        if (ppd) {
          cpoi();
          return;
        }
        // Hoca ödevi (Akıllı Ulaşım Modülü): Durak formu açıkken Esc, taslak noktayı da
        // haritadan silerek kapatsın — POI ile AYNI davranış.
        if (psd) {
          cstop();
          return;
        }
        // Kullanıcının kendi isteği (8. tur): Konum Analizi'nde Esc — önce SONUCU (ısı
        // haritası + POI izolasyonu) temizler, ikinci Esc çizilmiş poligonu da siler, üçüncü
        // Esc paneli tamamen kapatır. Kademeli davranış diğer araçlardaki "1. esc taslağı
        // iptal eder, 2. esc aracı kapatır" mantığıyla TUTARLI.
        if (lar) {
          clearLocationAnalysis();
          return;
        }
        if (hlp) {
          clearLocationAnalysisPolygon();
          return;
        }
        if (laa) {
          setLocationAnalysisActive(false);
          return;
        }
        // 2) Yarım taslak yoktu ama bir çizim/analiz/POI aracı hâlâ seçiliyse: ikinci Esc artık
        //    aracı tamamen kapatıp serbest seçim (mouse) moduna dönsün.
        if (dm) {
          setDrawMode(null);
          return;
        }
        if (ata) {
          setAnalysisToolActive(false);
          return;
        }
        if (pta) {
          setPoiToolActive(false);
        }
        if (sta) {
          setStopToolActive(false);
        }
        // Kullanıcının kendi isteği: hiçbir taslak/araç açık değilse ama "Haritada
        // gösterilenler" paneli açıksa, Esc onu da kapatsın.
        if (lfo) {
          setLayerFilterOpen(false);
        }
        return;
      }

      // Bir metin kutusundayken Ctrl+Z tarayıcının kendi geri alması olsun (input içindeki
      // yazım geçmişi) — haritadaki işlem geçmişiyle karışmasın.
      const target = e.target;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping) return;

      const ctrlOrCmd = e.ctrlKey || e.metaKey;
      if (!ctrlOrCmd) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        pu();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        pr();
      } else if (key === 'n' && e.altKey && getPermissions().canManageMultipleMaps) {
        // Faz 1a: "+ Yeni Harita" için kısayol — setSwitcherOpen/setNewMapPopoverOpen React'in
        // stabil setState fonksiyonları olduğu için latestRef'e ihtiyaç yok, doğrudan
        // çağırmak güvenli.
        e.preventDefault();
        setSwitcherOpen(true);
        setNewMapPopoverOpen(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ---- Geri al / ileri al (undo/redo) geçmişi ----------------------------------------
  // Her "kayıtlı" işlem (oluşturma, silme, öznitelik düzenleme, şekil düzenleme) başarıyla
  // bittiğinde pushHistory ile {undo, redo} çift fonksiyonu yığına ekleniyor. undo/redo
  // sırasında (isReplayingHistoryRef=true) alttaki fonksiyonlar (handleDelete, applyAttributesEdit
  // vb.) tekrar çağrılsa bile pushHistory kendini otomatik susturuyor — yeni bir işlem gibi
  // tekrar geçmişe eklenmiyor, aksi halde her undo yeni bir redo kaydı yaratır ve yığın hiç
  // boşalmazdı.
  function pushHistory(entry) {
    if (isReplayingHistoryRef.current) return;
    undoStackRef.current.push(entry);
    redoStackRef.current = []; // yeni bir işlemden sonra ileri geçmiş geçersiz olur (standart davranış)
    setUndoCount(undoStackRef.current.length);
    setRedoCount(0);
  }

  async function performUndo() {
    // Kullanıcının kendi isteği: hat bükme oturumu ortasında (henüz Kaydet'e basılmamışken)
    // Ctrl+Z global geçmişi karıştırmasın — editingGeometryKey ile AYNI mantık.
    if (isReplayingHistoryRef.current || editingGeometryKey || pendingDraw || editingRoutePathId != null) return;
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    isReplayingHistoryRef.current = true;
    try {
      await entry.undo();
      redoStackRef.current.push(entry);
    } catch (err) {
      console.error('Geri alma başarısız:', err);
      undoStackRef.current.push(entry); // başarısız oldu, yığından düşürmeyelim
    } finally {
      isReplayingHistoryRef.current = false;
      setUndoCount(undoStackRef.current.length);
      setRedoCount(redoStackRef.current.length);
    }
  }

  async function performRedo() {
    if (isReplayingHistoryRef.current || editingGeometryKey || pendingDraw || editingRoutePathId != null) return;
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    isReplayingHistoryRef.current = true;
    try {
      await entry.redo();
      undoStackRef.current.push(entry);
    } catch (err) {
      console.error('İleri alma başarısız:', err);
      redoStackRef.current.push(entry);
    } finally {
      isReplayingHistoryRef.current = false;
      setUndoCount(undoStackRef.current.length);
      setRedoCount(redoStackRef.current.length);
    }
  }

  // Kullanıcının kendi isteği: "aralarındaki çizgileri tutup kırabiliyor olalım bükebilelim" —
  // bkz. yukarıdaki [editingRoutePathId] Modify effect'i. startRoutePathEdit sadece o feature'ın
  // var olduğunu doğrulayıp state'i açıyor (asıl Modify interaction'ı effect kuruyor).
  // Kullanıcının kendi isteği (3 Eylül): "güzergah için bilgi'ye tıklayınca çizilenler
  // kısmından haritada gösterilenler kısmında sadece güzergahlar açık kalsın ve sadece o
  // güzergah görünsün." — odak açılırken mevcut katman görünürlüğü saklanıp yalnızca
  // Güzergahlar açık bırakılıyor; odak kapanınca kullanıcının kendi tercihleri geri geliyor.
  function focusRoute(routeId) {
    routeFocusFitDoneRef.current = false;
    if (!preFocusLayerVisibilityRef.current) {
      preFocusLayerVisibilityRef.current = { ...layerVisibilityRef.current };
    }
    const onlyRoutes = { Point: false, LineString: false, Polygon: false, Poi: false, Routes: true };
    layerVisibilityRef.current = onlyRoutes;
    setLayerVisibility(onlyRoutes);
    setFocusedRouteId(routeId);
  }
  focusRouteRef.current = focusRoute;

  function clearRouteFocus() {
    const restored = preFocusLayerVisibilityRef.current;
    preFocusLayerVisibilityRef.current = null;
    if (restored) {
      layerVisibilityRef.current = restored;
      setLayerVisibility(restored);
    }
    setFocusedRouteId(null);
  }

  function startRoutePathEdit(routeId) {
    const feature = routeLineSourceRef.current?.getFeatures().find((f) => f.get('routeId') === routeId);
    if (!feature) {
      setStatusMessage('Bu güzergahın haritada çizili bir hattı yok (en az 2 aktif durak gerekir).');
      return;
    }
    setEditingRoutePathId(routeId);
  }

  // Kullanıcının kendi isteği: "rota oluştur şeyi o ekranda çıksın" — AdminPage'deki "Rota
  // Oluştur" butonuyla AYNI uç nokta, ama haritadan çıkmadan hat düzenleme kartının içinden.
  async function generateRouteFromMap(routeId) {
    setGeneratingRoutePathId(routeId);
    try {
      const response = await fetchWithTimeout(`${TRANSIT_ROUTE_BASE}/${routeId}/generate-route`, {
        method: 'POST',
        headers: authHeader(),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setStatusMessage(body?.message || 'Rota oluşturulamadı.');
        return;
      }
      setStatusMessage('OSRM rotası oluşturuldu.');
      await fetchRoutes();
      // Yeni OSRM geometrisiyle Modify interaction'ının feature referansını tazele (bkz. durak
      // sürükleme sonrası AYNI yeniden-bağlama deseni — fetchRoutes lineSource'u yeniden kurar).
      if (editingRoutePathIdRef.current === routeId && routePathModifyRef.current) {
        const freshFeature = routeLineSourceRef.current?.getFeatures().find((f) => f.get('routeId') === routeId);
        if (freshFeature) {
          const featuresCollection = routePathModifyRef.current.getFeatures();
          featuresCollection.clear();
          featuresCollection.push(freshFeature);
          routePathBaselineWktRef.current = wktFormat.writeGeometry(freshFeature.getGeometry(), {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          });
          routePathPrevCoordsRef.current = freshFeature.getGeometry().getCoordinates().map((c) => [c[0], c[1]]);
          setRoutePathDirty(false);
        }
      }
    } catch (err) {
      console.error('Rota oluşturulamadı:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    } finally {
      setGeneratingRoutePathId(null);
    }
  }

  // Vazgeç — düzenlemeye başlarken saklanan orijinal geometriyi feature'a geri yazar (Modify
  // interaction'ı zaten [editingRoutePathId] effect'inin cleanup'ında kaldırılıyor).
  function cancelRoutePathEdit() {
    const feature = routeLineSourceRef.current?.getFeatures().find((f) => f.get('routeId') === editingRoutePathId);
    if (feature && routePathBaselineWktRef.current) {
      try {
        const original = wktFormat.readFeature(routePathBaselineWktRef.current, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });
        feature.setGeometry(original.getGeometry());
      } catch (err) {
        console.error('Hat düzenleme iptal edilirken orijinal geometri geri yüklenemedi:', err);
      }
    }
    setEditingRoutePathId(null);
    routePathBaselineWktRef.current = null;
  }

  // Kullanıcının kendi düzeltmesi: "sıfırla deyince düz çizgilere geri döndüler ne alaka...
  // sıfırla deyince sadece oynadığımız şeyi sıfırlasın, kaydet olduktan sonra sıfırlama
  // olmayacak, yolları hesaplasın her zaman." — "Sıfırla" SADECE o an ekranda elle
  // sürüklenmekte olan (henüz kaydedilmemiş) hattı iptal edip backend'deki elle-Path'i
  // temizler (bkz. SetPathAsync — artık wkt=null iken RouteGeometry'ye DOKUNMUYOR). Bu
  // güzergahın daha önce OSRM'den hesaplanmış bir rotası (RouteGeometry) varsa, Path
  // temizlenince render önceliği zaten geri OSRM rotasına döner — DÜZ ÇİZGİYE DEĞİL. Hiç OSRM
  // rotası yoksa (ne elle bükülmüş ne OSRM'den gelmiş bir hat varsa), düz çizgide bırakmak
  // yerine otomatik olarak OSRM'den bir rota istiyoruz — "yolları hesaplasın her zaman".
  async function resetRoutePathToStraight(routeId) {
    await persistRoutePath(routeId, null, routePathBaselineWktRef.current);
    setEditingRoutePathId(null);
    routePathBaselineWktRef.current = null;

    const route = routesRef.current.find((r) => r.id === routeId);
    if (route && !route.routeGeometryWkt) {
      try {
        const response = await fetchWithTimeout(`${TRANSIT_ROUTE_BASE}/${routeId}/generate-route`, {
          method: 'POST',
          headers: authHeader(),
        });
        if (response.ok) {
          await fetchRoutes();
        }
        // Başarısızsa (ör. 2'den az aktif durak, OSRM ayakta değil) sessizce düz çizgide
        // kalır — bu akış admin'in "Sıfırla"ya bastığı her an bir hata popup'ı görmesini
        // istemeyen, best-effort bir iyileştirme; asıl "Rota Oluştur" butonu hâlâ elde ve
        // hatayı açıkça gösteriyor.
      } catch (err) {
        console.error('Sıfırlama sonrası OSRM rotası otomatik alınamadı:', err);
      }
    }
  }

  async function saveRoutePathEdit() {
    const routeId = editingRoutePathId;
    const feature = routeLineSourceRef.current?.getFeatures().find((f) => f.get('routeId') === routeId);
    if (!feature) {
      setEditingRoutePathId(null);
      return;
    }
    const newWkt = wktFormat.writeGeometry(feature.getGeometry(), {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });
    const previousWkt = routePathBaselineWktRef.current;
    await persistRoutePath(routeId, newWkt, previousWkt);
    setEditingRoutePathId(null);
    routePathBaselineWktRef.current = null;
  }

  // Ortak yardımcı — hem "Kaydet" hem "Sıfırla" burayı çağırır, tek bir yerde undo/redo
  // kaydı düşürüyor (pushHistory ile AYNI {undo, redo} deseni, uygulamadaki TÜM diğer şekil
  // düzenlemeleriyle tutarlı granülerlik: her "kaydet" tek bir Ctrl+Z adımı).
  async function persistRoutePath(routeId, newWkt, previousWkt) {
    setSavingRoutePath(true);
    try {
      const response = await fetchWithTimeout(`${TRANSIT_ROUTE_BASE}/${routeId}/path`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ wkt: newWkt }),
      });
      if (!response.ok) {
        setStatusMessage('Güzergah hattı kaydedilemedi.');
        return;
      }
      pushHistory({
        undo: async () => {
          await fetchWithTimeout(`${TRANSIT_ROUTE_BASE}/${routeId}/path`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ wkt: previousWkt }),
          });
          await fetchRoutes();
        },
        redo: async () => {
          await fetchWithTimeout(`${TRANSIT_ROUTE_BASE}/${routeId}/path`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ wkt: newWkt }),
          });
          await fetchRoutes();
        },
      });
      await fetchRoutes();
    } catch (err) {
      console.error('Güzergah hattı kaydedilemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    } finally {
      setSavingRoutePath(false);
    }
  }

  // Çöp kutusundan geri getirip haritaya/listeye yeniden ekler — undo(oluşturma-silme)
  // ve redo(oluşturma) tarafından paylaşılan tek bir yer (TrashPanel'deki restore ile aynı
  // uç nokta, ama o ekrandaki restore undo/redo geçmişine dokunmuyor, ayrı bir akış).
  async function restoreItemToMap(typeInfo, id, wkt, place, province, name, color, categoryId, createdDate) {
    const response = await fetchWithTimeout(`${TRASH_BASE}/${typeInfo.endpoint}/${id}/restore`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Kayıt geri getirilemedi.');
    // Geri getirme/undo-redo her zaman kullanıcının KENDİ oturum geçmişindeki eylemlerini
    // ele alıyor — yazar her zaman BEN'im (Görev #70: yetki bazlı buton gizleme için lazım).
    addShapeToMapAndList(drawSourceRef.current, typeInfo, id, wkt, place, province, name, color, categoryId, createdDate, false, getMyUserId());
  }

  // TrashPanel'deki "Geri getir" butonu tarafından çağrılıyor — eskiden TrashPanel kendi
  // fetch'ini atıp sadece kendi listesinden çıkarıyordu, harita/Çizilenler paneli haberdar
  // olmadığı için öğe sayfa yenilenene kadar görünmüyordu. Artık asıl restore isteğini de
  // buradaki restoreItemToMap atıyor, böylece harita anında güncelleniyor.
  async function handleTrashRestore(mode, item) {
    const typeInfo = DRAW_TYPES.find((t) => t.mode === mode);
    if (!typeInfo) return;
    await restoreItemToMap(
      typeInfo,
      item.id,
      item.wkt,
      item.place,
      item.province,
      item.name,
      item.color,
      item.categoryId,
      item.createdDate
    );
  }
  // --------------------------------------------------------------------------------------

  // Çizim bitince (drawend) hemen kaydetmiyoruz — hoca isteği: kullanıcıdan önce İsim ve
  // Renk bilgisi almak için bir öznitelik pop-up'ı açılmalı. Şekil onaylanana kadar taslak
  // (varsayılan renkte) haritada duruyor; "Vazgeç" denirse haritadan da kaldırılıyor.
  function handleDrawEnd(mode, feature) {
    const typeInfo = DRAW_TYPES.find((t) => t.mode === mode);
    if (!typeInfo) return;

    // Hocanın Coğrafi Yetki görevi: hızlı/anlık geri bildirim — backend zaten NTS ile TAM
    // kontrolü yapıyor (bkz. GeometryService.CreateAsync), bu sadece kullanıcı POST'u
    // beklemeden hemen uyarı görsün diye. Şekli haritadan kaldırıp uyarı gösteriyoruz,
    // öznitelik pop-up'ını hiç açmıyoruz.
    if (!isWithinRestrictedArea(feature.getGeometry())) {
      drawSourceRef.current?.removeFeature(feature);
      showGeoWarning('Sadece belirlenen bölgeye çizim yapabilirsiniz.');
      return;
    }

    const wkt = wktFormat.writeGeometry(feature.getGeometry(), {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });

    feature.setStyle(buildStyle(mode, '?', false, TYPE_COLORS[mode]));
    setPendingDraw({ mode, feature, typeInfo, wkt });
  }

  async function confirmPendingDraw(name, color, categoryId, isPrivate) {
    if (!pendingDraw) return;
    const { mode, feature, typeInfo, wkt } = pendingDraw;
    setPendingDraw(null);

    try {
      const response = await fetchWithTimeout(`${API_BASE}/${typeInfo.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wkt, name: name || null, color: color || null, categoryId: categoryId || null, mapId: activeMapId, isPrivate: !!isPrivate }),
      });

      if (!response.ok) {
        // 403 = admin panelinden bu hesabın bu tip için çizim izni kapatılmış demektir —
        // backend'in döndürdüğü açıklayıcı mesajı olduğu gibi gösteriyoruz.
        let message = `${typeInfo.label} kaydedilemedi.`;
        if (response.status === 403 || response.status === 401) {
          try {
            const errData = await response.json();
            if (errData?.message) message = errData.message;
          } catch {
            // yoksayıldı, genel mesaj kullanılır
          }
        }
        setStatusMessage(message);
        drawSourceRef.current.removeFeature(feature);
        return;
      }

      const data = await response.json();
      const key = `${mode}-${data.id}`;
      feature.set('key', key);
      feature.set('mode', mode);
      feature.set('id', data.id);
      feature.set('color', color || null);
      feature.set('name', name || null);
      feature.setStyle(buildStyle(mode, data.id, false, color, name));

      getFeaturesMap().set(key, feature);
      setDrawnItems((current) => [
        ...current,
        {
          key,
          id: data.id,
          mode,
          label: typeInfo.label,
          place: null,
          province: null,
          name: name || null,
          color: color || null,
          categoryId: categoryId || null,
          createdDate: data.createdDate || null,
          isPrivate: !!isPrivate,
          // Az önce BEN çizdim — yazar id'si backend'in döndürdüğü değer, o da yoksa
          // benim id'm (Görev #70: yetki bazlı buton gizleme/deaktif için lazım).
          insertedUserId: data.insertedUserId ?? getMyUserId() ?? null,
        },
      ]);
      setStatusMessage(`${typeInfo.label} kaydedildi.`);

      pushHistory({
        label: `${typeInfo.label} oluşturma`,
        undo: () => handleDelete({ key, id: data.id, mode, label: typeInfo.label }),
        redo: () =>
          restoreItemToMap(typeInfo, data.id, wkt, null, null, name || null, color || null, categoryId || null, data.createdDate || null),
      });

      const [lon, lat] = toLonLat(getExtentCenter(feature.getGeometry().getExtent()));
      enqueueGeocode(key, data.id, typeInfo.endpoint, lon, lat);
    } catch (err) {
      console.error(`${typeInfo.label} kaydedilirken hata:`, err);
      setStatusMessage(
        err.name === 'AbortError' ? 'Sunucu zamanında cevap vermedi.' : 'Sunucuya bağlanılamadı.'
      );
      drawSourceRef.current.removeFeature(feature);
    }
  }

  function cancelPendingDraw() {
    if (!pendingDraw) return;
    drawSourceRef.current?.removeFeature(pendingDraw.feature);
    setPendingDraw(null);
  }

  // Öznitelik (isim/renk/kategori) güncellemesinin gerçek işi — hem normal "Kaydet" akışı
  // hem de undo/redo replay'i (eski/yeni değerlere dönmek için) bunu çağırıyor.
  // isPrivate parametresi opsiyonel — geçilmezse item'ın MEVCUT değeri korunur (FeatureInfoCard'ın
  // "Kaydet" akışı gibi bunu hiç bilmeyen çağrı yerleri gizliliği yanlışlıkla sıfırlamasın diye).
  async function applyAttributesEdit(item, name, color, categoryId, isPrivate = item.isPrivate) {
    const typeInfo = DRAW_TYPES.find((t) => t.mode === item.mode);
    if (!typeInfo) return false;

    try {
      const response = await fetchWithTimeout(`${API_BASE}/${typeInfo.endpoint}/${item.id}/attributes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || null, color: color || null, categoryId: categoryId || null, isPrivate: !!isPrivate }),
      });

      if (!response.ok) {
        let message = 'Güncellenemedi.';
        try {
          const errData = await response.json();
          if (errData?.message) message = errData.message;
        } catch {
          // yoksayıldı
        }
        setStatusMessage(message);
        return false;
      }

      const feature = getFeaturesMap().get(item.key);
      if (feature) {
        feature.set('color', color || null);
        feature.set('name', name || null);
        feature.setStyle(
          buildStyle(
            item.mode,
            item.id,
            selectedKeyRef.current === item.key,
            color,
            name,
            analysisGlowKeysRef.current.has(item.key)
          )
        );
      }

      setDrawnItems((current) =>
        current.map((i) =>
          i.key === item.key
            ? { ...i, name: name || null, color: color || null, categoryId: categoryId || null, isPrivate: !!isPrivate }
            : i
        )
      );
      return true;
    } catch (err) {
      console.error('Öznitelik güncellenirken hata:', err);
      setStatusMessage(
        err.name === 'AbortError' ? 'Sunucu zamanında cevap vermedi.' : 'Sunucuya bağlanılamadı.'
      );
      return false;
    }
  }

  // "Çizilenler" panelindeki bir öğenin ismini/rengini/kategorisini sonradan düzenleme.
  async function saveAttributesEdit(item, name, color, categoryId, isPrivate) {
    const previous = {
      name: item.name ?? null,
      color: item.color ?? null,
      categoryId: item.categoryId ?? null,
      isPrivate: !!item.isPrivate,
    };
    const ok = await applyAttributesEdit(item, name, color, categoryId, isPrivate);
    if (!ok) return;

    pushHistory({
      label: `${item.label} özniteliklerini düzenleme`,
      undo: () => applyAttributesEdit(item, previous.name, previous.color, previous.categoryId, previous.isPrivate),
      redo: () => applyAttributesEdit(item, name || null, color || null, categoryId || null, isPrivate),
    });

    setEditingKey(null);
    setStatusMessage(`${item.label} güncellendi.`);
  }

  // Bilgi kartındaki "Düzenle" — şekli sürükleyerek değiştirme moduna girer. Vazgeçilirse
  // geri dönmek için mevcut geometrinin bir kopyasını saklıyoruz (feature.getGeometry()
  // referansı Modify tarafından YERİNDE değiştiriliyor, klon almazsak orijinali kaybederiz).
  function startEditingGeometry(item) {
    // Savunma amaçlı: buton zaten yetkisizken hiç gösterilmiyor (bkz. getItemPermissions),
    // ama fonksiyon başka bir yoldan (ör. klavye kısayolu eklenirse ileride) çağrılırsa da
    // backend'in 403'üne güvenmeden burada da erken çıkalım.
    if (!getItemPermissions(item).canEdit) return;
    const feature = getFeaturesMap().get(item.key);
    if (!feature) return;
    editingOriginalGeometryRef.current = feature.getGeometry().clone();
    setEditingGeometryKey(item.key);
    setSelectedVertexIndex(null); // önceki düzenlemeden kalma köşe seçimi taşınmasın
    setEditName(item.name || '');
    setEditColor(item.color || COLOR_PRESETS[0]);
    setEditCategoryId(item.categoryId || '');
    setStatusMessage('İsim/renk\'i düzenleyin, köşe noktalarını sürükleyin, sonra Kaydet\'e basın.');
  }

  function cancelEditingGeometry() {
    if (editingGeometryKey) {
      const feature = getFeaturesMap().get(editingGeometryKey);
      if (feature && editingOriginalGeometryRef.current) {
        feature.setGeometry(editingOriginalGeometryRef.current);
      }
    }
    setEditingGeometryKey(null);
    setSelectedVertexIndex(null);
    editingOriginalGeometryRef.current = null;
    setStatusMessage('');
  }

  // Şekil (WKT) güncellemesinin gerçek işi — normal "Kaydet" akışı ile undo/redo replay'i
  // (eski/yeni geometriye dönmek için) ortak kullanıyor. Başarılı olursa feature'ın
  // geometrisini de günceller (undo/redo sırasında Modify interaction'ı feature'a bağlı
  // OLMAYABİLİR — o yüzden setGeometry burada elle yapılıyor, Modify'a güvenilmiyor).
  async function applyGeometryEdit(item, typeInfo, wkt) {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/${typeInfo.endpoint}/${item.id}/geometry`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wkt }),
      });

      if (!response.ok) {
        let message = 'Şekil güncellenemedi.';
        try {
          const errData = await response.json();
          if (errData?.message) message = errData.message;
        } catch {
          // yoksayıldı
        }
        setStatusMessage(message);
        return false;
      }

      const feature = getFeaturesMap().get(item.key);
      if (feature) {
        const geometry = wktFormat.readGeometry(wkt, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });
        feature.setGeometry(geometry);
      }
      return true;
    } catch (err) {
      console.error('Şekil güncellenirken hata:', err);
      setStatusMessage(
        err.name === 'AbortError' ? 'Sunucu zamanında cevap vermedi.' : 'Sunucuya bağlanılamadı.'
      );
      return false;
    }
  }

  // Bilgi kartındaki "Kaydet" — hoca isteği: "kullanıcı bu ekran üzerinden objenin isim/renk
  // bilgilerini VE konumunu (geometrisini) güncelleyebilmeli" — tek buton, iki bağımsız
  // kaydetme adımı (öznitelik + geometri), her biri kendi undo/redo kaydını (varsa gerçekten
  // değiştiyse) ayrı ayrı geçmişe ekliyor.
  async function saveEditedFeature() {
    const item = drawnItems.find((i) => i.key === editingGeometryKey);
    const feature = getFeaturesMap().get(editingGeometryKey);
    if (!item || !feature) {
      setEditingGeometryKey(null);
      setSelectedVertexIndex(null);
      return;
    }

    const typeInfo = DRAW_TYPES.find((t) => t.mode === item.mode);

    setSavingGeometry(true);
    try {
      // 1) Öznitelikler (isim/renk/kategori) — sadece gerçekten değiştiyse kaydet.
      const nextName = editName.trim() || null;
      const nextColor = editColor || null;
      const nextCategoryId = editCategoryId || null;
      const attrsChanged =
        nextName !== (item.name ?? null) ||
        nextColor !== (item.color ?? null) ||
        nextCategoryId !== (item.categoryId ?? null);

      if (attrsChanged) {
        const previous = { name: item.name ?? null, color: item.color ?? null, categoryId: item.categoryId ?? null };
        const attrsOk = await applyAttributesEdit(item, nextName, nextColor, nextCategoryId);
        if (!attrsOk) return;
        pushHistory({
          label: `${item.label} özniteliklerini düzenleme`,
          undo: () => applyAttributesEdit(item, previous.name, previous.color, previous.categoryId),
          redo: () => applyAttributesEdit(item, nextName, nextColor, nextCategoryId),
        });
      }

      // 2) Geometri — feature üzerinde zaten Modify ile canlı değişmiş durumda.
      const newWkt = wktFormat.writeGeometry(feature.getGeometry(), {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });
      const oldWkt = editingOriginalGeometryRef.current
        ? wktFormat.writeGeometry(editingOriginalGeometryRef.current, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          })
        : null;
      const geometryChanged = oldWkt !== null && oldWkt !== newWkt;

      if (geometryChanged) {
        // Hocanın Coğrafi Yetki görevi: bu kontrol handleDrawEnd'de YENİ çizimler için zaten
        // vardı, ama var olan bir şekli köşelerinden sürükleyip sınır dışına taşımak (Modify
        // interaction ile) bu kontrolden hiç geçmiyordu — backend PATCH'i reddediyordu ama
        // frontend geometriyi geri almadığı için şekil ekranda sınır dışında asılı kalıyordu.
        // Aynı "hemen geri al + 3sn uyar" davranışını burada da uyguluyoruz, backend'e hiç
        // istek atmadan.
        if (!isWithinRestrictedArea(feature.getGeometry())) {
          feature.setGeometry(editingOriginalGeometryRef.current);
          showGeoWarning('Sadece belirlenen bölgeye çizim yapabilirsiniz.');
          return;
        }
        const geomOk = await applyGeometryEdit(item, typeInfo, newWkt);
        // Not: backend BAŞKA bir sebepten (ağ hatası, vs.) reddederse geometriyi BİLEREK geri
        // almıyoruz — kullanıcı sürüklediği hâliyle tekrar "Kaydet"e basıp deneyebilsin diye
        // (geri alsaydık geçici bir ağ hatasında sürükleme emeği boşa giderdi).
        if (!geomOk) return;
        pushHistory({
          label: `${item.label} şeklini düzenleme`,
          undo: () => applyGeometryEdit(item, typeInfo, oldWkt),
          redo: () => applyGeometryEdit(item, typeInfo, newWkt),
        });
      }

      setStatusMessage(`${item.label} güncellendi.`);
      setEditingGeometryKey(null);
      setSelectedVertexIndex(null);
      editingOriginalGeometryRef.current = null;
    } finally {
      setSavingGeometry(false);
    }
  }

  // Envanter Analizi aracı: kullanıcı geçici bir Poligon çizer, backend'e kaydedilmeden
  // sadece mevcut nokta/çizgi/alan envanteriyle kesişim sayısı hesaplanır ve gösterilir.
  async function runAnalysis(feature) {
    setAnalysisLoading(true);
    setAnalysisResult(null);

    const wkt = wktFormat.writeGeometry(feature.getGeometry(), {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });

    try {
      const response = await fetchWithTimeout(`${ANALYSIS_API_BASE}/intersect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // BUG FİX (kullanıcının kendi tespiti): mapId eksikti, backend TÜM haritaları
        // tarıyordu — bkz. AnalysisController/InventoryAnalysisService yorumları.
        body: JSON.stringify({ wkt, mapId: activeMapId }),
      });

      if (!response.ok) {
        setStatusMessage('Envanter analizi başarısız oldu.');
        return;
      }

      const data = await response.json();
      setAnalysisResult(data);
    } catch (err) {
      console.error('Envanter analizi hatası:', err);
      setStatusMessage(
        err.name === 'AbortError' ? 'Sunucu zamanında cevap vermedi.' : 'Sunucuya bağlanılamadı.'
      );
    } finally {
      setAnalysisLoading(false);
    }
  }

  function clearAnalysis() {
    analysisSourceRef.current?.clear();
    setAnalysisResult(null);
    setAnalysisLoading(false);
    setAnalysisSelected(false);
  }

  function toggleAnalysisTool() {
    if (editingGeometryKey) return; // şekil düzenleme modundayken diğer araçlar karışmasın
    setStatusMessage('');
    setDrawMode(null); // aynı anda hem normal çizim hem analiz aracı açık olmasın
    // İkisi de sol-altta aynı konumda render ediyor (bkz. .analysis-panel /
    // .location-analysis-panel) — ikisi birden açık kalırsa üst üste biner, o yüzden biri
    // açılınca diğerinin panelini (varsa) kapatıyoruz.
    setLocationAnalysisActive(false);
    setAnalysisToolActive((current) => {
      const next = !current;
      if (next) selectFeature(null);
      return next;
    });
  }

  // Hoca ödevi (2. tur — Isı Haritası Analizi): sadece aç/kapa — bir GİRİŞ aracı olmadığı
  // için (Envanter Analizi'nin aksine) çizim modunu/diğer araçları kapatmıyor, kullanıcı
  // hızlıca birden çok kez tıklasa bile katmanın visible durumunu toggle etmekten başka bir
  // şey yapmıyor, yani yanlışlıkla art arda tıklamaya karşı doğal olarak dirençli (idempotent).
  function toggleHeatmap() {
    setHeatmapActive((current) => !current);
  }

  // Hoca ödevi (25 Ağustos — Konum Analizi): araç çubuğu butonu sadece PANELİ açıp kapatıyor
  // (Envanter Analizi'ndeki analysisToolActive'in karşılığı) — üretilmiş ısı haritası (varsa)
  // panel kapansa bile "Temizle"ye kadar haritada kalır (aşağıdaki JSX'te
  // locationAnalysisActive || locationAnalysisResultActive koşuluyla aynı fikir).
  function toggleLocationAnalysisTool() {
    if (editingGeometryKey) return;
    setStatusMessage('');
    setDrawMode(null);
    setAnalysisToolActive(false);
    setLocationAnalysisActive((current) => {
      const next = !current;
      if (next) selectFeature(null);
      else setLocationAnalysisDrawing(false);
      return next;
    });
  }

  function clearLocationAnalysisPolygon() {
    locationPolygonSourceRef.current?.clear();
    locationPolygonGeomRef.current = null;
    setHasLocationPolygon(false);
  }

  // Hoca ödevi (25 Ağustos — Konum Analizi): "Analiz yalnızca seçilen alan içerisindeki
  // POI'ler üzerinde çalışmalıdır." — POI listesi zaten tarayıcıda (bkz. fetchPois/pois
  // state'i), bu yüzden alan+kriter filtresi VE görselleştirme tamamen client-side.
  // Duraklatılmış (isActive=false) POI'ler analiz dışı bırakılıyor — haritada zaten "kapalı"
  // gösteriliyorlar, gerçek bir konum gibi sayılmamalılar.
  // Kullanıcının kendi tespiti: "1 POI dahil edildi diyor ama haritada bir şey çıkmadı" —
  // asıl kök sebep muhtemelen katman hiç görünmüyor olması DEĞİL, harita görünümü analiz
  // öncesinde nerede kaldıysa orada kalıyordu (ör. tüm Türkiye zoom'unda) — 18px yarıçaplı
  // TEK bir ısı noktası o zoom'da neredeyse tek piksel, gözle görülemeyecek kadar küçük
  // kalıyordu. Artık eşleşen POI'lerin çevresine (extent) otomatik "fit" yapıyoruz — arama
  // barındaki zoomToPoi ile AYNI fikir. Ayrıca hangi kriterin kaç POI'yle eşleştiğini
  // (matchedBreakdown) ayrı ayrı gösteriyoruz — "1 POI" gibi tek bir sayı, kullanıcının
  // "2 restoran + 1 otomotiv bekliyordum" beklentisiyle neyin uyuşmadığını anlamasına
  // yetmiyordu; kırılım en azından HANGİ kriterin 0 çıktığını gösterip teşhisi kolaylaştırıyor.
  function startLocationAnalysis() {
    // Kullanıcının tespiti (9. tur): "Alışveriş" (üst kategori) kriter olarak seçilince 0
    // POI dönüyordu ama alt kategorisi "Süpermarket" seçilince sonuç çıkıyordu — aynı kök
    // sebep #91'deki arama filtresi bug'ıyla aynı: POI'ler sadece YAPRAK kategori id'si
    // taşıyor, üst kategori id'siyle birebir eşleşme hiç tutmuyor. expandCategoryFilterIds
    // ile her kriterin kategori id'sini alt-ağacına (torunlar dahil) genişletiyoruz; kırılım
    // (matchedBreakdown) yine orijinal seçilen kritere göre gruplanıyor.
    const activeCriteria = locationAnalysisCriteria.filter((c) => c.categoryId !== '');
    if (activeCriteria.length < 2) return;

    const weightByCategoryId = new Map(); // genişletilmiş yaprak id (string) -> ağırlık
    const criterionByCategoryId = new Map(); // genişletilmiş yaprak id (string) -> orijinal kriter categoryId'si
    activeCriteria.forEach((c) => {
      const weight = Number(c.weight) || 0;
      const expanded = expandCategoryFilterIds(poiCategories, c.categoryId) || new Set([String(c.categoryId)]);
      expanded.forEach((id) => {
        weightByCategoryId.set(id, weight);
        criterionByCategoryId.set(id, c.categoryId);
      });
    });

    let candidates = pois.filter((p) => p.isActive !== false && p.categoryId != null && weightByCategoryId.has(String(p.categoryId)));

    if (locationAnalysisAreaMode === 'province') {
      if (!locationAnalysisProvince) return;
      candidates = candidates.filter((p) => p.province === locationAnalysisProvince);
    } else {
      const geom = locationPolygonGeomRef.current;
      if (!geom) return;
      candidates = candidates.filter((p) => {
        try {
          const geometry = wktFormat.readGeometry(p.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
          return geom.intersectsCoordinate(geometry.getCoordinates());
        } catch {
          return false; // bozuk/parse edilemeyen bir WKT tüm analizi çökertmesin
        }
      });
    }

    // Kullanıcının kendi isteği (3 Eylül): "konum analizinde ulaşım kısmında otogar veya bu tarz
    // güzergah duraklarına göre yapsın" — ulaşım kriteri artık sadece POI kataloğuna değil,
    // sistemdeki GERÇEK toplu taşıma duraklarına da bakıyor (metro/Ankaray/Başkentray durakları,
    // otogar vb.). Duraklar POI değil (ayrı tablo/katman), o yüzden aşağıda sentetik "aday"
    // olarak kriterin listesine ekleniyorlar.
    const transitCriterion = activeCriteria.find((c) => {
      const name = (poiCategories.find((cat) => cat.id === c.categoryId)?.name || '').toLocaleLowerCase('tr');
      return ['ulaşım', 'durak', 'istasyon', 'otogar', 'metro', 'terminal'].some((keyword) => name.includes(keyword));
    });
    // Kullanıcının kendi tespiti (3 Eylül): "il olarak ankara seçmeme rağmen çakıllı bölgesini
    // de öneriyor kırklarelide. seçilen il sınırında olmalı sadece." — HAKLI, bu bir bug'dı:
    // duraklar sadece POLİGON modunda filtreleniyordu, İL modunda hiç filtrelenmiyordu, bu
    // yüzden başka illerdeki duraklar analize girip oralarda ev önerisi doğurabiliyordu.
    // Durakta il alanı yok, ama bağlı olduğu GÜZERGAHTA var (TransitRoute.Province).
    const routeProvinceById = new Map(routes.map((r) => [r.id, r.province]));
    const transitStopCandidates = transitCriterion
      ? stops
          .filter((s) => !s.isPaused)
          .map((s) => {
            try {
              if (locationAnalysisAreaMode === 'province') {
                if (routeProvinceById.get(s.routeId) !== locationAnalysisProvince) return null;
              }
              const geometry = wktFormat.readGeometry(s.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
              const coord = geometry.getCoordinates();
              if (locationAnalysisAreaMode === 'polygon') {
                const geom = locationPolygonGeomRef.current;
                if (!geom || !geom.intersectsCoordinate(coord)) return null;
              }
              const [lon, lat] = toLonLat(coord);
              return { name: `${s.name} (${s.routeName || 'hat'})`, coord, lon, lat };
            } catch {
              return null;
            }
          })
          .filter(Boolean)
      : [];

    const source = locationHeatmapSourceRef.current;
    source?.clear();
    const extent = createEmpty();
    const countByCategory = new Map();
    // "En İyi Ev Konumları" için: orijinal kriter categoryId'si -> o kritere uyan POI'lerin
    // {lon, lat, name} listesi (bkz. computeTopHouseSpots — grid taramasında her nokta için
    // "bu kritere en yakın POI ne kadar uzakta" hesabında kullanılıyor).
    const poisByCriterion = new Map();
    candidates.forEach((p) => {
      let geometry;
      try {
        geometry = wktFormat.readGeometry(p.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
      } catch {
        return;
      }
      const coord = geometry.getCoordinates();
      const heatFeature = new Feature({ geometry: new Point(coord) });
      const catKey = String(p.categoryId);
      // Kullanıcının kendi isteği (3 Eylül): "kırmızılıklar falan beğenmedim hiç, çok aşırı
      // yoğun oluyor" — binlerce POI'de her nokta 1.0'a yakın ağırlıkla girince ısı haritası
      // her yerde doyuma ulaşıp koca kırmızı lekelere dönüşüyordu. Ağırlığı 0.25 katsayısıyla
      // ölçekliyoruz: yoğunluk FARKLARI (asıl bilgi) korunuyor, doyma sadece gerçekten çok
      // yoğun noktalarda oluyor. Katman opaklığı da düşürüldü (bkz. locationHeatmapLayer).
      heatFeature.set('weight', ((weightByCategoryId.get(catKey) || 0) / 100) * 0.25);
      source?.addFeature(heatFeature);
      extendExtent(extent, [coord[0], coord[1], coord[0], coord[1]]);
      const criterionCategoryId = criterionByCategoryId.get(catKey);
      countByCategory.set(criterionCategoryId, (countByCategory.get(criterionCategoryId) || 0) + 1);
      const [lon, lat] = toLonLat(coord);
      if (!poisByCriterion.has(criterionCategoryId)) poisByCriterion.set(criterionCategoryId, []);
      poisByCriterion.get(criterionCategoryId).push({ lon, lat, name: p.name });
    });

    // Ulaşım kriteri varsa gerçek duraklar da aynı listeye ekleniyor (bkz. yukarıdaki
    // transitStopCandidates yorumu) — ısı haritasına ve puanlamaya POI'lerle aynı şekilde giriyorlar.
    if (transitCriterion && transitStopCandidates.length > 0) {
      const weight = Number(transitCriterion.weight) || 0;
      const key = transitCriterion.categoryId;
      if (!poisByCriterion.has(key)) poisByCriterion.set(key, []);
      transitStopCandidates.forEach((stop) => {
        const heatFeature = new Feature({ geometry: new Point(stop.coord) });
        heatFeature.set('weight', (weight / 100) * 0.25);
        source?.addFeature(heatFeature);
        extendExtent(extent, [stop.coord[0], stop.coord[1], stop.coord[0], stop.coord[1]]);
        countByCategory.set(key, (countByCategory.get(key) || 0) + 1);
        poisByCriterion.get(key).push({ lon: stop.lon, lat: stop.lat, name: stop.name });
      });
    }

    locationHeatmapLayerRef.current?.setVisible(true);
    heatmapRadiusSyncRef.current?.(); // yarıçap o anki zoom'a göre ayarlansın (bkz. syncHeatmapRadius)
    // Kullanıcının kendi isteği: "Konum analizini başlat dediğimiz zaman çizilenler kısmından
    // sadece POI noktaları açık kalsın diğerleri otomatik kapansın." — analiz sonucu ısı
    // haritası + ev pinleri zaten kalabalık; kullanıcının kendi çizimleri ve güzergahlar
    // görüntüyü bozmasın. Kullanıcı isterse panelden tekrar açabiliyor (kalıcı bir kilit değil).
    const analysisLayerVisibility = { ...layerVisibilityRef.current, Point: false, LineString: false, Polygon: false, Routes: false, Poi: true };
    layerVisibilityRef.current = analysisLayerVisibility;
    setLayerVisibility(analysisLayerVisibility);
    setLocationAnalysisMatchedIds(new Set(candidates.map((p) => p.id)));
    setLocationAnalysisMatchedCount(candidates.length + transitStopCandidates.length);
    setLocationAnalysisMatchedBreakdown(
      activeCriteria
        .map((c) => ({
          categoryId: c.categoryId,
          categoryName: poiCategories.find((cat) => cat.id === c.categoryId)?.name || '?',
          count: countByCategory.get(c.categoryId) || 0,
        }))
    );
    setLocationAnalysisResultActive(true);

    // "asıl amaç güzel konumda ev bulmak" — ısı haritasının/eşleşme sayısının ÜSTÜNE, somut
    // "işte burası iyi" önerileri: seçilen alanın (matched POI bbox'ı, poligon modundaysa
    // poligonla kesişimi) içine bir grid seriyor, her noktayı kriterlere göre puanlıyor.
    const houseSpotSource = houseSpotSourceRef.current;
    houseSpotSource?.clear();
    setSelectedHouseSpotIndex(null);
    const polygonGeom = locationAnalysisAreaMode === 'polygon' ? locationPolygonGeomRef.current : null;
    const topSpots = isEmptyExtent(extent)
      ? []
      : computeTopHouseSpots({
          extent3857: extent,
          polygonGeom,
          criteria: activeCriteria.map((c) => ({ categoryId: c.categoryId, weight: Number(c.weight) || 0 })),
          poisByCriterion,
          poiCategories,
        });
    setLocationAnalysisTopSpots(topSpots);
    topSpots.forEach((spot, index) => {
      const feature = new Feature({ geometry: new Point(fromLonLat([spot.lon, spot.lat])) });
      feature.set('isHouseSpot', true);
      feature.set('spotIndex', index);
      feature.set('rank', index + 1);
      feature.set('score', spot.score);
      houseSpotSource?.addFeature(feature);
    });

    if (!isEmptyExtent(extent)) {
      mapRef.current?.getView().fit(extent, { padding: [340, 80, 80, 80], maxZoom: 16, duration: 400 });
    }
  }

  function clearLocationAnalysis() {
    locationHeatmapSourceRef.current?.clear();
    locationHeatmapLayerRef.current?.setVisible(false);
    houseSpotSourceRef.current?.clear();
    setLocationAnalysisTopSpots([]);
    setSelectedHouseSpotIndex(null);
    setLocationAnalysisResultActive(false);
    setLocationAnalysisMatchedCount(null);
    setLocationAnalysisMatchedBreakdown([]);
    setLocationAnalysisMatchedIds(null);
  }

  // Panel'deki "En İyi Konumlar" listesinden bir noktaya tıklanınca — sanki haritadaki pine
  // tıklanmış gibi davranıyor (odaklan + popup aç), sağ panelden güzergaha tıklayınca AYNI
  // fikir (bkz. #182'deki karar).
  function focusHouseSpot(index) {
    const spot = locationAnalysisTopSpots[index];
    if (!spot) return;
    setSelectedHouseSpotIndex(index);
    mapRef.current?.getView().animate({
      center: fromLonLat([spot.lon, spot.lat]),
      zoom: Math.max(mapRef.current.getView().getZoom() || 14, 15),
      duration: 500,
      easing: easeOut,
    });
  }

  async function handleDelete(item) {
    const typeInfo = DRAW_TYPES.find((t) => t.mode === item.mode);
    if (!typeInfo || deletingKeys.has(item.key)) return;

    // undo(oluşturma) çağrısı sadece key/id/mode/label ile geliyor (bkz. confirmPendingDraw) —
    // undo(silme) geçmiş kaydı için gereken tüm öznitelikleri (isim/renk/kategori/yer/tarih)
    // drawnItems'taki tam kayıttan tamamlıyoruz.
    const fullItem = drawnItems.find((i) => i.key === item.key) || item;
    const featureBeforeDelete = getFeaturesMap().get(item.key);
    const wktBeforeDelete = featureBeforeDelete
      ? wktFormat.writeGeometry(featureBeforeDelete.getGeometry(), {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        })
      : null;

    setDeletingKeys((current) => new Set(current).add(item.key));

    try {
      const response = await fetchWithTimeout(`${API_BASE}/${typeInfo.endpoint}/${item.id}`, {
        method: 'DELETE',
      });
      // 404 = zaten silinmiş demektir, kullanıcı için sonuç aynı: listede/haritada olmamalı
      if (!response.ok && response.status !== 404) {
        console.error(`${item.label} silinemedi, sunucu durumu:`, response.status);
        setStatusMessage(`${item.label} silinemedi (${response.status}).`);
        return;
      }

      // Haritadan/iç kayıttan temizleme adımını ayrı bir try/catch'e alıyoruz: burada
      // beklenmedik bir sorun çıksa bile asıl önemli olan (panelin güncellenmesi) yine olsun.
      try {
        const feature = getFeaturesMap().get(item.key);
        if (feature) {
          drawSourceRef.current?.removeFeature(feature);
          getFeaturesMap().delete(item.key);
        }
        if (selectedKeyRef.current === item.key) {
          selectFeature(null);
        }
      } catch (cleanupErr) {
        console.error('Harita temizleme hatası (yoksayıldı):', cleanupErr);
      }

      setDrawnItems((current) => current.filter((i) => i.key !== item.key));
      setStatusMessage(`${item.label} silindi.`);

      if (wktBeforeDelete) {
        pushHistory({
          label: `${item.label} silme`,
          undo: () =>
            restoreItemToMap(
              typeInfo,
              item.id,
              wktBeforeDelete,
              fullItem.place ?? null,
              fullItem.province ?? null,
              fullItem.name ?? null,
              fullItem.color ?? null,
              fullItem.categoryId ?? null,
              fullItem.createdDate ?? null
            ),
          redo: () => handleDelete(item),
        });
      }
    } catch (err) {
      console.error(`${item.label} silinirken hata:`, err);
      setStatusMessage(
        err.name === 'AbortError' ? 'Sunucu zamanında cevap vermedi.' : 'Sunucuya bağlanılamadı.'
      );
    } finally {
      setDeletingKeys((current) => {
        const next = new Set(current);
        next.delete(item.key);
        return next;
      });
    }
  }

  // Silmeden önce native window.confirm() yerine kendi onay penceremizi gösteriyoruz —
  // silinen öğe çöp kutusuna düşüp geri getirilebildiği için "danger" değil, bilgilendirici.
  function confirmDelete(item) {
    // Savunma amaçlı (bkz. startEditingGeometry'deki aynı yorum): buton zaten deaktif/gizliyken
    // buraya normal yoldan gelinmez, ama backend'in 403'üne güvenmeden erken çıkıyoruz.
    if (getItemPermissions(item).deleteState !== 'enabled') return;
    setPendingConfirm({
      title: `${item.label}${item.name ? ` "${item.name}"` : ` #${item.id}`} silinsin mi?`,
      message: 'Çöp kutusuna taşınacak, istersen sonra geri getirebilirsin.',
      confirmLabel: 'Evet, sil',
      danger: false,
      onConfirm: () => handleDelete(item),
    });
  }

  // Bilgi kartındaki "Yakınlaş" butonu ve panelden bir öğeye tıklama AYNI odaklama
  // mantığını kullanıyor — panelden tıklamada "zaten seçiliyse hiçbir şey yapma" koruması
  // var (handleItemClick), ama kartın kendi butonuna basmak her zaman yeniden odaklamalı.
  function focusOnItem(item) {
    const feature = getFeaturesMap().get(item.key);
    if (!feature || !mapRef.current) return;

    // "Odak" switch'i kapalıysa sinematik uçuş yerine doğrudan hedefe zıplıyoruz.
    if (flyAnimationEnabled) {
      flyToFeature(mapRef.current, feature);
    } else {
      const view = mapRef.current.getView();
      const size = mapRef.current.getSize();
      const targetExtent = feature.getGeometry().getExtent();
      view.animate({
        center: getCenter(targetExtent),
        zoom: computeFitZoom(view, size, targetExtent, 15),
        duration: 200,
      });
    }
  }

  // Hoca ödevi (POI Arama Barı): "sonuçlardan birine tıklandığında harita o noktaya
  // otomatik zoom yapsın." focusOnItem ile AYNI uçuş animasyonunu kullanıyor ama
  // landingPulse'ı BİLEREK atlıyor (bkz. flyToFeature yorumu) — POI'nin kendi ikon stilini
  // ezmesin diye. Arama sonucuna tıklayınca bilgi paneli de açılsın diye seçili POI'yi
  // set ediyoruz (normal POI tıklamasıyla AYNI his).
  function zoomToPoi(poi) {
    const feature = poiSourceRef.current?.getFeatures().find((f) => f.get('poiId') === poi.id);
    if (!feature || !mapRef.current) return;
    setAnalysisSelected(false);
    selectFeature(null);
    setSelectedPoi(poi.id);
    if (flyAnimationEnabled) {
      flyToFeature(mapRef.current, feature, () => {});
    } else {
      const view = mapRef.current.getView();
      const size = mapRef.current.getSize();
      const targetExtent = feature.getGeometry().getExtent();
      view.animate({
        center: getCenter(targetExtent),
        zoom: computeFitZoom(view, size, targetExtent, 16),
        duration: 200,
      });
    }
  }

  function zoomToAnalysisFeature() {
    const feature = analysisSourceRef.current?.getFeatures()[0];
    if (!feature || !mapRef.current) return;
    const view = mapRef.current.getView();
    const size = mapRef.current.getSize();
    const targetExtent = feature.getGeometry().getExtent();
    view.animate({
      center: getCenter(targetExtent),
      zoom: computeFitZoom(view, size, targetExtent, 15),
      duration: 300,
    });
  }

  function handleItemClick(item) {
    // Zaten seçili olan öğeye üst üste tıklamak (uçuş animasyonu daha bitmeden bile)
    // animasyonu baştan tekrar tetikliyordu — aynı öğeyse hiçbir şey yapmıyoruz.
    if (selectedKeyRef.current === item.key) return;
    setSelectedPoi(null); // Hoca ödevi (POI): listeden normal bir şekil seçilince POI paneli kapansın
    selectFeature(item.key);
    focusOnItem(item);
  }

  // Çizilenler panelinde bir satırın üzerine gelince haritadaki karşılığını "Envanter
  // Analizi"nde kullanılan aynı neon halkayla vurguluyoruz (buildStyle'ın isGlowing
  // parametresi) — yeni bir görsel dil icat etmek yerine zaten var olanı yeniden
  // kullanıyoruz. Tüm listeyi/effect'i yeniden tetiklemeden SADECE o tek feature'ı
  // restyle ediyoruz, mouseenter/mouseleave sık tetiklendiği için bu önemli.
  function restyleItemFeature(item) {
    const feature = getFeaturesMap().get(item.key);
    if (!feature) return;
    const matchesProvince = !selectedProvince || item.province === selectedProvince;
    const matchesCategory = !selectedCategoryId || item.categoryId === selectedCategoryId;
    const matchesLayer = layerVisibilityRef.current[item.mode] !== false;
    if (!matchesProvince || !matchesCategory || !matchesLayer) return; // filtre zaten gizliyor, dokunma
    feature.setStyle(
      buildStyle(
        item.mode,
        item.id,
        selectedKeyRef.current === item.key,
        item.color,
        item.name,
        analysisGlowKeysRef.current.has(item.key) || hoveredItemKeyRef.current === item.key
      )
    );
  }

  function handleItemMouseEnter(item) {
    hoveredItemKeyRef.current = item.key;
    restyleItemFeature(item);
  }

  function handleItemMouseLeave(item) {
    if (hoveredItemKeyRef.current !== item.key) return; // aynı anda başka bir satırdan geldiyse eskisini bozma
    hoveredItemKeyRef.current = null;
    restyleItemFeature(item);
  }

  function handleLogout() {
    clearAuth();
    navigate('/login');
  }

  function toggleDrawMode(mode) {
    if (editingGeometryKey) return; // şekil düzenleme modundayken diğer araçlar karışmasın
    setStatusMessage('');
    setAnalysisToolActive(false); // normal çizime geçerken analiz aracını kapat (sonucu/poligonu silmeden)
    setPoiToolActive(false); // Hoca ödevi (POI): normal çizime geçerken POI aracını da kapat
    setStopToolActive(false); // Hoca ödevi (Akıllı Ulaşım Modülü): Durak Ekle aracını da kapat
    setDrawMode((current) => {
      const next = current === mode ? null : mode;
      if (next) selectFeature(null); // çizime başlarken eski seçim highlight'ı ekranda kalmasın
      return next;
    });
  }

  // Hoca ödevi (POI/Rol/Operatör): "Operatör için haritada POI ekleme aracı (Point) oluşturun."
  // toggleDrawMode/toggleAnalysisTool ile AYNI mutual-exclusivity deseni — aynı anda sadece
  // tek bir çizim/analiz/POI aracı aktif olabilir.
  function togglePoiTool() {
    if (editingGeometryKey) return;
    setStatusMessage('');
    setDrawMode(null);
    setAnalysisToolActive(false);
    setStopToolActive(false); // Hoca ödevi (Akıllı Ulaşım Modülü): iki araç aynı anda açık olmasın
    setPoiToolActive((current) => {
      const next = !current;
      if (next) selectFeature(null);
      return next;
    });
  }

  // Hoca ödevi (Akıllı Ulaşım Modülü): "Operatör için haritada 'Durak Ekle' (Point) aracı
  // oluşturun." — togglePoiTool ile AYNI mutual-exclusivity deseni, ek olarak ManageRoutes
  // izni yoksa (NOT: "bu yeni rolleri eklerken daha önce yapılan POI ve Harita Çizim
  // araçlarını bu roldekiler ekleme işlemlerini yapmasınlar") aracı hiç açmıyoruz.
  function toggleStopTool() {
    if (editingGeometryKey) return;
    if (!getPermissions().canManageRoutes) return;
    setStatusMessage('');
    setDrawMode(null);
    setAnalysisToolActive(false);
    setPoiToolActive(false);
    setStopToolActive((current) => {
      const next = !current;
      if (next) selectFeature(null);
      else setLockedStopRouteId(null);
      return next;
    });
  }

  // Kullanıcı formu doldurmadan "Vazgeç" derse ya da geçersiz bir şey olursa: sketch olarak
  // poiSource'a eklenmiş olan taslak noktayı da kaldırıyoruz — aksi halde haritada isimsiz,
  // tıklanamaz bir "hayalet" nokta kalır.
  function cancelPoiDraw() {
    if (pendingPoiDraw?.feature) {
      poiSourceRef.current?.removeFeature(pendingPoiDraw.feature);
    }
    setPendingPoiDraw(null);
  }

  async function confirmPoiDraw(name, categoryId, schedule, scheduleExceptions, note, icon) {
    if (!pendingPoiDraw) return;
    try {
      const coordinates = pendingPoiDraw.feature?.getGeometry()?.getCoordinates();
      const location = coordinates ? await reverseGeocode(...toLonLat(coordinates)) : null;
      const response = await fetchWithTimeout(POI_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wkt: pendingPoiDraw.wkt,
          name,
          categoryId,
          schedule,
          scheduleExceptions,
          note,
          icon: icon || null,
          province: location?.province || null,
          district: location?.district || null,
          mapId: activeMapId,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatusMessage(body?.message || 'POI eklenemedi.');
        cancelPoiDraw();
        return;
      }
      const created = await response.json();
      const feature = pendingPoiDraw.feature;
      feature.set('isPoiFeature', true);
      feature.set('poiId', created.id);
      feature.set('name', created.name);
      feature.set('userId', created.userId);
      feature.set('categoryId', created.categoryId);
      feature.set('icon', created.effectiveIcon || '📍');
      feature.set('isActive', created.isActive !== false);
      feature.set('isOwnPoi', true);
      feature.set('poiHidden', false);
      feature.changed();
      setPois((current) => [created, ...current]);
      setPendingPoiDraw(null);
    } catch (err) {
      console.error('POI eklenemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
      cancelPoiDraw();
    }
  }

  async function deletePoi(poiId) {
    try {
      const response = await fetchWithTimeout(`${POI_BASE}/${poiId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatusMessage(body?.message || 'POI silinemedi.');
        return;
      }
      setPois((current) => current.filter((p) => p.id !== poiId));
      const source = poiSourceRef.current;
      if (source) {
        const feature = source.getFeatures().find((f) => f.get('poiId') === poiId);
        if (feature) source.removeFeature(feature);
      }
      setSelectedPoi(null);
    } catch (err) {
      console.error('POI silinemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }

  function startEditingPoi(poi) {
    const feature = poiSourceRef.current?.getFeatures().find((item) => item.get('poiId') === poi.id);
    if (!feature) return;
    editingPoiOriginalGeometryRef.current = feature.getGeometry()?.clone() || null;
    setEditPoiName(poi.name || '');
    setEditPoiCategoryId(poi.categoryId || '');
    setEditPoiSchedule(normalizePoiSchedule(poi.schedule));
    setEditPoiScheduleExceptions(Array.isArray(poi.scheduleExceptions) ? poi.scheduleExceptions : []);
    setEditPoiNote(poi.note || '');
    setEditPoiIcon(poi.icon || '');
    setEditingPoiId(poi.id);
  }

  function cancelEditingPoi() {
    const feature = poiSourceRef.current?.getFeatures().find((item) => item.get('poiId') === editingPoiId);
    if (feature && editingPoiOriginalGeometryRef.current) {
      feature.setGeometry(editingPoiOriginalGeometryRef.current.clone());
    }
    editingPoiOriginalGeometryRef.current = null;
    setEditingPoiId(null);
  }

  async function saveEditedPoi(poi) {
    const feature = poiSourceRef.current?.getFeatures().find((item) => item.get('poiId') === poi.id);
    if (!feature || !editPoiName.trim()) {
      setStatusMessage('POI adı boş olamaz.');
      return;
    }
    setSavingPoi(true);
    try {
      const wkt = wktFormat.writeGeometry(feature.getGeometry(), {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });
      const coordinates = feature.getGeometry()?.getCoordinates();
      const location = coordinates ? await reverseGeocode(...toLonLat(coordinates)) : null;
      const response = await fetchWithTimeout(`${POI_BASE}/${poi.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wkt,
          name: editPoiName.trim(),
          categoryId: editPoiCategoryId || null,
          workingHours: poi.workingHours || null,
          schedule: editPoiSchedule,
          scheduleExceptions: editPoiScheduleExceptions,
          note: editPoiNote.trim() || null,
          icon: editPoiIcon || null,
          province: location?.province ?? poi.province ?? null,
          district: location?.district ?? poi.district ?? null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setStatusMessage(body?.message || 'POI güncellenemedi.');
        return;
      }
      feature.set('name', body.name);
      feature.set('categoryId', body.categoryId);
      feature.set('icon', body.effectiveIcon || '📍');
      feature.set('isActive', body.isActive !== false);
      feature.changed();
      setPois((current) => current.map((item) => (item.id === body.id ? body : item)));
      editingPoiOriginalGeometryRef.current = null;
      setEditingPoiId(null);
      setStatusMessage('POI güncellendi.');
    } catch (err) {
      console.error('POI güncellenemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    } finally {
      setSavingPoi(false);
    }
  }

  // Hoca ödevi (Akıllı Ulaşım Modülü): cancelPoiDraw ile AYNI desen — kullanıcı formu
  // doldurmadan "Vazgeç" derse taslak nokta haritadan da kaldırılır.
  function cancelStopDraw() {
    if (pendingStopDraw?.feature) {
      stopSourceRef.current?.removeFeature(pendingStopDraw.feature);
    }
    setPendingStopDraw(null);
    setLockedStopRouteId(null);
  }

  // Kullanıcının kendi isteği: "araya bir yere yeni durak ekleyince otomatik sıralamasını
  // kendisi belirlesin doğru şekilde" — yeni durak var olan hattın HANGİ segmentine en
  // yakınsa (nokta-segment dik mesafesi), o segmentin hemen arkasına eklenir. 2'den az
  // durak varsa zaten "sıra" kavramı yok, sona ekleniyor (backend'in varsayılan davranışı).
  // t parametresini de döndürüyoruz: yeni nokta segmentin UCUNUN da ötesine düşüyorsa
  // (t clamp edilip 0 veya 1'e yapıştıysa) bunu "segmentin ortasına ekle" değil,
  // "güzergahın başına/sonuna ekle" olarak yorumlamamız gerekiyor (aşağıdaki fonksiyona bkz.).
  function pointToSegmentDistanceSq(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq;
    const rawT = t;
    t = Math.max(0, Math.min(1, t));
    const cx = a[0] + t * dx;
    const cy = a[1] + t * dy;
    return { distSq: (p[0] - cx) ** 2 + (p[1] - cy) ** 2, t: rawT };
  }

  function computeInsertIndexForNewStop(routeId, newWkt) {
    const siblings = stops.filter((s) => s.routeId === routeId && !s.isPaused).sort((a, b) => a.sortOrder - b.sortOrder);
    if (siblings.length < 2) return null; // sona eklemek zaten doğru sonucu veriyor
    try {
      const newPoint = wktFormat.readFeature(newWkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }).getGeometry().getCoordinates();
      const coords = siblings.map((s) => wktFormat.readFeature(s.wkt, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }).getGeometry().getCoordinates());
      let bestIndex = siblings.length; // varsayılan: sona ekle
      let bestDistSq = Infinity;
      let bestSegIndex = -1;
      let bestT = 0.5;
      for (let i = 0; i < coords.length - 1; i++) {
        const { distSq, t } = pointToSegmentDistanceSq(newPoint, coords[i], coords[i + 1]);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestIndex = i + 1; // bu segmentin hemen ardına
          bestSegIndex = i;
          bestT = t;
        }
      }
      // Kazanan segment İLK segmentse ve nokta onun BAŞINDAN öteye düşüyorsa (t<=0):
      // güzergahın en başına ekle. Kazanan segment SON segmentse ve nokta onun
      // SONUNDAN öteye düşüyorsa (t>=1): güzergahın en sonuna ekle. Aksi halde
      // segmentin hemen ardına (ortaya) ekle. Bu, "Zafer5'in ardından eklenen Zafer6
      // Zafer5'ten ÖNCEYE giriyor" hatasının kök nedeniydi.
      if (bestSegIndex === 0 && bestT <= 0) {
        bestIndex = 0;
      } else if (bestSegIndex === coords.length - 2 && bestT >= 1) {
        bestIndex = coords.length;
      }
      return bestIndex;
    } catch (err) {
      console.error('Durak ekleme sırası hesaplanamadı, sona eklenecek:', err);
      return null;
    }
  }

  // Kullanıcının kendi isteği: "haritadan durak eklerken tüm durakların sıralaması görünsün,
  // anlık olarak direkt oradan sırasını ayarlayabilelim" — StopFormPopup artık kullanıcının
  // elle seçtiği bir sıra numarasını (0-tabanlı insertIndex, undefined ise "hiç seçmedi/tek
  // durak" demek) veriyor; o zaman coğrafi otomatik hesaplama (computeInsertIndexForNewStop)
  // sadece FALLBACK olarak kullanılıyor (popup her zaman bir öneri gösterip önceden seçili
  // bıraktığı için pratikte hemen hiç devreye girmez, ama popup'ın kendisi hiç render
  // edilmeden bu fonksiyon başka bir yoldan çağrılırsa diye güvenlik ağı olarak duruyor).
  async function confirmStopDraw(name, routeId, chosenIndex) {
    if (!pendingStopDraw) return;
    try {
      const insertIndex = chosenIndex != null ? chosenIndex : computeInsertIndexForNewStop(routeId, pendingStopDraw.wkt);
      const response = await fetchWithTimeout(TRANSIT_STOP_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wkt: pendingStopDraw.wkt, name, routeId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatusMessage(body?.message || 'Durak eklenemedi.');
        cancelStopDraw();
        return;
      }
      const created = await response.json();
      setStops((current) => [created, ...current]);
      setPendingStopDraw(null);
      setLockedStopRouteId(null);

      // Durak sona eklendi (backend varsayılanı) — ama coğrafi olarak arada bir yere
      // düşüyorsa mevcut reorder uç noktasını kullanarak doğru sıraya taşıyoruz.
      if (insertIndex != null) {
        const siblings = stops.filter((s) => s.routeId === routeId && !s.isPaused).sort((a, b) => a.sortOrder - b.sortOrder);
        const orderedIds = siblings.map((s) => s.id);
        orderedIds.splice(insertIndex, 0, created.id);
        try {
          await fetchWithTimeout(`${TRANSIT_STOP_BASE}/reorder`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stopIds: orderedIds }),
          });
        } catch (reorderErr) {
          console.error('Otomatik sıralama uygulanamadı:', reorderErr);
        }
      }

      // route line çizgisi yeni durakla güncellensin diye tüm durakları/güzergah çizgisini tazele.
      fetchStops();

      // Kullanıcının kendi isteği (FAZ 2): "il ilçe mahalle vs otomatik oluştursun" — bu
      // güzergahın il/ilçe/mahalle etiketleri HÂLÂ boşsa (admin elle bir şey girmemişse),
      // yeni eklenen durağın konumundan reverse-geocode ile otomatik dolduruyoruz. Admin'in
      // elle girdiği bir değerin üzerine ASLA yazmıyoruz (saveEditedPoi ile AYNI "location ??
      // mevcut" deseni, ama burada "mevcutsa hiç dokunma" — POI'den farklı olarak güzergahın
      // TEK bir konumu yok, bu yüzden sadece BOŞKEN dolduruyoruz).
      const targetRoute = routesRef.current.find((r) => r.id === routeId);
      if (targetRoute && !targetRoute.province && !targetRoute.district) {
        try {
          const coords = pendingStopDraw.feature?.getGeometry()?.getCoordinates();
          const location = coords ? await reverseGeocode(...toLonLat(coords), 18) : null;
          if (location && (location.province || location.district || location.neighborhood)) {
            await fetchWithTimeout(`${TRANSIT_ROUTE_BASE}/${routeId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...authHeader() },
              body: JSON.stringify({
                province: location.province || null,
                district: location.district || null,
                neighborhood: location.neighborhood || null,
              }),
            });
            fetchRoutes();
          }
        } catch (geoErr) {
          console.error('Güzergah il/ilçe/mahalle otomatik doldurulamadı:', geoErr);
        }
      }
    } catch (err) {
      console.error('Durak eklenemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
      cancelStopDraw();
    }
  }

  async function deleteStop(stopId) {
    try {
      const response = await fetchWithTimeout(`${TRANSIT_STOP_BASE}/${stopId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatusMessage(body?.message || 'Durak silinemedi.');
        return;
      }
      setSelectedStop(null);
      fetchStops();
    } catch (err) {
      console.error('Durak silinemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    }
  }

  // Hoca ödevi (Akıllı Ulaşım Modülü): "basit inline prompt veya edit-mode YETERLİ" — POI'nin
  // tam VertexCoordinateEditor akışını kopyalamıyoruz, sadece isim + güzergah değiştirilebiliyor.
  function startEditingStop(stop) {
    setEditStopName(stop.name || '');
    setEditStopRouteId(stop.routeId || '');
    setEditingStopId(stop.id);
  }

  function cancelEditingStop() {
    setEditingStopId(null);
  }

  async function saveEditedStop(stop) {
    if (!editStopName.trim()) {
      setStatusMessage('Durak adı boş olamaz.');
      return;
    }
    setSavingStop(true);
    try {
      const response = await fetchWithTimeout(`${TRANSIT_STOP_BASE}/${stop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editStopName.trim(), routeId: Number(editStopRouteId) }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setStatusMessage(body?.message || 'Durak güncellenemedi.');
        return;
      }
      setEditingStopId(null);
      fetchStops();
      setStatusMessage('Durak güncellendi.');
    } catch (err) {
      console.error('Durak güncellenemedi:', err);
      setStatusMessage('Sunucuya bağlanılamadı.');
    } finally {
      setSavingStop(false);
    }
  }

  // focusOnItem/zoomToPoi ile AYNI desen — durağa "Yakınlaş" için.
  function zoomToStop(stop) {
    const feature = stopSourceRef.current?.getFeatures().find((f) => f.get('stopId') === stop.id);
    if (!feature || !mapRef.current) return;
    if (flyAnimationEnabled) {
      flyToFeature(mapRef.current, feature);
    } else {
      const view = mapRef.current.getView();
      const size = mapRef.current.getSize();
      const targetExtent = feature.getGeometry().getExtent();
      view.animate({
        center: getCenter(targetExtent),
        zoom: computeFitZoom(view, size, targetExtent, 15),
        duration: 200,
      });
    }
  }

  const isLowTime = remainingSeconds !== null && remainingSeconds <= 60;

  const selectedItem = drawnItems.find((i) => i.key === selectedKey) || null;

  // Her şehir için kaç nokta/çizgi/alan olduğunu sayıyoruz, dropdown'da göstermek için
  const provinceCounts = {};
  drawnItems.forEach((item) => {
    if (!item.province) return;
    if (!provinceCounts[item.province]) {
      provinceCounts[item.province] = { Point: 0, LineString: 0, Polygon: 0 };
    }
    provinceCounts[item.province][item.mode] += 1;
  });
  const provinces = Object.keys(provinceCounts).sort();

  function formatProvinceOption(province) {
    const counts = provinceCounts[province];
    const parts = DRAW_TYPES.filter((t) => counts[t.mode] > 0).map(
      (t) => `${counts[t.mode]} ${t.label.toLowerCase()}`
    );
    return `${province} (${parts.join(', ')})`;
  }

  // Envanter Analizi paneli: sayıların yanına her kesişen çizgi/alanın kendi uzunluğunu/
  // m²'sini ve genel toplamı ekliyoruz. Alan/uzunluk hesabı yine describeGeometry'deki gibi
  // istemci tarafında (ol/sphere, EPSG:3857 projeksiyonuna duyarlı gerçek geodesic hesap) —
  // backend'den gelen id listelerine karşılık gelen feature'lar zaten haritada yüklü.
  // "Toplam alan" için tek tek alanları TOPLAMIYORUZ (iki poligon üst üste binerse ortak
  // bölge iki kere sayılırdı) — backend'in gönderdiği unionedPolygonWkt (kesişen tüm
  // alanların topolojik birleşimi) üzerinden hesaplıyoruz, bu yüzden çakışan alanlar
  // otomatik olarak sadece bir kere sayılmış oluyor.
  function buildAnalysisBreakdown(result) {
    const lines = (result.lineIds || []).map((id) => {
      const geometry = getFeaturesMap().get(`LineString-${id}`)?.getGeometry();
      return { id, length: geometry ? getLength(geometry, { projection: 'EPSG:3857' }) : null };
    });
    const polygons = (result.polygonIds || []).map((id) => {
      const geometry = getFeaturesMap().get(`Polygon-${id}`)?.getGeometry();
      return { id, area: geometry ? getArea(geometry, { projection: 'EPSG:3857' }) : null };
    });

    const totalLineLength = lines.reduce((sum, l) => sum + (l.length || 0), 0);

    let totalArea = polygons.reduce((sum, p) => sum + (p.area || 0), 0); // WKT parse edilemezse geri düşülecek naif toplam
    let totalAreaIsUnioned = false;
    if (result.unionedPolygonWkt) {
      try {
        const unionedGeometry = wktFormat.readGeometry(result.unionedPolygonWkt, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        });
        totalArea = getArea(unionedGeometry, { projection: 'EPSG:3857' });
        totalAreaIsUnioned = true;
      } catch {
        // yoksayıldı — bozuk WKT gelirse naif toplamla devam
      }
    }

    return { lines, polygons, totalLineLength, totalArea, totalAreaIsUnioned };
  }

  const analysisBreakdown = analysisResult ? buildAnalysisBreakdown(analysisResult) : null;
  // Hoca ödevi (25 Ağustos — Konum Analizi): "İller listesinden seçim" — gerçek bir 81 il
  // sabit listesi yerine POI'lerin KENDİ `province` alanından türetiyoruz (bkz.
  // LocationAnalysisPanel.jsx'teki karar notu) — hiç POI'si olmayan bir il zaten analiz
  // için anlamsız, listede hiç görünmemesi daha doğru.
  const locationAnalysisProvinces = [...new Set(pois.map((p) => p.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const analysisHasOverlap =
    analysisBreakdown && analysisBreakdown.totalAreaIsUnioned && analysisBreakdown.polygons.length > 1 &&
    analysisBreakdown.totalArea < analysisBreakdown.polygons.reduce((sum, p) => sum + (p.area || 0), 0) - 1;

  return (
    <div className="map-page">
      {/* "Liquid glass" efekti için gizli SVG filtre tanımı — .feature-info-card ve
          .shapes-panel'in backdrop-filter'ı bunu url(#liquid-glass-distortion) ile
          referans alıyor (bkz. App.css). LIQUID_GLASS_BUMP_URL (merkezi nötr, kenarlara
          doğru açılan radyal gradyan) feDisplacementMap'e "hangi pikseli ne kadar
          kaydır" bilgisini veriyor — sonuç kenarlarda belirgin kırılma, ortada net bir
          lens hissi (önceki feTurbulence denemesi her yerde eşit dağılan gürültü
          yüzünden "bulanık/statik" görünüyordu). color-interpolation-filters=sRGB
          şart: varsayılan linearRGB renk uzayında R/G kanal okumaları yanlış çıkıyor.
          width/height=0 ile ekranda hiç yer kaplamıyor, sadece tanım olarak duruyor. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter
          id="liquid-glass-distortion"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feImage href={LIQUID_GLASS_BUMP_URL} xlinkHref={LIQUID_GLASS_BUMP_URL} x="0" y="0" width="100%" height="100%" result="bump" />
          <feGaussianBlur in="bump" stdDeviation="9" result="bumpBlur" />
          <feDisplacementMap in="SourceGraphic" in2="bumpBlur" scale="40" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <div className={`map-loading-overlay${mapLoading ? '' : ' map-loading-hidden'}`}>
        <div className="map-loading-ring" />
        <div className="map-loading-text">Harita hazırlanıyor…</div>
      </div>

      {/* Faz 3.2 (kullanıcının kendi isteği: "haritalar kısımları hepsi birleşik ama gömülü
          olmalı, açılır kapanır bar olsun") — TEK, varsayılan kapalı bar. Kapalıyken sadece
          aktif haritanın adını gösteren bir "pill"; açılınca içinde "Haritalarım" (kartlar +
          "+" ile yeni harita) ve "Paylaşılanlar" (benimle paylaşılan haritalar) sekmeleri. */}
      {/* Hoca ödevi (POI Arama Barı): "Google Maps benzeri bir Arama Barı ... Kullanıcı (User)
          rolüne de açık olmalıdır." canViewPoi üç yerleşik role de (Kullanıcı dahil) seed
          edildiği için burada ekstra bir rol kontrolüne gerek yok — POI'leri görebilen herkes
          arayabilir. */}
      {/* Kullanıcının kendi bildirdiği bug: bir güzergaha odaklanınca (transit-focus-banner,
          sol üstte) arama çubuğunun altındaki POI kategori çipleri (ortalanmış, geniş bir
          şerit) onunla aynı bölgeye taşıp üst üste biniyordu. Güzergah odağı zaten kendi
          başına bir "izolasyon" modu — POI arama/öneri çipleri o an alakasız, bu yüzden
          odak açıkken tamamen gizleniyor (Esc/✕ ile odak kapanınca geri gelir). */}
      {getPermissions().canViewPoi && focusedRouteId == null && (
        <PoiSearchBar
          pois={pois}
          // Arama sonuçları o an EKRANDA görünen bölgeye göre sıralansın (bkz. PoiSearchBar
          // içindeki sıralama yorumu) — haritanın anlık görünümünü fonksiyonla veriyoruz ki
          // her harita hareketinde bileşen yeniden render olmasın.
          getMapView={() => {
            const view = mapRef.current?.getView();
            const size = mapRef.current?.getSize();
            if (!view || !size) return null;
            const extent3857 = view.calculateExtent(size);
            const [minLon, minLat] = toLonLat([extent3857[0], extent3857[1]]);
            const [maxLon, maxLat] = toLonLat([extent3857[2], extent3857[3]]);
            const [centerLon, centerLat] = toLonLat(view.getCenter() || [0, 0]);
            return { extent: [minLon, minLat, maxLon, maxLat], center: { lon: centerLon, lat: centerLat } };
          }}
          onSelect={zoomToPoi}
          selectedPoiId={selectedPoi}
          onClear={() => setSelectedPoi(null)}
          categories={poiCategories}
          activeCategoryId={poiCategoryFilter}
          onSelectCategory={(id) => {
            setSelectedPoi(null);
            setPoiCategoryFilter((current) => (String(current) === String(id) ? '' : id));
          }}
        />
      )}

      <div className="map-switcher" ref={switcherRef}>
        <div className="map-brand-row">
          <button
            type="button"
            className={`map-switcher-trigger${switcherOpen ? ' map-switcher-trigger-open' : ''}`}
            onClick={() => setSwitcherOpen((v) => !v)}
            aria-expanded={switcherOpen}
            aria-haspopup="dialog"
            title="Haritalarım"
          >
            <span className="map-switcher-trigger-icon">🗺️</span>
            <span className="map-switcher-trigger-name">
              {viewingSharedMap
                ? sharedWithMe.find((s) => s.mapId === activeMapId)?.mapName
                  || adminAllMaps.find((m) => m.id === activeMapId)?.name
                  || 'Paylaşılan harita'
                : maps.find((m) => m.id === activeMapId)?.name || 'Harita seç'}
            </span>
            <span className={`map-switcher-chevron${switcherOpen ? ' map-switcher-chevron-open' : ''}`}>▾</span>
            {sharedWithMe.some((s) => s.status === 'Pending') && <span className="map-switcher-trigger-dot" />}
          </button>
          <div className="history-controls" aria-label="Harita işlem geçmişi">
            <button
              className="history-button"
              onClick={performUndo}
              disabled={undoCount === 0}
              title="Geri al (Ctrl+Z)"
              aria-label="Geri al"
            >
              <UndoIcon size={16} />
            </button>
            <button
              className="history-button"
              onClick={performRedo}
              disabled={redoCount === 0}
              title="İleri al (Ctrl+Y)"
              aria-label="İleri al"
            >
              <RedoIcon size={16} />
            </button>
          </div>
        </div>

        {switcherOpen && (
          <div className="map-switcher-panel">
            <div className="map-switcher-tabs">
              <button
                type="button"
                className={`map-switcher-tab${switcherTab === 'maps' ? ' map-switcher-tab-active' : ''}`}
                onClick={() => setSwitcherTab('maps')}
              >
                Haritalarım
              </button>
              <button
                type="button"
                className={`map-switcher-tab${switcherTab === 'shared' ? ' map-switcher-tab-active' : ''}`}
                onClick={() => setSwitcherTab('shared')}
              >
                <MessageIcon size={13} />
                {/* Kullanıcının kendi isteği: "paylaşılanlar yazısı benimle paylaşılanlar
                    olsun ama bu çok uzun oldu, benimle paylaşılanlar olduğunu
                    anlayabileceğim bi şey olsun" — zaten yanında bir mesaj/gelen-kutusu
                    ikonu vardı, "Gelen Kutusu" ikonla birlikte kısa ve net. */}
                Gelen Kutusu
                {sharedWithMe.some((s) => s.status === 'Pending') && (
                  <span className="map-switcher-tab-badge map-tabs-blink">
                    {sharedWithMe.filter((s) => s.status === 'Pending').length}
                  </span>
                )}
              </button>
              {isAdmin() && (
                <button
                  type="button"
                  className={`map-switcher-tab${switcherTab === 'adminAll' ? ' map-switcher-tab-active' : ''}`}
                  onClick={() => {
                    setSwitcherTab('adminAll');
                    if (!adminAllMapsLoaded) fetchAdminAllMaps();
                  }}
                  title="Sahiplik/paylaşım aranmaksızın sistemdeki tüm haritalar"
                >
                  🛡️ Tüm Haritalar
                </button>
              )}
            </div>

            {switcherTab === 'maps' && (
              <SelectMenu
                value={mapSortMode}
                onChange={setMapSortMode}
                triggerClassName="map-switcher-sort-select"
                triggerLabel={
                  mapSortMode === 'name' ? '↕ İsme göre' : mapSortMode === 'modified' ? '↕ Son değiştirmeye göre' : '↕ Elle sırala'
                }
                options={[
                  { value: 'manual', label: '↕ Elle sırala (sürükle-bırak)' },
                  { value: 'name', label: '↕ İsme göre' },
                  { value: 'modified', label: '↕ Son değiştirmeye göre' },
                ]}
              />
            )}

            {switcherTab === 'maps' ? (
              <div className="map-switcher-list">
                {/* Kullanıcının kendi isteği: "isme göre fln da filtreleyebilsin... son
                    değiştirmeye göre filtreleyebilsin" — 'manual' dışındaki modlarda düz
                    istemci-taraflı sıralama; VARSAYILAN hangi modda olursa olsun HER ZAMAN
                    en üstte kalır (önceki "her zaman en üstte olsun" isteği bozulmasın diye). */}
                {(mapSortMode === 'manual'
                  ? maps
                  : [...maps].sort((a, b) => {
                      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
                      return mapSortMode === 'name'
                        ? a.name.localeCompare(b.name, 'tr')
                        : new Date(b.modifiedDate) - new Date(a.modifiedDate);
                    })
                ).map((m) => {
                  const accordionOpen = mapSettingsOpenId === m.id;
                  const thumb = mapThumbnails[m.id];
                  // Sıralama modu 'manual' değilken sürüklemeyi de kapatıyoruz — aksi halde
                  // sürükleyip bıraktığında görsel sıra (isim/tarihe göre) ile backend'e
                  // kaydedilen SortOrder çelişir, kafa karıştırıcı olur.
                  const canReorder = getPermissions().canManageMultipleMaps && !viewingSharedMap && mapSortMode === 'manual';
                  // Kullanıcının kendi isteği (harita şeridi polish turu): "varsayılan her
                  // zaman en üstte olsun" — Görev #77'de varsayılan da sürüklenebilirdi,
                  // kafa karıştırdığı için artık PİNLENMİŞ: varsayılan haritanın kendisi
                  // sürüklenemez (tutamaç hiç gösterilmiyor) VE hiçbir şey onun üzerine
                  // bırakılamıyor (onDrop'ta erken çıkış) — backend zaten IsDefault'u
                  // sıralamada her zaman ilk sıraya koyuyor (bkz. MapService.GetMyMapsAsync),
                  // bu sadece frontend'in o garantiyi bozmasını engelliyor.
                  const canDragRow = canReorder && !m.isDefault;
                  return (
                    <div
                      key={m.id}
                      className={`map-switcher-card-row${m.id === activeMapId ? ' map-switcher-card-row-active' : ''}${m.isFavorite ? ' map-switcher-card-row-favorite' : ''}`}
                      // Görev #77 (kullanıcının kendi isteği: "mapleri kendimiz tutup
                      // sürükleme mantığı ile dizebilelim"): native HTML5 drag-drop, ekstra
                      // kütüphaneye gerek yok. Sürüklenebilirlik sadece TUTAMAÇ ikonundan
                      // başlatılabiliyor (draggable satırın TAMAMINDA olsaydı normal
                      // tıklama/hover jestleriyle çakışırdı).
                      onDragOver={(e) => {
                        if (!canDragRow) return;
                        e.preventDefault();
                        const draggedId = draggedMapIdRef.current;
                        // Aynı satırın üzerinde tekrar tekrar ateşlenen dragover'ları
                        // yoksay — sadece HEDEF gerçekten değişince yeniden sırala (kullanıcının
                        // isteği: "gerçek zamanlı... görebilelim" — ama gereksiz re-render'sız).
                        if (draggedId == null || draggedId === m.id || dragOverTargetIdRef.current === m.id) return;
                        dragOverTargetIdRef.current = m.id;
                        setMaps((cur) => computeDragReorder(cur, draggedId, m.id));
                      }}
                      onDrop={(e) => {
                        if (!canDragRow) return;
                        e.preventDefault();
                        dragDroppedRef.current = true;
                        const draggedId = draggedMapIdRef.current;
                        draggedMapIdRef.current = null;
                        dragOverTargetIdRef.current = null;
                        // `maps` zaten sürüklerken CANLI olarak son haline getirildi (bkz.
                        // onDragOver) — burada sadece backend'e TEK seferlik kalıcı kayıt.
                        if (draggedId != null) persistMapOrder(maps);
                      }}
                    >
                      <div className="map-switcher-card">
                        {canDragRow && (
                          <span
                            className="map-switcher-drag-handle"
                            draggable
                            onDragStart={(e) => {
                              draggedMapIdRef.current = m.id;
                              dragOverTargetIdRef.current = m.id;
                              dragOriginalOrderRef.current = maps; // iptal edilirse (bkz. onDragEnd) buraya dönülür
                              dragDroppedRef.current = false;
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              // Sürükleme bir satıra BIRAKILMADAN bitti (ör. liste dışına
                              // bırakıldı ya da Esc/iptal) — canlı önizlemeyi geri al, backend'e
                              // hiç kaydedilmemiş yarım bir sıra state'te asılı kalmasın.
                              if (!dragDroppedRef.current && dragOriginalOrderRef.current) {
                                setMaps(dragOriginalOrderRef.current);
                              }
                              draggedMapIdRef.current = null;
                              dragOverTargetIdRef.current = null;
                              dragOriginalOrderRef.current = null;
                            }}
                            title="Sürükleyerek sırala"
                          >
                            ⠿
                          </span>
                        )}
                        <button
                          type="button"
                          className="map-switcher-card-main"
                          onClick={() => {
                            setActiveMapId(m.id);
                            setSwitcherOpen(false);
                          }}
                          title="Bu haritaya geç"
                          onMouseEnter={() => handleThumbHoverStart(m)}
                          onMouseLeave={handleThumbHoverEnd}
                        >
                          <span className="map-switcher-thumb">
                            {thumb ? <img src={thumb} alt="" /> : <span className="map-switcher-thumb-placeholder">🗺️</span>}
                          </span>
                          <span className="map-switcher-card-info">
                            <span className="map-switcher-card-name">
                              {m.name}
                              {m.isDefault && <span className="map-switcher-default-badge">Varsayılan</span>}
                            </span>
                            {m.description && <span className="map-switcher-card-desc">{m.description}</span>}
                            <span className="map-switcher-card-meta">
                              {m.geometryCount} çizim
                              {/* Kullanıcının kendi isteği: "kaç kişiyle paylaşıldığı haritanın
                                  yanında yazsın, aktif kaç kişi var görelim" — backend'den
                                  gelen (rol paylaşımları kişi sayısına çevrilmiş) toplam/aktif
                                  sayaç. Hepsi aktifse tek sayı yeterli, aralarında fark varsa
                                  (bekleyen davet/duraklatılmış) ikisini de gösteriyoruz. */}
                              {m.shareCount > 0 &&
                                ` · 👥 ${m.shareCount} kişi${m.activeShareCount !== m.shareCount ? ` (${m.activeShareCount} aktif)` : ''}`}
                              {/* Kullanıcının kendi isteği: "son değiştirme tarihi ve saati
                                  yazsın". */}
                              {m.modifiedDate && ` · 🕓 ${formatModifiedShort(m.modifiedDate)}`}
                            </span>
                          </span>
                        </button>

                        {canReorder && (
                          <button
                            type="button"
                            className={`map-switcher-favorite-btn${m.isFavorite ? ' map-switcher-favorite-btn-active' : ''}`}
                            onClick={() => toggleMapFavorite(m)}
                            title={m.isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                          >
                            {m.isFavorite ? '★' : '☆'}
                          </button>
                        )}

                        {getPermissions().canManageMultipleMaps && !viewingSharedMap && (
                          <button
                            type="button"
                            className="map-switcher-card-gear"
                            onClick={() => {
                              if (accordionOpen) {
                                setMapSettingsOpenId(null);
                              } else {
                                setMapSettingsOpenId(m.id);
                                fetchMapShares(m.id);
                                fetchMapGeoRestrictions(m.id);
                              }
                            }}
                            title="Harita ayarları"
                          >
                            <GearIcon size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {getPermissions().canManageMultipleMaps && !viewingSharedMap && (
                  <button
                    type="button"
                    className="map-switcher-add"
                    onClick={() => setNewMapPopoverOpen(true)}
                    title="Yeni harita (Ctrl+Alt+N)"
                  >
                    +
                  </button>
                )}

                {!viewingSharedMap && (
                  <button type="button" className="map-switcher-trash-link" onClick={openMapTrash}>
                    🗑️ Çöp kutusu
                  </button>
                )}
              </div>
            ) : switcherTab === 'adminAll' ? (() => {
              // Kullanıcının kendi düzeltmesi: önceki tur "kullanıcı başına özet kart" grid'ini
              // ANA görünüm yapmıştı — bu istenmiyordu, eski tek tek harita listesi geri geldi
              // (filtreler kalıyor). Ayrıca: kendi haritaların zaten "Haritalarım" sekmesinde
              // var, burada TEKRAR görünmesinler.
              const myUsername = getAuth()?.username;
              const othersOnly = adminAllMaps.filter((m) => m.ownerUsername !== myUsername);
              const roleOptions = [...new Map(othersOnly.filter((m) => m.ownerRole).map((m) => [m.ownerRole, m.ownerRoleColor])).entries()];
              const userOptions = [...new Set(othersOnly.map((m) => m.ownerUsername).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
              const filtered = othersOnly.filter(
                (m) => (!adminAllUserFilter || m.ownerUsername === adminAllUserFilter) && (!adminAllRoleFilter || m.ownerRole === adminAllRoleFilter)
              );

              return (
                <div className="map-switcher-list">
                  {/* Kullanıcının kendi isteği: "haritanın en başında sabitli olarak herkesin
                      çizimlerinin bir arada olduğu bir harita olsun" — listenin HER ZAMAN ilk
                      satırı, filtrelerden etkilenmiyor. */}
                  <div className="map-switcher-shared-card map-switcher-combined-card">
                    <span className="map-switcher-thumb map-switcher-shared-thumb">🌐</span>
                    <span className="map-switcher-card-info">
                      <span className="map-switcher-card-name">Ortak Görünüm</span>
                      <span className="map-switcher-card-meta">Tüm kullanıcıların çizimleri tek haritada (salt okunur)</span>
                    </span>
                    <button
                      type="button"
                      className="map-switcher-view-btn"
                      onClick={() => {
                        openCombinedAdminView();
                        setSwitcherOpen(false);
                      }}
                    >
                      Görüntüle
                    </button>
                  </div>

                  {othersOnly.length === 0 && <p className="admin-hint">Başka kullanıcıya ait harita yok.</p>}
                  {othersOnly.length > 0 && (
                    <div className="admin-transit-filter-row">
                      <select value={adminAllUserFilter} onChange={(e) => setAdminAllUserFilter(e.target.value)} aria-label="Kullanıcı adına göre filtrele">
                        <option value="">Tüm kullanıcılar</option>
                        {userOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      {roleOptions.length > 0 && (
                        <select value={adminAllRoleFilter} onChange={(e) => setAdminAllRoleFilter(e.target.value)} aria-label="Role göre filtrele">
                          <option value="">Tüm roller</option>
                          {roleOptions.map(([role]) => <option key={role} value={role}>{role}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                  {filtered.map((m) => (
                    <div key={m.id} className="map-switcher-shared-card">
                      <span className="map-switcher-thumb map-switcher-shared-thumb">🛡️</span>
                      <span className="map-switcher-card-info">
                        <span className="map-switcher-card-name">
                          {m.name}
                          {m.isDefault && <span className="map-switcher-default-badge">Varsayılan</span>}
                        </span>
                        <span className="map-switcher-card-meta">
                          sahibi: {m.ownerUsername}{m.ownerRole && ` (${m.ownerRole})`} · {m.geometryCount} çizim
                          {m.modifiedDate && ` · 🕓 ${formatModifiedShort(m.modifiedDate)}`}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="map-switcher-view-btn"
                        onClick={() => {
                          setActiveMapId(m.id);
                          setSwitcherOpen(false);
                        }}
                      >
                        Görüntüle
                      </button>
                    </div>
                  ))}
                </div>
              );
            })() : (
              <div className="map-switcher-list">
                {sharedWithMe.length === 0 && <p className="admin-hint">Henüz seninle paylaşılan bir harita yok.</p>}
                {/* Görev #72 (kullanıcının kendi isteği: "burası çok kötü, güzelleştir" + "Görüntüle
                    yazısının kırmızı olması çok saçma"): eskiden Paylaş modalındaki "durdur"
                    satırıyla AYNI .map-share-row/.map-share-stop sınıflarını (kırmızı, tehlike
                    rengi) ödünç alıyordu — oysa burada "Görüntüle" YIKICI bir eylem değil, o
                    yüzden kırmızı anlamsızdı. Artık "Haritalarım" sekmesindeki kartlarla aynı
                    dilde (ikon + isim + meta), ayrı bir sınıf setiyle ve nötr/primary renkli bir
                    "Görüntüle" butonuyla. */}
                {/* Görev #77 (kullanıcının kendi isteği: "paylaşılan haritaları sonradan arşive
                    atabilmeliyim, favorileyebilmeliyim veya onlara not ekleyebilmeliyim bir
                    kullanıcı olarak"): favoriler üstte, arşivlenenler varsayılan gizli. */}
                {sharedWithMe.some((s) => s.isArchived) && (
                  <button
                    type="button"
                    className="map-switcher-trash-link"
                    onClick={() => setShowArchivedShares((v) => !v)}
                  >
                    {showArchivedShares ? '📂 Arşivlenenleri gizle' : '📦 Arşivlenenleri göster'}
                  </button>
                )}
                {sharedWithMe
                  .filter((s) => showArchivedShares || !s.isArchived)
                  .slice()
                  .sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0))
                  .map((s) => (
                  <div key={s.shareId} className={`map-switcher-shared-card${s.isArchived ? ' map-switcher-shared-card-archived' : ''}`}>
                    <span className="map-switcher-thumb map-switcher-shared-thumb">👁</span>
                    <span className="map-switcher-card-info">
                      <span className="map-switcher-card-name">
                        {s.mapName}
                        {s.status === 'Pending' && <span className="map-share-status map-share-status-pending">Bekliyor</span>}
                        {s.status === 'Accepted' && s.canView === false && (
                          <span className="map-share-status map-share-status-paused">Duraklatıldı</span>
                        )}
                        {s.isArchived && <span className="map-share-status map-share-status-archived">Arşivde</span>}
                      </span>
                      <span className="map-switcher-card-meta">
                        sahibi: {s.ownerUsername}
                        {s.viaRoleName ? ` · ${s.viaRoleName} rolü üzerinden` : ''}
                      </span>
                      {s.status === 'Accepted' && (
                        editingShareNoteId === s.shareId ? (
                          <span className="map-switcher-share-note-edit">
                            <input
                              type="text"
                              autoFocus
                              value={shareNoteDraft}
                              placeholder="Bir not ekle..."
                              maxLength={200}
                              onChange={(e) => setShareNoteDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveShareNote(s);
                                if (e.key === 'Escape') setEditingShareNoteId(null);
                              }}
                              onBlur={() => saveShareNote(s)}
                            />
                          </span>
                        ) : (
                          s.note && (
                            <span className="map-switcher-share-note" onClick={() => startEditingShareNote(s)} title="Notu düzenle">
                              📝 {s.note}
                            </span>
                          )
                        )
                      )}
                    </span>
                    {s.status === 'Pending' ? (
                      <div className="map-share-respond-actions">
                        <button type="button" className="map-share-accept" onClick={() => respondToShare(s, true)}>
                          Kabul Et
                        </button>
                        <button type="button" className="map-share-decline" onClick={() => respondToShare(s, false)}>
                          Reddet
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`map-switcher-favorite-btn${s.isFavorite ? ' map-switcher-favorite-btn-active' : ''}`}
                          title={s.isFavorite ? 'Favoriden çıkar' : 'Favorile'}
                          onClick={() => toggleShareFavorite(s)}
                        >
                          {s.isFavorite ? '★' : '☆'}
                        </button>
                        {!s.note && editingShareNoteId !== s.shareId && (
                          <button
                            type="button"
                            className="map-switcher-note-btn"
                            title="Not ekle"
                            onClick={() => startEditingShareNote(s)}
                          >
                            📝
                          </button>
                        )}
                        <button
                          type="button"
                          className="map-switcher-archive-btn"
                          title={s.isArchived ? 'Arşivden çıkar' : 'Arşivle'}
                          onClick={() => toggleShareArchived(s)}
                        >
                          {s.isArchived ? '📂' : '📦'}
                        </button>
                        <button
                          type="button"
                          className="map-switcher-view-btn"
                          disabled={s.canView === false}
                          title={s.canView === false ? 'Sahip bu paylaşımı duraklattı.' : undefined}
                          onClick={() => {
                            setActiveMapId(s.mapId);
                            setSwitcherOpen(false);
                          }}
                        >
                          Görüntüle
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Faz 3.2 bug fix (kullanıcının kendi tespiti): popover eskiden .map-switcher'a
                (sadece kapalı pill kadar geniş) göre konumlanıyordu, panel (340px) ondan
                geniş olduğu için popover listenin ÜZERİNE biniyordu. Artık panelin İÇİNDE,
                panele göre konumlanıyor — panelin sağına doğru güvenle taşıyor. */}
            {newMapPopoverOpen && (
              <div className="new-map-popover-anchor">
                <NewMapPopover
                  pickableRoles={pickableRoles}
                  searchUsers={searchUsersForShare}
                  creating={false}
                  onClose={() => setNewMapPopoverOpen(false)}
                  onCreate={async (payload) => {
                    await createNewMap(payload);
                    setNewMapPopoverOpen(false);
                    setSwitcherOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Büyük önizleme portalda kalır; kart ile önizleme arasındaki kısa geçiş toleransı
          sayesinde canlı OpenLayers yüzeyine ulaşıp pan/zoom yapmak mümkündür. */}
      {hoverPreviewMap &&
        createPortal(
          <div
            className="map-thumb-lightbox-layer"
            onMouseEnter={keepThumbPreviewOpen}
            onMouseLeave={handleThumbHoverEnd}
          >
            <MapPreviewLightbox mapId={hoverPreviewMap.id} mapName={hoverPreviewMap.name} />
          </div>,
          document.body
        )}

      {combinedViewActive && (
        <div className="map-shared-banner">
          <span>
            🌐 <strong>Ortak Görünüm</strong> — {combinedViewLoading
              ? 'yükleniyor…'
              : combinedViewStats
                ? `${combinedViewStats.userCount} kullanıcı, ${combinedViewStats.itemCount} çizim (salt okunur)`
                : 'salt okunur'}
          </span>
          <button type="button" className="map-shared-banner-back" onClick={closeCombinedAdminView}>
            ◀ Çık
          </button>
        </div>
      )}

      {/* Kullanıcının kendi isteği: "çizilenlerin üzerine tıklayınca kimin hangi haritası
          olduğu görülebilsin" — sağ panelden bir öğeye tıklanınca açılan küçük detay kartı. */}
      {combinedViewDetailKey != null && (() => {
        const item = combinedViewItems.find((i) => i.key === combinedViewDetailKey);
        if (!item) return null;
        const mapName = adminAllMaps.find((m) => m.id === item.mapId)?.name || 'Bilinmeyen harita';
        return (
          <div className="transit-vehicle-popup combined-view-detail-popup">
            <div className="transit-vehicle-popup-header">
              <span className="stop-form-route-dot" style={{ background: item.ownerColor }} />
              <span>{item.name || `#${item.id}`}</span>
              <button type="button" onClick={() => setCombinedViewDetailKey(null)} title="Kapat">✕</button>
            </div>
            <div className="transit-vehicle-popup-body combined-view-detail-body">
              <span>👤 <strong>{item.ownerUsername}</strong></span>
              <span>🗺️ {mapName}</span>
              <span>📐 {item.mode === 'Point' ? 'Nokta' : item.mode === 'LineString' ? 'Çizgi' : 'Alan'}</span>
              {item.isPrivate && <span>🔒 Sadece sahibine görünür</span>}
            </div>
          </div>
        );
      })()}

      {viewingSharedMap && (
        <div className="map-shared-banner">
          <span>
            👁 Şu an <strong>{sharedWithMe.find((s) => s.mapId === activeMapId)?.ownerUsername || 'başka bir kullanıcının'}</strong> haritasını
            görüntülüyorsun — sadece görüntüleme, düzenleyemezsin.
          </span>
          <button
            type="button"
            className="map-shared-banner-back"
            onClick={() => setActiveMapId(lastOwnMapIdRef.current ?? maps.find((m) => m.isDefault)?.id ?? maps[0]?.id ?? null)}
          >
            ◀ Kendi Haritalarıma Dön
          </button>
        </div>
      )}

      <div className={`shapes-panel${panelCollapsed ? ' shapes-panel-collapsed' : ''}`}>
        <button
          className="shapes-panel-header"
          onClick={() => setPanelCollapsed((c) => !c)}
          aria-expanded={!panelCollapsed}
        >
          <span>Çizilenler ({combinedViewActive ? combinedViewItems.length : drawnItems.length})</span>
          <span className="shapes-panel-toggle">{panelCollapsed ? '▸' : '▾'}</span>
        </button>

        {!panelCollapsed && (
          <div className="shapes-panel-body">
            {combinedViewActive ? (
              // Kullanıcının kendi isteği: "sağdaki çizilenler kısmında herkesinkiler
              // listelensin çizen ismiyle birlikte. detaylar fln görünlebilsin. filtreleme de
              // yapılabilsin çizime, kişiye göre." — normal (aktif haritaya özel) filtre/liste
              // UI'sı Ortak Görünüm'de anlamsız, bu yüzden TAMAMEN AYRI: üstte kişi/tip filtresi,
              // altta sahibe göre gruplanmış, filtrelenmiş bir liste.
              (() => {
                const owners = [...new Set(combinedViewItems.map((i) => i.ownerUsername))].sort((a, b) => a.localeCompare(b, 'tr'));
                const filteredItems = combinedViewItems.filter(
                  (item) =>
                    (!combinedViewOwnerFilter || item.ownerUsername === combinedViewOwnerFilter) &&
                    (!combinedViewTypeFilter || item.mode === combinedViewTypeFilter)
                );
                const byOwner = new Map();
                filteredItems.forEach((item) => {
                  if (!byOwner.has(item.ownerUsername)) byOwner.set(item.ownerUsername, []);
                  byOwner.get(item.ownerUsername).push(item);
                });
                const visibleOwners = [...byOwner.keys()].sort((a, b) => a.localeCompare(b, 'tr'));
                return (
                  <>
                    {owners.length > 0 && (
                      <>
                        <select
                          className="shapes-filter"
                          value={combinedViewOwnerFilter}
                          onChange={(e) => setCombinedViewOwnerFilter(e.target.value)}
                          aria-label="Kullanıcıya göre filtrele"
                        >
                          <option value="">Tüm kullanıcılar ({combinedViewItems.length})</option>
                          {owners.map((owner) => (
                            <option key={owner} value={owner}>
                              {owner} ({combinedViewItems.filter((i) => i.ownerUsername === owner).length})
                            </option>
                          ))}
                        </select>
                        <select
                          className="shapes-filter"
                          value={combinedViewTypeFilter}
                          onChange={(e) => setCombinedViewTypeFilter(e.target.value)}
                          aria-label="Çizim tipine göre filtrele"
                        >
                          <option value="">Tüm tipler ({combinedViewItems.length})</option>
                          <option value="Point">Nokta ({combinedViewItems.filter((i) => i.mode === 'Point').length})</option>
                          <option value="LineString">Çizgi ({combinedViewItems.filter((i) => i.mode === 'LineString').length})</option>
                          <option value="Polygon">Alan ({combinedViewItems.filter((i) => i.mode === 'Polygon').length})</option>
                        </select>
                      </>
                    )}
                    {visibleOwners.length === 0 ? (
                      <p className="shapes-empty">{combinedViewLoading ? 'Yükleniyor…' : 'Filtreyle eşleşen çizim yok.'}</p>
                    ) : (
                      visibleOwners.map((owner) => {
                        const ownerItems = byOwner.get(owner);
                        const ownerKey = `owner-${owner}`;
                        const isCollapsed = collapsedCategories.has(ownerKey);
                        return (
                          <div key={ownerKey} className="shapes-category">
                            <button
                              type="button"
                              className="shapes-category-title shapes-category-title-toggle"
                              onClick={() => toggleCategoryCollapse(ownerKey)}
                              aria-expanded={!isCollapsed}
                            >
                              <span className="shapes-category-dot" style={{ background: hashUsernameToColor(owner) }} />
                              👤 {owner} ({ownerItems.length})
                              <span className="shapes-category-arrow">{isCollapsed ? '▸' : '▾'}</span>
                            </button>
                            {!isCollapsed && (
                              <ul className="shapes-list">
                                {ownerItems.map((item) => (
                                  <li key={item.key} className="shapes-list-item">
                                    <button
                                      className="shapes-item-button"
                                      onClick={() => {
                                        zoomToCombinedViewItem(item.key);
                                        // Kullanıcının kendi isteği: "üzerine tıklayınca kimin
                                        // hangi haritası olduğu görülebilsin".
                                        setCombinedViewDetailKey(item.key);
                                      }}
                                    >
                                      <span className="shapes-item-dot" style={{ background: TYPE_COLORS[item.mode] }} />
                                      <span className="shapes-item-text">
                                        <span className="shapes-item-number">{item.name ? item.name : `#${item.id}`}</span>
                                        <span className="shapes-item-place">
                                          {item.mode === 'Point' ? 'Nokta' : item.mode === 'LineString' ? 'Çizgi' : 'Alan'}
                                          {' · '}
                                          {adminAllMaps.find((m) => m.id === item.mapId)?.name || 'Bilinmeyen harita'}
                                        </span>
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })
                    )}
                  </>
                );
              })()
            ) : (
              <>
            {provinces.length > 0 && (
              <select
                className="shapes-filter"
                value={selectedProvince}
                onChange={(e) => setSelectedProvince(e.target.value)}
              >
                <option value="">Tüm şehirler ({drawnItems.length})</option>
                {provinces.map((province) => {
                  const count = drawnItems.filter((item) => item.province === province).length;
                  return (
                    <option key={province} value={province}>
                      {formatProvinceOption(province)} ({count})
                    </option>
                  );
                })}
              </select>
            )}

            {categories.length > 0 && DRAW_TYPES.some((type) => getPermissions()[type.permKey]) && (
              <select
                className="shapes-filter"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Tüm kategoriler ({drawnItems.length})</option>
                {categories.map((cat) => {
                  const count = drawnItems.filter((item) => item.categoryId === cat.id).length;
                  return (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({count})
                    </option>
                  );
                })}
              </select>
            )}

            <div className="shapes-layer-filter" ref={layerFilterRef}>
              <button
                type="button"
                className="shapes-layer-filter-toggle"
                onClick={() => setLayerFilterOpen((open) => !open)}
                aria-expanded={layerFilterOpen}
              >
                <span>◉ Haritada gösterilenler</span>
                <span>{layerFilterOpen ? '▴' : '▾'}</span>
              </button>
              {layerFilterOpen && (
                <div className="shapes-layer-filter-options">
                  {[
                    { key: 'Point', label: 'Noktalar', color: TYPE_COLORS.Point, permKey: 'canDrawPoint' },
                    { key: 'LineString', label: 'Çizgiler', color: TYPE_COLORS.LineString, permKey: 'canDrawLine' },
                    { key: 'Polygon', label: 'Alanlar', color: TYPE_COLORS.Polygon, permKey: 'canDrawPolygon' },
                    { key: 'Poi', label: 'POI noktaları', color: '#db2777' },
                    // Kullanıcının kendi düzeltmesi: "Güzergahlar" yazısı, diğerleriyle AYNI
                    // toggle mantığında (izolasyon değil, sadece kendi katmanını aç/kapa).
                    { key: 'Routes', label: '🚌 Güzergahlar', color: '#2563eb', permKey: 'canViewRoutes' },
                  ].filter((layer) => !layer.permKey || getPermissions()[layer.permKey]).map((layer) => (
                    <label key={layer.key} className="shapes-layer-filter-option">
                      <input
                        type="checkbox"
                        checked={layerVisibility[layer.key]}
                        onChange={() => toggleLayerVisibility(layer.key)}
                      />
                      <span className="shapes-category-dot" style={{ background: layer.color }} />
                      <span>{layer.label}</span>
                      <small>{layerVisibility[layer.key] ? 'Açık' : 'Gizli'}</small>
                    </label>
                  ))}
                  {getPermissions().canViewPoi && (
                    <div className="poi-map-filters">
                      <button
                        type="button"
                        className="poi-map-filter-heading poi-map-filter-heading-toggle"
                        onClick={() => setPoiFilterOpen((open) => !open)}
                        aria-expanded={poiFilterOpen}
                      >
                        <strong>POI filtresi</strong>
                        <span className="poi-map-filter-heading-right">
                          <span><i className="poi-legend-dot is-mine" /> Benim <i className="poi-legend-dot" /> Diğer</span>
                          <span>{poiFilterOpen ? '▴' : '▾'}</span>
                        </span>
                      </button>
                      {poiFilterOpen && (
                        <>
                          {/* Kullanıcının kendi isteği: "sağda filtre olarak olmayacak, google maps
                              yapacaksın" — serbest metin arama artık SADECE üstteki PoiSearchBar'da
                              (bkz. render'ın üstündeki <PoiSearchBar>). Burada yalnızca gerçek
                              filtreler (kategori/sahiplik/durum) kalıyor. */}
                          <SearchableCategorySelect
                            options={buildPoiCategoryOptions(poiCategories)}
                            value={poiCategoryFilter}
                            onChange={setPoiCategoryFilter}
                            emptyLabel="Tüm POI kategorileri"
                            ariaLabel="Haritadaki POI kategorisini filtrele"
                          />
                          <label className="poi-map-own-filter">
                            <input
                              type="checkbox"
                              checked={poiOwnerFilter === 'mine'}
                              onChange={(event) => setPoiOwnerFilter(event.target.checked ? 'mine' : 'all')}
                            />
                            Yalnız benim POI’lerim
                          </label>
                          <select value={poiStatusFilter} onChange={(event) => setPoiStatusFilter(event.target.value)} aria-label="Haritadaki POI durumunu filtrele">
                            <option value="all">Aktif ve duraklatılmış</option>
                            <option value="active">Yalnız aktif</option>
                            <option value="paused">Yalnız duraklatılmış</option>
                          </select>
                          <small>{pois.filter((poi) => {
                            const categoryFilterIds = expandCategoryFilterIds(poiCategories, poiCategoryFilter);
                            return (!categoryFilterIds || categoryFilterIds.has(String(poi.categoryId || '')))
                              && (poiOwnerFilter !== 'mine' || poi.userId === myUserId)
                              && (poiStatusFilter === 'all' || (poiStatusFilter === 'active' ? poi.isActive !== false : poi.isActive === false));
                          }).length} / {pois.length} POI gösteriliyor</small>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Kullanıcının kendi isteği: "sağdaki menüden güzergahlar listelensin oradan
                seçince de simülasyon başlatılabilsin" — haritada bir hatta doğrudan tıklamak
                yöneticiler için hat DÜZENLEME moduna girer (bkz. startRoutePathEdit, kasıtlı
                olarak değiştirilmedi — mevcut düzenleme alışkanlığını bozmamak için), bu yüzden
                "sadece bakmak/simülasyon başlatmak" isteyen HERKES (yönetici olsun olmasın)
                için ayrı, tıklaması hattı düzenlemeye SOKMAYAN bir liste. */}
            {getPermissions().canViewRoutes && routes.length > 0 && (
              <div className="shapes-category">
                <button
                  type="button"
                  className="shapes-category-title shapes-category-title-toggle"
                  onClick={() => toggleCategoryCollapse('Routes')}
                  aria-expanded={!collapsedCategories.has('Routes')}
                >
                  <span className="shapes-category-dot" style={{ background: '#2563eb' }} />
                  🚌 Güzergahlar ({routes.length})
                  <span className="shapes-category-arrow">{collapsedCategories.has('Routes') ? '▸' : '▾'}</span>
                </button>
                {!collapsedCategories.has('Routes') && (
                  <ul className="shapes-list">
                    {routes.map((route) => {
                      const place = [route.neighborhood, route.district, route.province].filter(Boolean).join(', ');
                      return (
                        <li key={route.id} className="shapes-list-item">
                          <button
                            className="shapes-item-button"
                            onClick={() => {
                              // Kullanıcının kendi isteği: "sağdaki çizilenler kısmından
                              // güzergaha tıklayınca ... sanki haritadan güzergaha tıklamışız
                              // gibi olsun" — yöneticiler için AYNI davranış: hat düzenleme
                              // moduna girer (startRoutePathEdit); yönetici olmayanlar için
                              // ise banner (setFocusedRouteId). İkisinde de aşağıdaki
                              // [stops, editingRoutePathId] / [stops, routes, focusedRouteId]
                              // effect'leri durakların extent'ine bir kez zoom-fit yapıyor.
                              // Kullanıcının kendi isteği (3 Eylül): "sağdan çizilenler kısmında
                              // güzergahlar sıralanıyor, oradan herhangi bir güzergaha tıklayınca
                              // geri kalan her şey silikleşsin ve o güzergah öne çıksın." — artık
                              // yönetici olsun olmasın HERKES için odak modu açılıyor (eskiden
                              // yöneticiyi doğrudan hat DÜZENLEME moduna sokuyordu; düzenleme
                              // hâlâ haritada hattın kendisine tıklayarak veya odak banner'ından
                              // erişilebilir durumda).
                              if (focusedRouteId === route.id) clearRouteFocus();
                              else focusRoute(route.id);
                            }}
                            title="Bu güzergaha odaklan, simülasyon başlat/takip et"
                          >
                            <span className="shapes-item-dot" style={{ background: route.color || '#2563eb' }} />
                            <span className="shapes-item-text">
                              <span className="shapes-item-number">
                                {route.name}
                                {route.isPaused && (
                                  <span className="shapes-item-private-badge" title="Duraklatıldı">⏸</span>
                                )}
                                {simulationRunningState[route.id] && (
                                  <span className="transit-route-select-live" title="Simülasyon şu an çalışıyor"> ● canlı</span>
                                )}
                              </span>
                              {place && <span className="shapes-item-place">{place}</span>}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {DRAW_TYPES.map((type) => {
              const items = drawnItems.filter((item) => item.mode === type.mode);
              const visible = items.filter(
                (item) =>
                  (!selectedProvince || item.province === selectedProvince) &&
                  (!selectedCategoryId || item.categoryId === selectedCategoryId)
              );
              const isCollapsed = collapsedCategories.has(type.mode);
              return (
                <div key={type.mode} className={`shapes-category${layerVisibility[type.mode] ? '' : ' shapes-category-hidden'}`}>
                  <button
                    type="button"
                    className="shapes-category-title shapes-category-title-toggle"
                    onClick={() => toggleCategoryCollapse(type.mode)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className="shapes-category-dot" style={{ background: TYPE_COLORS[type.mode] }} />
                    {type.label} ({visible.length})
                    <span className="shapes-category-arrow">{isCollapsed ? '▸' : '▾'}</span>
                  </button>
                  {isCollapsed ? null : !layerVisibility[type.mode] ? (
                    <p className="shapes-empty">Haritada gizli</p>
                  ) : visible.length === 0 ? (
                    <p className="shapes-empty">Yok</p>
                  ) : (
                    <ul className="shapes-list">
                      {visible.map((item) => {
                        // Görev #70 (kullanıcının kendi isteği): "kısmi izinli ise deaktif,
                        // hiç izni yok ise hiç görünmesin" — düzenleme HİÇBİR şekilde mümkün
                        // değilse (canEdit false) kalem butonunu tamamen kaldırıyoruz; silme
                        // izni yoksa Sil butonu deaktif kalıyor (görünür ama tıklanamaz, çünkü
                        // "izin yok" ile "geçici olarak işlem sürüyor" durumları farklı — deaktif
                        // buton kullanıcıya "bu işlem senin için kapalı" mesajını daha net verir).
                        const { canEdit, deleteState } = getItemPermissions(item);
                        return editingKey === item.key ? (
                          <ItemEditRow
                            key={item.key}
                            item={item}
                            colorPresets={effectiveColorPresets}
                            categories={categories}
                            onSave={(name, color, categoryId, isPrivate) =>
                              saveAttributesEdit(item, name, color, categoryId, isPrivate)
                            }
                            onCancel={() => setEditingKey(null)}
                          />
                        ) : (
                          <li
                            key={item.key}
                            className={`shapes-list-item${
                              selectedKey === item.key ? ' shapes-list-item-active' : ''
                            }`}
                            onMouseEnter={() => handleItemMouseEnter(item)}
                            onMouseLeave={() => handleItemMouseLeave(item)}
                          >
                            <button className="shapes-item-button" onClick={() => handleItemClick(item)}>
                              <span
                                className="shapes-item-dot"
                                style={{ background: item.color || TYPE_COLORS[item.mode] }}
                              />
                              <span className="shapes-item-text">
                                <span className="shapes-item-number">
                                  {item.name ? item.name : `#${item.id}`}
                                  {item.isPrivate && (
                                    <span className="shapes-item-private-badge" title="Sadece bana görünüyor">
                                      🔒
                                    </span>
                                  )}
                                </span>
                                {item.place && <span className="shapes-item-place">{item.place}</span>}
                              </span>
                            </button>
                            {canEdit && (
                              <button
                                className="shapes-edit-button"
                                title="Düzenle"
                                onClick={() => setEditingKey(item.key)}
                              >
                                ✎
                              </button>
                            )}
                            {deleteState !== 'hidden' && (
                              <button
                                className="shapes-delete-button"
                                disabled={deleteState === 'disabled' || deletingKeys.has(item.key)}
                                title={deleteState === 'disabled' ? 'Bu şekli silme yetkin yok (sadece kendi çizdiklerini silebilirsin).' : undefined}
                                onClick={() => confirmDelete(item)}
                              >
                                {deletingKeys.has(item.key) ? '...' : 'Sil'}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
              </>
            )}
          </div>
        )}
      </div>

      {selectedItem && (() => {
        const isEditing = editingGeometryKey === selectedItem.key;
        const feature = getFeaturesMap().get(selectedItem.key);
        const category = selectedItem.categoryId ? categories.find((c) => c.id === selectedItem.categoryId) : null;
        // Görev #70: bilgi kartındaki Düzenle/Sil de Çizilenler listesiyle AYNI kurala uyuyor.
        const itemPerms = getItemPermissions(selectedItem);

        return (
          <FeatureInfoCard
            key={selectedItem.key}
            title={selectedItem.name || `${selectedItem.label} #${selectedItem.id}`}
            color={selectedItem.color || TYPE_COLORS[selectedItem.mode]}
            onClose={isEditing ? cancelEditingGeometry : () => selectFeature(null)}
            rows={
              isEditing
                ? [{ label: 'İpucu', value: 'Köşeleri sürükleyin/elle girin.' }]
                : [
                    { label: 'Tip', value: selectedItem.label },
                    { label: 'Konum', value: describeGeometry(selectedItem.mode, feature?.getGeometry()) },
                    ...(selectedItem.place ? [{ label: 'Yer', value: selectedItem.place }] : []),
                    ...(category ? [{ label: 'Kategori', value: category.name }] : []),
                    { label: 'Eklendi', value: formatDateTime(selectedItem.createdDate) },
                  ]
            }
            actions={
              isEditing
                ? [
                    {
                      label: savingGeometry ? 'Kaydediliyor…' : '✓ Kaydet',
                      variant: 'primary',
                      disabled: savingGeometry,
                      onClick: saveEditedFeature,
                    },
                    { label: 'Vazgeç', disabled: savingGeometry, onClick: cancelEditingGeometry },
                  ]
                : [
                    { label: '🔭 Yakınlaş', onClick: () => focusOnItem(selectedItem) },
                    ...(itemPerms.canEdit
                      ? [{ label: '✏️ Düzenle', onClick: () => startEditingGeometry(selectedItem) }]
                      : []),
                    ...(itemPerms.deleteState !== 'hidden'
                      ? [
                          {
                            label: 'Sil',
                            variant: 'danger',
                            disabled: itemPerms.deleteState === 'disabled',
                            title:
                              itemPerms.deleteState === 'disabled'
                                ? 'Bu şekli silme yetkin yok (sadece kendi çizdiklerini silebilirsin).'
                                : undefined,
                            onClick: () => confirmDelete(selectedItem),
                          },
                        ]
                      : []),
                  ]
            }
          >
            {isEditing && (
              <>
                <AttributesEditFields
                  name={editName}
                  onNameChange={setEditName}
                  color={editColor}
                  onColorChange={setEditColor}
                  colorPresets={effectiveColorPresets}
                  categoryId={editCategoryId}
                  onCategoryChange={setEditCategoryId}
                  categories={categories}
                />
                <VertexCoordinateEditor
                  key={selectedItem.key}
                  feature={feature}
                  mode={selectedItem.mode}
                  selectedIndex={selectedVertexIndex}
                  onSelectIndex={setSelectedVertexIndex}
                />
              </>
            )}
          </FeatureInfoCard>
        );
      })()}

      {analysisSelected && (
        <FeatureInfoCard
          key="analysis"
          title="Envanter Analizi Poligonu"
          color="#f59e0b"
          onClose={() => setAnalysisSelected(false)}
          rows={[
            { label: 'Tip', value: 'Geçici poligon (kaydedilmez)' },
            {
              label: 'Konum',
              value: describeGeometry('Polygon', analysisSourceRef.current?.getFeatures()[0]?.getGeometry()),
            },
          ]}
          actions={[
            { label: '🔭 Yakınlaş', onClick: zoomToAnalysisFeature },
            { label: 'Kaldır', variant: 'danger', onClick: clearAnalysis },
          ]}
        />
      )}

      {selectedPoi != null && (() => {
        // Hoca ödevi (POI): "Eklenen POI'ye tıklandığında bilgi paneli açılmalıdır."
        const poi = pois.find((p) => p.id === selectedPoi);
        if (!poi) return null;
        const isPoiOwner = poi.userId === myUserId;
        const canDelete = isAdmin() || (isPoiOwner && (!viewingSharedMap || myShareSettings?.canDelete));
        // Not: isAdmin() burada zaten canDelete'i doğrudan true yapıyor (sahiplikten
        // bağımsız) — "adminler her şeyi yapabilecek" isteğiyle tutarlı.
        const canEdit = isAdmin() || (isPoiOwner && getPermissions().canManagePoi && poi.isActive !== false);
        const disabledEditReason = poi.isActive === false
          ? 'Bu POI yönetici tarafından duraklatıldığı için düzenlenemez.'
          : 'Başka bir kullanıcı tarafından eklenen POI noktasını düzenleyemezsiniz.';
        const isEditingPoi = editingPoiId === poi.id;
        const poiFeature = poiSourceRef.current?.getFeatures().find((item) => item.get('poiId') === poi.id);
        // Kullanıcının kendi isteği: rol bazlı detay seviyesi.
        //  - full (Admin her POI'de, Operatör KENDİ POI'sinde): bugüne kadarki tam liste.
        //  - medium (Operatör BAŞKASININ POI'sinde): durum/kategori/konum/koordinat var ama
        //    not/ekleyen/eklendi YOK — "kimin eklediğini görmesinler" isteği.
        //  - minimal (düz Kullanıcı, herkesin POI'sinde): sadece kategori/konum + aşağıda
        //    (children'da) günlük açık/kapalı listesi — koordinat/durum/ekleyen/not/tarih yok.
        const isFullDetail = isAdmin() || (isPoiOwner && getPermissions().canManagePoi);
        const isMediumDetail = !isFullDetail && getPermissions().canManagePoi;
        return (
          <FeatureInfoCard
            key={`poi-${poi.id}`}
            title={poi.name}
            color={poi.isActive === false ? '#64748b' : isPoiOwner ? '#2563eb' : '#db2777'}
            /* Kullanıcının isteği (8. tur): kart normal kullanıcı görünümünde ("kart gereksiz
               sağa sola gitmiş") aşırı genişti — sebebi children (aşağıdaki günlük açık/kapalı
               özeti) varsa .feature-info-card-has-content sınıfının kartı 680px'e kadar
               genişletmesiydi, bu genişlik aslında sadece düzenleme formları (VertexCoordinateEditor
               vb.) için gerekliydi. Düzenleme modunda DEĞİLKEN (children sadece PoiScheduleSummary
               ise) narrowContent ile daha dar bir genişliğe sabitliyoruz. */
            narrowContent={!isEditingPoi}
            onClose={() => {
              if (isEditingPoi) cancelEditingPoi();
              setSelectedPoi(null);
            }}
            rows={isEditingPoi ? [] : (() => {
              const coordinates = poiFeature?.getGeometry()?.getCoordinates();
              const lonLat = coordinates ? toLonLat(coordinates) : null;
              if (isFullDetail) {
                return [
                  { label: 'Durum', value: poi.isActive === false ? 'Duraklatılmış' : isPoiOwner ? 'Aktif · Benim POI’im' : 'Aktif' },
                  { label: 'Kategori', value: poi.categoryName || 'Kategorisiz' },
                  { label: 'Mesai Saatleri', value: groupPoiSchedule(poi.schedule).map((group) => `${group.label} ${group.value}`).join(' · ') || poi.workingHours || 'Belirtilmemiş' },
                  ...(poi.scheduleExceptions?.length ? [{ label: 'Özel Günler', value: `${poi.scheduleExceptions.length} tarih tanımlı` }] : []),
                  { label: 'Konum', value: [poi.district, poi.province].filter(Boolean).join(', ') || 'Belirtilmemiş' },
                  { label: 'Koordinat', value: lonLat ? `${lonLat[1].toFixed(6)}, ${lonLat[0].toFixed(6)}` : 'Belirtilmemiş' },
                  { label: 'Not', value: poi.note || 'Not eklenmemiş' },
                  { label: 'Ekleyen', value: poi.addedByUsername || 'Bilinmiyor' },
                  { label: 'Eklendi', value: formatDateTime(poi.createdDate) },
                ];
              }
              if (isMediumDetail) {
                return [
                  { label: 'Durum', value: poi.isActive === false ? 'Duraklatılmış' : 'Aktif' },
                  { label: 'Kategori', value: poi.categoryName || 'Kategorisiz' },
                  { label: 'Konum', value: [poi.district, poi.province].filter(Boolean).join(', ') || 'Belirtilmemiş' },
                  { label: 'Koordinat', value: lonLat ? `${lonLat[1].toFixed(6)}, ${lonLat[0].toFixed(6)}` : 'Belirtilmemiş' },
                ];
              }
              return [
                { label: 'Kategori', value: poi.categoryName || 'Kategorisiz' },
                { label: 'Konum', value: [poi.district, poi.province].filter(Boolean).join(', ') || 'Belirtilmemiş' },
              ];
            })()}
            actions={
              isEditingPoi
                ? [
                    { label: 'Vazgeç', onClick: cancelEditingPoi, disabled: savingPoi },
                    { label: savingPoi ? 'Kaydediliyor…' : 'Kaydet', variant: 'primary', onClick: () => saveEditedPoi(poi), disabled: savingPoi },
                  ]
                : [
                    ...(canEdit
                      ? [{ label: '✏️ Düzenle', onClick: () => startEditingPoi(poi) }]
                      : getPermissions().canManagePoi
                        ? [{ label: '✏️ Düzenle', disabled: true, title: disabledEditReason }]
                        : []),
                    ...(canDelete ? [{ label: 'Sil', variant: 'danger', onClick: () => deletePoi(poi.id) }] : []),
                  ]
            }
          >
            {(() => {
              // Not: FeatureInfoCard `children && <div className="feature-info-card-content">`
              // ile sarıyor — iki ayrı JSX ifadesini yan yana koyarsak (biri hep false olsa
              // bile) React bunları bir DİZİYE çevirir ve dizi HER ZAMAN truthy olduğu için
              // boş bir içerik div'i sızardı. Bu yüzden TEK bir ifade döndürüyoruz, hiçbiri
              // uymuyorsa gerçekten null (FeatureInfoCard hiç içerik div'i render etmesin).
              if (isEditingPoi && poiFeature) {
                return (
              <div className="poi-edit-fields">
                <label>
                  İsim
                  <input value={editPoiName} onChange={(e) => setEditPoiName(e.target.value)} />
                </label>
                <div className="poi-edit-field">
                  <span>Kategori</span>
                  <SearchableCategorySelect
                    options={buildPoiCategoryOptions(poiCategories)}
                    value={editPoiCategoryId}
                    onChange={(next) => setEditPoiCategoryId(next ? Number(next) : '')}
                    ariaLabel="POI düzenleme kategorisi ara ve seç"
                  />
                </div>
                <div className="poi-edit-field">
                  <span>Mesai Saatleri</span>
                  <PoiScheduleEditor
                    value={editPoiSchedule}
                    onChange={setEditPoiSchedule}
                    legacyText={!poi.schedule?.length ? poi.workingHours : null}
                  />
                </div>
                <PoiScheduleExceptionEditor value={editPoiScheduleExceptions} onChange={setEditPoiScheduleExceptions} />
                <label>
                  Not
                  <textarea rows={3} maxLength={2000} value={editPoiNote} onChange={(e) => setEditPoiNote(e.target.value)} placeholder="POI hakkında not" />
                </label>
                <div className="poi-edit-field">
                  <span>İkon (opsiyonel)</span>
                  <IconPicker value={editPoiIcon} onChange={setEditPoiIcon} allowEmpty emptyLabel="Kategoriden gelsin" />
                </div>
                <VertexCoordinateEditor key={`poi-edit-${poi.id}`} feature={poiFeature} mode="Point" />
              </div>
                );
              }
              if (!isFullDetail) {
                return (
                  <PoiScheduleSummary
                    schedule={poi.schedule}
                    scheduleExceptions={poi.scheduleExceptions}
                    legacyText={poi.workingHours}
                  />
                );
              }
              return null;
            })()}
          </FeatureInfoCard>
        );
      })()}

      {selectedStop != null && (() => {
        // Hoca ödevi (Akıllı Ulaşım Modülü): "Duraklara tıklandığında bilgi kutucuğu açılmalıdır."
        // POI'nin selectedPoi bloğuyla AYNI desen — Google Maps'teki durak bilgi balonu gibi.
        const stop = stops.find((s) => s.id === selectedStop);
        if (!stop) return null;
        const isEditingStop = editingStopId === stop.id;
        return (
          <FeatureInfoCard
            key={`stop-${stop.id}`}
            title={stop.name}
            color={stop.routeColor || '#2563eb'}
            narrowContent={!isEditingStop}
            onClose={() => {
              if (isEditingStop) cancelEditingStop();
              setSelectedStop(null);
            }}
            rows={isEditingStop ? [] : [
              { label: 'Güzergah', value: stop.routeName },
              { label: 'Sıra', value: `${stop.sortOrder + 1}. durak` },
              { label: 'Eklendi', value: formatDateTime(stop.createdDate) },
              ...(stop.addedByUsername ? [{ label: 'Ekleyen', value: stop.addedByUsername }] : []),
            ]}
            actions={
              isEditingStop
                ? [
                    { label: 'Vazgeç', onClick: cancelEditingStop, disabled: savingStop },
                    { label: savingStop ? 'Kaydediliyor…' : 'Kaydet', variant: 'primary', onClick: () => saveEditedStop(stop), disabled: savingStop },
                  ]
                : getPermissions().canManageRoutes
                  ? [
                      { label: '✏️ Düzenle', onClick: () => startEditingStop(stop) },
                      {
                        label: 'Sil',
                        variant: 'danger',
                        onClick: () => setPendingConfirm({
                          title: `"${stop.name}" durağı silinsin mi?`,
                          message: 'Bu işlem geri alınamaz.',
                          confirmLabel: 'Evet, sil',
                          onConfirm: () => deleteStop(stop.id),
                        }),
                      },
                    ]
                  : [{ label: '🔭 Yakınlaş', onClick: () => zoomToStop(stop) }]
            }
          >
            {isEditingStop && (
              <div className="poi-edit-fields">
                <label>
                  İsim
                  <input value={editStopName} onChange={(e) => setEditStopName(e.target.value)} />
                </label>
                <div className="poi-edit-field">
                  <span>Güzergah</span>
                  <select
                    className="attribute-popup-select"
                    value={editStopRouteId}
                    onChange={(e) => setEditStopRouteId(e.target.value ? Number(e.target.value) : '')}
                    aria-label="Durak düzenleme güzergahı"
                  >
                    {routes.map((route) => (
                      <option key={route.id} value={route.id}>{route.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </FeatureInfoCard>
        );
      })()}

      <div className="draw-toolbar">
        {DRAW_TYPES.filter((type) => getPermissions()[type.permKey]).map((type) => {
          const ToolIcon = TYPE_ICONS[type.mode];
          return (
            <button
              key={type.mode}
              className={`draw-button${drawMode === type.mode ? ' draw-button-active' : ''}`}
              onClick={() => toggleDrawMode(type.mode)}
              disabled={!!editingGeometryKey}
              title={type.label}
              aria-pressed={drawMode === type.mode}
            >
              <span className="draw-button-icon">
                <ToolIcon color={drawMode === type.mode ? '#fff' : TYPE_COLORS[type.mode]} />
              </span>
              {type.label}
            </button>
          );
        })}
        {getPermissions().canUseAnalysisTool && (
          <>
            <span className="draw-toolbar-separator" />
            <button
              className={`draw-button draw-button-analysis${analysisToolActive ? ' draw-button-analysis-active' : ''}`}
              onClick={toggleAnalysisTool}
              disabled={!!editingGeometryKey}
              title="Envanter Analizi"
              aria-pressed={analysisToolActive}
            >
              <span className="draw-button-icon">
                <AnalysisToolIcon color={analysisToolActive ? '#fff' : '#f59e0b'} />
              </span>
              Envanter Analizi
            </button>
            <button
              className={`draw-button draw-button-heatmap${heatmapActive ? ' draw-button-heatmap-active' : ''}`}
              onClick={toggleHeatmap}
              title="Noktaların yoğunluğuna göre GeoServer üzerinden Isı Haritası üretir"
              aria-pressed={heatmapActive}
            >
              <span className="draw-button-icon">🔥</span>
              Isı Haritası Analizi{heatmapLoading ? '…' : ''}
            </button>
          </>
        )}
        {/* Kullanıcının kendi isteği: Konum Analizi artık İZİN GEREKTİRMEDEN herkese (her role)
            açık — Envanter Analizi ve Isı Haritası Analizi'nin aksine canUseAnalysisTool
            gate'inin DIŞINDA, koşulsuz gösteriliyor. */}
        <span className="draw-toolbar-separator" />
        <button
          className={`draw-button draw-button-analysis${locationAnalysisActive ? ' draw-button-analysis-active' : ''}`}
          onClick={toggleLocationAnalysisTool}
          disabled={!!editingGeometryKey}
          title="Seçili alan ve ağırlıklı kriterlere göre POI ısı haritası üretir"
          aria-pressed={locationAnalysisActive}
        >
          <span className="draw-button-icon">📊</span>
          Konum Analizi
        </button>
        {getPermissions().canManagePoi && (!viewingSharedMap || myShareSettings?.canDraw || isAdmin()) && (
          <>
            {(DRAW_TYPES.some((type) => getPermissions()[type.permKey]) || getPermissions().canUseAnalysisTool) && (
              <span className="draw-toolbar-separator" />
            )}
            <button
              className={`draw-button draw-button-poi${poiToolActive ? ' draw-button-poi-active' : ''}`}
              onClick={togglePoiTool}
              disabled={!!editingGeometryKey}
              title="Haritaya yeni POI (ilgi noktası) ekle"
              aria-pressed={poiToolActive}
            >
              <span className="draw-button-icon">📍</span>
              POI Ekle
            </button>
          </>
        )}
        {/* Hoca ödevi (Akıllı Ulaşım Modülü): "Operatör için haritada 'Durak Ekle' (Point) aracı
            oluşturun." — NOT: "bu yeni rolleri eklerken daha önce yapılan POI ve Harita Çizim
            araçlarını bu roldekiler ekleme işlemlerini yapmasınlar yetkileri olmasın" — bu yüzden
            canManagePoi/DRAW_TYPES'tan TAMAMEN bağımsız, sadece canManageRoutes koşuluna bağlı. */}
        {getPermissions().canManageRoutes && (
          <>
            <span className="draw-toolbar-separator" />
            <button
              className={`draw-button draw-button-poi${stopToolActive ? ' draw-button-poi-active' : ''}`}
              onClick={toggleStopTool}
              disabled={!!editingGeometryKey}
              title={lockedStopRouteId ? 'Haritaya bu güzergaha durak ekle' : 'Haritaya yeni durak ekle'}
              aria-pressed={stopToolActive}
            >
              <span className="draw-button-icon">🚏</span>
              Durak Ekle
            </button>
          </>
        )}
        <span className="draw-toolbar-separator" />
        <button
          className={`draw-button draw-button-focus${flyAnimationEnabled ? ' draw-button-focus-active' : ''}`}
          onClick={toggleFlyAnimation}
          title="Öğeye tıklayınca sinematik uçuş animasyonu"
          aria-pressed={flyAnimationEnabled}
        >
          <span className={`focus-switch${flyAnimationEnabled ? ' focus-switch-on' : ''}`}>
            <span className="focus-switch-knob" />
          </span>
          Odak
        </button>
        {statusMessage && <span className="draw-status">{statusMessage}</span>}
      </div>

      {heatmapActive && heatmapImageError && (
        // Kullanıcının kendi tespiti: eskiden lejant görüntü gerçekten yüklenip
        // yüklenmediğine bakmadan çiziliyordu — GeoServer bir hata dönse bile "her şey
        // yolunda" görünüyordu. Artık ImageWMS'in 'imageloaderror' olayını yakalayınca
        // lejant yerine BURADA net bir hata kutusu gösteriyoruz.
        <div className="heatmap-legend heatmap-legend-error">
          <div className="heatmap-legend-title">Isı Haritası yüklenemedi</div>
          <div className="heatmap-legend-error-text">
            GeoServer'da "heatmap" style'ı kurulu mu? (docs/geoserver-sql-view-ve-heatmap.md, 3. bölüm)
          </div>
        </div>
      )}

      {heatmapActive && !heatmapImageError && !heatmapLoading && (
        // Hoca ödevi (2. tur): "Ekrana Isı Haritası Lejantı ekleyin (sağ alt köşede yer
        // alabilir). Lejant üzerinde renklerin ne anlama geldiği (0 ile 1 arasındaki yoğunluk
        // değerleri) açıkça gösterilmelidir." HEATMAP_COLOR_STOPS ile GeoServer'daki SLD'nin
        // AYNI renk duraklarını kullandığından emin olunmalı (bkz. o sabitin üstündeki not).
        // Sadece görüntü GERÇEKTEN yüklendiyse gösteriliyor (bkz. yukarıdaki hata kutusu).
        <div className="heatmap-legend">
          <div className="heatmap-legend-title">Isı Haritası Yoğunluğu</div>
          <div
            className="heatmap-legend-bar"
            style={{
              background: `linear-gradient(to right, ${HEATMAP_COLOR_STOPS.map(
                (s) => `${s.color} ${s.offset * 100}%`
              ).join(', ')})`,
            }}
          />
          <div className="heatmap-legend-labels">
            <span>0</span>
            <span>1</span>
          </div>
        </div>
      )}

      {(analysisToolActive || analysisResult) && (
        <div className="analysis-panel">
          <div className="analysis-panel-title">Envanter Analizi</div>
          {analysisLoading && <p className="analysis-panel-hint">Hesaplanıyor…</p>}
          {!analysisLoading && analysisResult && (
            <>
              <ul className="analysis-panel-list">
                <li>Nokta: <strong>{analysisResult.pointCount}</strong></li>
                <li>
                  Çizgi: <strong>{analysisResult.lineCount}</strong>
                  {analysisBreakdown.lines.length > 0 && (
                    <span className="analysis-panel-sub"> · {formatLength(analysisBreakdown.totalLineLength)}</span>
                  )}
                </li>
                <li>
                  Alan: <strong>{analysisResult.polygonCount}</strong>
                  {analysisBreakdown.polygons.length > 0 && (
                    <span className="analysis-panel-sub"> · {formatArea(analysisBreakdown.totalArea)}</span>
                  )}
                </li>
                <li className="analysis-panel-total">
                  Toplam: <strong>{analysisResult.totalCount}</strong>
                </li>
              </ul>

              {analysisHasOverlap && (
                <p className="analysis-panel-hint">
                  ⚠️ Bazı alanlar üst üste biniyor — toplam alan çakışan bölgeyi tekrar saymadan hesaplandı.
                </p>
              )}

              {(analysisBreakdown.lines.length > 0 || analysisBreakdown.polygons.length > 0) && (
                <ul className="analysis-panel-detail-list">
                  {analysisBreakdown.lines.map((l) => (
                    <li key={`line-${l.id}`}>
                      <span>Çizgi #{l.id}</span>
                      <span>{l.length != null ? formatLength(l.length) : '—'}</span>
                    </li>
                  ))}
                  {analysisBreakdown.polygons.map((p) => (
                    <li key={`polygon-${p.id}`}>
                      <span>Alan #{p.id}</span>
                      <span>{p.area != null ? formatArea(p.area) : '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {!analysisLoading && !analysisResult && analysisToolActive && (
            <p className="analysis-panel-hint">Haritada geçici bir poligon çizin.</p>
          )}
          <button className="analysis-panel-clear" onClick={clearAnalysis}>
            Temizle
          </button>
        </div>
      )}

      {(locationAnalysisActive || locationAnalysisResultActive) && (
        <LocationAnalysisPanel
          areaMode={locationAnalysisAreaMode}
          onAreaModeChange={(mode) => {
            setLocationAnalysisAreaMode(mode);
            setLocationAnalysisDrawing(false);
          }}
          provinces={locationAnalysisProvinces}
          province={locationAnalysisProvince}
          onProvinceChange={setLocationAnalysisProvince}
          hasPolygon={hasLocationPolygon}
          drawingPolygon={locationAnalysisDrawing}
          onDrawPolygon={() => setLocationAnalysisDrawing((current) => !current)}
          onClearPolygon={clearLocationAnalysisPolygon}
          categories={poiCategories}
          criteria={locationAnalysisCriteria}
          onCriteriaChange={setLocationAnalysisCriteria}
          onStart={startLocationAnalysis}
          onClear={clearLocationAnalysis}
          onClose={() => {
            // Kullanıcının kendi isteği (8. tur): "konum analizinde çarpıya basıldıysa
            // poligon gene silinsin" — kapatma artık tam bir sıfırlama: çizilmiş poligon,
            // varsa sonuç (ısı haritası + POI izolasyonu) ve panel hepsi birlikte temizlenir.
            clearLocationAnalysisPolygon();
            clearLocationAnalysis();
            setLocationAnalysisActive(false);
            setLocationAnalysisDrawing(false);
          }}
          resultActive={locationAnalysisResultActive}
          matchedCount={locationAnalysisMatchedCount}
          matchedBreakdown={locationAnalysisMatchedBreakdown}
          topSpots={locationAnalysisTopSpots}
          selectedSpotIndex={selectedHouseSpotIndex}
          onSpotSelect={(index) => (selectedHouseSpotIndex === index ? setSelectedHouseSpotIndex(null) : focusHouseSpot(index))}
        />
      )}

      {pendingDraw && (
        <AttributePopup
          mode={pendingDraw.mode}
          typeLabel={pendingDraw.typeInfo.label}
          wkt={pendingDraw.wkt}
          analysisApiBase={ANALYSIS_API_BASE}
          categoryApiBase={CATEGORY_API_BASE}
          colorPresets={effectiveColorPresets}
          categories={categories}
          onCategoriesChanged={reloadCategories}
          onConfirm={confirmPendingDraw}
          onCancel={cancelPendingDraw}
        />
      )}

      {categoryManagerOpen && (
        <CategoryManagerModal
          categories={categories}
          categoryApiBase={CATEGORY_API_BASE}
          onClose={() => setCategoryManagerOpen(false)}
          onChanged={reloadCategories}
        />
      )}

      <div className="session-controls">
        <div
          className={`countdown${isLowTime ? ' countdown-warning' : ''}`}
          title={`Kalan oturum süresi: ${formatTime(remainingSeconds)}`}
          aria-label={`Kalan oturum süresi ${formatTime(remainingSeconds)}`}
        >
          <span aria-hidden="true">⏱</span>
          {formatTime(remainingSeconds)}
        </div>
        <span className="session-username" title="Giriş yapan kullanıcı">
          👤 {getAuth()?.username}
        </span>
        {!isAdmin() && getPermissions().canManageCategories && (
          <button
            className="category-manager-button"
            title="Kategori Yönetimi"
            aria-label="Kategori Yönetimi"
            onClick={() => setCategoryManagerOpen(true)}
          >
            🏷️
          </button>
        )}
        {isAdmin() && (
          <button className="admin-panel-button" onClick={() => navigate('/admin')} title="Yönetim Paneli" aria-label="Yönetim Paneli">
            🛠️ Yönetim Paneli
          </button>
        )}
        {isAdmin() && (
          <button className="trash-open-button" onClick={() => setTrashOpen(true)} title="Çöp Kutusu" aria-label="Çöp Kutusu">
            🗑️
          </button>
        )}
        <button className="settings-button" onClick={() => navigate('/settings')} title="Ayarlar" aria-label="Ayarlar">
          ⚙️
        </button>
        <button className="logout-button" onClick={handleLogout} title="Çıkış Yap">
          <LogoutIcon />
        </button>
      </div>

      {/* Hocanın Coğrafi Yetki görevi: sınır dışına çizim denemesi uyarısı — 3 saniye sonra
          kendiliğinden kayboluyor (bkz. showGeoWarning). */}
      {geoWarning && <div className="geo-restriction-warning">⚠️ {geoWarning}</div>}

      {trashOpen && <TrashPanel onClose={() => setTrashOpen(false)} onRestore={handleTrashRestore} />}

      {/* Görev #74: dişliye basınca artık burada, ekranın ortasında açılan modal —
          eskiden Haritalarım listesinin içindeki akordeondu (bkz. yukarıdaki kaldırılan blok). */}
      {mapSettingsOpenId != null &&
        (() => {
          const settingsMap = maps.find((m) => m.id === mapSettingsOpenId);
          if (!settingsMap) return null;
          const settingsShares = mapShares.filter(
            (s) => s.mapId === settingsMap.id && s.status !== 'Declined' && s.status !== 'Removed'
          );
          return (
            <MapSettingsModal
              map={settingsMap}
              shares={settingsShares}
              canDeleteMap={maps.length > 1}
              duplicating={duplicatingMap}
              activity={mapActivity}
              activityLoading={activityLoading}
              onOpenActivity={() => fetchMapActivity(settingsMap.id)}
              geoRestrictions={mapGeoRestrictions}
              onPauseShare={confirmPauseShare}
              onRemoveShare={removeShare}
              onOpenGeoRestriction={(target) => {
                setMapSettingsOpenId(null);
                setGeoRestrictTarget({
                  mapId: settingsMap.id,
                  mapName: settingsMap.name,
                  type: target.type,
                  id: target.id,
                  label: target.label,
                  returnTo: 'settings',
                });
              }}
              onSave={(payload) => saveMapSettings(settingsMap, payload)}
              onDuplicate={() => setPendingConfirm({
                title: 'Haritayı çoğalt',
                message: `“${settingsMap.name}” haritasının açıklaması ve çizimleriyle yeni bir kopyası oluşturulacak. Paylaşım alıcıları kopyalanmaz.`,
                confirmLabel: 'Çoğalt',
                danger: false,
                onConfirm: () => duplicateMap(settingsMap.id),
              })}
              onSetDefault={() => setMapAsDefault(settingsMap)}
              onOpenShare={() => {
                setMapSettingsOpenId(null);
                setShareModalMapId(settingsMap.id);
                fetchMapShares(settingsMap.id);
              }}
              onDelete={() => {
                setMapSettingsOpenId(null);
                deleteMap(settingsMap);
              }}
              onClose={() => setMapSettingsOpenId(null)}
            />
          );
        })()}

      {mapTrashOpen && (
        <MapTrashModal
          deletedMaps={deletedMaps}
          loading={mapTrashLoading}
          onRestore={restoreDeletedMap}
          onPermanentDelete={permanentDeleteMap}
          onClose={() => setMapTrashOpen(false)}
        />
      )}

      {profileCardUsername && (
        <UserProfileCard
          username={profileCardUsername}
          data={profileCardData}
          loading={profileCardLoading}
          myMaps={maps}
          onInvite={(mapId, username) => {
            setProfileCardUsername(null);
            inviteToMap(mapId, username);
          }}
          onClose={() => setProfileCardUsername(null)}
        />
      )}

      {shareModalMapId != null && (
        <div className="attribute-popup-overlay" onClick={() => setShareModalMapId(null)}>
          <div className="attribute-popup map-share-popup" onClick={(e) => e.stopPropagation()}>
            {/* Kullanıcının kendi isteği (harita şeridi polish turu): "ismi kişi ekle / paylaş
                olsun" + "harita aktivite/loglarını paylaş yerinden görebiliyoruz çok saçma" —
                Aktivite artık burada değil, Harita Ayarları modalında (bkz. MapSettingsModal
                'onOpenActivity' prop'u) — bu modal artık SADECE davet/paylaşım yönetimi, tek
                bir görünüm, sekmeye gerek kalmadı. */}
            <div className="attribute-popup-title">
              🔗 Kişi Ekle / Paylaş — {maps.find((m) => m.id === shareModalMapId)?.name || ''}
            </div>

            <>
                {/* Görev #78 (admin: harita paylaşım politikası): "yeni paylaşım BAŞLATMA"
                    (kişi davet etme / role paylaşma) artık ayrı bir izne bağlı (ShareMap) —
                    bu izin yoksa kutucukları hiç göstermiyoruz (backend zaten 403 dönerdi,
                    burada kullanıcı hiç deneyip hata almasın diye baştan gizliyoruz). VAR OLAN
                    paylaşımları yönetmek (aşağıdaki liste: Duraklat/Kaldır/Ayarlar) bilinçli
                    olarak bu izne bağlı DEĞİL — izni sonradan alınan biri, önceden kurduğu
                    paylaşımları yönetemez hale gelmesin diye. */}
                {getPermissions().canShareMap ? (
                  <>
                    <label className="attribute-popup-label" htmlFor="share-username">
                      Kişi davet et
                    </label>
                    <div className="map-share-invite-row">
                      <input
                        id="share-username"
                        className="attribute-popup-input"
                        type="text"
                        value={shareUsername}
                        onChange={(e) => setShareUsername(e.target.value)}
                        placeholder="Davet edilecek kullanıcı adı"
                        onKeyDown={(e) => e.key === 'Enter' && inviteToMap(shareModalMapId, shareUsername)}
                      />
                      <button
                        type="button"
                        className="attribute-popup-confirm"
                        disabled={inviting || !shareUsername.trim()}
                        onClick={() => inviteToMap(shareModalMapId, shareUsername)}
                      >
                        Davet Et
                      </button>
                    </div>

                    {/* Faz 3.2 (kullanıcının kendi isteği: "rollere de paylaşabilelim") — kabul/red
                        yok, seçilen roldeki herkes anında erişir. */}
                    <label className="attribute-popup-label" htmlFor="share-role">
                      Role paylaş
                    </label>
                    <div className="map-share-invite-row">
                      <SelectMenu
                        value={roleShareSelection}
                        onChange={setRoleShareSelection}
                        triggerClassName="map-share-role-select"
                        triggerLabel={
                          roleShareSelection
                            ? pickableRoles.find((r) => String(r.id) === String(roleShareSelection))?.name
                            : 'Rol seç…'
                        }
                        options={pickableRoles.map((r) => ({ value: r.id, label: `${r.name} (${r.userCount} kişi)`, color: r.color }))}
                      />
                      <button
                        type="button"
                        className="attribute-popup-confirm"
                        disabled={!roleShareSelection}
                        onClick={() => {
                          shareMapWithRole(shareModalMapId, Number(roleShareSelection));
                          setRoleShareSelection('');
                        }}
                      >
                        Paylaş
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="admin-hint">Bu rolün yeni kişi/rol ile paylaşım başlatma yetkisi yok — var olan paylaşımları aşağıdan yönetebilirsin.</p>
                )}

                {/* Faz 3.2 (kullanıcının kendi isteği: "aktif ve davet kısımları olsun"). */}
                {(() => {
                  const activeShares = mapShares.filter((s) => s.status === 'Accepted');
                  const pendingShares = mapShares.filter((s) => s.status === 'Pending');
                  const renderRow = (s) => (
                    <div key={s.id} className={`map-share-row${s.status === 'Accepted' && s.canView === false ? ' map-share-row-paused' : ''}`}>
                      <div className="map-share-row-info">
                        {s.targetType === 'Role' ? (
                          <span className="new-map-role-dot" style={{ background: s.roleColor || '#6b7280' }} />
                        ) : null}
                        {s.targetType === 'Role' ? (
                          <span className="map-share-username">{s.roleName} rolü</span>
                        ) : (
                          <button
                            type="button"
                            className="map-share-username map-share-username-link"
                            onClick={() => openUserProfile(s.invitedUsername)}
                            title="Kullanıcı profili"
                          >
                            {s.invitedUsername}
                          </button>
                        )}
                        {s.targetType === 'Role' && <span className="admin-hint">{s.roleUserCount} kişi</span>}
                        {s.status === 'Accepted' && s.canView === false && (
                          <span className="map-share-status map-share-status-paused">⏸ Duraklatıldı</span>
                        )}
                      </div>
                      <div className="map-share-row-dates">
                        <span>{s.targetType === 'Role' ? 'Paylaşıldı' : 'Davet'}: {formatDateTime(s.invitedDate)}</span>
                        {s.respondedDate && s.targetType !== 'Role' && <span>Yanıt: {formatDateTime(s.respondedDate)}</span>}
                      </div>
                      {s.status === 'Accepted' && (
                        <MapShareSettingsRow share={s} colorPresets={COLOR_PRESETS} onSave={updateShareSettings} />
                      )}
                      {/* Kullanıcının isteği (9. tur): sıralama Coğrafi Yetki Tanımla - Duraklat -
                          Kaldır olacak, yan yana (taşmadan). */}
                      <div className="map-share-row-actions">
                        {/* Görev #7 (kullanıcının kendi isteği): "bi harita açılsın ve isim
                            seçerek veya rol seçerek onlara çizimle kısıt yapabilelim" — bu
                            haritaya ve bu kişiye/role özel çizim kısıtlaması. */}
                        {s.status === 'Accepted' && (
                          <button
                            type="button"
                            className="map-share-geo-restrict"
                            onClick={() => {
                              const targetId = s.targetType === 'Role' ? s.roleId : s.invitedUserId;
                              if (targetId == null) return; // veri tutarsızlığına karşı savunma — id yoksa modal açılamaz
                              const map = maps.find((m) => m.id === shareModalMapId);
                              setShareModalMapId(null);
                              setGeoRestrictTarget({
                                mapId: shareModalMapId,
                                mapName: map?.name || '',
                                type: s.targetType === 'Role' ? 'role' : 'user',
                                id: targetId,
                                label: s.targetType === 'Role' ? `'${s.roleName}' rolü` : `'${s.invitedUsername}' kullanıcısı`,
                                returnTo: 'share',
                              });
                            }}
                            title="Bu kişi/rol için bu haritada çizim yapabileceği alanları tanımla"
                          >
                            🗺️ Coğrafi Yetki Tanımla
                          </button>
                        )}
                        {s.status === 'Accepted' && (
                          <button
                            type="button"
                            className={`map-share-pause${s.canView === false ? ' map-share-pause-active' : ''}`}
                            onClick={() => confirmPauseShare(s, s.canView === false)}
                            title={s.canView === false ? 'Erişimi geri aç' : 'Erişimini geçici olarak durdur'}
                          >
                            {s.canView === false ? '▶ Devam Ettir' : '⏸ Duraklat'}
                          </button>
                        )}
                        <button type="button" className="map-share-stop" onClick={() => removeShare(s)}>
                          {s.status === 'Pending' ? '↩ Daveti Geri Çek' : '🗑️ Kaldır'}
                        </button>
                      </div>
                    </div>
                  );

                  return (
                    <>
                      <div className="map-share-group-label">Aktif ({activeShares.length})</div>
                      <div className="map-share-list">
                        {activeShares.length === 0 && <p className="admin-hint">Henüz kimseyle/hiçbir role paylaşılmamış.</p>}
                        {activeShares.map(renderRow)}
                      </div>
                      {pendingShares.length > 0 && (
                        <>
                          <div className="map-share-group-label">Bekleyen Davetler ({pendingShares.length})</div>
                          <div className="map-share-list">{pendingShares.map(renderRow)}</div>
                        </>
                      )}
                    </>
                  );
                })()}
              </>

            <div className="attribute-popup-actions">
              <button type="button" className="attribute-popup-cancel" onClick={() => setShareModalMapId(null)}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Görev #7 + yeni harita sihirbazı: Paylaş modalındaki "🚧 Kısıtla" satırından YA DA
          yeni-harita-sonrası takip adımından açılır — kapatınca returnTo'ya göre kaynağa
          GERİ DÖN (kullanıcı akışı kaybetmesin). */}
      {geoRestrictTarget && (
        <GeoRestrictionModal
          target={{ type: geoRestrictTarget.type, id: geoRestrictTarget.id, label: geoRestrictTarget.label }}
          mapId={geoRestrictTarget.mapId}
          mapName={geoRestrictTarget.mapName}
          onClose={() => {
            const returning = geoRestrictTarget;
            setGeoRestrictTarget(null);
            if (returning.returnTo === 'postCreate') {
              setPostCreateFollowup({ mapId: returning.mapId, mapName: returning.mapName, users: returning.followupUsers, roles: returning.followupRoles });
            } else if (returning.returnTo === 'settings') {
              setMapSettingsOpenId(returning.mapId);
              fetchMapShares(returning.mapId);
              fetchMapGeoRestrictions(returning.mapId); // rozet (duraklatıldı/kısıtlı) güncel olsun
            } else {
              setShareModalMapId(returning.mapId);
              fetchMapShares(returning.mapId);
            }
          }}
        />
      )}

      {/* Kullanıcının kendi isteği: "artı butonuna basınca boş bir harita açılmalı ve...
          harita üzerinden sınırlama belirleyebileceğim" — harita + davetler zaten gönderildi,
          bu SADECE opsiyonel bir sonraki adım. Esc/Kapat SADECE bu adımı gizler, haritayı
          SİLMEZ (bkz. yukarıdaki postCreateFollowup state yorumu) — veri kaybı riski yok. */}
      {postCreateFollowup && !geoRestrictTarget && (
        <div className="attribute-popup-overlay" onClick={() => setPostCreateFollowup(null)}>
          <div className="attribute-popup" onClick={(e) => e.stopPropagation()}>
            <div className="attribute-popup-title">🗺️ Coğrafi Yetki Tanımla (opsiyonel) — {postCreateFollowup.mapName}</div>
            <p className="admin-hint">
              '{postCreateFollowup.mapName}' oluşturuldu ve paylaşıldı. İstersen davet ettiğin kişi/rollerin bu haritada
              sadece belirli alanlarda çizim yapmasını sağlayabilirsin — istemiyorsan direkt "Bitti"ye basabilirsin.
            </p>
            <div className="map-share-list">
              {postCreateFollowup.users.map((u) => (
                <div key={`pcf-user-${u.id}`} className="map-share-row">
                  <div className="map-share-row-info">
                    <span className="map-share-username">👤 {u.username}</span>
                  </div>
                  <div className="map-share-row-actions">
                    <button
                      type="button"
                      className="map-share-geo-restrict"
                      onClick={() =>
                        setGeoRestrictTarget({
                          mapId: postCreateFollowup.mapId,
                          mapName: postCreateFollowup.mapName,
                          type: 'user',
                          id: u.id,
                          label: `'${u.username}' kullanıcısı`,
                          returnTo: 'postCreate',
                          followupUsers: postCreateFollowup.users,
                          followupRoles: postCreateFollowup.roles,
                        })
                      }
                    >
                      🗺️ Coğrafi Yetki Tanımla
                    </button>
                  </div>
                </div>
              ))}
              {postCreateFollowup.roles.map((r) => (
                <div key={`pcf-role-${r.id}`} className="map-share-row">
                  <div className="map-share-row-info">
                    <span className="new-map-role-dot" style={{ background: r.color || '#6b7280' }} />
                    <span className="map-share-username">{r.name} rolü</span>
                  </div>
                  <div className="map-share-row-actions">
                    <button
                      type="button"
                      className="map-share-geo-restrict"
                      onClick={() =>
                        setGeoRestrictTarget({
                          mapId: postCreateFollowup.mapId,
                          mapName: postCreateFollowup.mapName,
                          type: 'role',
                          id: r.id,
                          label: `'${r.name}' rolü`,
                          returnTo: 'postCreate',
                          followupUsers: postCreateFollowup.users,
                          followupRoles: postCreateFollowup.roles,
                        })
                      }
                    >
                      🗺️ Coğrafi Yetki Tanımla
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="attribute-popup-actions">
              <button type="button" className="attribute-popup-confirm" onClick={() => setPostCreateFollowup(null)}>
                ✓ Bitti
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingConfirm && (
        <ConfirmDialog
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          danger={pendingConfirm.danger !== false}
          onConfirm={() => {
            pendingConfirm.onConfirm();
            setPendingConfirm(null);
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {pendingPoiDraw && (
        <PoiFormPopup
          categories={poiCategories}
          poiCategoryApiBase={POI_CATEGORY_BASE}
          onCategoriesChanged={fetchPoiCategories}
          onConfirm={confirmPoiDraw}
          onCancel={cancelPoiDraw}
        />
      )}

      {pendingStopDraw && (
        <StopFormPopup
          routes={routes}
          lockedRouteId={lockedStopRouteId}
          allStops={stops}
          getSuggestedIndex={(routeId) => computeInsertIndexForNewStop(routeId, pendingStopDraw.wkt)}
          onConfirm={confirmStopDraw}
          onCancel={cancelStopDraw}
        />
      )}

      {/* Kullanıcının kendi isteği: "hattı düzenleme şeyi altta olmasın, haritadan hatta
          tıklayınca olsun" — eski toolbar select+durum-satırı kaldırıldı (Çizilenler paneliyle
          çakışıp çirkin görünüyordu), yerine düzgün bir floating kart. */}
      {editingRoutePathId != null && (() => {
        const editedRoute = routes.find((r) => r.id === editingRoutePathId);
        return (
          <>
            <div className="route-path-edit-card">
              <div className="route-path-edit-card-header">
                <span className="stop-form-route-dot" style={{ background: editedRoute?.color || '#2563eb' }} />
                <strong>{editedRoute ? `"${editedRoute.name}" hattını düzenliyorsunuz` : 'Hattı düzenliyorsunuz'}</strong>
              </div>
              <div className="route-path-edit-card-actions">
                {/* Kullanıcının kendi isteği: "bi hatta tıklayınca Kaydet ve Sıfırla başta
                    görünmesin, bir değişiklik yapınca çıksın" — routePathDirty false iken bu
                    ikisi artık sadece disabled değil, TAMAMEN gizli. */}
                {routePathDirty && (
                  <button type="button" className="draw-button route-path-save-button" onClick={saveRoutePathEdit} disabled={savingRoutePath}>
                    {savingRoutePath ? 'Kaydediliyor…' : '✓ Kaydet'}
                  </button>
                )}
                {/* Kullanıcının kendi isteği: "haritadan o güzergaha tıklayınca da simülasyon
                    başlat şeyi görünsün" — hattı düzenlemeye girenler zaten canManageRoutes
                    sahibi (bkz. startRoutePathEdit'in giriş koşulu), izin kontrolüne gerek yok. */}
                <button
                  type="button"
                  className="draw-button"
                  disabled={simulationActionRouteId === editingRoutePathId}
                  onClick={() =>
                    (simulationRunningState[editingRoutePathId] ? stopSimulation : startSimulation)(editingRoutePathId)
                  }
                  title={simulationRunningState[editingRoutePathId] ? 'Simülasyonu durdur' : 'Bu güzergahta simülasyonu başlat'}
                >
                  {simulationActionRouteId === editingRoutePathId
                    ? '⏳…'
                    : simulationRunningState[editingRoutePathId]
                      ? '⏹ Durdur'
                      : '▶ Simülasyonu Başlat'}
                </button>
                <button
                  type="button"
                  className="draw-button"
                  onClick={() => toggleFollowRoute(editingRoutePathId)}
                  title={followedRouteIds.has(editingRoutePathId) ? 'Canlı takibi bırak' : 'Aracı canlı olarak haritada takip et'}
                >
                  {followedRouteIds.has(editingRoutePathId) ? '👁 Takibi Bırak' : '👁 Takip Et'}
                </button>
                {/* Kullanıcının kendi isteği: "rota oluştur şeyi o ekranda çıksın" — AdminPage
                    ile AYNI uç nokta, haritadan çıkmadan. */}
                <button
                  type="button"
                  className="draw-button"
                  onClick={() => generateRouteFromMap(editingRoutePathId)}
                  disabled={savingRoutePath || generatingRoutePathId === editingRoutePathId || (editedRoute?.stopCount || 0) < 2}
                  title={(editedRoute?.stopCount || 0) < 2 ? 'En az 2 aktif durak gerekir' : 'OSRM ile yeniden hesapla'}
                >
                  {generatingRoutePathId === editingRoutePathId ? '⏳ Hesaplanıyor…' : '🛣️ Rota Oluştur'}
                </button>
                {/* Kullanıcının kendi isteği: "bir değişiklik yapınca çıksın" — routePathDirty,
                    bu oturumda gerçek bir sürükleme olmadıkça false kalır (bkz. yukarıdaki
                    [editingRoutePathId] effect'i), false iken buton hiç render edilmiyor. */}
                {routePathDirty && (
                  <button
                    type="button"
                    className="draw-button"
                    onClick={() => resetRoutePathToStraight(editingRoutePathId)}
                    disabled={savingRoutePath}
                    title="Bu oturumdaki değişikliği geri al"
                  >
                    ↺ Sıfırla
                  </button>
                )}
                <button type="button" className="draw-button" onClick={cancelRoutePathEdit} disabled={savingRoutePath}>
                  ✕ Vazgeç (Esc)
                </button>
              </div>
            </div>
            {/* Kullanıcının kendi isteği: "ipucu yazılarını iptal edelim olmasın öyle bir
                yazı" — hem kısa balon hem de OSRM override hover-tooltip'i tamamen kaldırıldı;
                kart genişledikçe (Simülasyon/Takip Et butonları eklendiğinden beri) bu balon
                yeni butonlarla çakışıyordu. */}
          </>
        );
      })()}

      {/* Kullanıcının kendi isteği: güzergah "Bilgi" izolasyonu — selectedPoi'nin arama
          çubuğundaki pinlenmiş-isim + X ile kapatma davranışıyla AYNI fikir. */}
      {focusedRouteId != null && (() => {
        const focusedRoute = routes.find((r) => r.id === focusedRouteId);
        const isRunning = !!simulationRunningState[focusedRouteId];
        const isFollowing = followedRouteIds.has(focusedRouteId);
        const actionBusy = simulationActionRouteId === focusedRouteId;
        return (
          <div className="transit-focus-banner">
            <span className="stop-form-route-dot" style={{ background: focusedRoute?.color || '#2563eb' }} />
            <span>{focusedRoute ? `"${focusedRoute.name}" güzergahına odaklanıldı` : 'Güzergaha odaklanıldı'}</span>
            {/* Hoca ödevi (31 Ağustos): "Haritada... bir güzergaha tıklandığında 'Simülasyonu
                Başlat' butonu çıksın (Sadece Admin ve Operatör başlatabilsin)." */}
            {getPermissions().canManageRoutes && (
              <button
                type="button"
                className="transit-focus-banner-action"
                disabled={actionBusy}
                onClick={() => (isRunning ? stopSimulation(focusedRouteId) : startSimulation(focusedRouteId))}
                title={isRunning ? 'Simülasyonu durdur' : 'Bu güzergahta simülasyonu başlat'}
              >
                {isRunning ? '⏹ Durdur' : '▶ Simülasyonu Başlat'}
              </button>
            )}
            {/* Hoca ödevi (31 Ağustos): "Diğer kullanıcılar aynı güzergaha tıkladığında 'Takip
                Et' butonu çıksın... 'Takibi Bırak' butonu ile takipten çıkılabilsin." — herkese
                açık, ManageRoutes izni gerekmiyor (bkz. Hub'daki gerekçe). */}
            <button
              type="button"
              className="transit-focus-banner-action"
              onClick={() => toggleFollowRoute(focusedRouteId)}
              title={isFollowing ? 'Canlı takibi bırak' : 'Aracı canlı olarak haritada takip et'}
            >
              {isFollowing ? '👁 Takibi Bırak' : '👁 Takip Et'}
            </button>
            <button type="button" onClick={clearRouteFocus} title="Odağı kaldır, tüm güzergahları göster">✕</button>
          </div>
        );
      })()}

      {/* Kullanıcının kendi isteği (3 Eylül): "hangi duraktan kalktığı, mevcut durağı, sonraki
          durağı falan ayrıntılı olarak görünsün." — odaklanılan hattın durak zinciri; simülasyon
          çalışıyorsa canlı segment (ayrıldığı durak → yaklaştığı durak + ETA) vurgulanıyor,
          çalışmıyorsa hattın ilk/son durağı ve tüm durak sırası listeleniyor. */}
      {focusedRouteId != null && (() => {
        const focusedRoute = routes.find((r) => r.id === focusedRouteId);
        const routeStops = stops
          .filter((s) => s.routeId === focusedRouteId && !s.isPaused)
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (routeStops.length === 0) return null;
        const snap = simulationSnapshots[focusedRouteId];
        const live = snap?.isRunning ? snap : null;
        const stopEtas = live?.stopEtas || [];
        const nextEta = stopEtas.find((e) => !e.passed);
        const minutes = (seconds) => (seconds == null ? null : Math.max(1, Math.ceil(seconds / 60)));
        return (
          <div className="transit-route-detail-card">
            <div className="transit-route-detail-header">
              <span className="stop-form-route-dot" style={{ background: focusedRoute?.color || '#2563eb' }} />
              <strong>{focusedRoute?.name || 'Güzergah'}</strong>
              <span className="transit-route-detail-count">{routeStops.length} durak</span>
            </div>
            {live ? (
              <div className="transit-route-detail-live">
                <div className="transit-route-detail-live-row">
                  <span>🚏 Kalktığı durak</span>
                  <strong>{live.currentFromStopName || routeStops[0]?.name || '—'}</strong>
                </div>
                <div className="transit-route-detail-live-row">
                  <span>🚌 Şu an</span>
                  <strong>{`%${Math.round(live.percentComplete || 0)} tamamlandı`}</strong>
                </div>
                <div className="transit-route-detail-live-row">
                  <span>🎯 Sonraki durak</span>
                  <strong>
                    {live.currentToStopName || '—'}
                    {nextEta && ` · ${minutes(nextEta.etaSeconds)} dk`}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="transit-route-detail-live">
                <div className="transit-route-detail-live-row">
                  <span>🚩 İlk durak</span>
                  <strong>{routeStops[0].name}</strong>
                </div>
                <div className="transit-route-detail-live-row">
                  <span>🏁 Son durak</span>
                  <strong>{routeStops[routeStops.length - 1].name}</strong>
                </div>
                <div className="transit-route-detail-hint">
                  Canlı konum, kalkış ve varış bilgisi için simülasyonu başlatın.
                </div>
              </div>
            )}
            <ol className="transit-route-detail-stops">
              {routeStops.map((stop) => {
                const eta = stopEtas.find((e) => e.stopId === stop.id);
                const isNext = live && live.currentToStopName === stop.name;
                const passed = eta?.passed === true;
                return (
                  <li
                    key={stop.id}
                    className={`transit-route-detail-stop${isNext ? ' is-next' : ''}${passed ? ' is-passed' : ''}`}
                  >
                    <button type="button" onClick={() => zoomToStop(stop)} title="Bu durağa git">
                      <span className="transit-route-detail-stop-order">{stop.sortOrder + 1}</span>
                      <span className="transit-route-detail-stop-name">{stop.name}</span>
                      {eta && !passed && <span className="transit-route-detail-stop-eta">{minutes(eta.etaSeconds)} dk</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })()}

      {/* Hoca ödevi (31 Ağustos): "Hareket eden araca tıklandığında bilgi popup'ı açılsın ve
          güzergahın yüzde kaçının tamamlandığı bilgisi gösterilsin." */}
      {selectedSimulationRouteId != null && simulationSnapshots[selectedSimulationRouteId] && (() => {
        const snap = simulationSnapshots[selectedSimulationRouteId];
        const stopEtas = snap.stopEtas || [];
        // Kullanıcının kendi isteği: "sonraki durağa x dakika falan diye yazsın" — henüz
        // geçilmemiş İLK durak = bir sonraki durak. formatMinutes dakikaya YUVARLAMIYOR
        // (Math.ceil), "0 dakika" yerine "1 dk içinde" görünsün istiyoruz (yolcu için daha
        // anlamlı — "az kaldı" hissi).
        const nextStop = stopEtas.find((e) => !e.passed);
        const formatMinutes = (seconds) => (seconds == null ? null : Math.max(1, Math.ceil(seconds / 60)));
        // "toplam süre fln da yazsın geri sayım olsun" — dakika:saniye formatında, canlı
        // güncellenen (her PositionUpdated'te yeniden hesaplanan) bir geri sayım.
        const formatCountdown = (seconds) => {
          const total = Math.max(0, Math.round(seconds));
          const m = Math.floor(total / 60);
          const s = total % 60;
          return `${m}:${String(s).padStart(2, '0')}`;
        };
        const boardingEta = stopEtas.find((e) => e.stopId === boardingStopId);
        const destinationEta = stopEtas.find((e) => e.stopId === destinationStopId);
        const tripSeconds = boardingEta && destinationEta ? destinationEta.etaSeconds - boardingEta.etaSeconds : null;

        return (
          <div className="transit-vehicle-popup">
            <div className="transit-vehicle-popup-header">
              <span className="stop-form-route-dot" style={{ background: snap.routeColor || '#2563eb' }} />
              <span>{snap.routeName || 'Güzergah'}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedSimulationRouteId(null);
                  setBoardingStopId(null);
                  setDestinationStopId(null);
                }}
                title="Kapat"
              >
                ✕
              </button>
            </div>
            <div className="transit-vehicle-popup-body">
              <div className="transit-vehicle-popup-progress-track">
                <div
                  className="transit-vehicle-popup-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(0, snap.percentComplete || 0))}%`, background: snap.routeColor || '#2563eb' }}
                />
              </div>
              <span>{`%${Math.round(snap.percentComplete || 0)} tamamlandı`}</span>

              {(snap.currentFromStopName || snap.currentToStopName) && (
                <div className="transit-vehicle-popup-segment">
                  {snap.currentFromStopName && <span>{snap.currentFromStopName} durağından ayrıldı</span>}
                  {snap.currentToStopName && (
                    <span>
                      {' → '}
                      <strong>{snap.currentToStopName}</strong>
                      {nextStop && ` (${formatMinutes(nextStop.etaSeconds)} dk içinde)`}
                    </span>
                  )}
                </div>
              )}

              {stopEtas.length > 0 && (
                <div className="transit-vehicle-popup-trip-planner">
                  <div className="transit-vehicle-popup-trip-planner-title">Yolculuk Süresi Hesapla</div>
                  <label>
                    Biniş durağı
                    <select
                      value={boardingStopId ?? ''}
                      onChange={(e) => setBoardingStopId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Seçin…</option>
                      {stopEtas.map((eta) => (
                        <option key={eta.stopId} value={eta.stopId}>{eta.stopName}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    İniş durağı
                    <select
                      value={destinationStopId ?? ''}
                      onChange={(e) => setDestinationStopId(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">Seçin…</option>
                      {stopEtas.map((eta) => (
                        <option key={eta.stopId} value={eta.stopId}>{eta.stopName}</option>
                      ))}
                    </select>
                  </label>
                  {tripSeconds != null && (
                    <div className="transit-vehicle-popup-countdown">
                      {tripSeconds > 0 ? (
                        <>Kalan yolculuk süresi: <strong>{formatCountdown(tripSeconds)}</strong></>
                      ) : boardingEta?.passed ? (
                        <>Biniş durağı zaten geçildi, süre hesaplanamıyor.</>
                      ) : (
                        <>İniş durağı, biniş durağından önce — durak sırasını kontrol edin.</>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div ref={mapContainerRef} className="map-container" />
    </div>
  );
}

export default MapPage;

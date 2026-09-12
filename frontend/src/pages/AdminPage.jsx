import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authHeader, getAuth, clearAuth, refreshMe, getPermissions } from '../auth';
import { LogoutIcon } from '../components/icons';
import ColorSwatchInput from '../components/ColorSwatchInput';
import ConfirmDialog from '../components/ConfirmDialog';
import SelectMenu from '../components/SelectMenu';
import GeoRestrictionModal from '../components/GeoRestrictionModal';
import { roleAccentStyle } from '../colorUtils';
import PoiPreviewMap from '../components/PoiPreviewMap';
import PoiScheduleEditor from '../components/PoiScheduleEditor';
import PoiScheduleExceptionEditor from '../components/PoiScheduleExceptionEditor';
import { groupPoiSchedule, normalizePoiSchedule, formatPoiExceptionDate } from '../poiScheduleUtils';
import SearchableCategorySelect from '../components/SearchableCategorySelect';
import IconPicker from '../components/IconPicker';

const ADMIN_BASE = 'http://localhost:5276/api/Admin';
const ROLE_BASE = 'http://localhost:5276/api/Role';
const CATEGORY_BASE = 'http://localhost:5276/api/Category';
const PERMISSION_BASE = 'http://localhost:5276/api/Permission';
// Hoca ödevi (POI/Rol/Operatör): tbl_point'in düz (hiyerarşisiz) Category'sinden AYRI —
// bkz. PoiCategory.cs. Aynı isim çakışmasın diye "Poi" öneki net.
const POI_BASE = 'http://localhost:5276/api/Poi';
const POI_CATEGORY_BASE = 'http://localhost:5276/api/PoiCategory';
// Hoca ödevi (Akıllı Ulaşım Modülü): Durak/Güzergah yönetimi — POI ile AYNI izole mimari,
// backend tarafında tamamen ayrı bir varlık (bkz. MapPage.jsx'teki AYNI sabitler).
const TRANSIT_ROUTE_BASE = 'http://localhost:5276/api/TransitRoute';
const TRANSIT_STOP_BASE = 'http://localhost:5276/api/TransitStop';
// Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma): "Haritada VEYA LİSTEDE bir güzergaha
// tıklandığında 'Simülasyonu Başlat' butonu çıksın" — MapPage'deki AYNI uç, burada sadece
// başlat/durdur için kullanılıyor (canlı takip/yüzde popup'ı harita tarafının işi).
const TRANSIT_SIMULATION_BASE = 'http://localhost:5276/api/TransitSimulation';

// Gün 6: izin tanımları artık backend'den (Permission tablosu) dinamik geliyor, burada
// sabit bir liste yok. Bilinen kodlar için sadece görsel bir emoji eşlemesi tutuyoruz —
// ileride admin panelinden yeni bir Permission eklenirse (kod tarafında yeni bir
// PermissionCodes sabiti + seed satırıyla) burada emoji tanımlı olmasa bile 🔑 ile
// otomatik düşer, çökmez.
const PERMISSION_ICONS = {
  ManageAdmin: '🛠️',
  DrawPoint: '📍',
  DrawLine: '📏',
  DrawPolygon: '⬟',
  UseAnalysisTool: '🔎',
  ManageCategories: '🏷️',
  DeleteCategories: '🗑️',
  ManageMultipleMaps: '🗂️',
  ManageGeoRestrictions: '🗺️',
  ShareMap: '🔗',
  ViewPoi: '👁️',
  ManagePoi: '📍',
  ManagePoiCategories: '🗂️',
};
function permissionIcon(code) {
  return PERMISSION_ICONS[code] || '🔑';
}

// Hoca ödevi (POI/Rol/Operatör): "Hiyerarşik yapıda poi_category" — düz listeyi Parent-Child
// ağacına göre sıralayıp her seviyeyi girintiliyoruz. PoiFormPopup.jsx'teki AYNI mantık
// (kod tekrarı burada göze değer değil — iki dosya birbirinden bağımsız, tek amaçlı küçük
// bir yardımcı fonksiyon).
function buildIndentedCategoryOptions(categories, excludeId = null) {
  const byParent = new Map();
  categories.forEach((c) => {
    if (c.id === excludeId) return; // düzenlenen kategorinin kendisi kendi altına taşınamaz
    const key = c.parentId ?? 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(c);
  });
  byParent.forEach((list) => list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name, 'tr')));

  const result = [];
  function walk(parentKey, depth) {
    const children = byParent.get(parentKey) || [];
    children.forEach((c) => {
      result.push({ ...c, depth, label: `${'　'.repeat(depth)}${depth > 0 ? '↳ ' : ''}${c.name}` });
      walk(c.id, depth + 1);
    });
  }
  walk('root', 0);
  return result;
}

// Kullanıcının kendi isteği (26 Ağustos, 6. tur): "ana kategorilerde 0 poi yazmaması gerek,
// kendi alt kategorilerinin toplamı yazmalı orada." — üst kategori kartındaki rozet artık
// SADECE o kategoriye doğrudan atanmış POI'leri değil, tüm alt-ağacındaki (children, torunlar
// vb.) POI'lerin toplamını gösteriyor.
function countPoisInCategoryTree(categoryId, poiCategories, pois) {
  const ids = new Set([categoryId]);
  let added = true;
  while (added) {
    added = false;
    for (const c of poiCategories) {
      if (c.parentId != null && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }
  return pois.filter((poi) => poi.categoryId != null && ids.has(poi.categoryId)).length;
}

// Kullanıcının kendi isteği (26 Ağustos, 6. tur): toplu içe aktarmada "aynı mekan aynı
// lokasyondaysa onları atlasın sadece kategorisi farklıysa değiştirsin" — isim karşılaştırması
// için basit normalize, konum karşılaştırması için WKT'den lat/lon çıkarma ve ~150m toleranslı
// yakınlık kontrolü (küresel formüle gerek yok, bu kısa mesafeler için düzlemsel yeterli).
function normalizePoiName(name) {
  return (name || '').trim().toLocaleLowerCase('tr');
}

function parseWktPoint(wkt) {
  const match = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(wkt || '');
  return match ? { lon: parseFloat(match[1]), lat: parseFloat(match[2]) } : null;
}

function isSameLocation(a, b, toleranceDeg = 0.0015) {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < toleranceDeg && Math.abs(a.lon - b.lon) < toleranceDeg;
}

async function authedFetch(url, options = {}) {
  return fetch(url, { ...options, headers: { ...authHeader(), ...(options.headers || {}) } });
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function compactPoiSchedule(poi) {
  const groups = groupPoiSchedule(poi.schedule);
  if (groups.length === 0) return poi.workingHours || '—';
  const first = `${groups[0].label} ${groups[0].value}`;
  return groups.length === 1 ? first : `${first} · +${groups.length - 1}`;
}

const TABS = [
  { key: 'overview', label: '📊 Genel Bakış' },
  { key: 'users', label: '👥 Kullanıcılar' },
  { key: 'roles', label: '🎭 Roller' },
  { key: 'categories', label: '🏷️ Kategoriler' },
  { key: 'poi', label: '📍 POI Yönetimi' },
  { key: 'transit', label: '🚌 Güzergah Yönetimi' },
  { key: 'logs', label: '📜 Loglar' },
];

function AdminPage() {
  const navigate = useNavigate();
  const currentUsername = getAuth()?.username;

  const [activeTab, setActiveTab] = useState('overview');

  const [users, setUsers] = useState([]);
  const [savedUsers, setSavedUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  // roles/categories: ekranda düzenlenen TASLAK durum. savedRoles/savedCategories: sunucudaki
  // son bilinen hâl — "Kaydet"/"Vazgeç" ikisi arasındaki farkı (dirty check) bulmak ve
  // vazgeçildiğinde taslağı geri almak için referans olarak tutuluyor. Discord'daki gibi:
  // switch'e her bastığında anında kaydetmiyoruz, alttaki barla toplu onaylıyoruz.
  // Kullanıcı rolü ve doğrudan izinler de aynı taslak sisteminde: seçim önce yerelde
  // görünür, alttaki bar üzerinden toplu kaydedilir veya tek hamlede geri alınır.
  const [roles, setRoles] = useState([]);
  const [savedRoles, setSavedRoles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [savedCategories, setSavedCategories] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotalCount, setLogTotalCount] = useState(0);
  const [logTotalPages, setLogTotalPages] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const logPageSize = 25;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [userSearch, setUserSearch] = useState('');
  const [userSort, setUserSort] = useState({ key: 'name', dir: 'asc' }); // key: 'name' | 'role' | 'date'
  const [roleFilter, setRoleFilter] = useState(null); // Genel Bakış'tan bir role tıklanınca kullanıcılar bu role göre filtrelenir

  // Hepsi varsayılan olarak açık başlasın, ve birini açıp kapatmak diğerlerini etkilemesin
  // diye tek bir id yerine bir Set tutuyoruz.
  const [expandedRoleIds, setExpandedRoleIds] = useState(new Set());
  const expandedInitializedRef = useRef(false);
  const [expandedUserIds, setExpandedUserIds] = useState(new Set());

  // Hoca görevi: Coğrafi Yetki Tanımlama Modülü — hangi rol/kullanıcı için harita modalı
  // açık ({ type: 'role'|'user', id, label }), null = kapalı.
  const [geoModalTarget, setGeoModalTarget] = useState(null);

  // "+ Oluştur" butonuna basınca artık toolbar'da açılmıyor, ortada gerçek bir mini
  // pencere (modal) açılıyor.
  const [creatingRole, setCreatingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#6b7280');

  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6b7280');
  const [editingCategoryId, setEditingCategoryId] = useState(null);

  // Hoca ödevi (POI/Rol/Operatör): "POI Yönetimi" sekmesi — POI listesi + hiyerarşik
  // kategori yönetimi. roles/categories'teki taslak+toplu-kaydet deseninin AKSİNE, burada
  // her değişiklik (isim/üst kategori) anında kaydediliyor — liste küçük kalması beklenen
  // (öngörülemeyen çok sayıda taslak satırıyla uğraşmaya değmez, basit tutuyoruz).
  const [pois, setPois] = useState([]);
  const [poiCategories, setPoiCategories] = useState([]);
  const [creatingPoiCategory, setCreatingPoiCategory] = useState(false);
  const [newPoiCategoryName, setNewPoiCategoryName] = useState('');
  const [newPoiCategoryDescription, setNewPoiCategoryDescription] = useState('');
  const [newPoiCategoryParentId, setNewPoiCategoryParentId] = useState('');
  const [newPoiCategoryIcon, setNewPoiCategoryIcon] = useState('');
  const [editingPoiCategoryId, setEditingPoiCategoryId] = useState(null);
  const [poiCategoryDraft, setPoiCategoryDraft] = useState(null);
  const [poiCategorySearch, setPoiCategorySearch] = useState('');
  const [selectedPoiCategoryDetail, setSelectedPoiCategoryDetail] = useState(null);
  const [draggedPoiCategoryId, setDraggedPoiCategoryId] = useState(null);
  const [poiCategoryDropTarget, setPoiCategoryDropTarget] = useState(null);
  const [selectedPoiDetail, setSelectedPoiDetail] = useState(null);
  const [editingAdminPoi, setEditingAdminPoi] = useState(false);
  const [adminPoiDraft, setAdminPoiDraft] = useState(null);
  const [savingAdminPoi, setSavingAdminPoi] = useState(false);
  const [poiSearch, setPoiSearch] = useState('');
  // Hoca ödevi (25 Ağustos — Konum Analizi): "bu analiz için poi verisi oluşturun, ne kadar
  // çok veri olursa o kadar iyi sonuç verecektir." — tek tek elle eklemek yerine JSON
  // yapıştırıp tek seferde birden çok POI ekleyen bir araç. Kalıcı bir admin özelliği olarak
  // tasarlandı (tek kullanımlık bir script değil) çünkü ileride açık kaynak POI toplama
  // işinde de aynı yolla tekrar veri yükleneceği zaten biliniyor.
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportText, setBulkImportText] = useState('');
  const [bulkImportRunning, setBulkImportRunning] = useState(false);
  const [bulkImportSummary, setBulkImportSummary] = useState(null);
  // Kullanıcının kendi isteği: "güzergahları otomatikleştirmek istiyorum... ankaradaki tüm
  // metro, tramvay, tren, otobüs verilerini çekebiliyorsak otomatik olarak tanımlamak
  // istiyorum" — Toplu POI İçe Aktar ile AYNI desen (ayrı bir backend "toplu" ucu YOK,
  // mevcut tekil TransitRoute/TransitStop uçları sırayla çağrılıyor).
  const [routeImportOpen, setRouteImportOpen] = useState(false);
  const [routeImportText, setRouteImportText] = useState('');
  const [routeImportRunning, setRouteImportRunning] = useState(false);
  const [routeImportProgress, setRouteImportProgress] = useState('');
  const [routeImportSummary, setRouteImportSummary] = useState(null);
  const [resetAllLoading, setResetAllLoading] = useState(false);
  // Kullanıcının kendi isteği (26 Ağustos, 5. tur): "poiler açıp kapanabilir olsun hepsi
  // göründüğü için sayfanın en altına inemiyorum." — toplu içe aktarmadan sonra POI sayısı
  // binlere çıkabildiği için liste varsayılan olarak KAPALI başlıyor, isteyen açıyor (ayrıca
  // .admin-table-wrap kendi içinde 60vh'de kaydırılıyor, açıkken bile sayfa sonsuza uzamıyor).
  const [poiListOpen, setPoiListOpen] = useState(false);
  // Aynı istek: "kategoriler de ana kategoriler açılıp kapanabilir olsun" — üst (depth 0)
  // kategoriye tıklanınca altındaki alt kategoriler gizlenir/gösterilir (accordion). Boş Set
  // = hiçbiri genişletilmemiş (hepsi kapalı) varsayılan durum.
  const [expandedRootCategoryIds, setExpandedRootCategoryIds] = useState(() => new Set());
  const [poiCategoryFilter, setPoiCategoryFilter] = useState('');
  const [poiProvinceFilter, setPoiProvinceFilter] = useState('');
  const [poiDistrictFilter, setPoiDistrictFilter] = useState('');
  const [poiStatusFilter, setPoiStatusFilter] = useState('all');
  const [poiSort, setPoiSort] = useState({ key: 'createdDate', dir: 'desc' });

  // Hoca ödevi (Akıllı Ulaşım Modülü): "Güzergah Yönetimi" paneli — yeni güzergah ekleme
  // (isim+renk), listeleme/düzenleme, ve her güzergahın durak listesi (sıra bazlı,
  // sürükle-bırak). poiCategories'teki taslak sistemine GİRMİYORUZ (basitlik için POI
  // listesi gibi: her değişiklik anında kaydediliyor) — activeTab === 'transit' olunca
  // lazy-load ediliyor (loadAll'a eklenmedi, gereksiz istek atılmasın diye).
  const [transitRoutes, setTransitRoutes] = useState([]);
  const [transitLoading, setTransitLoading] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteColor, setNewRouteColor] = useState('#2563eb');
  const [newRouteProvince, setNewRouteProvince] = useState('');
  const [newRouteDistrict, setNewRouteDistrict] = useState('');
  const [creatingRoute, setCreatingRoute] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [editRouteName, setEditRouteName] = useState('');
  const [editRouteColor, setEditRouteColor] = useState('#2563eb');
  const [editRouteProvince, setEditRouteProvince] = useState('');
  const [editRouteDistrict, setEditRouteDistrict] = useState('');
  // FAZ 2 (kullanıcının kendi isteği): "mahalle" de eklendi — normalde MapPage'de durak
  // eklenince otomatik dolduruluyor (bkz. reverseGeocode), burada sadece admin elle görüp
  // düzeltebilsin diye.
  const [editRouteNeighborhood, setEditRouteNeighborhood] = useState('');
  // Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): "Güzergah üzerine 'Rota Oluştur'
  // butonu ekleyin." — aynı anda sadece bir güzergah için istek atılabilsin diye id tutuyoruz
  // (buton bu id'ye göre kendi loading durumunu gösteriyor, diğer kartlar etkilenmiyor).
  const [generatingRouteId, setGeneratingRouteId] = useState(null);
  // Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma): "listede bir güzergaha tıklandığında
  // 'Simülasyonu Başlat' butonu çıksın" — routeId -> boolean (aktif mi) haritası; simulationBusyRouteId
  // ise generatingRouteId ile AYNI desen, tek seferde bir kartın butonu loading göstersin diye.
  const [simulationRunning, setSimulationRunning] = useState({});
  const [simulationBusyRouteId, setSimulationBusyRouteId] = useState(null);
  // Kullanıcının kendi isteği (27 Ağustos ödevi kapsamı): admin panelinde durak isminin de
  // düzenlenebilir olması — PATCH /api/TransitStop/{id} zaten Name kabul ediyordu, sadece
  // frontend'de inline düzenleme eksikti (editingRouteId/editRouteName ile AYNI desen).
  const [editingStopId, setEditingStopId] = useState(null);
  const [editStopName, setEditStopName] = useState('');
  // Kullanıcının kendi isteği: "arayınca çıksın veya şehre, ilçeye göre filtre olsun" —
  // poiProvinceFilter/poiSearch ile AYNI desen, tamamen client-side (liste zaten yüklü).
  const [transitSearch, setTransitSearch] = useState('');
  const [transitProvinceFilter, setTransitProvinceFilter] = useState('');
  const [transitDistrictFilter, setTransitDistrictFilter] = useState('');
  const [expandedRouteId, setExpandedRouteId] = useState(null);
  const [routeStops, setRouteStops] = useState([]);
  const [routeStopsLoading, setRouteStopsLoading] = useState(false);
  // Kullanıcının kendi isteği: "Güzergah eklemek için güzergah ekle yazısına basınca
  // detayları açılan pencereden girelim" — inline satır yerine modal (bulkImportOpen/
  // poi-category-detail modal ile AYNI attribute-popup-overlay deseni).
  const [showCreateRouteModal, setShowCreateRouteModal] = useState(false);
  // Native HTML5 D&D — MapPage.jsx'teki harita şeridi sürükle-bırak deseniyle AYNI (ref'te
  // tutulan sürüklenen/hedef id + her dragover'da canlı önizleme, backend'e sadece onDrop'ta tek istek).
  const draggedStopIdRef = useRef(null);
  const dragOverStopIdRef = useRef(null);

  // Gün 6: admin panelinden doğrudan kullanıcı oluşturma ("+ Kullanıcı Ekle").
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRoleId, setNewUserRoleId] = useState(null);

  // window.confirm() yerine kendi onay penceremiz — { title, message, onConfirm }
  const [pendingConfirm, setPendingConfirm] = useState(null);

  function sortCodes(codes) {
    return [...(codes || [])].sort();
  }

  async function fetchLogPage(page, showLoading = false) {
    if (showLoading) setLogsLoading(true);
    try {
      const response = await authedFetch(`${ADMIN_BASE}/logs/paged?page=${page}&pageSize=${logPageSize}`);
      if (!response.ok) return;
      const data = await response.json();
      setLogs(data.items || []);
      setLogTotalCount(data.totalCount || 0);
      setLogTotalPages(data.totalPages || 0);
      if (data.totalPages > 0 && page > data.totalPages) setLogPage(data.totalPages);
    } finally {
      if (showLoading) setLogsLoading(false);
    }
  }

  async function loadAll() {
    try {
      const [usersRes, rolesRes, categoriesRes, permissionsRes, poisRes, poiCategoriesRes] = await Promise.all([
        authedFetch(`${ADMIN_BASE}/users`),
        authedFetch(ROLE_BASE),
        authedFetch(CATEGORY_BASE),
        authedFetch(PERMISSION_BASE),
        authedFetch(`${POI_BASE}/admin`),
        authedFetch(POI_CATEGORY_BASE),
      ]);

      const usersData = usersRes.ok ? await usersRes.json() : [];
      const normalizedUsers = usersData.map((u) => ({ ...u, directPermissionCodes: sortCodes(u.directPermissionCodes) }));
      setUsers(normalizedUsers);
      setSavedUsers(normalizedUsers);

      const rolesData = rolesRes.ok ? await rolesRes.json() : [];
      const normalizedRoles = rolesData.map((r) => ({ ...r, permissionCodes: sortCodes(r.permissionCodes) }));
      setRoles(normalizedRoles);
      setSavedRoles(normalizedRoles);
      if (!expandedInitializedRef.current && normalizedRoles.length > 0) {
        setExpandedRoleIds(new Set(normalizedRoles.map((r) => r.id)));
        expandedInitializedRef.current = true;
      }

      const categoriesData = categoriesRes.ok ? await categoriesRes.json() : [];
      setCategories(categoriesData);
      setSavedCategories(categoriesData);

      await fetchLogPage(1);

      const permissionsData = permissionsRes.ok ? await permissionsRes.json() : [];
      setPermissions(permissionsData);

      setPois(poisRes.ok ? await poisRes.json() : []);
      setPoiCategories(poiCategoriesRes.ok ? await poiCategoriesRes.json() : []);

      if (newUserRoleId == null && normalizedRoles.length > 0) {
        setNewUserRoleId(normalizedRoles.find((r) => r.isBuiltIn && r.name === 'Kullanıcı')?.id ?? normalizedRoles[0].id);
      }
    } catch (err) {
      console.error('Admin paneli verileri yüklenemedi:', err);
      setError('Veriler yüklenemedi. Sunucuya bağlanılamadı.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loglar sekmesi "anında görünmüyor, panelden çıkıp girince görünüyor" şikayetine karşı:
  // sekme aktifken 4 saniyede bir tekrar çekiyoruz. Not: bu bir "poll" (yoklama), gerçek
  // anlık (WebSocket/SignalR) bildirim değil — basit ve bu ölçekte yeterli, ama sunucuya
  // sekme açıkken düzenli istek gider; onlarca eşzamanlı admin olursa SignalR'a geçmek
  // daha doğru olur.
  useEffect(() => {
    if (activeTab !== 'logs') return undefined;
    let ignore = false;
    function fetchLogs(showLoading = false) {
      if (showLoading) setLogsLoading(true);
      authedFetch(`${ADMIN_BASE}/logs/paged?page=${logPage}&pageSize=${logPageSize}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!ignore && data) {
            setLogs(data.items || []);
            setLogTotalCount(data.totalCount || 0);
            setLogTotalPages(data.totalPages || 0);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!ignore && showLoading) setLogsLoading(false);
        });
    }
    fetchLogs(true);
    const intervalId = setInterval(fetchLogs, 4000);
    return () => {
      ignore = true;
      clearInterval(intervalId);
    };
  }, [activeTab, logPage]);

  async function fetchTransitRoutes() {
    setTransitLoading(true);
    try {
      const response = await authedFetch(TRANSIT_ROUTE_BASE);
      if (response.ok) {
        const data = await response.json();
        setTransitRoutes(data);
        // Hoca ödevi (31 Ağustos): liste açılır açılmaz her güzergahın buton metni
        // ("Simülasyonu Başlat" mı "Durdur" mu) doğru görünsün diye, tıklama beklemeden
        // uçların hepsine tek seferlik durum sorgusu atıyoruz (public uç, izin gerektirmiyor).
        Promise.all(
          data.map((route) =>
            authedFetch(`${TRANSIT_SIMULATION_BASE}/${route.id}/state`)
              .then((res) => (res.ok ? res.json() : null))
              .then((snapshot) => (snapshot ? [route.id, snapshot.isRunning] : null))
              .catch(() => null)
          )
        ).then((results) => {
          setSimulationRunning((current) => {
            const next = { ...current };
            results.forEach((entry) => {
              if (entry) next[entry[0]] = entry[1];
            });
            return next;
          });
        });
      }
    } catch (err) {
      console.error('Güzergahlar yüklenemedi:', err);
    } finally {
      setTransitLoading(false);
    }
  }

  // Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma): "listede bir güzergaha tıklandığında
  // 'Simülasyonu Başlat' butonu çıksın (Sadece Admin ve Operatör başlatabilsin)." — buton zaten
  // canManageRoutes iznine göre koşullu render ediliyor (aşağıda), backend de AYRICA
  // ManageRoutes iznini kontrol ediyor (bkz. TransitSimulationController).
  async function toggleSimulation(route) {
    const isRunning = !!simulationRunning[route.id];
    setSimulationBusyRouteId(route.id);
    setError('');
    try {
      const response = await authedFetch(`${TRANSIT_SIMULATION_BASE}/${route.id}/${isRunning ? 'stop' : 'start'}`, { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message || (isRunning ? 'Simülasyon durdurulamadı.' : 'Simülasyon başlatılamadı.'));
        return;
      }
      setSimulationRunning((current) => ({ ...current, [route.id]: !isRunning }));
    } catch (err) {
      console.error('Simülasyon durumu değiştirilemedi:', err);
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setSimulationBusyRouteId(null);
    }
  }

  // Kullanıcının kendi bildirdiği sorun: "simülasyon başlat deyince hiçbir şey gözlemlemedim" —
  // çünkü admin panelinde harita YOK, aracı görebileceği tek yer haritadır. goToMapForRouteInfo
  // ile AYNI sessionStorage handoff deseni, ek olarak "autoFollowRouteId" ile MapPage'e
  // varır varmaz otomatik "Takip Et"i de tetikliyoruz — kullanıcı hiçbir ek tıklama yapmadan
  // hareket eden aracı görsün diye.
  function goToMapForSimulation(route) {
    sessionStorage.setItem('focusRouteId', String(route.id));
    sessionStorage.setItem('autoFollowRouteId', String(route.id));
    navigate('/');
  }

  async function fetchRouteStops(routeId) {
    setRouteStopsLoading(true);
    try {
      const response = await authedFetch(`${TRANSIT_STOP_BASE}/by-route/${routeId}`);
      setRouteStops(response.ok ? await response.json() : []);
    } catch (err) {
      console.error('Durak listesi yüklenemedi:', err);
      setRouteStops([]);
    } finally {
      setRouteStopsLoading(false);
    }
  }

  function toggleRouteExpanded(route) {
    setExpandedRouteId((current) => {
      const next = current === route.id ? null : route.id;
      if (next) fetchRouteStops(route.id);
      else setRouteStops([]);
      return next;
    });
  }

  // Kullanıcının kendi isteği: "ankaradaki tüm metro, tramvay, tren, otobüs... verilerini
  // otomatik olarak tanımlamak istiyorum haritada görünsün istiyorum hepsi yollarda çizili
  // olarak otomatik." — Beklenen JSON: bir dizi, her eleman
  //   { name, color?, province?, district?, pathWkt?, stops: [{ name, lat, lon }] }
  // Akış (Toplu POI İçe Aktarma ile AYNI mantık, ayrı bir backend ucu eklemeden):
  //   1) POST /api/TransitRoute            → hat oluştur
  //   2) POST /api/TransitStop (xN)        → durakları SIRAYLA ekle (sortOrder backend'de artıyor)
  //   3) PATCH /api/TransitRoute/{id}/path → OSM'den gelen GERÇEK hat geometrisi (varsa)
  // 3. adım sayesinde OSRM'e gerek kalmıyor: metro/tramvay zaten raylarda gidiyor, OSRM ise
  // karayolu grafiğinde çalıştığı için ray hatlarını yanlış çizerdi.
  // Aynı isimli bir hat zaten varsa ATLANIYOR (tekrar içe aktarmada kopya oluşmasın).
  async function runBulkRouteImport() {
    setRouteImportSummary(null);
    let rows;
    try {
      rows = JSON.parse(routeImportText);
      if (!Array.isArray(rows)) throw new Error('JSON bir dizi (array) olmalı.');
    } catch (err) {
      setRouteImportSummary({ created: 0, skipped: 0, stops: 0, errors: [`Geçersiz JSON: ${err.message}`] });
      return;
    }

    setRouteImportRunning(true);
    const existingNames = new Set(transitRoutes.map((route) => route.name.trim().toLocaleLowerCase('tr')));
    let created = 0;
    let skipped = 0;
    let stopCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setRouteImportProgress(`${i + 1}/${rows.length} — ${row?.name || '?'}`);
      try {
        if (!row?.name || !Array.isArray(row.stops) || row.stops.length < 2) {
          throw new Error('name ve en az 2 duraklı stops dizisi zorunlu.');
        }
        if (existingNames.has(row.name.trim().toLocaleLowerCase('tr'))) {
          skipped += 1;
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const routeResponse = await authedFetch(TRANSIT_ROUTE_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name.trim(),
            color: row.color || '#2563eb',
            province: row.province || 'Ankara',
            district: row.district || null,
          }),
        });
        if (!routeResponse.ok) {
          const body = await routeResponse.json().catch(() => null);
          throw new Error(body?.message || `Hat oluşturulamadı (HTTP ${routeResponse.status}).`);
        }
        // eslint-disable-next-line no-await-in-loop
        const route = await routeResponse.json();
        existingNames.add(row.name.trim().toLocaleLowerCase('tr'));
        created += 1;

        for (const stop of row.stops) {
          if (!stop?.name || stop.lat == null || stop.lon == null) continue;
          // eslint-disable-next-line no-await-in-loop
          const stopResponse = await authedFetch(TRANSIT_STOP_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wkt: `POINT(${stop.lon} ${stop.lat})`,
              name: stop.name,
              routeId: route.id,
            }),
          });
          if (stopResponse.ok) stopCount += 1;
        }

        if (row.pathWkt) {
          // eslint-disable-next-line no-await-in-loop
          await authedFetch(`${TRANSIT_ROUTE_BASE}/${route.id}/path`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wkt: row.pathWkt }),
          });
        }
      } catch (err) {
        errors.push(`${i + 1}. hat (${row?.name || '?'}): ${err.message}`);
      }
    }

    setRouteImportRunning(false);
    setRouteImportProgress('');
    setRouteImportSummary({ created, skipped, stops: stopCount, errors: errors.slice(0, 20) });
    if (created > 0) await fetchTransitRoutes();
  }

  async function createRoute() {
    const trimmed = newRouteName.trim();
    if (!trimmed) return;
    setCreatingRoute(true);
    try {
      const response = await authedFetch(TRANSIT_ROUTE_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          color: newRouteColor,
          province: newRouteProvince.trim() || null,
          district: newRouteDistrict.trim() || null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message || 'Güzergah eklenemedi.');
        return;
      }
      const created = await response.json();
      setTransitRoutes((current) => [created, ...current]);
      setNewRouteName('');
      setNewRouteColor('#2563eb');
      setNewRouteProvince('');
      setNewRouteDistrict('');
      setShowCreateRouteModal(false);
      // Kullanıcının kendi isteği: "direkt güzergah oluşturup durakları da ekleyebilelim
      // hızlıca" — oluşturunca kart otomatik açılsın, "Haritadan Durak Ekle" butonu hemen elin altında olsun.
      setExpandedRouteId(created.id);
      setRouteStops([]);
    } catch (err) {
      console.error('Güzergah eklenemedi:', err);
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setCreatingRoute(false);
    }
  }

  // Kullanıcının kendi isteği: "duraklat ve devam ettir deyince onay istesin silerken de
  // aynı şekilde" — confirmDeleteRoute/confirmDeleteStop ile AYNI pendingConfirm deseni.
  function confirmToggleRoutePaused(route) {
    const willPause = !route.isPaused;
    setPendingConfirm({
      title: willPause ? `"${route.name}" güzergahı duraklatılsın mı?` : `"${route.name}" güzergahı devam ettirilsin mi?`,
      message: willPause ? 'Duraklatılan güzergah haritada gösterilmez.' : 'Güzergah tekrar haritada görünür olur.',
      confirmLabel: willPause ? 'Evet, duraklat' : 'Evet, devam ettir',
      onConfirm: () => toggleRoutePaused(route),
    });
  }

  function confirmToggleStopPaused(stop) {
    const willPause = !stop.isPaused;
    setPendingConfirm({
      title: willPause ? `"${stop.name}" durağı duraklatılsın mı?` : `"${stop.name}" durağı devam ettirilsin mi?`,
      message: willPause ? 'Duraklatılan durak haritada gösterilmez, hat önceki/sonraki aktif durağı birleştirir.' : 'Durak tekrar haritada görünür olur.',
      confirmLabel: willPause ? 'Evet, duraklat' : 'Evet, devam ettir',
      onConfirm: () => toggleStopPaused(stop),
    });
  }

  // Kullanıcının kendi isteği: "istediğimiz durağı veya güzergahı duraklatma şeyi de olsun
  // duraklatınca görünmesinler" — MapSettingsModal'daki Duraklat/Devam Ettir ile AYNI desen.
  async function toggleRoutePaused(route) {
    const nextPaused = !route.isPaused;
    try {
      const response = await authedFetch(`${TRANSIT_ROUTE_BASE}/${route.id}/pause`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaused: nextPaused }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message || 'Güzergah durumu değiştirilemedi.');
        return;
      }
      setTransitRoutes((current) => current.map((r) => (r.id === route.id ? { ...r, isPaused: nextPaused } : r)));
    } catch (err) {
      console.error('Güzergah durumu değiştirilemedi:', err);
      setError('Sunucuya bağlanılamadı.');
    }
  }

  async function toggleStopPaused(stop) {
    const nextPaused = !stop.isPaused;
    try {
      const response = await authedFetch(`${TRANSIT_STOP_BASE}/${stop.id}/pause`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaused: nextPaused }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message || 'Durak durumu değiştirilemedi.');
        return;
      }
      setRouteStops((current) => current.map((s) => (s.id === stop.id ? { ...s, isPaused: nextPaused } : s)));
    } catch (err) {
      console.error('Durak durumu değiştirilemedi:', err);
      setError('Sunucuya bağlanılamadı.');
    }
  }

  function startEditingRoute(route) {
    setEditRouteName(route.name);
    setEditRouteColor(route.color);
    setEditRouteProvince(route.province || '');
    setEditRouteDistrict(route.district || '');
    setEditRouteNeighborhood(route.neighborhood || '');
    setEditingRouteId(route.id);
  }

  async function saveEditedRoute(route) {
    const trimmed = editRouteName.trim();
    if (!trimmed) return;
    try {
      const response = await authedFetch(`${TRANSIT_ROUTE_BASE}/${route.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          color: editRouteColor,
          province: editRouteProvince.trim(),
          district: editRouteDistrict.trim(),
          neighborhood: editRouteNeighborhood.trim(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message || 'Güzergah güncellenemedi.');
        return;
      }
      const updated = await response.json();
      setTransitRoutes((current) => current.map((r) => (r.id === route.id ? updated : r)));
      setEditingRouteId(null);
    } catch (err) {
      console.error('Güzergah güncellenemedi:', err);
      setError('Sunucuya bağlanılamadı.');
    }
  }

  // Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): "Güzergah üzerine 'Rota Oluştur'
  // butonu ekleyin. Rota hesaplamaları için OSRM kullanın ... Hesaplanan rotaları ilgili
  // güzergah için veritabanına kaydedin ve haritada gösterin." — backend (TransitRouteService.
  // GenerateRouteAsync) aktif durakları SortOrder'a göre OSRM'e gönderip route.RouteGeometry'yi
  // dolduruyor; burada sadece isteği atıp sonucu listeye yansıtıyoruz.
  async function generateRoute(route) {
    setGeneratingRouteId(route.id);
    setError('');
    try {
      const response = await authedFetch(`${TRANSIT_ROUTE_BASE}/${route.id}/generate-route`, { method: 'POST' });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.message || 'Rota oluşturulamadı.');
        return;
      }
      setTransitRoutes((current) => current.map((r) => (r.id === route.id ? body : r)));
    } catch (err) {
      console.error('Rota oluşturulamadı:', err);
      setError('Sunucuya bağlanılamadı.');
    } finally {
      setGeneratingRouteId(null);
    }
  }

  function startEditingStop(stop) {
    setEditStopName(stop.name);
    setEditingStopId(stop.id);
  }

  async function saveEditedStop(stop) {
    const trimmed = editStopName.trim();
    if (!trimmed) return;
    try {
      const response = await authedFetch(`${TRANSIT_STOP_BASE}/${stop.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message || 'Durak adı güncellenemedi.');
        return;
      }
      const updated = await response.json();
      setRouteStops((current) => current.map((s) => (s.id === stop.id ? updated : s)));
      setEditingStopId(null);
    } catch (err) {
      console.error('Durak adı güncellenemedi:', err);
      setError('Sunucuya bağlanılamadı.');
    }
  }

  function confirmDeleteRoute(route) {
    setPendingConfirm({
      title: `"${route.name}" güzergahı silinsin mi?`,
      message: `Bu güzergaha bağlı ${route.stopCount || 0} durak da SİLİNECEK. Bu işlem geri alınamaz.`,
      confirmLabel: 'Evet, sil',
      onConfirm: () => deleteRoute(route.id),
    });
  }

  async function deleteRoute(routeId) {
    try {
      const response = await authedFetch(`${TRANSIT_ROUTE_BASE}/${routeId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message || 'Güzergah silinemedi.');
        return;
      }
      setTransitRoutes((current) => current.filter((r) => r.id !== routeId));
      if (expandedRouteId === routeId) {
        setExpandedRouteId(null);
        setRouteStops([]);
      }
    } catch (err) {
      console.error('Güzergah silinemedi:', err);
      setError('Sunucuya bağlanılamadı.');
    }
  }

  function confirmDeleteStop(stop) {
    setPendingConfirm({
      title: `"${stop.name}" durağı silinsin mi?`,
      message: 'Bu işlem geri alınamaz.',
      confirmLabel: 'Evet, sil',
      onConfirm: () => deleteStopFromRoute(stop),
    });
  }

  async function deleteStopFromRoute(stop) {
    try {
      const response = await authedFetch(`${TRANSIT_STOP_BASE}/${stop.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message || 'Durak silinemedi.');
        return;
      }
      setRouteStops((current) => current.filter((s) => s.id !== stop.id));
      setTransitRoutes((current) => current.map((r) => (r.id === stop.routeId ? { ...r, stopCount: Math.max(0, (r.stopCount || 1) - 1) } : r)));
    } catch (err) {
      console.error('Durak silinemedi:', err);
      setError('Sunucuya bağlanılamadı.');
    }
  }

  // MapPage.jsx'teki computeDragReorder ile AYNI desen: sürüklerken CANLI önizleme, backend'e
  // sadece onDrop'ta tek bir istek (bkz. persistStopOrder).
  function computeStopDragReorder(sourceStops, draggedId, targetId) {
    if (draggedId == null || draggedId === targetId) return sourceStops;
    const draggedStop = sourceStops.find((s) => s.id === draggedId);
    if (!draggedStop) return sourceStops;
    const rest = sourceStops.filter((s) => s.id !== draggedId);
    const targetIndex = rest.findIndex((s) => s.id === targetId);
    if (targetIndex === -1) return sourceStops;
    rest.splice(targetIndex, 0, draggedStop);
    return rest;
  }

  // Kullanıcının kendi isteği: "tut sürükle kısmı daha smooth olsun şu anda direkt sürükleyince
  // ışınlanarak yer değişiyor" — klasik FLIP tekniği (First-Last-Invert-Play): sıra her
  // değiştiğinde (her dragover'da bile) satırların ESKİ konumunu bir ref'te tutuyoruz, yeni
  // DOM'a yazıldıktan sonra (useLayoutEffect, boyama öncesi) satırı eski konumundaymış gibi
  // ters transform'la "ışınlıyoruz", sonra bir sonraki frame'de transform'u sıfırlayıp CSS
  // transition ile gerçek konumuna kaydırıyoruz — kart gerçekten elle sürüklenmiş gibi görünür.
  const stopRowRefs = useRef(new Map());
  const prevStopRectsRef = useRef(new Map());
  useLayoutEffect(() => {
    const newRects = new Map();
    routeStops.forEach((stop) => {
      const el = stopRowRefs.current.get(stop.id);
      if (el) newRects.set(stop.id, el.getBoundingClientRect());
    });
    const prevRects = prevStopRectsRef.current;
    routeStops.forEach((stop) => {
      const el = stopRowRefs.current.get(stop.id);
      const prevRect = prevRects.get(stop.id);
      const newRect = newRects.get(stop.id);
      if (!el || !prevRect || !newRect) return;
      const deltaY = prevRect.top - newRect.top;
      if (Math.abs(deltaY) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${deltaY}px)`;
      void el.offsetHeight; // reflow'u zorla (transition:none'ın uygulandığından emin olmak için)
      requestAnimationFrame(() => {
        el.style.transition = 'transform 220ms ease';
        el.style.transform = '';
      });
    });
    prevStopRectsRef.current = newRects;
  }, [routeStops]);

  // Kullanıcının kendi isteği: "sıralama için çizgilerin ilk noktasından son noktasına doğru
  // sıralanmalı, aksi halde uyarı versin" — WKT'den kaba koordinatları çıkarıp ilk duraktan
  // itibaren mesafenin GENEL olarak artıp artmadığına bakan basit bir sezgisel kontrol (kesin
  // bir "doğru sıra" hesabı yok — zikzak sokaklar/döngüsel hatlar meşru olabilir, bu yüzden
  // KAYDETMEYİ ENGELLEMİYOR, sadece uyarı gösteriyor).
  function checkGeographicOrderConsistency(orderedStops) {
    if (orderedStops.length < 3) return true;
    const coords = orderedStops.map((s) => {
      const m = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(s.wkt || '');
      return m ? [Number(m[1]), Number(m[2])] : null;
    });
    if (coords.some((c) => !c)) return true;
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    let violations = 0;
    for (let i = 1; i < coords.length; i++) {
      if (dist(coords[0], coords[i]) < dist(coords[0], coords[i - 1]) - 0.002) violations++;
    }
    return violations <= Math.max(1, Math.floor(coords.length * 0.3));
  }

  async function persistStopOrder(orderedStops) {
    try {
      await authedFetch(`${TRANSIT_STOP_BASE}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopIds: orderedStops.map((s) => s.id) }),
      });
      // Sıra numaraları (sortOrder) sunucu tarafında değişti, listeyi tazeleyip senkron kalalım.
      setTransitRoutes((current) => [...current]);
      if (!checkGeographicOrderConsistency(orderedStops)) {
        setError('Uyarı: bu sıralama güzergahın ilk durağından son durağına doğru coğrafi bir düzen izlemiyor gibi görünüyor. Yine de kaydedildi — isterseniz sırayı gözden geçirin.');
      }
    } catch (err) {
      console.error('Sıralama kaydedilemedi:', err);
    }
  }

  // Hoca ödevi (Akıllı Ulaşım Modülü): "Haritada seçilen bir nokta doğrudan güzergaha durak
  // olarak eklenebilmelidir." — sessionStorage'a hedef güzergah id'sini yazıp MapPage'e (/)
  // yönlendiriyoruz, orada Durak Ekle aracı bu güzergaha kilitli otomatik açılıyor.
  function goToMapForStop(route) {
    sessionStorage.setItem('pendingStopRouteId', String(route.id));
    // Kullanıcının kendi isteği: "haritadan durak ekle" mevcut durakları sığdıracak şekilde
    // yakınlaşsın — 0 durak varsa fit edilecek bir extent yok, MapPage bu durumda genel
    // görünümde kalır (bkz. MapPage.jsx 'pendingStopRouteId' handoff effect'i).
    if (route.stopCount > 0) {
      sessionStorage.setItem('fitStopRouteId', String(route.id));
    }
    navigate('/');
  }

  // Kullanıcının kendi isteği: "güzergahların yanında bilgi şeyi olsun tıklayınca tüm
  // durakları falan haritada sadece o hatlar olacak şekilde ve oraya yakınlaşmış şekilde
  // göstersin" — goToMapForStop ile AYNI sessionStorage handoff deseni, MapPage mount'ta
  // bunu okuyup o güzergahı izole gösterip extent'ine fit ediyor (bkz. MapPage.jsx focusRouteId).
  function goToMapForRouteInfo(route) {
    // Kullanıcının kendi isteği: 0 duraklı bir güzergahta "Bilgi" haritaya gitmesin,
    // gidilecek bir şey olmadığı için kullanıcıyı boş bir haritada bırakmak yerine
    // uyarsın.
    if (!route.stopCount) {
      setError(`"${route.name}" güzergahının henüz durağı yok, haritada gösterilecek bir şey bulunmuyor.`);
      return;
    }
    sessionStorage.setItem('focusRouteId', String(route.id));
    navigate('/');
  }

  // Hoca ödevi (Akıllı Ulaşım Modülü): "Güzergah Yönetimi" sekmesi lazy-load — activeTab
  // 'transit' olunca ilk kez güzergah listesini çekiyoruz (loadAll'daki Promise.all'a
  // KATILMADI, tercih notunda belirtildiği gibi daha verimli).
  useEffect(() => {
    if (activeTab !== 'transit' || transitRoutes.length > 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTransitRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ---- Kullanıcılar ----
  function stageRoleAssignment(userId, roleId) {
    const role = roles.find((r) => r.id === roleId);
    setUsers((cur) =>
      cur.map((u) => (u.id === userId ? { ...u, roleId, roleName: role?.name, roleColor: role?.color } : u))
    );
  }

  function assignRole(userId, roleId) {
    const targetUser = users.find((user) => user.id === userId);
    const currentRole = roles.find((role) => role.id === targetUser?.roleId);
    const nextRole = roles.find((role) => role.id === roleId);
    if (!targetUser || !nextRole || targetUser.roleId === roleId) return;
    setPendingConfirm({
      title: 'Kullanıcı rolünü değiştir',
      message: `${targetUser.username} kullanıcısının rolü ${currentRole?.name || 'atanmamış'} yerine ${nextRole.name} olarak taslağa alınacak. Sunucuya ancak alttaki Kaydet düğmesine bastığında uygulanır.`,
      confirmLabel: 'Taslağa al',
      danger: false,
      onConfirm: () => stageRoleAssignment(userId, roleId),
    });
  }

  function toggleSort(key) {
    setUserSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  }

  function sortArrow(key) {
    if (userSort.key !== key) return '';
    return userSort.dir === 'asc' ? ' ▲' : ' ▼';
  }

  async function createUser() {
    const trimmed = newUsername.trim();
    if (!trimmed || !newUserPassword) return;
    const response = await authedFetch(`${ADMIN_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: trimmed, password: newUserPassword, roleId: newUserRoleId }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.message || 'Kullanıcı oluşturulamadı.');
      return;
    }
    setError('');
    setNewUsername('');
    setNewUserPassword('');
    setCreatingUser(false);
    await loadAll();
  }

  function deleteUser(user) {
    setPendingConfirm({
      title: `"${user.username}" kullanıcısını çıkar`,
      message: 'Kullanıcı kalıcı olarak silinmez, çöp kutusuna alınır ve giriş yapamaz hale gelir.',
      onConfirm: async () => {
        const response = await authedFetch(`${ADMIN_BASE}/users/${user.id}`, { method: 'DELETE' });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setError(data?.message || 'Kullanıcı çıkarılamadı.');
          return;
        }
        setError('');
        setUsers((cur) => cur.filter((u) => u.id !== user.id));
        setSavedUsers((cur) => cur.filter((u) => u.id !== user.id));
      },
    });
  }

  function toggleUserExpanded(id) {
    setExpandedUserIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Bir izin zaten kullanıcının rolünde varsa checkbox devre dışı + "rolden geliyor"
  // rozeti gösteriliyor, tıklanamıyor bile — hocanın Gün 6 isteği birebir bu: "bir yetki
  // kullanıcının rolünde zaten tanımlıysa kullanıcı sekmesinde tekrar seçim yaptırmayın,
  // yetkinin rolden geldiğini arayüzde belirtin."
  function toggleUserPermission(user, code) {
    const role = roles.find((r) => r.id === user.roleId);
    if (role?.permissionCodes.includes(code)) return; // rolden geliyor, dokunulmuyor

    const has = user.directPermissionCodes.includes(code);
    const nextCodes = sortCodes(has ? user.directPermissionCodes.filter((c) => c !== code) : [...user.directPermissionCodes, code]);
    const permission = permissions.find((item) => item.code === code);
    setPendingConfirm({
      title: has ? 'Kullanıcı iznini kaldır' : 'Kullanıcı izni ekle',
      message: `${user.username} kullanıcısı için “${permission?.name || code}” izni ${has ? 'kaldırılacak' : 'eklenecek'} ve taslağa alınacak. Sunucuya Kaydet düğmesiyle uygulanır.`,
      confirmLabel: has ? 'İzni kaldır' : 'İzni ekle',
      danger: false,
      onConfirm: () => setUsers((cur) => cur.map((u) => (u.id === user.id ? { ...u, directPermissionCodes: nextCodes } : u))),
    });
  }

  // ---- Roller: taslak (yerel) düzenleme — sunucuya hemen gitmiyor ----
  function editRoleDraft(roleId, patch) {
    setRoles((cur) => cur.map((r) => (r.id === roleId ? { ...r, ...patch } : r)));
  }

  function toggleRolePermission(roleId, code) {
    setRoles((cur) =>
      cur.map((r) => {
        if (r.id !== roleId) return r;
        const has = r.permissionCodes.includes(code);
        const next = sortCodes(has ? r.permissionCodes.filter((c) => c !== code) : [...r.permissionCodes, code]);
        return { ...r, permissionCodes: next };
      })
    );
  }

  async function createRole() {
    const trimmed = newRoleName.trim();
    if (!trimmed) return;
    const response = await authedFetch(ROLE_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, color: newRoleColor, description: newRoleDescription.trim() || null }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.message || 'Rol oluşturulamadı.');
      return;
    }
    setError('');
    setNewRoleName('');
    setNewRoleDescription('');
    setNewRoleColor('#6b7280');
    setCreatingRole(false);
    await loadAll();
  }

  function deleteRole(role) {
    setPendingConfirm({
      title: `"${role.name}" rolünü sil`,
      message: 'Bu işlem geri alınamaz.',
      onConfirm: async () => {
        const response = await authedFetch(`${ROLE_BASE}/${role.id}`, { method: 'DELETE' });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setError(data?.message || 'Rol silinemedi.');
          return;
        }
        setError('');
        setRoles((cur) => cur.filter((r) => r.id !== role.id));
        setSavedRoles((cur) => cur.filter((r) => r.id !== role.id));
      },
    });
  }

  // ---- Kategoriler: taslak (yerel) düzenleme — sunucuya hemen gitmiyor ----
  function editCategoryDraft(categoryId, patch) {
    setCategories((cur) => cur.map((c) => (c.id === categoryId ? { ...c, ...patch } : c)));
  }

  async function createCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const response = await authedFetch(CATEGORY_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmed,
        description: newCategoryDescription.trim() || null,
        color: newCategoryColor,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.message || 'Kategori oluşturulamadı.');
      return;
    }
    setError('');
    setNewCategoryName('');
    setNewCategoryDescription('');
    setNewCategoryColor('#6b7280');
    setCreatingCategory(false);
    await loadAll();
  }

  function deleteCategory(category) {
    setPendingConfirm({
      title: `"${category.name}" kategorisini sil`,
      message: 'Üzerindeki nokta/çizgi/alanlar silinmez, sadece kategorisiz kalır.',
      onConfirm: async () => {
        const response = await authedFetch(`${CATEGORY_BASE}/${category.id}`, { method: 'DELETE' });
        if (!response.ok) {
          setError('Kategori silinemedi.');
          return;
        }
        setError('');
        setCategories((cur) => cur.filter((c) => c.id !== category.id));
        setSavedCategories((cur) => cur.filter((c) => c.id !== category.id));
      },
    });
  }

  // ---- POI Yönetimi (Hoca ödevi: POI/Rol/Operatör) ----
  function deletePoi(poi) {
    setPendingConfirm({
      title: `"${poi.name}" POI'sini sil`,
      message: 'Bu işlem geri alınamaz.',
      onConfirm: async () => {
        const response = await authedFetch(`${POI_BASE}/${poi.id}`, { method: 'DELETE' });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setError(data?.message || 'POI silinemedi.');
          return;
        }
        setError('');
        setPois((cur) => cur.filter((p) => p.id !== poi.id));
      },
    });
  }

  // Hoca ödevi (25 Ağustos — Konum Analizi): "poi verisi oluşturun, ne kadar çok veri olursa
  // o kadar iyi sonuç verecektir." Beklenen JSON biçimi: bir dizi, her satır
  // { name, categoryName, parentCategoryName?, province, district?, lat, lon, icon?,
  // workingHours? }. Mevcut TEKLİ POST /api/Poi ve POST /api/PoiCategory uçlarını sırayla
  // çağırıyor — ayrı bir "toplu" backend endpoint'i BİLİNÇLİ olarak eklenmedi, birkaç yüz
  // satırlık bir admin işlemi için gereken en basit yol bu, sunucu tarafında yeni bir kod
  // yolu/migration riski almaya değmez.
  async function runBulkPoiImport() {
    setBulkImportSummary(null);
    let rows;
    try {
      rows = JSON.parse(bulkImportText);
      if (!Array.isArray(rows)) throw new Error('JSON bir dizi (array) olmalı.');
    } catch (err) {
      setBulkImportSummary({ created: 0, updated: 0, skipped: 0, failed: 0, errors: [`Geçersiz JSON: ${err.message}`] });
      return;
    }
    if (rows.length === 0) {
      setBulkImportSummary({ created: 0, updated: 0, skipped: 0, failed: 0, errors: ['Liste boş.'] });
      return;
    }

    setBulkImportRunning(true);
    // Aynı isimdeki kategori tekrar tekrar oluşturulmasın diye (hem mevcut kategoriler hem bu
    // içe aktarma sırasında YENİ oluşturulanlar) bir sözlükte tutuyoruz.
    const categoryIdByName = new Map(
      poiCategories.map((c) => [`${c.parentId || ''}::${c.name.trim().toLocaleLowerCase('tr')}`, c.id])
    );

    async function findOrCreateCategoryId(name, parentName) {
      if (!name) return null;
      let parentId = null;
      if (parentName) {
        parentId = await findOrCreateCategoryId(parentName, null);
      }
      const key = `${parentId || ''}::${name.trim().toLocaleLowerCase('tr')}`;
      if (categoryIdByName.has(key)) return categoryIdByName.get(key);
      const response = await authedFetch(POI_CATEGORY_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), parentId: parentId || null }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.id) throw new Error(data?.message || `"${name}" kategorisi oluşturulamadı.`);
      categoryIdByName.set(key, data.id);
      return data.id;
    }

    // Kullanıcının kendi isteği (26 Ağustos, 6. tur): "aynı mekan aynı lokasyondaysa onları
    // atlasın sadece kategorisi farklıysa değiştirsin lütfen yenisi eklenecekse bile." — her
    // satır önce MEVCUT POI'lere (aynı isim + ~150m yakınlık) karşı kontrol ediliyor: eşleşme
    // varsa ve kategori de aynıysa hiçbir şey yapılmıyor (skip), kategori farklıysa yeni POI
    // OLUŞTURULMUYOR, mevcut olan PATCH ile güncelleniyor. `knownPois` bu içe aktarmanın
    // KENDİ içinde de (aynı JSON'da aynı yer iki kez geçerse) aynı mantığı uygulayabilmek için
    // her create/update sonrası güncellenen, `pois` state'inin yerel bir kopyası.
    const knownPois = pois.map((p) => ({ ...p }));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row?.name || row.lat == null || row.lon == null) {
          throw new Error('name, lat, lon alanları zorunlu.');
        }
        const categoryId = row.categoryName
          // eslint-disable-next-line no-await-in-loop
          ? await findOrCreateCategoryId(row.categoryName, row.parentCategoryName)
          : null;
        const rowPoint = { lat: Number(row.lat), lon: Number(row.lon) };
        const existing = knownPois.find((poi) => (
          !poi.isDeleted
          && normalizePoiName(poi.name) === normalizePoiName(row.name)
          && isSameLocation(parseWktPoint(poi.wkt), rowPoint)
        ));

        if (existing) {
          if ((existing.categoryId ?? null) === (categoryId ?? null)) {
            skipped += 1;
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          const response = await authedFetch(`${POI_BASE}/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              wkt: existing.wkt,
              name: existing.name,
              categoryId,
              workingHours: existing.workingHours || null,
              note: existing.note || null,
              icon: existing.icon || row.icon || null,
              province: existing.province || row.province || null,
              district: existing.district || row.district || null,
            }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => null);
            throw new Error(data?.message || `HTTP ${response.status}`);
          }
          const data = await response.json().catch(() => null);
          if (data) Object.assign(existing, data);
          updated += 1;
          continue;
        }

        // Kullanıcının kendi isteği (26 Ağustos): toplu içe aktarılan POI'ler belirli bir
        // haritaya bağlanmasın — "evrensel, herkes için her haritada geçerli, gömülü harita
        // verisi gibi". mapId göndermiyoruz (backend null olarak kabul ediyor); GetCatalogAsync
        // zaten MapId'ye göre filtrelemediği için bu POI'ler tüm haritalarda aynı şekilde
        // görünür. Sadece yöneticiler "atanmamış" POI oluşturabilir/düzenleyebilir — bulk
        // import panel zaten admin'e özel.
        // eslint-disable-next-line no-await-in-loop
        const response = await authedFetch(POI_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wkt: `POINT(${row.lon} ${row.lat})`,
            name: row.name,
            categoryId,
            province: row.province || null,
            district: row.district || null,
            icon: row.icon || null,
            workingHours: row.workingHours || null,
            mapId: null,
          }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.message || `HTTP ${response.status}`);
        }
        const data = await response.json().catch(() => null);
        if (data) knownPois.push(data);
        created += 1;
      } catch (err) {
        errors.push(`${i + 1}. satır (${row?.name || '?'}): ${err.message}`);
      }
    }

    setBulkImportRunning(false);
    setBulkImportSummary({ created, updated, skipped, failed: errors.length, errors: errors.slice(0, 20) });
    if (created > 0 || updated > 0) await loadAll();
  }

  // Kullanıcının kendi isteği: mevcut POI/kategorileri temizleyip sıfırdan başlayabilmek
  // için — mevcut TEKLİ silme uçlarını (soft-delete, is_deleted=true) döngüyle çağırıyor,
  // "gerçek" bir toplu silme endpoint'i YOK (aynı "en basit yol" kararı bulk import'taki gibi).
  // Kategorileri POI'lerden SONRA siliyoruz (bir POI hâlâ bağlıyken kategori silinmeye
  // çalışılırsa backend muhtemelen reddeder/uyarı verir).
  function resetAllPoisAndCategories() {
    setPendingConfirm({
      title: 'Tüm POI ve kategorileri sıfırla',
      message: `${pois.length} POI ve ${poiCategories.length} kategori silinecek (yumuşak silme — çöp kutusundan geri alınabilir).`,
      confirmLabel: 'Hepsini sil',
      danger: true,
      onConfirm: async () => {
        setResetAllLoading(true);
        for (const poi of pois) {
          // eslint-disable-next-line no-await-in-loop
          await authedFetch(`${POI_BASE}/${poi.id}`, { method: 'DELETE' });
        }
        for (const cat of poiCategories) {
          // eslint-disable-next-line no-await-in-loop
          await authedFetch(`${POI_CATEGORY_BASE}/${cat.id}`, { method: 'DELETE' });
        }
        setResetAllLoading(false);
        await loadAll();
      },
    });
  }

  async function createPoiCategory() {
    const trimmed = newPoiCategoryName.trim();
    if (!trimmed) return;
    const response = await authedFetch(POI_CATEGORY_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: trimmed,
        description: newPoiCategoryDescription.trim() || null,
        parentId: newPoiCategoryParentId || null,
        icon: newPoiCategoryIcon || null,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.message || 'POI kategorisi oluşturulamadı.');
      return;
    }
    setError('');
    setNewPoiCategoryName('');
    setNewPoiCategoryDescription('');
    setNewPoiCategoryParentId('');
    setNewPoiCategoryIcon('');
    setCreatingPoiCategory(false);
    await loadAll();
  }

  async function updatePoiCategory(category, patch) {
    const response = await authedFetch(`${POI_CATEGORY_BASE}/${category.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.message || 'POI kategorisi güncellenemedi.');
      return;
    }
    setError('');
    await loadAll();
  }

  function savePoiCategoryDraft(category) {
    const name = poiCategoryDraft?.name?.trim();
    const description = poiCategoryDraft?.description?.trim() || null;
    const icon = poiCategoryDraft?.icon || null;
    if (!name) return;
    if (
      name === category.name &&
      description === (category.description || null) &&
      icon === (category.icon || null)
    ) {
      setEditingPoiCategoryId(null);
      setPoiCategoryDraft(null);
      return;
    }
    setPendingConfirm({
      title: 'POI kategorisini güncelle',
      message: `“${category.name}” kategorisinin adı, açıklaması veya ikonu değişecek. Bu kategoriye bağlı POI kayıtları korunur.`,
      confirmLabel: 'Değişiklikleri uygula',
      danger: false,
      onConfirm: async () => {
        await updatePoiCategory(category, { name, description, updateDescription: true, icon, updateIcon: true });
        setEditingPoiCategoryId(null);
        setPoiCategoryDraft(null);
      },
    });
  }

  function movePoiCategory(category, parentIdValue, sortOrder = 0) {
    const parentId = parentIdValue === '' ? null : Number(parentIdValue);
    if (parentId === category.parentId && Number(sortOrder) === Number(category.sortOrder || 0)) return;
    const parent = poiCategories.find((item) => item.id === parentId);
    setPendingConfirm({
      title: 'POI kategorisini taşı',
      message: `“${category.name}” kategorisi ${parent ? `“${parent.name}” altına` : 'kök seviyesine'} taşınacak. Alt kategorileri birlikte korunur.`,
      confirmLabel: 'Taşı',
      danger: false,
      onConfirm: () => updatePoiCategory(category, {
        parentId,
        moveToRoot: parentId === null,
        sortOrder,
      }),
    });
  }

  function canMovePoiCategoryTo(categoryId, parentId) {
    let currentId = parentId;
    let guard = 0;
    while (currentId != null && guard++ < poiCategories.length + 1) {
      if (currentId === categoryId) return false;
      currentId = poiCategories.find((item) => item.id === currentId)?.parentId ?? null;
    }
    return true;
  }

  function getPoiCategoryDropMode(event, targetElement = event.currentTarget) {
    const rect = targetElement.getBoundingClientRect();
    return event.clientY <= rect.top + rect.height * 0.34 ? 'before' : 'inside';
  }

  function completePoiCategoryMove(draggedId, target, mode) {
    const dragged = poiCategories.find((item) => item.id === draggedId);
    if (!dragged || !target || dragged.id === target.id) return;
    if (mode === 'invalid') {
      setError('Bir kategori kendi alt kategorisinin altına taşınamaz.');
      return;
    }
    if (mode === 'inside') {
      const children = poiCategories.filter((item) => item.parentId === target.id);
      movePoiCategory(dragged, target.id, children.length);
      return;
    }
    const siblings = poiCategories
      .filter((item) => item.parentId === target.parentId && item.id !== dragged.id)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    movePoiCategory(dragged, target.parentId ?? '', Math.max(0, siblings.findIndex((item) => item.id === target.id)));
  }

  function getPoiCategoryPointerTarget(event, draggedId) {
    const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest('.admin-poi-category-item');
    const targetId = Number(targetElement?.dataset.poiCategoryId);
    const target = poiCategories.find((item) => item.id === targetId);
    if (!target || target.id === draggedId) return null;
    const requestedMode = getPoiCategoryDropMode(event, targetElement);
    const requestedParentId = requestedMode === 'inside' ? target.id : target.parentId;
    const mode = canMovePoiCategoryTo(draggedId, requestedParentId) ? requestedMode : 'invalid';
    return { id: target.id, mode };
  }

  function beginPoiCategoryPointerDrag(event, draggedId) {
    if (event.button !== 0) return;
    event.preventDefault();
    let latestTarget = null;
    setDraggedPoiCategoryId(draggedId);
    setPoiCategoryDropTarget(null);

    function handlePointerMove(pointerEvent) {
      pointerEvent.preventDefault();
      latestTarget = getPoiCategoryPointerTarget(pointerEvent, draggedId);
      setPoiCategoryDropTarget(latestTarget);
    }

    function cleanup() {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      setDraggedPoiCategoryId(null);
      setPoiCategoryDropTarget(null);
    }

    function handlePointerUp() {
      if (latestTarget) {
        const target = poiCategories.find((item) => item.id === latestTarget.id);
        completePoiCategoryMove(draggedId, target, latestTarget.mode);
      }
      cleanup();
    }

    function handlePointerCancel() {
      cleanup();
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
  }

  function beginAdminPoiEdit(poi) {
    setAdminPoiDraft({
      name: poi.name || '',
      categoryId: poi.categoryId || '',
      workingHours: poi.workingHours || '',
      schedule: normalizePoiSchedule(poi.schedule),
      scheduleExceptions: Array.isArray(poi.scheduleExceptions) ? poi.scheduleExceptions : [],
      note: poi.note || '',
      province: poi.province || '',
      district: poi.district || '',
      icon: poi.icon || '',
      wkt: poi.wkt,
    });
    setEditingAdminPoi(true);
  }

  async function reverseGeocodePoi(wkt) {
    const match = /POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i.exec(wkt || '');
    if (!match) return null;
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${match[2]}&lon=${match[1]}&zoom=14&addressdetails=1`, {
        headers: { 'Accept-Language': 'tr' },
      });
      if (!response.ok) return null;
      const address = (await response.json()).address || {};
      return {
        province: address.province || address.state || address.region || null,
        district: address.town || address.city_district || address.county || address.city || null,
      };
    } catch {
      return null;
    }
  }

  async function saveAdminPoi() {
    if (!selectedPoiDetail || !adminPoiDraft?.name?.trim()) return;
    setSavingAdminPoi(true);
    try {
      const location = await reverseGeocodePoi(adminPoiDraft.wkt);
      const body = {
        name: adminPoiDraft.name.trim(),
        categoryId: adminPoiDraft.categoryId ? Number(adminPoiDraft.categoryId) : null,
        workingHours: adminPoiDraft.workingHours.trim() || null,
        schedule: adminPoiDraft.schedule,
        scheduleExceptions: adminPoiDraft.scheduleExceptions,
        note: adminPoiDraft.note.trim() || null,
        icon: adminPoiDraft.icon || null,
        province: location?.province || adminPoiDraft.province.trim() || null,
        district: location?.district || adminPoiDraft.district.trim() || null,
        wkt: adminPoiDraft.wkt,
      };
      const response = await authedFetch(`${POI_BASE}/${selectedPoiDetail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.message || 'POI güncellenemedi.');
        return;
      }
      setPois((current) => current.map((item) => (item.id === data.id ? data : item)));
      setSelectedPoiDetail(data);
      setEditingAdminPoi(false);
      setAdminPoiDraft(null);
      setError('');
    } finally {
      setSavingAdminPoi(false);
    }
  }

  function changePoiStatus(poi) {
    const nextActive = poi.isActive === false;
    setPendingConfirm({
      title: nextActive ? 'POI’yi devam ettir' : 'POI’yi duraklat',
      message: nextActive
        ? `“${poi.name}” yeniden aktif ve belirgin gösterilecek.`
        : `“${poi.name}” silinmeyecek; bütün haritalarda silik ve duraklatılmış olarak gösterilecek.`,
      onConfirm: async () => {
        const response = await authedFetch(`${POI_BASE}/${poi.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: nextActive }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setError(data?.message || 'POI durumu güncellenemedi.');
          return;
        }
        setPois((current) => current.map((item) => item.id === data.id ? data : item));
        setSelectedPoiDetail((current) => current?.id === data.id ? data : current);
        setError('');
      },
    });
  }

  function deletePoiCategory(category) {
    setPendingConfirm({
      title: `"${category.name}" POI kategorisini sil`,
      message: 'Alt kategorileri varsa kök seviyeye taşınır; bu kategorideki POI\'ler kategorisiz kalır.',
      onConfirm: async () => {
        const response = await authedFetch(`${POI_CATEGORY_BASE}/${category.id}`, { method: 'DELETE' });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setError(data?.message || 'POI kategorisi silinemedi.');
          return;
        }
        setError('');
        await loadAll();
      },
    });
  }

  // ---- Discord tarzı "kaydedilmemiş değişiklikler" barı ----
  const rolesDirty = JSON.stringify(roles) !== JSON.stringify(savedRoles);
  const categoriesDirty = JSON.stringify(categories) !== JSON.stringify(savedCategories);
  const usersDirty = JSON.stringify(users) !== JSON.stringify(savedUsers);
  const hasPendingChanges = usersDirty || rolesDirty || categoriesDirty;

  async function commitPendingChanges() {
    setSaving(true);
    try {
      for (const user of users) {
        const saved = savedUsers.find((item) => item.id === user.id);
        if (!saved) continue;

        if (user.roleId !== saved.roleId) {
          const roleResponse = await authedFetch(`${ADMIN_BASE}/users/${user.id}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId: user.roleId }),
          });
          if (!roleResponse.ok) {
            const data = await roleResponse.json().catch(() => null);
            setError(data?.message || `“${user.username}” kullanıcısının rolü kaydedilemedi.`);
            return;
          }
        }

        if (JSON.stringify(sortCodes(user.directPermissionCodes)) !== JSON.stringify(sortCodes(saved.directPermissionCodes))) {
          const permissionResponse = await authedFetch(`${ADMIN_BASE}/users/${user.id}/permissions`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissionCodes: sortCodes(user.directPermissionCodes) }),
          });
          if (!permissionResponse.ok) {
            const data = await permissionResponse.json().catch(() => null);
            setError(data?.message || `“${user.username}” kullanıcısının izinleri kaydedilemedi.`);
            return;
          }
        }
      }

      for (const role of roles) {
        const saved = savedRoles.find((r) => r.id === role.id);
        if (!saved) continue;
        const changed = JSON.stringify(role) !== JSON.stringify(saved);
        if (!changed) continue;
        const body = {
          name: role.name,
          description: role.description,
          color: role.color,
          permissionCodes: role.permissionCodes,
        };
        const response = await authedFetch(`${ROLE_BASE}/${role.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setError(data?.message || `"${role.name}" rolü kaydedilemedi.`);
        }
      }

      for (const cat of categories) {
        const saved = savedCategories.find((c) => c.id === cat.id);
        if (!saved) continue;
        if (cat.name === saved.name && cat.color === saved.color && (cat.description || '') === (saved.description || '')) continue;
        await authedFetch(`${CATEGORY_BASE}/${cat.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: cat.name, description: cat.description || '', color: cat.color }),
        });
      }

      await loadAll();
      refreshMe(); // kendi rolün değiştiyse izinlerin anında güncellensin
    } finally {
      setSaving(false);
    }
  }

  function discardPendingChanges() {
    setUsers(savedUsers);
    setRoles(savedRoles);
    setCategories(savedCategories);
    setError('');
  }

  function requestCommitPendingChanges() {
    const parts = [];
    if (usersDirty) parts.push('kullanıcı rolü/izinleri');
    if (rolesDirty) parts.push('rol tanımları');
    if (categoriesDirty) parts.push('kategori tanımları');
    setPendingConfirm({
      title: 'Değişiklikleri kaydet',
      message: `${parts.join(', ')} sunucuya uygulanacak. Yetki değişiklikleri ilgili kullanıcıların erişimini etkileyebilir.`,
      confirmLabel: 'Kaydet ve uygula',
      danger: false,
      onConfirm: commitPendingChanges,
    });
  }

  function toggleRoleExpanded(id) {
    setExpandedRoleIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleLogout() {
    clearAuth();
    navigate('/login');
  }

  function goToUsersFilteredByRole(roleId) {
    setActiveTab('users');
    setRoleFilter(roleId);
  }

  const roleCounts = {};
  users.forEach((u) => {
    roleCounts[u.roleName] = (roleCounts[u.roleName] || 0) + 1;
  });

  const filteredUsers = users
    .filter((u) => u.username.toLowerCase().includes(userSearch.toLowerCase()))
    .filter((u) => !roleFilter || u.roleId === roleFilter)
    .sort((a, b) => {
      let cmp;
      if (userSort.key === 'role') cmp = a.roleName.localeCompare(b.roleName);
      else if (userSort.key === 'date') cmp = new Date(a.createdDate) - new Date(b.createdDate);
      else cmp = a.username.localeCompare(b.username);
      return userSort.dir === 'asc' ? cmp : -cmp;
    });

  const roleFilterInfo = roleFilter ? roles.find((r) => r.id === roleFilter) : null;

  const poiProvinceOptions = [...new Set(pois.map((poi) => poi.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));

  // Kullanıcının kendi isteği: "arayınca çıksın veya şehre, ilçeye göre filtre olsun" —
  // poiProvinceOptions/poiFiltered ile AYNI desen, tamamen client-side.
  const transitProvinceOptions = [...new Set(transitRoutes.map((r) => r.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const transitDistrictOptions = [...new Set(
    transitRoutes.filter((r) => !transitProvinceFilter || r.province === transitProvinceFilter).map((r) => r.district).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'tr'));
  const filteredTransitRoutes = transitRoutes.filter((route) => {
    const matchesSearch = !transitSearch.trim() || route.name.toLocaleLowerCase('tr').includes(transitSearch.trim().toLocaleLowerCase('tr'));
    const matchesProvince = !transitProvinceFilter || route.province === transitProvinceFilter;
    const matchesDistrict = !transitDistrictFilter || route.district === transitDistrictFilter;
    return matchesSearch && matchesProvince && matchesDistrict;
  });
  const poiDistrictOptions = [...new Set(pois
    .filter((poi) => !poiProvinceFilter || poi.province === poiProvinceFilter)
    .map((poi) => poi.district)
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const filteredPois = pois
    .filter((poi) => `${poi.name} ${poi.addedByUsername || ''} ${poi.mapName || ''}`.toLocaleLowerCase('tr').includes(poiSearch.toLocaleLowerCase('tr')))
    .filter((poi) => !poiCategoryFilter || String(poi.categoryId || '') === String(poiCategoryFilter))
    .filter((poi) => !poiProvinceFilter || poi.province === poiProvinceFilter)
    .filter((poi) => !poiDistrictFilter || poi.district === poiDistrictFilter)
    .filter((poi) => poiStatusFilter === 'all'
      || (poiStatusFilter === 'active' && poi.isActive !== false)
      || (poiStatusFilter === 'paused' && poi.isActive === false))
    .sort((a, b) => {
      let comparison;
      if (poiSort.key === 'createdDate') comparison = new Date(a.createdDate) - new Date(b.createdDate);
      else comparison = String(a[poiSort.key] || '').localeCompare(String(b[poiSort.key] || ''), 'tr');
      return poiSort.dir === 'asc' ? comparison : -comparison;
    });

  // Kullanıcının kendi isteği: "ana kategoriler açılıp kapanabilir olsun" — buildIndentedCategoryOptions
  // zaten DFS sırasıyla (bir üst kategori, hemen ardından TÜM alt kategorileri) döndürüyor,
  // bu yüzden basit bir tek geçişte üst kategori kapalıysa ondan sonraki tüm depth>0
  // satırlarını (bir sonraki depth 0'a kadar) gizleyebiliyoruz. Arama aktifken accordion
  // durumunu YOK SAYIYORUZ - aksi halde arama sonucu bir alt kategori kapalı bir üst
  // kategorinin altındaysa görünmez olurdu, bu kafa karıştırıcı olurdu.
  const poiCategorySearchTerm = poiCategorySearch.trim().toLocaleLowerCase('tr');
  const visiblePoiCategoryRows = (() => {
    const matched = buildIndentedCategoryOptions(poiCategories).filter((cat) => (
      !poiCategorySearchTerm || `${cat.name} ${cat.description || ''}`.toLocaleLowerCase('tr').includes(poiCategorySearchTerm)
    ));
    if (poiCategorySearchTerm) return matched;
    let showUntilRoot = true;
    const visible = [];
    for (const cat of matched) {
      if (cat.depth === 0) {
        showUntilRoot = expandedRootCategoryIds.has(cat.id);
        visible.push(cat);
      } else if (showUntilRoot) {
        visible.push(cat);
      }
    }
    return visible;
  })();

  function toggleRootCategoryExpanded(id) {
    setExpandedRootCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function togglePoiSort(key) {
    setPoiSort((current) => current.key === key
      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'createdDate' ? 'desc' : 'asc' });
  }

  function poiSortArrow(key) {
    if (poiSort.key !== key) return '';
    return poiSort.dir === 'asc' ? ' ▲' : ' ▼';
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>🛠️ Yönetim Paneli</h1>
          <p className="admin-subtitle">Kullanıcılar, roller ve kategoriler</p>
        </div>
        <div className="admin-header-actions">
          <button className="admin-back-button" onClick={() => navigate('/')}>
            ← Haritaya dön
          </button>
          <button className="logout-button" onClick={handleLogout}>
            <LogoutIcon /> Çıkış Yap
          </button>
        </div>
      </div>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-shell">
        <nav className="admin-tabs" aria-label="Yönetim bölümleri">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`admin-tab${activeTab === tab.key ? ' admin-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              aria-current={activeTab === tab.key ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="admin-tab-content">
          {loading ? (
            <p className="admin-hint">Yükleniyor…</p>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div>
                  <div className="admin-overview">
                    <button className="admin-stat-card admin-stat-card-clickable" onClick={() => goToUsersFilteredByRole(null)}>
                      <div className="admin-stat-number">{users.length}</div>
                      <div className="admin-stat-label">👥 Toplam kullanıcı</div>
                    </button>
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        className="admin-stat-card admin-stat-card-clickable"
                        style={roleAccentStyle(role.color)}
                        onClick={() => goToUsersFilteredByRole(role.id)}
                        title={role.description || `${role.name} rolündeki kullanıcıları gör`}
                      >
                        <div className="admin-stat-number">
                          {roleCounts[role.name] || 0}
                        </div>
                        <div className="admin-stat-label">🎭 {role.name}</div>
                      </button>
                    ))}
                    <button className="admin-stat-card admin-stat-card-clickable" onClick={() => setActiveTab('categories')}>
                      <div className="admin-stat-number">{categories.length}</div>
                      <div className="admin-stat-label">🏷️ Kategori</div>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'users' && (
                <div>
                  <div className="admin-toolbar">
                    <input
                      className="admin-search"
                      type="text"
                      placeholder="🔍 Kullanıcı ara…"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                    <SelectMenu
                      triggerClassName="select-menu-trigger-pill"
                      triggerStyle={roleFilterInfo ? roleAccentStyle(roleFilterInfo.color) : undefined}
                      // Kapalıyken (trigger) daha bilgilendirici bir özet: "Tüm roller (2 rol, 4 kişi)"
                      // ya da seçili role özel "Admin (1 kişi)". Açılan listedeki seçeneklerin
                      // kendi label'ı (options) hâlâ sade "(N kişi)" formatında kalıyor.
                      triggerLabel={
                        roleFilterInfo
                          ? `${roleFilterInfo.name} (${roleCounts[roleFilterInfo.name] || 0} kişi)`
                          : `Tüm roller (${roles.length} rol, ${users.length} kişi)`
                      }
                      value={roleFilter ?? ''}
                      onChange={(v) => setRoleFilter(v ? Number(v) : null)}
                      options={[
                        { value: '', label: `Tüm roller (${users.length} kişi)` },
                        ...roles.map((r) => ({ value: r.id, label: `${r.name} (${roleCounts[r.name] || 0} kişi)`, color: r.color })),
                      ]}
                    />
                  </div>

                  <div className="admin-section-actions">
                    <button className="admin-add-button" onClick={() => setCreatingUser(true)}>
                      + Kullanıcı Ekle
                    </button>
                  </div>

                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th className="admin-th-sortable" onClick={() => toggleSort('name')}>
                            Kullanıcı adı{sortArrow('name')}
                          </th>
                          <th className="admin-th-sortable" onClick={() => toggleSort('role')}>
                            Rol{sortArrow('role')}
                          </th>
                          <th className="admin-th-sortable" onClick={() => toggleSort('date')}>
                            Kayıt tarihi{sortArrow('date')}
                          </th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((user) => {
                          const role = roles.find((r) => r.id === user.roleId);
                          const rolePermissionCodes = role?.permissionCodes || [];
                          const expanded = expandedUserIds.has(user.id);
                          return (
                            <Fragment key={user.id}>
                              <tr className="admin-user-row" onClick={() => toggleUserExpanded(user.id)}>
                                <td>
                                  <span>
                                    {user.username}
                                    {user.username === currentUsername && <span className="admin-you-badge">sen</span>}
                                  </span>
                                </td>
                                <td>
                                  <SelectMenu
                                    value={user.roleId}
                                    triggerStyle={roleAccentStyle(role?.color || user.roleColor)}
                                    onChange={(v) => assignRole(user.id, Number(v))}
                                    options={roles.map((r) => ({ value: r.id, label: r.name, color: r.color }))}
                                  />
                                </td>
                                <td>{formatDate(user.createdDate)}</td>
                                <td>
                                  <button
                                    className="admin-role-delete"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteUser(user);
                                    }}
                                  >
                                    Çıkar
                                  </button>
                                  <button className="admin-role-toggle-perms" tabIndex={-1}>
                                    {expanded ? '▾' : '▸'}
                                  </button>
                                </td>
                              </tr>
                              {expanded && (
                                <tr>
                                  <td colSpan={4} className="admin-permissions-cell">
                                    <div className="admin-role-details">
                                      <div className="admin-role-permissions">
                                        {permissions.map((perm) => {
                                          const fromRole = rolePermissionCodes.includes(perm.code);
                                          const checked = fromRole || user.directPermissionCodes.includes(perm.code);
                                          return (
                                            <label
                                              key={perm.code}
                                              className="admin-permission-row"
                                              title={fromRole ? 'Rolden gelen izinler değiştirilemez.' : perm.description || ''}
                                            >
                                              <button
                                                type="button"
                                                className={`admin-switch${checked ? ' admin-switch-on' : ''}`}
                                                disabled={fromRole}
                                                onClick={() => toggleUserPermission(user, perm.code)}
                                              >
                                                <span className="admin-switch-knob" />
                                              </button>
                                              {permissionIcon(perm.code)} {perm.name}
                                            </label>
                                          );
                                        })}
                                      </div>
                                      {getPermissions().canManageGeoRestrictions && (
                                        <button
                                          type="button"
                                          className="admin-geo-button"
                                          onClick={() =>
                                            setGeoModalTarget({ type: 'user', id: user.id, label: `'${user.username}' kullanıcısı` })
                                          }
                                        >
                                          🗺️ Coğrafi Yetki Tanımla
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                        {filteredUsers.length === 0 && (
                          <tr>
                            <td colSpan={4} className="admin-hint">
                              Eşleşen kullanıcı yok.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'roles' && (
                <div>
                  <div className="admin-section-actions">
                    <button className="admin-add-button" onClick={() => setCreatingRole(true)}>
                      + Rol Oluştur
                    </button>
                  </div>

                  <div className="admin-role-list">
                    {roles.map((role) => (
                      <div key={role.id} className="admin-role-card" style={{ borderLeftColor: role.color }}>
                        <div className="admin-role-card-header">
                          <ColorSwatchInput
                            value={role.color}
                            onChange={(hex) => editRoleDraft(role.id, { color: hex })}
                            className="admin-role-color-input"
                            title="Rol rengi"
                          />
                          <input
                            type="text"
                            className="admin-role-name-input"
                            value={role.name}
                            onChange={(e) => editRoleDraft(role.id, { name: e.target.value })}
                          />
                          <span className="admin-role-user-count">{role.userCount} kullanıcı</span>
                          {!role.isBuiltIn && (
                            <button className="admin-role-delete" onClick={() => deleteRole(role)}>
                              Sil
                            </button>
                          )}
                          <button className="admin-role-toggle-perms" onClick={() => toggleRoleExpanded(role.id)}>
                            {expandedRoleIds.has(role.id) ? '▾' : '▸'}
                          </button>
                        </div>

                        {expandedRoleIds.has(role.id) && (
                          <div className="admin-role-details">
                            <input
                              type="text"
                              className="admin-role-description-input"
                              placeholder="Rol açıklaması (opsiyonel)…"
                              value={role.description || ''}
                              onChange={(e) => editRoleDraft(role.id, { description: e.target.value })}
                            />
                            <div className="admin-role-permissions">
                              {permissions.map((perm) => (
                                <label key={perm.code} className="admin-permission-row" title={perm.description || ''}>
                                  <button
                                    type="button"
                                    className={`admin-switch${role.permissionCodes.includes(perm.code) ? ' admin-switch-on' : ''}`}
                                    onClick={() => toggleRolePermission(role.id, perm.code)}
                                  >
                                    <span className="admin-switch-knob" />
                                  </button>
                                  {permissionIcon(perm.code)} {perm.name}
                                </label>
                              ))}
                            </div>
                            {getPermissions().canManageGeoRestrictions && (
                              <button
                                type="button"
                                className="admin-geo-button"
                                onClick={() => setGeoModalTarget({ type: 'role', id: role.id, label: `'${role.name}' rolü` })}
                              >
                                🗺️ Coğrafi Yetki Tanımla
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'categories' && (
                <div>
                  <div className="admin-section-actions">
                    <button className="admin-add-button" onClick={() => setCreatingCategory(true)}>
                      + Kategori Oluştur
                    </button>
                    <span className="admin-section-count">{categories.length} kategori</span>
                  </div>

                  <ul className="admin-category-list">
                    {categories.map((cat) => (
                      <li key={cat.id} className="admin-category-item admin-standard-category-item">
                        <ColorSwatchInput
                          value={cat.color}
                          onChange={(hex) => editCategoryDraft(cat.id, { color: hex })}
                          className="admin-role-color-input"
                          title="Kategori rengi"
                        />
                        <div className="admin-category-copy">
                          {editingCategoryId === cat.id ? (
                            <input
                              className="admin-category-name-input"
                              type="text"
                              value={cat.name}
                              autoFocus
                              onChange={(e) => editCategoryDraft(cat.id, { name: e.target.value })}
                              onBlur={() => setEditingCategoryId(null)}
                              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                            />
                          ) : (
                            <span className="admin-category-name" onClick={() => setEditingCategoryId(cat.id)}>
                              {cat.name}
                            </span>
                          )}
                          <textarea
                            className="admin-category-description-input"
                            rows={2}
                            value={cat.description || ''}
                            onChange={(e) => editCategoryDraft(cat.id, { description: e.target.value })}
                            placeholder="Kategori açıklaması ekle…"
                            aria-label={`${cat.name} kategori açıklaması`}
                          />
                        </div>
                        <span className="admin-category-meta">
                          {cat.createdByUsername ? `${cat.createdByUsername} tarafından` : ''} {formatDate(cat.createdDate)}
                        </span>
                        <button className="admin-trash-delete" onClick={() => deleteCategory(cat)}>
                          Sil
                        </button>
                      </li>
                    ))}
                    {categories.length === 0 && <p className="admin-hint">Henüz kategori yok.</p>}
                  </ul>
                </div>
              )}

              {activeTab === 'poi' && (
                <div className="admin-poi-section">
                  {/* Kullanıcının kendi isteği (7. tur): "Eklenen poiler daha açılabilir bişey
                      gibi kart gibi görünsün" — kategori kartlarıyla AYNI görsel dilde
                      (bordered, rounded kart) bir kart, "Toplu POI İçe Aktar" ise artık bu
                      kartın İÇİNDE değil, sağ üstte TEK BAŞINA bir buton (tıklayınca ayrı bir
                      modal açılıyor, bkz. bulkImportOpen + aşağıdaki modal). */}
                  <div className="admin-poi-list-card">
                    <div className="admin-poi-list-card-header">
                      <button
                        type="button"
                        className="admin-collapsible-heading"
                        onClick={() => setPoiListOpen((v) => !v)}
                        aria-expanded={poiListOpen}
                      >
                        <h3 className="admin-subsection-title">
                          {poiListOpen ? '▾' : '▸'} 📍 Eklenen POI'ler
                        </h3>
                        <span className="admin-section-count">{pois.length} POI</span>
                      </button>
                      <button
                        type="button"
                        className="admin-secondary-button admin-poi-import-trigger"
                        onClick={() => setBulkImportOpen(true)}
                      >
                        📥 Toplu İçe Aktar
                      </button>
                    </div>

                    {poiListOpen && (
                      <div className="admin-poi-list-card-body">
                        <div className="admin-poi-filterbar" aria-label="POI filtreleri">
                          <input
                            className="admin-search-input"
                            type="search"
                            placeholder="POI, ekleyen veya harita ara…"
                            value={poiSearch}
                            onChange={(event) => setPoiSearch(event.target.value)}
                          />
                          <SearchableCategorySelect
                            options={buildIndentedCategoryOptions(poiCategories)}
                            value={poiCategoryFilter}
                            onChange={setPoiCategoryFilter}
                            emptyLabel="Tüm kategoriler"
                            ariaLabel="POI kategorisine göre ara ve filtrele"
                          />
                          <select value={poiProvinceFilter} onChange={(event) => { setPoiProvinceFilter(event.target.value); setPoiDistrictFilter(''); }} aria-label="İle göre filtrele">
                            <option value="">Tüm iller</option>
                            {poiProvinceOptions.map((province) => <option key={province} value={province}>{province}</option>)}
                          </select>
                          <select value={poiDistrictFilter} onChange={(event) => setPoiDistrictFilter(event.target.value)} aria-label="İlçeye göre filtrele">
                            <option value="">Tüm ilçeler</option>
                            {poiDistrictOptions.map((district) => <option key={district} value={district}>{district}</option>)}
                          </select>
                          <select value={poiStatusFilter} onChange={(event) => setPoiStatusFilter(event.target.value)} aria-label="POI durumuna göre filtrele">
                            <option value="all">Tüm durumlar</option>
                            <option value="active">Aktif</option>
                            <option value="paused">Duraklatılmış</option>
                          </select>
                          <span className="admin-section-count">{filteredPois.length} / {pois.length} POI</span>
                        </div>
                        <div className="admin-table-wrap">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th className="admin-th-sortable" onClick={() => togglePoiSort('name')}>İsim{poiSortArrow('name')}</th>
                                <th className="admin-th-sortable" onClick={() => togglePoiSort('categoryName')}>Kategori{poiSortArrow('categoryName')}</th>
                                <th className="admin-th-sortable" onClick={() => togglePoiSort('province')}>İl{poiSortArrow('province')}</th>
                                <th className="admin-th-sortable" onClick={() => togglePoiSort('district')}>İlçe{poiSortArrow('district')}</th>
                                <th>Mesai Saatleri</th>
                                <th>Ekleyen</th>
                                <th>Harita</th>
                                <th className="admin-th-sortable" onClick={() => togglePoiSort('createdDate')}>Eklenme tarihi{poiSortArrow('createdDate')}</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredPois.map((poi) => (
                                <tr
                                  key={poi.id}
                                  className={`admin-poi-row${poi.isActive === false ? ' admin-poi-row-paused' : ''}`}
                                  onClick={() => setSelectedPoiDetail(poi)}
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') setSelectedPoiDetail(poi);
                                  }}
                                >
                                  <td>{poi.effectiveIcon || '📍'} {poi.name}{poi.isActive === false && <span className="admin-poi-paused-badge">Duraklatıldı</span>}</td>
                                  <td>{poi.categoryName || '—'}</td>
                                  <td>{poi.province || '—'}</td>
                                  <td>{poi.district || '—'}</td>
                                  <td className="admin-poi-hours-cell" title={poi.workingHours || ''}>{compactPoiSchedule(poi)}</td>
                                  <td>{poi.addedByUsername || 'Bilinmiyor'}</td>
                                  <td>{poi.mapName || <span className="admin-poi-unassigned">Atanmamış</span>}</td>
                                  <td>{formatDate(poi.createdDate)}</td>
                                  <td>
                                    <button
                                      className={`admin-poi-status-button${poi.isActive === false ? ' is-paused' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); changePoiStatus(poi); }}
                                    >
                                      {poi.isActive === false ? 'Devam' : 'Duraklat'}
                                    </button>
                                    <button className="admin-trash-delete" onClick={(e) => { e.stopPropagation(); deletePoi(poi); }}>
                                      Sil
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {filteredPois.length === 0 && (
                                <tr>
                                  <td colSpan={9} className="admin-hint">
                                    {pois.length === 0 ? 'Henüz POI eklenmemiş.' : 'Filtrelerle eşleşen POI yok.'}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="admin-poi-category-heading">
                    <h3 className="admin-subsection-title">🗂️ POI Kategorileri</h3>
                  </div>
                  <div className="admin-section-actions admin-poi-category-toolbar">
                    <button className="admin-add-button" onClick={() => setCreatingPoiCategory(true)}>
                      + Kategori Ekle
                    </button>
                    <button
                      className="admin-secondary-button admin-secondary-button-danger"
                      onClick={resetAllPoisAndCategories}
                      disabled={resetAllLoading || (pois.length === 0 && poiCategories.length === 0)}
                      title="Tüm POI'leri ve kategorileri yumuşak siler (çöp kutusundan geri alınabilir)"
                    >
                      {resetAllLoading ? 'Siliniyor…' : '🗑️ Tümünü Sıfırla'}
                    </button>
                    <span className="admin-section-count">{poiCategories.length} kategori</span>
                    <input
                      type="search"
                      className="admin-search-input admin-poi-category-search"
                      value={poiCategorySearch}
                      onChange={(event) => setPoiCategorySearch(event.target.value)}
                      placeholder="Kategori adı veya açıklama ara…"
                      aria-label="POI kategorilerinde ara"
                    />
                  </div>

                  <p className="admin-hint admin-category-drag-hint">⋮⋮ tutamacından sürükle: kartın üst kenarı sıralar, gövdesi alt kategori yapar. Her taşıma onay ister.</p>
                  <ul className="admin-category-list admin-poi-category-list">
                    {visiblePoiCategoryRows.map((cat) => {
                      const hasChildren = poiCategories.some((c) => c.parentId === cat.id);
                      const isExpanded = expandedRootCategoryIds.has(cat.id);
                      return (
                      <li
                        key={cat.id}
                        data-poi-category-id={cat.id}
                        data-category-depth={cat.depth}
                        style={{ '--category-depth': Math.min(cat.depth, 6) }}
                        className={`admin-category-item admin-poi-category-item${draggedPoiCategoryId === cat.id ? ' is-dragging' : ''}${poiCategoryDropTarget?.id === cat.id ? ` is-drop-${poiCategoryDropTarget.mode}` : ''}`}
                      >
                        {/* Kullanıcının kendi isteği (8. tur): "Sil butonu sol alta kaymış" —
                            kök neden, bu buton SADECE alt kategorisi olan üst kategorilerde
                            render edilirken grid'in 5 sabit sütunu 6'ya çıkıyor, taşan son
                            öğe (Sil) bir sonraki satıra kayıyordu. Artık slot HER SATIRDA
                            (boş bile olsa) render ediliyor ki grid sütun sayısı hep sabit
                            kalsın (bkz. App.css .admin-poi-category-item grid-template-columns). */}
                        <span className="admin-category-expand-slot">
                          {cat.depth === 0 && hasChildren && (
                            <button
                              type="button"
                              className="admin-category-expand-toggle"
                              aria-label={`${cat.name} alt kategorilerini ${isExpanded ? 'gizle' : 'göster'}`}
                              aria-expanded={isExpanded}
                              title={isExpanded ? 'Alt kategorileri gizle' : 'Alt kategorileri göster'}
                              onClick={() => toggleRootCategoryExpanded(cat.id)}
                            >
                              {isExpanded ? '▾' : '▸'}
                            </button>
                          )}
                        </span>
                        <button
                          type="button"
                          className="admin-category-drag-handle"
                          aria-label={`${cat.name} kategorisini sürükle`}
                          aria-pressed={draggedPoiCategoryId === cat.id}
                          title="Tut ve sürükle"
                          onPointerDown={(event) => beginPoiCategoryPointerDrag(event, cat.id)}
                        >
                          <span aria-hidden="true">⋮⋮</span>
                        </button>
                        {poiCategoryDropTarget?.id === cat.id && (
                          <span className={`admin-category-drop-indicator admin-category-drop-indicator-${poiCategoryDropTarget.mode}`}>
                            {poiCategoryDropTarget.mode === 'before'
                              ? 'Buraya sırala'
                              : poiCategoryDropTarget.mode === 'inside'
                                ? 'Alt kategori yap'
                                : 'Bu konuma taşınamaz'}
                          </span>
                        )}
                        {editingPoiCategoryId === cat.id ? (
                          <div className="admin-poi-category-editor">
                            <input
                              className="admin-category-name-input"
                              type="text"
                              value={poiCategoryDraft?.name || ''}
                              autoFocus
                              onChange={(event) => setPoiCategoryDraft((current) => ({ ...current, name: event.target.value }))}
                            />
                            <textarea
                              className="attribute-popup-textarea"
                              rows={2}
                              value={poiCategoryDraft?.description || ''}
                              onChange={(event) => setPoiCategoryDraft((current) => ({ ...current, description: event.target.value }))}
                              placeholder="Kategori açıklaması"
                            />
                            <IconPicker
                              value={poiCategoryDraft?.icon || ''}
                              onChange={(next) => setPoiCategoryDraft((current) => ({ ...current, icon: next }))}
                              allowEmpty
                              emptyLabel="Varsayılan (📍)"
                            />
                            <div className="admin-poi-category-editor-actions">
                              <button type="button" className="attribute-popup-cancel" onClick={() => { setEditingPoiCategoryId(null); setPoiCategoryDraft(null); }}>Vazgeç</button>
                              <button type="button" className="attribute-popup-confirm" onClick={() => savePoiCategoryDraft(cat)}>Kaydet</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="admin-poi-category-summary"
                            // Kullanıcının kendi isteği: "kategorilerin üzerine tıklayınca
                            // açılıp kapanabilir olsun" — alt kategorisi olan üst kategoride
                            // isme tıklamak artık detay modalını DEĞİL, accordion'ı açıp
                            // kapatıyor (detay için "Bilgi" butonu hâlâ duruyor). Alt kategorisi
                            // olmayanlarda (yaprak/leaf) eskisi gibi detay modalı açılıyor.
                            onClick={() => (cat.depth === 0 && hasChildren
                              ? toggleRootCategoryExpanded(cat.id)
                              : setSelectedPoiCategoryDetail(cat))}
                          >
                            <strong>
                              {cat.depth > 0 && <span className="admin-category-tree-turn" aria-hidden="true">↳</span>}
                              {cat.icon || '📍'} {cat.name}
                              <span className="admin-poi-category-count">{countPoisInCategoryTree(cat.id, poiCategories, pois)} POI</span>
                            </strong>
                            <small>{cat.description || 'Açıklama eklenmemiş'}</small>
                          </button>
                        )}
                        {editingPoiCategoryId !== cat.id && (
                          <div className="admin-poi-category-card-actions">
                            <button type="button" onClick={() => { setNewPoiCategoryParentId(cat.id); setCreatingPoiCategory(true); }}>+ Alt kategori</button>
                            <button type="button" onClick={() => { setEditingPoiCategoryId(cat.id); setPoiCategoryDraft({ name: cat.name, description: cat.description || '', icon: cat.icon || '' }); }}>Düzenle</button>
                            <button type="button" onClick={() => setSelectedPoiCategoryDetail(cat)}>Bilgi</button>
                          </div>
                        )}
                        <SelectMenu
                          triggerClassName="select-menu-trigger-pill"
                          value={cat.parentId ?? ''}
                          onChange={(v) => movePoiCategory(cat, v, 0)}
                          options={[
                            { value: '', label: 'Kök (üst kategori yok)' },
                            ...buildIndentedCategoryOptions(poiCategories, cat.id).map((opt) => ({
                              value: opt.id,
                              label: opt.label,
                            })),
                          ]}
                        />
                        <button className="admin-trash-delete" onClick={() => deletePoiCategory(cat)}>
                          Sil
                        </button>
                      </li>
                      );
                    })}
                    {poiCategories.length === 0 && <p className="admin-hint">Henüz POI kategorisi yok.</p>}
                    {poiCategories.length > 0 && buildIndentedCategoryOptions(poiCategories).every((cat) => {
                      const term = poiCategorySearch.trim().toLocaleLowerCase('tr');
                      return term && !`${cat.name} ${cat.description || ''}`.toLocaleLowerCase('tr').includes(term);
                    }) && <p className="admin-hint">Aramayla eşleşen POI kategorisi yok.</p>}
                  </ul>
                </div>
              )}

              {activeTab === 'transit' && (
                <div className="admin-poi-section">
                  {/* Hoca ödevi (Akıllı Ulaşım Modülü): "Menüye 'Güzergah Yönetimi' paneli
                      ekleyin. Yeni güzergah ekleme (isim ve renk belirleme), listeleme ve
                      düzenleme yapılabilsin." — admin-poi-list-card'ın AYNI görsel dili.
                      Kullanıcının kendi isteği (redesign turu): "çok kötü görünüyor" — kart
                      artık route.color ile TAMAMEN çerçevelenip tonlanıyor (roleAccentStyle,
                      Rol seçim kartlarıyla AYNI teknik), açılır üçgen büyütüldü, isim en
                      solda; Güzergah Ekle artık inline satır değil modal (bkz. showCreateRouteModal). */}
                  <div className="admin-poi-list-card">
                    <div className="admin-poi-list-card-header">
                      <h3 className="admin-subsection-title">🚌 Güzergahlar</h3>
                      <div className="admin-transit-header-actions">
                        <span className="admin-section-count">{transitRoutes.length} güzergah</span>
                        {/* Kullanıcının kendi isteği: "ankaradaki tüm metro, tramvay, tren,
                            otobüs verilerini... otomatik olarak tanımlamak istiyorum" */}
                        <button type="button" className="admin-add-button" onClick={() => setRouteImportOpen(true)}>
                          📥 Toplu Hat İçe Aktar
                        </button>
                        <button type="button" className="admin-add-button" onClick={() => setShowCreateRouteModal(true)}>
                          + Güzergah Ekle
                        </button>
                      </div>
                    </div>
                    <div className="admin-poi-list-card-body">
                      {/* Kullanıcının kendi isteği: "arayınca çıksın veya şehre, ilçeye göre
                          filtre olsun" — POI listesindeki arama/il filtresiyle AYNI desen. */}
                      {transitRoutes.length > 0 && (
                        <div className="admin-transit-filter-row">
                          <input
                            type="text"
                            className="admin-search-input"
                            placeholder="Güzergah ara…"
                            value={transitSearch}
                            onChange={(e) => setTransitSearch(e.target.value)}
                          />
                          <select
                            value={transitProvinceFilter}
                            onChange={(e) => { setTransitProvinceFilter(e.target.value); setTransitDistrictFilter(''); }}
                            aria-label="İle göre filtrele"
                          >
                            <option value="">Tüm iller</option>
                            {transitProvinceOptions.map((province) => <option key={province} value={province}>{province}</option>)}
                          </select>
                          <select
                            value={transitDistrictFilter}
                            onChange={(e) => setTransitDistrictFilter(e.target.value)}
                            disabled={transitDistrictOptions.length === 0}
                            aria-label="İlçeye göre filtrele"
                          >
                            <option value="">Tüm ilçeler</option>
                            {transitDistrictOptions.map((district) => <option key={district} value={district}>{district}</option>)}
                          </select>
                        </div>
                      )}

                      {transitLoading && <p className="admin-hint">Güzergahlar yükleniyor…</p>}
                      {!transitLoading && transitRoutes.length === 0 && <p className="admin-hint">Henüz güzergah yok.</p>}
                      {!transitLoading && transitRoutes.length > 0 && filteredTransitRoutes.length === 0 && (
                        <p className="admin-hint">Aramanızla eşleşen güzergah yok.</p>
                      )}

                      <ul className="admin-transit-route-list">
                        {filteredTransitRoutes.map((route) => {
                          const isExpanded = expandedRouteId === route.id;
                          const isEditingRoute = editingRouteId === route.id;
                          return (
                            <li
                              key={route.id}
                              className={`admin-transit-route-item${route.isPaused ? ' admin-transit-route-item-paused' : ''}`}
                              style={roleAccentStyle(route.color)}
                            >
                              <div className="admin-transit-route-row">
                                <div className="admin-transit-route-info">
                                  <button
                                    type="button"
                                    className="admin-transit-route-toggle-btn"
                                    onClick={() => toggleRouteExpanded(route)}
                                    aria-expanded={isExpanded}
                                    aria-label={isExpanded ? 'Güzergahı kapat' : 'Güzergahı aç'}
                                  >
                                    <span className={`admin-transit-route-arrow${isExpanded ? ' admin-transit-route-arrow-open' : ''}`} aria-hidden="true">▶</span>
                                  </button>
                                  {isEditingRoute ? (
                                    <input
                                      className="admin-category-name-input admin-transit-route-name-input"
                                      value={editRouteName}
                                      onChange={(e) => setEditRouteName(e.target.value)}
                                      autoFocus
                                    />
                                  ) : (
                                    <span className="admin-transit-route-name" onClick={() => toggleRouteExpanded(route)}>{route.name}</span>
                                  )}
                                  <span className="stop-form-route-dot admin-transit-route-color-dot" style={{ background: route.color }} title="Güzergah rengi" />
                                  <span className="admin-section-count">{route.stopCount} durak</span>
                                  {(route.province || route.district || route.neighborhood) && (
                                    <span className="admin-section-count" title="Otomatik/elle etiketlenen konum">
                                      📍 {[route.neighborhood, route.district, route.province].filter(Boolean).join(', ')}
                                    </span>
                                  )}
                                  {route.isPaused && <span className="admin-transit-paused-badge">⏸ Duraklatıldı</span>}
                                  {route.routeGeneratedAt && (
                                    <span className="admin-section-count" title="OSRM ile son rota oluşturma zamanı">
                                      🛣️ {formatDate(route.routeGeneratedAt)}
                                    </span>
                                  )}
                                </div>
                                <div className="admin-transit-route-actions">
                                  {isEditingRoute ? (
                                    <>
                                      <ColorSwatchInput value={editRouteColor} onChange={setEditRouteColor} className="admin-transit-color-input" title="Güzergah rengi" />
                                      <input
                                        className="admin-transit-inline-location-input"
                                        placeholder="İl"
                                        value={editRouteProvince}
                                        onChange={(e) => setEditRouteProvince(e.target.value)}
                                      />
                                      <input
                                        className="admin-transit-inline-location-input"
                                        placeholder="İlçe"
                                        value={editRouteDistrict}
                                        onChange={(e) => setEditRouteDistrict(e.target.value)}
                                      />
                                      {/* FAZ 2 (kullanıcının kendi isteği): normalde MapPage'de
                                          durak eklenince otomatik doluyor (bkz. reverseGeocode),
                                          burada sadece elle görüp düzeltme imkanı. */}
                                      <input
                                        className="admin-transit-inline-location-input"
                                        placeholder="Mahalle"
                                        value={editRouteNeighborhood}
                                        onChange={(e) => setEditRouteNeighborhood(e.target.value)}
                                      />
                                      <button type="button" className="admin-secondary-button" onClick={() => saveEditedRoute(route)}>Kaydet</button>
                                      <button type="button" className="admin-secondary-button" onClick={() => setEditingRouteId(null)}>Vazgeç</button>
                                    </>
                                  ) : (
                                    <>
                                      {/* Kullanıcının kendi isteği: "güzergahların yanında bilgi
                                          şeyi olsun tıklayınca... haritada sadece o hatlar
                                          olacak şekilde... yakınlaşmış şekilde göstersin" */}
                                      <button type="button" className="admin-secondary-button" onClick={() => goToMapForRouteInfo(route)} title="Haritada bu güzergaha odaklan">
                                        ℹ️ Bilgi
                                      </button>
                                      <button type="button" className="admin-secondary-button" onClick={() => startEditingRoute(route)}>✏️ Düzenle</button>
                                      <button
                                        type="button"
                                        className="admin-secondary-button"
                                        onClick={() => generateRoute(route)}
                                        disabled={generatingRouteId === route.id || (route.stopCount || 0) < 2}
                                        title={(route.stopCount || 0) < 2 ? 'Rota oluşturmak için en az 2 aktif durak gerekli.' : 'OSRM ile gerçek yol ağına göre rota hesapla'}
                                      >
                                        {generatingRouteId === route.id ? '⏳ Hesaplanıyor…' : '🛣️ Rota Oluştur'}
                                      </button>
                                      <button
                                        type="button"
                                        className={`admin-secondary-button${route.isPaused ? ' is-paused' : ''}`}
                                        onClick={() => confirmToggleRoutePaused(route)}
                                      >
                                        {route.isPaused ? '▶ Devam Ettir' : '⏸ Duraklat'}
                                      </button>
                                      {getPermissions().canManageRoutes && (
                                        <button
                                          type="button"
                                          className={`admin-secondary-button${simulationRunning[route.id] ? ' is-paused' : ''}`}
                                          onClick={() => toggleSimulation(route)}
                                          disabled={simulationBusyRouteId === route.id || (route.stopCount || 0) < 2}
                                          title={(route.stopCount || 0) < 2 ? 'Simülasyon için en az 2 aktif durak gerekli.' : 'Bu güzergahta bir aracın hareketini simüle et'}
                                        >
                                          {simulationBusyRouteId === route.id
                                            ? '⏳…'
                                            : simulationRunning[route.id]
                                              ? '⏹ Simülasyonu Durdur'
                                              : '▶ Simülasyonu Başlat'}
                                        </button>
                                      )}
                                      {/* Kullanıcının kendi bildirdiği sorun: "simülasyon başlat
                                          deyince hiçbir şey gözlemlemedim" — burada harita yok,
                                          aracı görmek için haritaya gitmek gerekiyor. Simülasyon
                                          çalışırken bu buton haritaya götürüp otomatik "Takip
                                          Et"i de tetikliyor (bkz. goToMapForSimulation). */}
                                      {simulationRunning[route.id] && (
                                        <button
                                          type="button"
                                          className="admin-secondary-button"
                                          onClick={() => goToMapForSimulation(route)}
                                          title="Haritaya git ve aracı canlı takip et"
                                        >
                                          🗺️ Haritada Gör
                                        </button>
                                      )}
                                      <button type="button" className="admin-secondary-button admin-secondary-button-danger" onClick={() => confirmDeleteRoute(route)}>Sil</button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="admin-transit-stop-panel">
                                  <div className="admin-transit-stop-panel-header">
                                    <p className="admin-hint">Sırayı değiştirmek için ⋮⋮ tutamacından sürükleyin.</p>
                                    <button type="button" className="admin-secondary-button" onClick={() => goToMapForStop(route)}>
                                      🗺️ Haritadan Durak Ekle
                                    </button>
                                  </div>
                                  {routeStopsLoading && <p className="admin-hint">Duraklar yükleniyor…</p>}
                                  {!routeStopsLoading && routeStops.length === 0 && <p className="admin-hint">Bu güzergahta henüz durak yok.</p>}
                                  <ul className="admin-transit-stop-list">
                                    {routeStops.map((stop, index) => (
                                      <li
                                        key={stop.id}
                                        ref={(el) => {
                                          if (el) stopRowRefs.current.set(stop.id, el);
                                          else stopRowRefs.current.delete(stop.id);
                                        }}
                                        className={`admin-transit-stop-row${stop.isPaused ? ' admin-transit-stop-row-paused' : ''}`}
                                        onDragOver={(e) => {
                                          e.preventDefault();
                                          const draggedId = draggedStopIdRef.current;
                                          if (draggedId == null || draggedId === stop.id || dragOverStopIdRef.current === stop.id) return;
                                          dragOverStopIdRef.current = stop.id;
                                          setRouteStops((cur) => computeStopDragReorder(cur, draggedId, stop.id));
                                        }}
                                        onDrop={(e) => {
                                          e.preventDefault();
                                          const draggedId = draggedStopIdRef.current;
                                          draggedStopIdRef.current = null;
                                          dragOverStopIdRef.current = null;
                                          if (draggedId != null) persistStopOrder(routeStops);
                                        }}
                                      >
                                        <span
                                          className="admin-category-drag-handle"
                                          draggable
                                          title="Tut ve sürükle"
                                          onDragStart={() => {
                                            draggedStopIdRef.current = stop.id;
                                            dragOverStopIdRef.current = stop.id;
                                          }}
                                          onDragEnd={() => {
                                            draggedStopIdRef.current = null;
                                            dragOverStopIdRef.current = null;
                                          }}
                                        >
                                          <span aria-hidden="true">⋮⋮</span>
                                        </span>
                                        <span className="admin-transit-stop-order">{index + 1}.</span>
                                        {editingStopId === stop.id ? (
                                          <input
                                            className="admin-category-name-input admin-transit-route-name-input"
                                            value={editStopName}
                                            onChange={(e) => setEditStopName(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') saveEditedStop(stop); if (e.key === 'Escape') setEditingStopId(null); }}
                                            autoFocus
                                          />
                                        ) : (
                                          <span className="admin-transit-stop-name">{stop.name}</span>
                                        )}
                                        {stop.isPaused && <span className="admin-transit-paused-badge">⏸ Duraklatıldı</span>}
                                        <span className="admin-transit-stop-meta">{stop.addedByUsername || ''}</span>
                                        {editingStopId === stop.id ? (
                                          <>
                                            <button type="button" className="admin-secondary-button" onClick={() => saveEditedStop(stop)}>Kaydet</button>
                                            <button type="button" className="admin-secondary-button" onClick={() => setEditingStopId(null)}>Vazgeç</button>
                                          </>
                                        ) : (
                                          <button type="button" className="admin-secondary-button" onClick={() => startEditingStop(stop)} title="Durak adını düzenle">✏️</button>
                                        )}
                                        <button
                                          type="button"
                                          className={`admin-secondary-button${stop.isPaused ? ' is-paused' : ''}`}
                                          onClick={() => confirmToggleStopPaused(stop)}
                                          title={stop.isPaused ? 'Devam ettir' : 'Duraklat'}
                                        >
                                          {stop.isPaused ? '▶' : '⏸'}
                                        </button>
                                        <button type="button" className="admin-trash-delete" onClick={() => confirmDeleteStop(stop)}>Sil</button>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Kullanıcının kendi isteği: "Güzergah eklemek için güzergah ekle yazısına
                  basınca detayları açılan pencereden girelim, direkt güzergah oluşturup
                  durakları da ekleyebilelim hızlıca." — oluşturma artık modal; oluşturulan
                  güzergahın kartı otomatik açılıp "Haritadan Durak Ekle" hemen kullanılabiliyor. */}
              {showCreateRouteModal && (
                <div className="attribute-popup-overlay" onClick={() => setShowCreateRouteModal(false)}>
                  <div className="attribute-popup admin-transit-route-modal" role="dialog" aria-modal="true" aria-labelledby="create-route-title" onClick={(event) => event.stopPropagation()}>
                    <div className="admin-poi-detail-header">
                      <div className="attribute-popup-title" id="create-route-title">🚌 Yeni Güzergah</div>
                      <button type="button" className="settings-close-button" aria-label="Kapat" onClick={() => setShowCreateRouteModal(false)}>✕</button>
                    </div>
                    <label className="admin-form-label">
                      Güzergah adı
                      <input
                        type="text"
                        className="admin-search-input"
                        placeholder="Örn. Merkez Hattı"
                        value={newRouteName}
                        onChange={(e) => setNewRouteName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') createRoute(); }}
                        autoFocus
                      />
                    </label>
                    <label className="admin-form-label">
                      Renk
                      <ColorSwatchInput value={newRouteColor} onChange={setNewRouteColor} className="admin-transit-color-input" title="Güzergah rengi" />
                    </label>
                    {/* Kullanıcının kendi isteği: "şehre, ilçeye göre filtre olsun" — bu ikisi
                        sadece arama/filtre etiketi, harita konumunu etkilemiyor (opsiyonel). */}
                    <div className="admin-transit-location-row">
                      <label className="admin-form-label">
                        İl (opsiyonel)
                        <input
                          type="text"
                          className="admin-search-input"
                          placeholder="Örn. İstanbul"
                          value={newRouteProvince}
                          onChange={(e) => setNewRouteProvince(e.target.value)}
                        />
                      </label>
                      <label className="admin-form-label">
                        İlçe (opsiyonel)
                        <input
                          type="text"
                          className="admin-search-input"
                          placeholder="Örn. Kadıköy"
                          value={newRouteDistrict}
                          onChange={(e) => setNewRouteDistrict(e.target.value)}
                        />
                      </label>
                    </div>
                    <p className="admin-hint">Oluşturduktan sonra durak eklemeye haritadan hemen devam edebilirsiniz.</p>
                    <div className="admin-transit-route-modal-actions">
                      <button type="button" className="admin-secondary-button" onClick={() => setShowCreateRouteModal(false)}>Vazgeç</button>
                      <button
                        type="button"
                        className="admin-add-button"
                        onClick={createRoute}
                        disabled={creatingRoute || !newRouteName.trim()}
                      >
                        {creatingRoute ? 'Oluşturuluyor…' : 'Oluştur'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'logs' && (
                <div className="admin-log-section">
                  {logsLoading && <p className="admin-hint">Loglar yükleniyor…</p>}
                  {!logsLoading && logs.length === 0 && <p className="admin-hint">Henüz aktivite yok.</p>}
                  {!logsLoading && logs.length > 0 && (
                    <ul className="admin-log-list">
                      {logs.map((log) => (
                        <li key={log.id} className="admin-log-item">
                          <span className="admin-log-actor">{log.actorUsername}</span>
                          <span className="admin-log-details">{log.details}</span>
                          <span className="admin-log-date">{formatDate(log.createdDate)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <nav className="admin-log-pagination" aria-label="Log sayfaları">
                    <button
                      type="button"
                      onClick={() => setLogPage((current) => Math.max(1, current - 1))}
                      disabled={logsLoading || logPage <= 1}
                    >
                      ← Önceki
                    </button>
                    <span>
                      Sayfa {logTotalPages === 0 ? 0 : logPage} / {logTotalPages} · {logTotalCount} kayıt
                    </span>
                    <button
                      type="button"
                      onClick={() => setLogPage((current) => Math.min(logTotalPages, current + 1))}
                      disabled={logsLoading || logTotalPages === 0 || logPage >= logTotalPages}
                    >
                      Sonraki →
                    </button>
                  </nav>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {creatingRole && (
        <div className="attribute-popup-overlay" onClick={() => setCreatingRole(false)}>
          <div className="attribute-popup" onClick={(e) => e.stopPropagation()}>
            <div className="attribute-popup-title">🎭 Yeni Rol</div>
            <label className="attribute-popup-label" htmlFor="new-role-name">
              Ad
            </label>
            <input
              id="new-role-name"
              className="attribute-popup-input"
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Rol adı"
              autoFocus
            />
            <label className="attribute-popup-label" htmlFor="new-category-description">
              Açıklama (opsiyonel)
            </label>
            <textarea
              id="new-category-description"
              className="attribute-popup-textarea"
              rows={3}
              value={newCategoryDescription}
              onChange={(e) => setNewCategoryDescription(e.target.value)}
              placeholder="Bu kategori hangi çizimler için kullanılır?"
            />
            <label className="attribute-popup-label" htmlFor="new-role-description">
              Açıklama (opsiyonel)
            </label>
            <textarea
              id="new-role-description"
              className="attribute-popup-textarea"
              value={newRoleDescription}
              onChange={(e) => setNewRoleDescription(e.target.value)}
              placeholder="Bu rol ne için kullanılıyor?"
              rows={3}
            />
            <div className="attribute-popup-label">Renk</div>
            <ColorSwatchInput
              value={newRoleColor}
              onChange={setNewRoleColor}
              className="admin-role-color-input"
              title="Rol rengi"
            />
            <div className="attribute-popup-actions">
              <button
                type="button"
                className="attribute-popup-cancel"
                onClick={() => {
                  setCreatingRole(false);
                  setNewRoleName('');
                  setNewRoleDescription('');
                }}
              >
                Vazgeç
              </button>
              <button type="button" className="attribute-popup-confirm" onClick={createRole}>
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPoiDetail && (
        <div className="attribute-popup-overlay" onClick={() => { setSelectedPoiDetail(null); setEditingAdminPoi(false); setAdminPoiDraft(null); }}>
          <div
            className="attribute-popup admin-poi-detail-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-poi-detail-title"
          >
            <div className="admin-poi-detail-header">
              <div>
                <div className="attribute-popup-title" id="admin-poi-detail-title">📍 {selectedPoiDetail.name}</div>
                <p className="admin-hint">{selectedPoiDetail.mapName || 'Atanmamış'} · POI ayrıntısı ve harita konumu</p>
              </div>
              <div className="admin-poi-detail-header-actions">
                {!editingAdminPoi && (
                  <button className={`admin-secondary-button${selectedPoiDetail.isActive === false ? ' is-paused' : ''}`} onClick={() => changePoiStatus(selectedPoiDetail)}>
                    {selectedPoiDetail.isActive === false ? '▶ Devam Ettir' : '⏸ Duraklat'}
                  </button>
                )}
                {!editingAdminPoi && <button className="admin-secondary-button" onClick={() => beginAdminPoiEdit(selectedPoiDetail)}>✎ Düzenle</button>}
                <button className="settings-close-button" onClick={() => { setSelectedPoiDetail(null); setEditingAdminPoi(false); setAdminPoiDraft(null); }} aria-label="POI ayrıntısını kapat">✕</button>
              </div>
            </div>
            <div className="admin-poi-detail-layout">
              <PoiPreviewMap
                wkt={editingAdminPoi ? adminPoiDraft?.wkt : selectedPoiDetail.wkt}
                name={editingAdminPoi ? adminPoiDraft?.name : selectedPoiDetail.name}
                editable={editingAdminPoi}
                onWktChange={(wkt) => setAdminPoiDraft((current) => ({ ...current, wkt }))}
              />
              <div className="admin-poi-detail-content">
              {editingAdminPoi ? (
                <div className="admin-poi-edit-form">
                <label>Ad<input value={adminPoiDraft?.name || ''} onChange={(event) => setAdminPoiDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                <div className="admin-poi-edit-field"><span>Kategori</span>
                  <SearchableCategorySelect
                    options={buildIndentedCategoryOptions(poiCategories)}
                    value={adminPoiDraft?.categoryId || ''}
                    onChange={(categoryId) => setAdminPoiDraft((current) => ({ ...current, categoryId }))}
                    ariaLabel="Admin POI kategorisi ara ve seç"
                  />
                </div>
                <div className="admin-poi-edit-field admin-poi-edit-schedule"><span>Mesai saatleri</span>
                  <PoiScheduleEditor
                    value={adminPoiDraft?.schedule || []}
                    onChange={(schedule) => setAdminPoiDraft((current) => ({ ...current, schedule }))}
                    legacyText={!selectedPoiDetail.schedule?.length ? selectedPoiDetail.workingHours : null}
                  />
                </div>
                <div className="admin-poi-edit-field admin-poi-edit-schedule"><span>Özel günler ve tatiller</span>
                  <PoiScheduleExceptionEditor
                    value={adminPoiDraft?.scheduleExceptions || []}
                    onChange={(scheduleExceptions) => setAdminPoiDraft((current) => ({ ...current, scheduleExceptions }))}
                  />
                </div>
                <label className="admin-poi-edit-note">Not<textarea rows={3} value={adminPoiDraft?.note || ''} onChange={(event) => setAdminPoiDraft((current) => ({ ...current, note: event.target.value }))} placeholder="POI hakkında kısa not" /></label>
                <label>İl<input value={adminPoiDraft?.province || ''} onChange={(event) => setAdminPoiDraft((current) => ({ ...current, province: event.target.value }))} /></label>
                <label>İlçe<input value={adminPoiDraft?.district || ''} onChange={(event) => setAdminPoiDraft((current) => ({ ...current, district: event.target.value }))} /></label>
                <div className="admin-poi-edit-field"><span>İkon (opsiyonel)</span>
                  <IconPicker
                    value={adminPoiDraft?.icon || ''}
                    onChange={(icon) => setAdminPoiDraft((current) => ({ ...current, icon }))}
                    allowEmpty
                    emptyLabel="Kategoriden gelsin"
                  />
                </div>
                <div className="attribute-popup-actions admin-poi-edit-actions">
                  <button type="button" className="attribute-popup-cancel" onClick={() => { setEditingAdminPoi(false); setAdminPoiDraft(null); }}>Vazgeç</button>
                  <button type="button" className="attribute-popup-confirm" disabled={savingAdminPoi || !adminPoiDraft?.name?.trim()} onClick={saveAdminPoi}>{savingAdminPoi ? 'Kaydediliyor…' : 'Kaydet'}</button>
                </div>
                </div>
              ) : (
                <dl className="admin-poi-detail-grid">
                <div><dt>Kategori</dt><dd>{selectedPoiDetail.categoryName || 'Kategorisiz'}</dd></div>
                <div><dt>Konum</dt><dd>{[selectedPoiDetail.district, selectedPoiDetail.province].filter(Boolean).join(', ') || 'Belirtilmemiş'}</dd></div>
                <div className="admin-poi-detail-schedule-field"><dt>Mesai Saatleri</dt><dd>
                  {groupPoiSchedule(selectedPoiDetail.schedule).length > 0 ? (
                    <span className="admin-poi-schedule-summary">
                      {groupPoiSchedule(selectedPoiDetail.schedule).map((group) => (
                        <span className={`admin-poi-schedule-chip is-${group.kind}`} key={`${group.label}-${group.value}`}>
                          <b>{group.label}</b><span>{group.value}</span>{group.overnight && <small>ertesi gün</small>}
                        </span>
                      ))}
                    </span>
                  ) : (selectedPoiDetail.workingHours || 'Belirtilmemiş')}
                </dd></div>
                <div><dt>Ekleyen</dt><dd>{selectedPoiDetail.addedByUsername || 'Bilinmiyor'}</dd></div>
                <div><dt>Eklenme Tarihi</dt><dd>{formatDate(selectedPoiDetail.createdDate)}</dd></div>
                {selectedPoiDetail.mapName && <div><dt>Harita</dt><dd>{selectedPoiDetail.mapName}</dd></div>}
                <div className="admin-poi-detail-note"><dt>Not</dt><dd>{selectedPoiDetail.note || 'Not eklenmemiş'}</dd></div>
                {selectedPoiDetail.scheduleExceptions?.length > 0 && (
                  <div className="admin-poi-detail-schedule-field"><dt>Özel Günler</dt><dd>
                    <span className="admin-poi-schedule-summary">
                      {selectedPoiDetail.scheduleExceptions.map((item) => (
                        <span className={`admin-poi-schedule-chip ${item.isOpen ? 'is-hours' : 'is-closed'}`} key={`${item.date}-${item.repeatsAnnually}`}>
                          <b>{formatPoiExceptionDate(item)}</b>
                          <span>{item.isOpen ? item.is24Hours ? '24 saat açık' : `${item.startTime}–${item.endTime}` : 'Kapalı'}</span>
                          {item.repeatsAnnually && <small>her yıl</small>}
                        </span>
                      ))}
                    </span>
                  </dd></div>
                )}
                </dl>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {bulkImportOpen && (
        <div className="attribute-popup-overlay" onClick={() => setBulkImportOpen(false)}>
          <div className="attribute-popup admin-bulk-import-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title" onClick={(event) => event.stopPropagation()}>
            <div className="admin-poi-detail-header">
              <div>
                <div className="attribute-popup-title" id="bulk-import-title">📥 Toplu POI İçe Aktar</div>
                <p className="admin-hint">
                  JSON dizisi yapıştırın — her satır: <code>{'{ name, categoryName, parentCategoryName?, province, district?, lat, lon, icon?, workingHours? }'}</code>.
                  Eksik kategoriler otomatik oluşturulur. Aynı isim + aynı konumdaki POI'ler atlanır; sadece kategorisi farklıysa mevcut POI güncellenir (kopya oluşturulmaz).
                </p>
              </div>
              <button type="button" className="settings-close-button" aria-label="Toplu içe aktarmayı kapat" onClick={() => setBulkImportOpen(false)}>✕</button>
            </div>
            <textarea
              className="admin-bulk-import-textarea"
              rows={14}
              placeholder='[&#10;  { "name": "Örnek Kafe", "categoryName": "Kafe", "parentCategoryName": "Yeme-İçme", "province": "İstanbul", "district": "Kadıköy", "lat": 40.99, "lon": 29.03 }&#10;]'
              value={bulkImportText}
              onChange={(event) => setBulkImportText(event.target.value)}
              disabled={bulkImportRunning}
              autoFocus
            />
            <div className="admin-bulk-import-controls">
              <button
                type="button"
                className="admin-bulk-import-run"
                onClick={runBulkPoiImport}
                disabled={bulkImportRunning || !bulkImportText.trim()}
              >
                {bulkImportRunning ? 'İçe aktarılıyor…' : 'İçe Aktar'}
              </button>
            </div>
            {bulkImportSummary && (
              <div className={`admin-bulk-import-summary${bulkImportSummary.failed > 0 ? ' has-errors' : ''}`}>
                <div>
                  ✅ {bulkImportSummary.created} yeni eklendi
                  {bulkImportSummary.updated > 0 && <>, 🔁 {bulkImportSummary.updated} güncellendi</>}
                  {bulkImportSummary.skipped > 0 && <>, ⏭️ {bulkImportSummary.skipped} atlandı (zaten vardı)</>}
                  {bulkImportSummary.failed > 0 && <>, ❌ {bulkImportSummary.failed} hatalı</>}
                </div>
                {bulkImportSummary.errors.length > 0 && (
                  <ul>
                    {bulkImportSummary.errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Kullanıcının kendi isteği: "güzergahları otomatikleştirmek istiyorum... hepsi
          yollarda çizili olarak otomatik" — Toplu POI İçe Aktar modalıyla AYNI desen. */}
      {routeImportOpen && (
        <div className="attribute-popup-overlay" onClick={() => !routeImportRunning && setRouteImportOpen(false)}>
          <div className="attribute-popup admin-bulk-import-modal" role="dialog" aria-modal="true" aria-labelledby="route-import-title" onClick={(event) => event.stopPropagation()}>
            <div className="admin-poi-detail-header">
              <div>
                <div className="attribute-popup-title" id="route-import-title">📥 Toplu Hat İçe Aktar</div>
                <p className="admin-hint">
                  JSON dizisi yapıştırın — her satır: <code>{'{ name, color?, province?, district?, pathWkt?, stops: [{ name, lat, lon }] }'}</code>.
                  Hat oluşturulur, durakları sırayla eklenir ve <code>pathWkt</code> verilmişse hattın gerçek
                  (OSM) geometrisi doğrudan yazılır — bu durumda ayrıca "Rota Oluştur" (OSRM) çalıştırmaya gerek kalmaz.
                  Aynı isimli hat zaten varsa atlanır.
                </p>
              </div>
              <button type="button" className="settings-close-button" aria-label="Hat içe aktarmayı kapat" disabled={routeImportRunning} onClick={() => setRouteImportOpen(false)}>✕</button>
            </div>
            <textarea
              className="admin-bulk-import-textarea"
              rows={12}
              placeholder='[&#10;  { "name": "M1 Kızılay–Batıkent", "color": "#e11d48", "stops": [{ "name": "Kızılay", "lat": 39.92, "lon": 32.85 }] }&#10;]'
              value={routeImportText}
              onChange={(event) => setRouteImportText(event.target.value)}
              disabled={routeImportRunning}
              autoFocus
            />
            <div className="admin-bulk-import-controls">
              <button
                type="button"
                className="admin-bulk-import-run"
                onClick={runBulkRouteImport}
                disabled={routeImportRunning || !routeImportText.trim()}
              >
                {routeImportRunning ? `İçe aktarılıyor… ${routeImportProgress}` : 'İçe Aktar'}
              </button>
            </div>
            {routeImportSummary && (
              <div className={`admin-bulk-import-summary${routeImportSummary.errors.length > 0 ? ' has-errors' : ''}`}>
                <div>
                  ✅ {routeImportSummary.created} hat eklendi, 🚏 {routeImportSummary.stops} durak
                  {routeImportSummary.skipped > 0 && <>, ⏭️ {routeImportSummary.skipped} atlandı (aynı isim zaten var)</>}
                  {routeImportSummary.errors.length > 0 && <>, ❌ {routeImportSummary.errors.length} hatalı</>}
                </div>
                {routeImportSummary.errors.length > 0 && (
                  <ul>
                    {routeImportSummary.errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedPoiCategoryDetail && (
        <div className="attribute-popup-overlay" onClick={() => setSelectedPoiCategoryDetail(null)}>
          <div className="attribute-popup admin-poi-category-detail-modal" role="dialog" aria-modal="true" aria-labelledby="poi-category-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="admin-poi-detail-header">
              <div>
                <div className="attribute-popup-title" id="poi-category-detail-title">🗂️ {selectedPoiCategoryDetail.name}</div>
                <p className="admin-hint">POI kategorisi ayrıntıları</p>
              </div>
              <div className="admin-poi-detail-header-actions">
                <button type="button" className="admin-secondary-button" onClick={() => { setNewPoiCategoryParentId(selectedPoiCategoryDetail.id); setCreatingPoiCategory(true); setSelectedPoiCategoryDetail(null); }}>+ Alt kategori</button>
                <button type="button" className="admin-secondary-button" onClick={() => { setEditingPoiCategoryId(selectedPoiCategoryDetail.id); setPoiCategoryDraft({ name: selectedPoiCategoryDetail.name, description: selectedPoiCategoryDetail.description || '', icon: selectedPoiCategoryDetail.icon || '' }); setSelectedPoiCategoryDetail(null); }}>Düzenle</button>
                <button type="button" className="settings-close-button" aria-label="POI kategori ayrıntısını kapat" onClick={() => setSelectedPoiCategoryDetail(null)}>✕</button>
              </div>
            </div>
            <div className="admin-poi-category-detail-layout">
              {pois.some((poi) => poi.categoryId === selectedPoiCategoryDetail.id) ? (
                <PoiPreviewMap
                  items={pois.filter((poi) => poi.categoryId === selectedPoiCategoryDetail.id)}
                  name={selectedPoiCategoryDetail.name}
                />
              ) : (
                <div className="admin-poi-category-empty-map"><span>⌖</span><strong>Haritada gösterilecek POI yok</strong><small>Bu kategoriye POI eklendiğinde burada konumları birlikte görünür.</small></div>
              )}
              <div className="admin-poi-category-detail-info">
                <dl>
                  <div><dt>Açıklama</dt><dd>{selectedPoiCategoryDetail.description || 'Açıklama eklenmemiş'}</dd></div>
                  <div><dt>Üst kategori</dt><dd>{poiCategories.find((category) => category.id === selectedPoiCategoryDetail.parentId)?.name || 'Kök kategori'}</dd></div>
                  <div><dt>Alt kategori</dt><dd>{poiCategories.filter((category) => category.parentId === selectedPoiCategoryDetail.id).length}</dd></div>
                  <div><dt>POI sayısı</dt><dd>{pois.filter((poi) => poi.categoryId === selectedPoiCategoryDetail.id).length}</dd></div>
                </dl>
                <div className="admin-poi-category-poi-list">
                  <strong>Bu kategorideki POI’ler</strong>
                  {pois.filter((poi) => poi.categoryId === selectedPoiCategoryDetail.id).map((poi) => (
                    <button type="button" key={poi.id} onClick={() => { setSelectedPoiCategoryDetail(null); setSelectedPoiDetail(poi); }}>
                      <span>{poi.name}</span><small>{[poi.district, poi.province].filter(Boolean).join(', ') || 'Konum belirtilmemiş'}</small>
                    </button>
                  ))}
                  {pois.every((poi) => poi.categoryId !== selectedPoiCategoryDetail.id) && <p className="admin-hint">Bu kategoride henüz POI yok.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {creatingCategory && (
        <div className="attribute-popup-overlay" onClick={() => setCreatingCategory(false)}>
          <div className="attribute-popup" onClick={(e) => e.stopPropagation()}>
            <div className="attribute-popup-title">🏷️ Yeni Kategori</div>
            <label className="attribute-popup-label" htmlFor="new-category-name">
              Ad
            </label>
            <input
              id="new-category-name"
              className="attribute-popup-input"
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Kategori adı"
              autoFocus
            />
            <div className="attribute-popup-label">Renk</div>
            <ColorSwatchInput
              value={newCategoryColor}
              onChange={setNewCategoryColor}
              className="admin-role-color-input"
              title="Kategori rengi"
            />
            <div className="attribute-popup-actions">
              <button
                type="button"
                className="attribute-popup-cancel"
                onClick={() => {
                  setCreatingCategory(false);
                  setNewCategoryName('');
                  setNewCategoryDescription('');
                }}
              >
                Vazgeç
              </button>
              <button type="button" className="attribute-popup-confirm" onClick={createCategory}>
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {creatingPoiCategory && (
        <div className="attribute-popup-overlay" onClick={() => setCreatingPoiCategory(false)}>
          <div className="attribute-popup" onClick={(e) => e.stopPropagation()}>
            <div className="attribute-popup-title">🗂️ Yeni POI Kategorisi</div>
            <label className="attribute-popup-label" htmlFor="new-poi-category-name">
              Ad
            </label>
            <input
              id="new-poi-category-name"
              className="attribute-popup-input"
              type="text"
              value={newPoiCategoryName}
              onChange={(e) => setNewPoiCategoryName(e.target.value)}
              placeholder="Örn. Restoran"
              autoFocus
            />
            <label className="attribute-popup-label" htmlFor="new-poi-category-description">
              Açıklama (opsiyonel)
            </label>
            <textarea
              id="new-poi-category-description"
              className="attribute-popup-textarea"
              value={newPoiCategoryDescription}
              onChange={(event) => setNewPoiCategoryDescription(event.target.value)}
              placeholder="Bu kategori hangi POI'ler için?"
              rows={3}
            />
            <div className="attribute-popup-label">Üst kategori (opsiyonel)</div>
            <SelectMenu
              value={newPoiCategoryParentId}
              onChange={setNewPoiCategoryParentId}
              options={[
                { value: '', label: 'Kök (üst kategori yok)' },
                ...buildIndentedCategoryOptions(poiCategories).map((opt) => ({ value: opt.id, label: opt.label })),
              ]}
            />
            <div className="attribute-popup-label">İkon (opsiyonel)</div>
            <IconPicker value={newPoiCategoryIcon} onChange={setNewPoiCategoryIcon} allowEmpty emptyLabel="Varsayılan (📍)" />
            <div className="attribute-popup-actions">
              <button
                type="button"
                className="attribute-popup-cancel"
                onClick={() => {
                  setCreatingPoiCategory(false);
                  setNewPoiCategoryName('');
                  setNewPoiCategoryDescription('');
                  setNewPoiCategoryParentId('');
                  setNewPoiCategoryIcon('');
                }}
              >
                Vazgeç
              </button>
              <button type="button" className="attribute-popup-confirm" onClick={createPoiCategory}>
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {creatingUser && (
        <div className="attribute-popup-overlay" onClick={() => setCreatingUser(false)}>
          <div className="attribute-popup" onClick={(e) => e.stopPropagation()}>
            <div className="attribute-popup-title">👤 Yeni Kullanıcı</div>
            <label className="attribute-popup-label" htmlFor="new-user-name">
              Kullanıcı adı
            </label>
            <input
              id="new-user-name"
              className="attribute-popup-input"
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Kullanıcı adı"
              autoFocus
            />
            <label className="attribute-popup-label" htmlFor="new-user-password">
              Şifre
            </label>
            <input
              id="new-user-password"
              className="attribute-popup-input"
              type="password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              placeholder="Şifre"
            />
            <div className="attribute-popup-label">Rol</div>
            <SelectMenu
              value={newUserRoleId ?? ''}
              onChange={(v) => setNewUserRoleId(Number(v))}
              options={roles.map((r) => ({ value: r.id, label: r.name, color: r.color }))}
            />
            <div className="attribute-popup-actions">
              <button
                type="button"
                className="attribute-popup-cancel"
                onClick={() => {
                  setCreatingUser(false);
                  setNewUsername('');
                  setNewUserPassword('');
                }}
              >
                Vazgeç
              </button>
              <button type="button" className="attribute-popup-confirm" onClick={createUser}>
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {geoModalTarget && <GeoRestrictionModal target={geoModalTarget} onClose={() => setGeoModalTarget(null)} />}

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

      {hasPendingChanges && (
        <div className="admin-unsaved-bar">
          <span className="admin-unsaved-text">⚠️ Kaydedilmemiş değişikliklerin var.</span>
          <div className="admin-unsaved-actions">
            <button className="admin-unsaved-discard" onClick={discardPendingChanges} disabled={saving}>
              Vazgeç
            </button>
            <button className="admin-unsaved-save" onClick={requestCommitPendingChanges} disabled={saving}>
              {saving ? 'Kaydediliyor…' : '✓ Kaydet'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPage;

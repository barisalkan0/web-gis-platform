const AUTH_KEY = 'auth';

// meData: GET /api/Auth/me'nin döndürdüğü obje (username, roleId, roleName, roleColor,
// canManageAdmin, canDrawPoint/Line/Polygon, canUseAnalysisTool, canManageCategories).
// Login akışı token'ı aldıktan hemen sonra /me'yi çağırıp bunu tamamlıyor — admin paneli
// linkini göstermek, izin hatalarını yorumlamak ve rol rengini göstermek için lazım.
export function saveAuth(token, expiresAt, meData = null) {
  const current = getAuth() || {};
  localStorage.setItem(AUTH_KEY, JSON.stringify({ ...current, token, expiresAt, ...(meData || {}) }));
}

export function getAuth() {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
  cachedCardPosition = null;
  cachedCardCollapsed = true;
}

// Bilgi kartının (FeatureInfoCard) sürüklenmiş konumu — MapPage her yeni obje seçildiğinde
// kartı `key={item.key}` ile yeniden mount ettiği için (bkz. FeatureInfoCard.jsx) kartın
// KENDİ state'i her seçimde sıfırlanır. Kullanıcı "nereye sürüklediysem orada kalsın, sadece
// çıkış/girişte varsayılana dönsün" istediği için pozisyonu component state'inin DIŞINDA,
// bu modülde (sayfa yeniden yüklenmedikçe hayatta kalan) tutuyoruz — logout'ta sıfırlanıyor.
let cachedCardPosition = null;
export function getCardPosition() {
  return cachedCardPosition;
}
export function setCardPosition(pos) {
  cachedCardPosition = pos;
}

// Kartın daraltılmış/genişletilmiş durumu — pozisyonla AYNI mantık: bir obje düzenlenirken
// (VertexCoordinateEditor açıkken) başka bir noktaya tıklanınca kart `key` değiştiği için
// yeniden mount oluyor ve eskiden her zaman kapalı (collapsed=true) açılıyordu. Kullanıcı
// "önceki açıksa yenisi de açık gelsin" istediği için bunu da component state'i DIŞINDA
// tutup logout'ta varsayılana (kapalı) döndürüyoruz.
let cachedCardCollapsed = true;
export function getCardCollapsed() {
  return cachedCardCollapsed;
}
export function setCardCollapsed(value) {
  cachedCardCollapsed = value;
}

export function isAuthValid() {
  const auth = getAuth();
  if (!auth) return false;
  return new Date(auth.expiresAt) > new Date();
}

// Backend'e giden isteklere eklenecek "Authorization: Bearer ..." header'ı — token yoksa
// boş obje döner, spread edildiğinde hiçbir şey eklemez.
export function authHeader() {
  const auth = getAuth();
  return auth?.token ? { Authorization: `Bearer ${auth.token}` } : {};
}

// Gün 6: backend artık tek tek canDrawPoint/canManageAdmin gibi boolean alanlar yerine
// bir "permissionCodes" (string[]) listesi döndürüyor (rolden gelenler + kullanıcıya
// doğrudan atananlar birleşik). Bu dosya o listeyi eskiyle AYNI boolean şekle çeviriyor —
// böylece MapPage/AttributePopup/CategoryManagerModal gibi bu fonksiyonları tüketen hiçbir
// yer değişmedi, sadece buradaki çeviri katmanı güncellendi.
function hasPermission(code) {
  const codes = getAuth()?.permissionCodes;
  return Array.isArray(codes) && codes.includes(code);
}

export function isAdmin() {
  return hasPermission('ManageAdmin');
}

// Görev #70 (kullanıcının kendi isteği): "bu şekli BEN mi çizdim" karşılaştırması için —
// paylaşılan bir haritada düzenle/sil butonlarını yazara göre gizlemek/deaktif etmek üzere.
// /me henüz hiç çağrılmadıysa (ör. sayfa yeni açıldı) undefined döner, çağıran taraf bunu
// "henüz bilmiyoruz" olarak ele almalı (yetkiyi VARSAYILAN AÇIK değil, KAPALI tutarak).
export function getMyUserId() {
  return getAuth()?.userId;
}

// Rol tabanlı izinler — /me çağrılmadan önce (ör. sayfa daha yeni açıldıysa) permissionCodes
// hiç yoksa geriye dönük uyumluluk için hepsi açık varsayılıyor, backend zaten gerçek
// kontrolü kendi tarafında yapıyor.
export function getPermissions() {
  const codes = getAuth()?.permissionCodes;
  if (!Array.isArray(codes)) {
    return {
      canDrawPoint: true,
      canDrawLine: true,
      canDrawPolygon: true,
      canUseAnalysisTool: true,
      canManageCategories: true,
      canDeleteCategories: true,
      canManageMultipleMaps: true,
      canManageGeoRestrictions: true,
      canShareMap: true,
      canManagePoi: true,
      canManagePoiCategories: true,
      canViewPoi: true,
      canManageRoutes: true,
      canViewRoutes: true,
    };
  }
  return {
    canDrawPoint: codes.includes('DrawPoint'),
    canDrawLine: codes.includes('DrawLine'),
    canDrawPolygon: codes.includes('DrawPolygon'),
    canUseAnalysisTool: codes.includes('UseAnalysisTool'),
    canManageCategories: codes.includes('ManageCategories'),
    canDeleteCategories: codes.includes('DeleteCategories'),
    // Faz 1a: "birden fazla harita" — kullanıcının kendi fikri (bkz. PermissionCodes.ManageMultipleMaps).
    canManageMultipleMaps: codes.includes('ManageMultipleMaps'),
    // Hoca görevi: Coğrafi Yetki Tanımlama Modülü — admin panelinde bu izin yoksa buton hiç görünmez.
    canManageGeoRestrictions: codes.includes('ManageGeoRestrictions'),
    // Görev #78: paylaşma artık ManageMultipleMaps'ten ayrı bir izin (bkz. PermissionCodes.ShareMap).
    canShareMap: codes.includes('ShareMap'),
    // Hoca ödevi (POI/Rol/Operatör): haritada yeni POI ekleyebilme (varsayılan: Operatör + Admin).
    canManagePoi: codes.includes('ManagePoi'),
    canManagePoiCategories: codes.includes('ManagePoiCategories'),
    canViewPoi: codes.includes('ViewPoi') || codes.includes('ManagePoi') || codes.includes('ManageAdmin'),
    // Hoca ödevi (Akıllı Ulaşım Modülü): güzergah/durak ekleme-düzenleme-silme-sıralama
    // (Ulaşım Operatörü + Admin) ve sadece görüntüleme (ManageRoutes bunu dolaylı sağlar).
    canManageRoutes: codes.includes('ManageRoutes') || codes.includes('ManageAdmin'),
    canViewRoutes: codes.includes('ViewRoutes') || codes.includes('ManageRoutes') || codes.includes('ManageAdmin'),
  };
}

export async function refreshMe() {
  try {
    const response = await fetch('http://localhost:5276/api/Auth/me', { headers: authHeader() });
    if (!response.ok) return null;
    const me = await response.json();
    const auth = getAuth();
    if (auth) saveAuth(auth.token, auth.expiresAt, me);
    return me;
  } catch {
    return null;
  }
}

import * as signalR from '@microsoft/signalr';

// Hoca ödevi (31 Ağustos, SignalR Canlı Veri Yayını ve İstemci Takibi): "Anlık konum
// verilerinin paylaşımı için SignalR altyapısını kurun." — TÜM uygulama için TEK bir paylaşımlı
// bağlantı (module-level singleton, React state DEĞİL): birden fazla bileşen (MapPage, ileride
// belki AdminPage) aynı anda güzergah takip edebilir, her biri kendi HubConnection'ını açmasın.
// TransitSimulationHub.cs'te [Authorize] YOK (bkz. o dosyadaki gerekçe) — bu yüzden token
// taşımaya hiç gerek yok, bağlantı her zaman anonim.
const HUB_URL = 'http://localhost:5276/hubs/transit-simulation';

let connectionPromise = null;

// Kullanıcının kendi isteği: "Takip Et" tıklanır tıklanmaz istekleri kaybetmeden bağlanabilsin
// diye — bağlantı henüz kurulmadıysa ilk çağıran kurar, sonrakiler AYNI promise'i bekler
// (yarış durumunda birden fazla HubConnection açılmasın diye).
function getConnection() {
  if (!connectionPromise) {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      // Kullanıcının kendi isteği kapsamında değil ama makul bir varsayılan: bağlantı
      // koparsa (ör. backend yeniden başlatıldı) otomatik yeniden dener.
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    connectionPromise = connection.start().then(() => connection).catch((err) => {
      connectionPromise = null; // bir sonraki denemede tekrar kurmayı dene
      throw err;
    });
  }
  return connectionPromise;
}

// "Takip Et" — bir güzergahın SignalR grubuna katılır, PositionUpdated/SimulationCompleted
// olaylarını dinlemeye başlar. onPosition(snapshot) her konum güncellemesinde çağrılır.
// Dönen fonksiyonu çağırınca hem grup'tan çıkılır hem event dinleyicileri kaldırılır
// ("Takibi Bırak" ile AYNI temizlik — React effect cleanup deseniyle uyumlu).
export async function followRoute(routeId, onPosition, onCompleted) {
  const connection = await getConnection();

  const handlePosition = (snapshot) => {
    if (snapshot?.routeId === routeId) onPosition(snapshot);
  };
  const handleCompleted = (snapshot) => {
    if (snapshot?.routeId === routeId) onCompleted?.(snapshot);
  };

  connection.on('PositionUpdated', handlePosition);
  connection.on('SimulationCompleted', handleCompleted);
  await connection.invoke('JoinRouteGroup', routeId);

  return async function unfollow() {
    connection.off('PositionUpdated', handlePosition);
    connection.off('SimulationCompleted', handleCompleted);
    try {
      await connection.invoke('LeaveRouteGroup', routeId);
    } catch {
      // Bağlantı zaten koptuysa (ör. sayfa kapanıyor) sessizce yut — "Takibi Bırak" işlemi
      // için kullanıcıya gösterecek bir hata yok, zaten artık dinlemiyoruz.
    }
  };
}

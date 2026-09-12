using Microsoft.AspNetCore.SignalR;

namespace BasarsoftStaj.API.Hubs;

// Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma + SignalR Canlı Veri Yayını):
// "Anlık konum verilerinin paylaşımı için SignalR altyapısını kurun ... Diğer kullanıcılar
// aynı güzergaha tıkladığında 'Takip Et' butonu çıksın ve aracı canlı olarak harita üzerinde
// takip edebilsinler."
//
// Bilinçli tasarım kararı: Hub'ın kendisinde [Authorize] YOK. Güzergah/durak listesi zaten
// herkese açık (bkz. TransitRouteController.GetAll — auth gerektirmiyor), simülasyonu
// İZLEMEK için de kimlik doğrulaması şart koşmadık — sadece BAŞLATMA/DURDURMA (bkz.
// TransitSimulationController, ManageRoutes izniyle korunuyor) yetki gerektiriyor. Bu, JWT
// token'ını SignalR bağlantısına (WebSocket upgrade sırasında custom header taşınamıyor,
// query string'e taşımak gerekirdi) ekleme karmaşıklığından bilerek kaçınıyor.
//
// Her güzergah kendi SignalR grubunda yayın yapıyor (GroupName) — böylece bir kullanıcı
// SADECE "Takip Et" dediği güzergahların konum güncellemelerini alıyor, sistemdeki TÜM
// güzergahların trafiğini dinlemek zorunda kalmıyor.
public class TransitSimulationHub : Hub
{
    public static string GroupName(int routeId) => $"transit-route-{routeId}";

    // Kullanıcının kendi isteği: "Takip Et" butonu.
    public Task JoinRouteGroup(int routeId) => Groups.AddToGroupAsync(Context.ConnectionId, GroupName(routeId));

    // "Takibi Bırak" butonu.
    public Task LeaveRouteGroup(int routeId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(routeId));
}

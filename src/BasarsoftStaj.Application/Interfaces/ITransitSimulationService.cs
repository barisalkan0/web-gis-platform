using BasarsoftStaj.Application.DTOs;

namespace BasarsoftStaj.Application.Interfaces;

// Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma): "Haritada veya listede bir
// güzergaha tıklandığında 'Simülasyonu Başlat' butonu çıksın (Sadece Admin ve Operatör
// başlatabilsin). Simülasyon başladığında ilk duraktan son durağa doğru hareket eden bir
// araç ikonu/resmi haritada anlık konumuyla gösterilsin."
//
// Bilinçli tasarım kararı: simülasyon durumu VERİTABANINA YAZILMIYOR — tamamen bellek içi
// (bkz. TransitSimulationService'teki static ConcurrentDictionary). "Simülasyon" kelimesinin
// kendisi zaten geçici/senkron olmayan bir gösterim olduğunu ima ediyor (gerçek bir GPS
// takibi değil); kalıcı bir DB tablosu/migration açmak bu ödevin kapsamına göre gereksiz
// karmaşıklık olurdu — sunucu yeniden başlarsa aktif simülasyonlar sıfırlanır, bu kabul
// edilebilir bir davranış.
public interface ITransitSimulationService
{
    // Sadece ManageRoutes izni olan roller (Admin, Ulaşım Operatörü) çağırabilir — yetki
    // kontrolü TransitSimulationController'da yapılıyor, bu metod saf iş mantığı.
    Task<(bool Success, string? Error)> StartAsync(int routeId, string actorUsername);
    Task<(bool Success, string? Error)> StopAsync(int routeId, string actorUsername);

    // Herkese açık — bir kullanıcı güzergaha tıkladığında "şu an çalışıyor mu, yüzde kaçta"
    // diye anlık sorgulamak için (SignalR grubuna katılmadan ÖNCE buton durumunu belirlemek
    // amacıyla). Simülasyon o routeId için hiç başlatılmadıysa/bitmişse IsRunning=false
    // döner (null DEĞİL — istemci tarafında null-kontrolü tekrarını önlemek için).
    Task<TransitSimulationSnapshot> GetSnapshotAsync(int routeId);

    // TransitSimulationBroadcastService'in (BackgroundService) her turda hangi route'ları
    // dolaşıp yayın yapacağını bilmesi için.
    IReadOnlyCollection<int> GetActiveRouteIds();
}

using Microsoft.AspNetCore.SignalR;
using BasarsoftStaj.API.Hubs;
using BasarsoftStaj.Application.Interfaces;

namespace BasarsoftStaj.API.BackgroundServices;

// Hoca ödevi (31 Ağustos, SignalR Canlı Veri Yayını): "Anlık konum verilerinin paylaşımı için
// SignalR altyapısını kurun." — bu, aktif simülasyonları saniyede bir dolaşıp her birinin
// GÜNCEL konumunu/yüzdesini kendi SignalR grubuna ("Takip Et" diyenlere) yayınlayan arka plan
// servisi. ITransitSimulationService SINGLETON olduğu için (bkz. Program.cs) burada ekstra
// bir scope açmaya gerek yok; sadece SendAsync IHubContext üzerinden yapılıyor.
public class TransitSimulationBroadcastService : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(1);

    private readonly ITransitSimulationService _simulationService;
    private readonly IHubContext<TransitSimulationHub> _hubContext;
    private readonly ILogger<TransitSimulationBroadcastService> _logger;

    public TransitSimulationBroadcastService(
        ITransitSimulationService simulationService,
        IHubContext<TransitSimulationHub> hubContext,
        ILogger<TransitSimulationBroadcastService> logger)
    {
        _simulationService = simulationService;
        _hubContext = hubContext;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var routeIds = _simulationService.GetActiveRouteIds();
                foreach (var routeId in routeIds)
                {
                    var snapshot = await _simulationService.GetSnapshotAsync(routeId);
                    var groupName = TransitSimulationHub.GroupName(routeId);
                    // GetSnapshotAsync, süre dolduğunda simülasyonu bellekten SİLİP son bir kez
                    // IsRunning=false + %100 döndürür — bu "SimulationCompleted" olarak
                    // yayınlanıyor, aksi halde "PositionUpdated" olarak.
                    var eventName = snapshot.IsRunning ? "PositionUpdated" : "SimulationCompleted";
                    await _hubContext.Clients.Group(groupName).SendAsync(eventName, snapshot, stoppingToken);
                }
            }
            catch (Exception ex)
            {
                // Best-effort yayın — bir turdaki hata (ör. geçici DB/ağ sorunu) bir sonraki
                // turu engellemesin.
                _logger.LogError(ex, "Simülasyon yayını sırasında hata oluştu.");
            }

            try
            {
                await Task.Delay(TickInterval, stoppingToken);
            }
            catch (TaskCanceledException)
            {
                // Uygulama kapanıyor — normal.
            }
        }
    }
}

using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using NetTopologySuite.Geometries;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.Application.Services;

// Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma + SignalR Canlı Veri Yayını).
// SINGLETON olarak kayıtlı (bkz. Program.cs) — aktif simülasyonların bellek içi durumu tüm
// istekler/bağlantılar arasında PAYLAŞILMALI (her HTTP isteğinde sıfırlanan Scoped bir
// servisle bu mümkün olmazdı). Singleton bir servis Scoped repository'lere DOĞRUDAN
// constructor injection ile bağlanamayacağı için (captive dependency), DB'ye SADECE
// StartAsync içinde, IServiceScopeFactory ile açılan kısa ömürlü bir scope üzerinden
// erişiyoruz; GetSnapshotAsync/StopAsync/GetActiveRouteIds ise saf bellek-içi işlem, DB'ye
// hiç gitmiyor (performans: BackgroundService bunları saniyede bir çağırıyor).
public class TransitSimulationService : ITransitSimulationService
{
    private const int Srid = 4326;

    // Kullanıcının kendi tespiti (3 Eylül): "neden her durağa 1dk 2dk falan diyor. ilk duraktan
    // son durağa 3dk olması imkansız. bari tutarlı olsaydı gerçek hız limitlerine uyarak fln,
    // duraklarda durarak." — HAKLI: eski model tüm hattı 180 saniyeye SIKIŞTIRIYORDU
    // (MaxDurationSeconds=180), yani 15 km'lik M1 hattı 3 dakikada bitiyordu ve bütün durak
    // ETA'ları 1-2 dk çıkıyordu. Artık süre gerçek dünya değerlerinden hesaplanıyor:
    //   toplam süre = mesafe / ortalama_seyir_hızı + durak_sayısı × durakta_bekleme
    // Ortalama seyir hızı, ULAŞIM TÜRÜNE göre (hat adından çıkarımla) seçiliyor: raylı
    // sistemler şehir içi trafikten etkilenmediği için otobüsten hızlı. Bunlar TİCARİ hız
    // (duraklar hariç saf seyir) değerleri; durakta bekleme ayrıca ekleniyor.
    private const double RailSpeedMetersPerSecond = 12.5;  // ~45 km/s (metro/Ankaray/banliyö seyir hızı)
    private const double BusSpeedMetersPerSecond = 6.5;    // ~23 km/s (şehir içi otobüs, trafik dahil)
    private const double StopDwellSeconds = 25.0;          // her durakta kapı açık bekleme
    private const double MinDurationSeconds = 60.0;
    private const double MaxDurationSeconds = 5400.0;      // 1.5 saat — uzun banliyö hatları da sığsın

    // Hat adından ulaşım türü çıkarımı: veri modelinde ayrı bir "tür" alanı YOK (hoca ödevinde
    // istenmemişti), ama içe aktarılan gerçek hatların adları (M1/M2, Ankaray, Başkentray,
    // tramvay...) türü net biçimde taşıyor. Eşleşme yoksa otobüs varsayılıyor (daha yavaş
    // olan, yani ETA'ları abartmayan taraf).
    private static double ResolveSpeed(string? routeName)
    {
        var name = (routeName ?? string.Empty).ToLowerInvariant();
        string[] railKeywords = ["metro", "ankaray", "tramvay", "tram", "başkentray", "baskentray", "tren", "banliyö", "banliyo", "m1", "m2", "m3", "m4", "m5"];
        return railKeywords.Any(name.Contains) ? RailSpeedMetersPerSecond : BusSpeedMetersPerSecond;
    }

    private static readonly ConcurrentDictionary<int, SimulationState> ActiveSimulations = new();

    private readonly IServiceScopeFactory _scopeFactory;

    public TransitSimulationService(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public async Task<(bool Success, string? Error)> StartAsync(int routeId, string actorUsername)
    {
        using var scope = _scopeFactory.CreateScope();
        var routeRepository = scope.ServiceProvider.GetRequiredService<IRepository<TransitRoute>>();
        var stopRepository = scope.ServiceProvider.GetRequiredService<IRepository<TransitStop>>();
        var auditLogService = scope.ServiceProvider.GetRequiredService<IAuditLogService>();

        var route = await routeRepository.GetByIdAsync(routeId);
        if (route == null || route.IsDeleted) return (false, "Güzergah bulunamadı.");
        if (route.IsPaused) return (false, "Duraklatılmış bir güzergahta simülasyon başlatılamaz.");

        var stops = (await stopRepository.GetAllAsync())
            .Where(s => !s.IsDeleted && !s.IsPaused && s.RouteId == routeId)
            .OrderBy(s => s.SortOrder)
            .ToList();
        if (stops.Count < 2) return (false, "Simülasyon başlatmak için en az 2 aktif durak gerekiyor.");

        // Render önceliği MapPage.jsx (fetchStops) ile AYNI: OSRM rotası > elle bükülmüş hat >
        // duraklardan geçen düz çizgi — simülasyon, kullanıcının haritada GÖRDÜĞÜ hattın
        // AYNISI üzerinde hareket etmeli, yoksa "araç yoldan çıkıyor" gibi bir tutarsızlık
        // izlenimi verir.
        LineString geometry;
        if (route.RouteGeometry != null)
        {
            geometry = route.RouteGeometry;
        }
        else if (route.Path != null)
        {
            geometry = route.Path;
        }
        else
        {
            var coords = stops.Select(s => s.Geometry.Coordinate).ToArray();
            geometry = GeometryFactory.Default.CreateLineString(coords);
            geometry.SRID = Srid;
        }

        var points = geometry.Coordinates;
        if (points.Length < 2) return (false, "Güzergah hattı geçersiz (en az 2 noktalı olmalı).");

        var cumulative = new double[points.Length];
        cumulative[0] = 0;
        for (var i = 1; i < points.Length; i++)
        {
            cumulative[i] = cumulative[i - 1] + HaversineMeters(points[i - 1], points[i]);
        }
        var totalMeters = cumulative[^1];
        if (totalMeters <= 0) return (false, "Güzergah hattının uzunluğu hesaplanamadı.");

        // Gerçekçi süre: saf seyir + her duraktaki bekleme (ilk durak hariç — araç zaten orada
        // başlıyor). ETA'lar ve konum interpolasyonu AYNI süreyi kullandığı için ikisi tutarlı
        // kalıyor; bekleme süresi hat boyunca oransal olarak dağılmış kabul ediliyor (duraklarda
        // aracın TAM olarak durup beklemesi ayrı bir zaman çizelgesi gerektirirdi, bu ölçekte
        // gereksiz karmaşıklık — kullanıcıya gösterilen dakikalar bu haliyle gerçekçi).
        var speed = ResolveSpeed(route.Name);
        var travelSeconds = totalMeters / speed;
        var dwellSeconds = Math.Max(0, stops.Count - 1) * StopDwellSeconds;
        var durationSeconds = Math.Clamp(travelSeconds + dwellSeconds, MinDurationSeconds, MaxDurationSeconds);

        // Kullanıcının kendi isteği: "hangi durakta olduğunu, nereye gittiğini fln sırayla
        // yazsın... sonraki durağa x dakika... zafer 2'den binip zafer 5'te inecek biri için
        // toplam süre" — bunun için her durağın hat üzerindeki KONUMUNU (kümülatif metre
        // cinsinden) bilmemiz gerekiyor. Hat, OSRM/elle bükülmüş bir çizgi olabileceği için
        // durağın KENDİ koordinatı `points` dizisinde birebir bulunmayabilir — en yakın hat
        // noktasını (basit en-yakın-komşu, segment üzerine izdüşüm DEĞİL — bu ölçekte yeterli
        // bir yaklaşıklık) bulup o noktanın kümülatif mesafesini durağa atıyoruz.
        var stopProgress = stops
            .Select(s =>
            {
                var stopCoord = s.Geometry.Coordinate;
                var nearestIndex = 0;
                var nearestDist = double.MaxValue;
                for (var i = 0; i < points.Length; i++)
                {
                    var d = HaversineMeters(stopCoord, points[i]);
                    if (d < nearestDist)
                    {
                        nearestDist = d;
                        nearestIndex = i;
                    }
                }
                return new StopProgressEntry { StopId = s.Id, Name = s.Name, CumulativeMeters = cumulative[nearestIndex] };
            })
            // Coğrafi sıra ile SortOrder farklı olabilir (kullanıcı elle bükünce) — durak
            // "ne zaman geçilecek" listesi HER ZAMAN hat üzerindeki gerçek konuma göre sıralı
            // olmalı, yoksa ETA'lar mantıksız (azalıp artan) görünür.
            .OrderBy(sp => sp.CumulativeMeters)
            .ToList();

        var state = new SimulationState
        {
            RouteId = routeId,
            RouteName = route.Name,
            RouteColor = route.Color,
            StartUtc = DateTime.UtcNow,
            DurationSeconds = durationSeconds,
            Points = points,
            CumulativeMeters = cumulative,
            TotalMeters = totalMeters,
            StopProgress = stopProgress,
        };
        ActiveSimulations[routeId] = state;

        await auditLogService.LogAsync(actorUsername, "transit_simulation.start", $"'{route.Name}' güzergahı için simülasyon başlatıldı (~{Math.Round(durationSeconds)} sn).");
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> StopAsync(int routeId, string actorUsername)
    {
        var wasRunning = ActiveSimulations.TryRemove(routeId, out var state);
        if (wasRunning && state != null)
        {
            using var scope = _scopeFactory.CreateScope();
            var auditLogService = scope.ServiceProvider.GetRequiredService<IAuditLogService>();
            await auditLogService.LogAsync(actorUsername, "transit_simulation.stop", $"'{state.RouteName}' güzergahının simülasyonu durduruldu.");
        }
        return (true, null);
    }

    public Task<TransitSimulationSnapshot> GetSnapshotAsync(int routeId)
    {
        if (!ActiveSimulations.TryGetValue(routeId, out var state))
        {
            return Task.FromResult(new TransitSimulationSnapshot { RouteId = routeId, IsRunning = false });
        }

        var elapsedSeconds = (DateTime.UtcNow - state.StartUtc).TotalSeconds;
        var fraction = Math.Clamp(elapsedSeconds / state.DurationSeconds, 0.0, 1.0);

        if (fraction >= 1.0)
        {
            // Tamamlandı — bir daha yayın yapılmasın diye bellekten kaldırıyoruz. Son bir kez
            // %100 ve IsRunning=false döndürüyoruz ki çağıran taraf (BackgroundService)
            // "SimulationCompleted" olayını yayınlayabilsin.
            ActiveSimulations.TryRemove(routeId, out _);
            var lastPoint = state.Points[^1];
            var finishedEtas = BuildStopEtas(state, state.DurationSeconds);
            var (finishedFrom, finishedTo) = ResolveCurrentSegment(finishedEtas);
            return Task.FromResult(new TransitSimulationSnapshot
            {
                RouteId = routeId,
                IsRunning = false,
                PercentComplete = 100,
                Lon = lastPoint.X,
                Lat = lastPoint.Y,
                RouteName = state.RouteName,
                RouteColor = state.RouteColor,
                CurrentFromStopName = finishedFrom,
                CurrentToStopName = finishedTo,
                StopEtas = finishedEtas,
            });
        }

        var (lon, lat) = InterpolatePosition(state, fraction);
        var etas = BuildStopEtas(state, elapsedSeconds);
        var (fromStopName, toStopName) = ResolveCurrentSegment(etas);
        return Task.FromResult(new TransitSimulationSnapshot
        {
            RouteId = routeId,
            IsRunning = true,
            PercentComplete = Math.Round(fraction * 100, 1),
            Lon = lon,
            Lat = lat,
            RouteName = state.RouteName,
            RouteColor = state.RouteColor,
            CurrentFromStopName = fromStopName,
            CurrentToStopName = toStopName,
            StopEtas = etas,
        });
    }

    // Kullanıcının kendi isteği: "sonraki durağa x dakika... zafer 2'den binip zafer 5'te
    // inecek biri için toplam süre" — GÜZERGAHTAKİ HER durak için "şu andan itibaren kaç
    // saniye sonra oraya varılır" listesi. İstemci bunu iki durak seçip farkını alarak
    // (ör. Zafer5 ETA'sı - Zafer2 ETA'sı) yolculuk süresini hesaplamak için kullanıyor.
    private static List<TransitSimulationStopEta> BuildStopEtas(SimulationState state, double elapsedSeconds)
    {
        return state.StopProgress.Select(sp =>
        {
            // Konum interpolasyonuyla (InterpolatePosition) BİREBİR AYNI oran: traveledMeters =
            // (elapsed/duration) * totalMeters — yani bir durağa "ne zaman varılacağı" da
            // AYNI oranın tersinden hesaplanıyor, iki hesap birbirinden SAPMASIN diye.
            var etaSeconds = state.TotalMeters <= 0
                ? 0
                : (sp.CumulativeMeters / state.TotalMeters) * state.DurationSeconds - elapsedSeconds;
            return new TransitSimulationStopEta
            {
                StopId = sp.StopId,
                StopName = sp.Name,
                EtaSeconds = Math.Round(etaSeconds, 1),
                Passed = etaSeconds <= 0,
            };
        }).ToList();
    }

    // "Şu an X durağı ile Y durağı arasında" — StopEtas listesindeki son GEÇİLMİŞ durak ile
    // ilk GEÇİLMEMİŞ durak arasında. Rota henüz ilk durağa ulaşmadıysa From=null, son durak
    // geçildiyse To=null (pratikte simülasyon bittiğinde To hep null olur).
    private static (string? From, string? To) ResolveCurrentSegment(List<TransitSimulationStopEta> etas)
    {
        string? from = null;
        string? to = null;
        foreach (var eta in etas)
        {
            if (eta.Passed) from = eta.StopName;
            else { to = eta.StopName; break; }
        }
        return (from, to);
    }

    public IReadOnlyCollection<int> GetActiveRouteIds() => ActiveSimulations.Keys.ToList();

    private static (double Lon, double Lat) InterpolatePosition(SimulationState state, double fraction)
    {
        var targetMeters = fraction * state.TotalMeters;
        var points = state.Points;
        var cumulative = state.CumulativeMeters;

        for (var i = 1; i < cumulative.Length; i++)
        {
            if (targetMeters > cumulative[i] && i != cumulative.Length - 1) continue;

            var segmentStartMeters = cumulative[i - 1];
            var segmentLengthMeters = cumulative[i] - segmentStartMeters;
            var segmentT = segmentLengthMeters <= 0 ? 0 : (targetMeters - segmentStartMeters) / segmentLengthMeters;
            segmentT = Math.Clamp(segmentT, 0.0, 1.0);

            var a = points[i - 1];
            var b = points[i];
            var lon = a.X + (b.X - a.X) * segmentT;
            var lat = a.Y + (b.Y - a.Y) * segmentT;
            return (lon, lat);
        }

        var last = points[^1];
        return (last.X, last.Y);
    }

    // Basit haversine mesafesi (metre) — lon/lat (derece) koordinatlar arası. NTS'in kendi
    // geometrik uzunluk hesabı (Length) düzlemsel/derece bazlı olduğu için gerçek metre
    // uzaklığı vermiyor; simülasyon SÜRESİNİ gerçekçi bir ölçekte tutmak için (bkz.
    // ResolveSpeed/StopDwellSeconds) gerçek dünya mesafesine ihtiyaç var.
    private static double HaversineMeters(Coordinate a, Coordinate b)
    {
        const double earthRadiusMeters = 6371000.0;
        var lat1 = DegreesToRadians(a.Y);
        var lat2 = DegreesToRadians(b.Y);
        var deltaLat = DegreesToRadians(b.Y - a.Y);
        var deltaLon = DegreesToRadians(b.X - a.X);

        var h = Math.Sin(deltaLat / 2) * Math.Sin(deltaLat / 2) +
                Math.Cos(lat1) * Math.Cos(lat2) * Math.Sin(deltaLon / 2) * Math.Sin(deltaLon / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(h), Math.Sqrt(1 - h));
        return earthRadiusMeters * c;
    }

    private static double DegreesToRadians(double degrees) => degrees * Math.PI / 180.0;

    private sealed class SimulationState
    {
        public int RouteId { get; set; }
        public string RouteName { get; set; } = string.Empty;
        public string RouteColor { get; set; } = "#2563eb";
        public DateTime StartUtc { get; set; }
        public double DurationSeconds { get; set; }
        public Coordinate[] Points { get; set; } = Array.Empty<Coordinate>();
        public double[] CumulativeMeters { get; set; } = Array.Empty<double>();
        public double TotalMeters { get; set; }

        // Her durağın rota üzerindeki (en yakın nokta bazlı) kümülatif metre konumu, kümülatif
        // metreye göre sıralı — BuildStopEtas bu sırayı "yolcunun sırayla geçeceği duraklar"
        // olarak kullanıyor (stop.SortOrder DEĞİL, çünkü kullanıcı hattı büküp gerçek geometri
        // sırasını SortOrder'dan farklılaştırmış olabilir).
        public List<StopProgressEntry> StopProgress { get; set; } = new();
    }

    private sealed class StopProgressEntry
    {
        public int StopId { get; set; }
        public string Name { get; set; } = string.Empty;
        public double CumulativeMeters { get; set; }
    }
}

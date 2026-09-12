namespace BasarsoftStaj.Application.DTOs;

// Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma): hem REST (GET .../state — bir
// kullanıcı güzergaha tıkladığında "hâlâ çalışıyor mu" diye anlık sorgulamak için) hem
// SignalR (PositionUpdated/SimulationCompleted event payload'ı) TARAFINDAN AYNI şekli
// kullanıyor — istemci tarafında tek bir tip üzerinden işlenebiliyor.
public class TransitSimulationSnapshot
{
    public int RouteId { get; set; }
    public bool IsRunning { get; set; }

    // 0-100 arası — hoca: "güzergahın yüzde kaçının tamamlandığı bilgisi gösterilsin."
    public double PercentComplete { get; set; }

    // Aracın o anki konumu (WGS84 lon/lat) — IsRunning=false iken anlamsız (0,0 olabilir),
    // istemci sadece IsRunning=true iken haritada göstermeli.
    public double Lon { get; set; }
    public double Lat { get; set; }

    public string? RouteName { get; set; }
    public string? RouteColor { get; set; }

    // Kullanıcının kendi isteği (31 Ağustos ödevinin devamı): "hangi durakta olduğunu, nereye
    // gittiğini fln sırayla yazsın yolcuların anlayabileceği şekilde" — aracın o an hangi iki
    // durak ARASINDA olduğu (ikisi de null ise henüz ilk durağa ulaşmamış/son durağı geçmiş
    // demektir, pratikte IsRunning=true iken hep dolu olur).
    public string? CurrentFromStopName { get; set; }
    public string? CurrentToStopName { get; set; }

    // "sonraki durağa x dakika... zafer 2'den binip zafer 5'te inecek biri için toplam süre"
    // — güzergahtaki HER durak için (geçilmiş olsa da) tahmini varış saniyesi. Negatif/0
    // değerler "zaten geçildi" anlamına gelir (Passed=true), istemci bunlardan biniş/iniş
    // durağı seçip aradaki farkı kendisi hesaplayabilir.
    public List<TransitSimulationStopEta> StopEtas { get; set; } = new();
}

// Bilinçli tasarım: ayrı bir sınıf (nested değil) — hem controller hem BackgroundService
// System.Text.Json ile serileştiriyor, düz bir POCO en az sürprizi garantiliyor.
public class TransitSimulationStopEta
{
    public int StopId { get; set; }
    public string StopName { get; set; } = string.Empty;

    // Şu andan (snapshot alındığı andan) itibaren o durağa varışa kalan saniye — negatifse
    // durak zaten geçilmiş demektir.
    public double EtaSeconds { get; set; }
    public bool Passed { get; set; }
}

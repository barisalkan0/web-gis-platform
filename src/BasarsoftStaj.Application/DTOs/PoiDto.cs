namespace BasarsoftStaj.Application.DTOs;

// Hoca ödevi: "Eklenen POI'lerin listesi ve ekleyen kullanıcı bilgileri görülebilsin" —
// bu yüzden CategoryName/AddedByUsername gibi JOIN edilmiş, sadece okunacak alanlar da var
// (write DTO'larında yok, sadece bu okuma DTO'sunda).
public class PoiDto
{
    public int Id { get; set; }
    public string Wkt { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int? CategoryId { get; set; }
    public string? CategoryName { get; set; }
    public string? WorkingHours { get; set; }
    public string? Note { get; set; }
    public string? Province { get; set; }
    public string? District { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedDate { get; set; }
    public int? UserId { get; set; }
    public string? AddedByUsername { get; set; }
    public int? MapId { get; set; }
    public string? MapName { get; set; }
    // Kullanıcının kendi isteği: POI'ye özel ikon (null olabilir, form'da boş bırakıldıysa).
    public string? Icon { get; set; }
    // Haritada GERÇEKTEN kullanılacak ikon: Icon > kategori ikonu > "📍" varsayılanı
    // (bkz. PoiService.ToDto) — frontend her POI için ayrı ayrı bu düşüşü tekrarlamasın diye
    // sunucu tarafında bir kere hesaplanıp hazır gönderiliyor.
    public string EffectiveIcon { get; set; } = "📍";
    public IReadOnlyList<PoiWorkingHourDto> Schedule { get; set; } = [];
    public IReadOnlyList<PoiScheduleExceptionDto> ScheduleExceptions { get; set; } = [];
}

public class PoiWorkingHourDto
{
    public int DayOfWeek { get; set; }
    public bool IsOpen { get; set; } = true;
    public bool Is24Hours { get; set; }
    public string? StartTime { get; set; }
    public string? EndTime { get; set; }
}

public class PoiScheduleExceptionDto
{
    public string Date { get; set; } = string.Empty;
    public bool RepeatsAnnually { get; set; }
    public bool IsOpen { get; set; }
    public bool Is24Hours { get; set; }
    public string? StartTime { get; set; }
    public string? EndTime { get; set; }
    public string? Note { get; set; }
}

public class CreatePoiDto
{
    public string Wkt { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int? CategoryId { get; set; }
    public string? WorkingHours { get; set; }
    public string? Note { get; set; }
    public string? Province { get; set; }
    public string? District { get; set; }
    public string? Icon { get; set; }
    // Kullanıcının kendi isteği (26 Ağustos, toplu içe aktarma): "evrensel olacak bu, herkes
    // için her haritada geçerli olacak gömülü harita verisi gibi düşün" — nullable, çünkü
    // GetCatalogAsync zaten MapId'ye göre FİLTRELEMİYOR (bkz. PoiService yorumu, "frontend
    // sadece bu uç noktayı çağırıyor"), yani bir POI'nin MapId'si null olsa da haritada
    // herkese, her haritada zaten aynı şekilde görünür. Poi entity'sindeki MapId zaten
    // nullable'dı (eski/sahipsiz kayıtlar için) — burada sadece DTO'yu aynı nullable'a
    // açıyoruz, DB şeması/migration DEĞİŞMEDİ.
    public int? MapId { get; set; }
    public IReadOnlyList<PoiWorkingHourDto>? Schedule { get; set; }
    public IReadOnlyList<PoiScheduleExceptionDto>? ScheduleExceptions { get; set; }
}

public class AssignPoiMapDto
{
    public int MapId { get; set; }
}

public class PoiMapOptionDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string OwnerUsername { get; set; } = string.Empty;
}

public class UpdatePoiDto
{
    public string Wkt { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int? CategoryId { get; set; }
    public string? WorkingHours { get; set; }
    public string? Note { get; set; }
    public string? Province { get; set; }
    public string? District { get; set; }
    public string? Icon { get; set; }
    public IReadOnlyList<PoiWorkingHourDto>? Schedule { get; set; }
    public IReadOnlyList<PoiScheduleExceptionDto>? ScheduleExceptions { get; set; }
}

public class UpdatePoiStatusDto
{
    public bool IsActive { get; set; }
}

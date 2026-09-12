namespace BasarsoftStaj.Domain.Entities;

public class PoiScheduleException
{
    public int Id { get; set; }
    public int PoiId { get; set; }
    public Poi Poi { get; set; } = null!;
    public DateOnly Date { get; set; }
    public bool RepeatsAnnually { get; set; }
    public bool IsOpen { get; set; }
    public bool Is24Hours { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public string? Note { get; set; }
}

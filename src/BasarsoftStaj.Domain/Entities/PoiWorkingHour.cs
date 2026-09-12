namespace BasarsoftStaj.Domain.Entities;

public class PoiWorkingHour
{
    public int Id { get; set; }
    public int PoiId { get; set; }
    public Poi Poi { get; set; } = null!;
    public int DayOfWeek { get; set; }
    public bool IsOpen { get; set; } = true;
    public bool Is24Hours { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
}

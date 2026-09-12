namespace BasarsoftStaj.Application.DTOs;

// Sağdaki "Çizilenler" panelinden bir nokta/çizgi/alanın ismini, rengini ve kategorisini
// sonradan değiştirmek için — çizim sırasındaki pop-up ile aynı alanlar.
public class UpdateAttributesDto
{
    public string? Name { get; set; }
    public string? Color { get; set; }
    public int? CategoryId { get; set; }

    // Faz 3: mevcut bir çizimin "sadece bana görünsün" durumunu sonradan değiştirebilmek için.
    public bool IsPrivate { get; set; } = false;
}

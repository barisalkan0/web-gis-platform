namespace BasarsoftStaj.Application.DTOs;

public class PoiCategoryDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? ParentId { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedDate { get; set; }
    // Kullanıcının kendi isteği: kategorinin haritadaki varsayılan ikonu (emoji).
    public string? Icon { get; set; }
}

public class CreatePoiCategoryDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? ParentId { get; set; }
    public string? Icon { get; set; }
}

public class UpdatePoiCategoryDto
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public bool UpdateDescription { get; set; }
    public string? Icon { get; set; }
    // Description ile AYNI "boş = değişiklik yok" belirsizliğini çözmek için aynı desen:
    // true gönderilmezse Icon alanı hiç dokunulmaz (frontend her PATCH'te ikonu yeniden
    // göndermek zorunda kalmasın).
    public bool UpdateIcon { get; set; }
    // "Taşı" (başka bir üst kategorinin altına al) — null gönderilirse değişmez, kategoriyi
    // en üst seviyeye taşımak için ayrıca 0 özel değeri kullanılır (bkz. PoiCategoryService).
    public int? ParentId { get; set; }
    public bool MoveToRoot { get; set; } = false;
    // Drag/drop sırasında hedef kardeşler arasındaki sıfır tabanlı sıra.
    public int? SortOrder { get; set; }
}

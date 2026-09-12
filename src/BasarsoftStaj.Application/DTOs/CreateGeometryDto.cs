namespace BasarsoftStaj.Application.DTOs;

public class CreateGeometryDto
{
    public string Wkt { get; set; } = string.Empty;

    // Hocanın istediği öznitelik pop-up'ından geliyor: en az İsim ve Renk.
    // Boş bırakılırsa servis tarafında makul bir varsayılan atanıyor.
    public string? Name { get; set; }
    public string? Color { get; set; }
    public int? CategoryId { get; set; }

    // Faz 1b: hangi haritaya çizildiği. Client göndermezse (henüz harita switcher'ı
    // olmayan eski frontend) Controller kullanıcının varsayılan haritasını otomatik
    // çözüp buraya yazıyor (bkz. GeometryController, IMapService.GetOrCreateDefaultMapIdAsync)
    // — böylece bu alan eklenmeden önce yazılmış istekler de kırılmadan çalışmaya devam eder.
    public int? MapId { get; set; }

    // Faz 3 (kullanıcının kendi isteği): "sadece bana görünsün" — true ise bu kaydı
    // haritayı paylaşımla görüntüleyen başkaları göremez (sadece çizen ve harita sahibi).
    public bool IsPrivate { get; set; } = false;
}

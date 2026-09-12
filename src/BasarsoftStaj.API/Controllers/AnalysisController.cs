using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;

namespace BasarsoftStaj.API.Controllers;

// Hoca isteği: "Envanter Analizi" — hem normal Poligon çiziminden hemen sonra
// otomatik olarak, hem de menüdeki geçici (kaydedilmeyen) analiz aracından
// çağrılıyor. Poligon veritabanına kaydedilsin ya da kaydedilmesin, aynı uç nokta
// yeterli: sadece bir WKT poligon alıp mevcut envanterle kesişim sayısını döndürüyor.
//
// BUG FİX (kullanıcının kendi tespiti — "ekranda 1 nokta 1 çizgi var ama toplam 7
// diyor"): bu uç eskiden [Authorize] BİLE değildi ve mapId hiç almıyordu — çoklu harita
// (Faz 1a) ve kişiye özel çizim (Faz 3) eklendiğinde buraya taşınmayı unutmuşuz, yani
// TÜM kullanıcıların TÜM haritalarındaki kayıtları tarıyordu. Artık GeometryController
// ile birebir aynı iki kural: (1) mapId verilmezse aktif kullanıcının varsayılan
// haritasına düş, (2) o haritayı görüntüleme hakkın (sahiplik YA DA kabul edilmiş
// paylaşım) yoksa 403.
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AnalysisController : ApiControllerBase
{
    private readonly IInventoryAnalysisService _analysisService;
    private readonly ICurrentUserService _currentUser;
    private readonly IMapService _mapService;
    private readonly IMapShareService _mapShareService;

    public AnalysisController(
        IInventoryAnalysisService analysisService,
        ICurrentUserService currentUser,
        IMapService mapService,
        IMapShareService mapShareService,
        ILogger<AnalysisController> logger) : base(logger)
    {
        _analysisService = analysisService;
        _currentUser = currentUser;
        _mapService = mapService;
        _mapShareService = mapShareService;
    }

    [HttpPost("intersect")]
    public async Task<IActionResult> Intersect([FromBody] AnalyzeIntersectionDto dto)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });

            var mapId = dto.MapId ?? await _mapService.GetOrCreateDefaultMapIdAsync(userId.Value);
            var isOwner = await _mapService.IsOwnerAsync(mapId, userId.Value);
            if (!isOwner && !await _mapShareService.HasAcceptedAccessAsync(mapId, userId.Value))
            {
                return StatusCode(403, new { message = "Bu haritayı görüntüleme yetkin yok." });
            }

            var (success, result, error) = await _analysisService.AnalyzeAsync(dto, mapId, userId, isOwner);
            return success ? Ok(result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Envanter analizi yapılamadı.");
        }
    }
}

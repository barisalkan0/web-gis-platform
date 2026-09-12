using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Application.Services;

namespace BasarsoftStaj.API.Controllers;

// Hoca ödevi (2. tur — GeoServer SQL View/WMS-WFS ayrımı + Isı Haritası): "Verilerin
// haritadaki genel gösterimlerinde WMS ... tercih edin" isteği gereği bazı ekranlar
// (harita önizleme lightbox'ı, Isı Haritası) artık backend'e hiç uğramadan DOĞRUDAN
// tarayıcıdan GeoServer'ın WMS servisine istek atıyor (OpenLayers ImageWMS — GetMap zaten
// bir raster/resim döndürüyor, ara katmandan geçirmenin performans dışında bir faydası yok).
// Ama bu isteklerin İÇİN GEREKEN yetki kontrolü VE haritaya/kullanıcıya özel CQL_FILTER
// string'i hâlâ backend'de üretiliyor — frontend'e asla "istediğin mapId'yi görebilirsin"
// gibi bir açık bırakmıyoruz; bu endpoint sadece o mapId'yi görme hakkı olan kullanıcıya,
// sadece O HARİTAYA özel scoped bir config döner (GeometryController'daki WFS okuma yolunun
// AYNI yetki/görünürlük kuralının WMS karşılığı).
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GeoServerConfigController : ApiControllerBase
{
    private readonly ICurrentUserService _currentUser;
    private readonly IMapService _mapService;
    private readonly IMapShareService _mapShareService;
    private readonly IPermissionService _permissionService;
    private readonly IConfiguration _configuration;

    public GeoServerConfigController(
        ICurrentUserService currentUser,
        IMapService mapService,
        IMapShareService mapShareService,
        IPermissionService permissionService,
        IConfiguration configuration,
        ILogger<GeoServerConfigController> logger) : base(logger)
    {
        _currentUser = currentUser;
        _mapService = mapService;
        _mapShareService = mapShareService;
        _permissionService = permissionService;
        _configuration = configuration;
    }

    // GeometryController.CanViewMapAsync ile BİREBİR aynı kural — bilerek kopya. Bu iki
    // controller birbirinden bağımsız yaşıyor; ortak bir taban sınıfa taşımak bu ödevin
    // kapsamı için gereksiz bir risk olurdu. Asıl güvenlik-kritik/tekrar-riskli parça olan
    // CQL_FILTER string'i zaten GeoServerCqlFilterBuilder'da TEK yerde (bkz. o dosyadaki not).
    // Kullanıcının kendi isteği: adminler sahiplik/paylaşım aranmaksızın her haritayı görsün
    // — bu controller PermissionControllerBase'den türemediği için IsAdminAsync'i burada da
    // bilerek AYNI şekilde kopyalıyoruz (yukarıdaki notla tutarlı).
    private async Task<bool> CanViewMapAsync(int userId, int mapId)
    {
        if (await _mapService.IsOwnerAsync(mapId, userId)) return true;
        if (await _mapShareService.HasAcceptedAccessAsync(mapId, userId)) return true;
        var username = User.Identity?.Name;
        if (string.IsNullOrEmpty(username)) return false;
        var effectiveCodes = await _permissionService.GetEffectivePermissionCodesForUsernameAsync(username);
        return effectiveCodes.Contains(BasarsoftStaj.Domain.Entities.PermissionCodes.ManageAdmin);
    }

    // mapId: önizlemesi/ısı haritası açılacak harita. Dönen cqlFilter'ı frontend olduğu
    // gibi (URL-encode ederek) WMS GetMap isteğine CQL_FILTER parametresi olarak ekliyor —
    // frontend tarafında AYRICA bir görünürlük mantığı YOK, kör bir şekilde bu string'i
    // taşıyor. Böylece "hangi kayıtların görüneceği" kararı hep tek yerde (backend) kalıyor.
    [HttpGet("{mapId}")]
    public async Task<IActionResult> GetConfig(int mapId)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            if (!await CanViewMapAsync(userId.Value, mapId))
                return StatusCode(403, new { message = "Bu haritayı görüntüleme yetkin yok." });

            var isOwner = await _mapService.IsOwnerAsync(mapId, userId.Value);
            var cqlFilter = GeoServerCqlFilterBuilder.BuildVisibilityFilter(mapId, userId, isOwner);

            var config = new GeoServerConfigDto
            {
                BaseUrl = (_configuration["GeoServer:BaseUrl"] ?? "http://localhost:8080/geoserver").TrimEnd('/'),
                Workspace = _configuration["GeoServer:Workspace"] ?? "basarsoft",
                CqlFilter = cqlFilter,
            };
            return Ok(config);
        }
        catch (Exception ex)
        {
            return HandleException(ex, "GeoServer bağlantı bilgileri alınamadı.");
        }
    }
}

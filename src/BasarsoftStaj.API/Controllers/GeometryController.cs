using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NetTopologySuite.Geometries;
using BasarsoftStaj.Application.DTOs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Domain.Entities;

namespace BasarsoftStaj.API.Controllers;

// Katmanlı mimari: WKT parse/doğrulama + DTO eşleme gibi iş mantığı IGeometryService'te —
// Controller sadece ilgili servisi çağırıp sonucu HTTP yanıtına çeviriyor.
[ApiController]
[Route("api/[controller]")]
public class GeometryController : PermissionControllerBase
{
    private readonly IGeometryService<TblPoint, Point> _pointService;
    private readonly IGeometryService<TblLine, LineString> _lineService;
    private readonly IGeometryService<TblPolygon, Polygon> _polygonService;
    private readonly IPermissionService _permissionService;
    private readonly ICurrentUserService _currentUser;
    private readonly IMapService _mapService;
    private readonly IMapShareService _mapShareService;

    public GeometryController(
        IGeometryService<TblPoint, Point> pointService,
        IGeometryService<TblLine, LineString> lineService,
        IGeometryService<TblPolygon, Polygon> polygonService,
        IPermissionService permissionService,
        ICurrentUserService currentUser,
        IMapService mapService,
        IMapShareService mapShareService,
        ILogger<GeometryController> logger) : base(logger)
    {
        _pointService = pointService;
        _lineService = lineService;
        _polygonService = polygonService;
        _permissionService = permissionService;
        _currentUser = currentUser;
        _mapService = mapService;
        _mapShareService = mapShareService;
    }

    // Faz 1b: mapId query'de gelmezse (henüz harita switcher'ı olmayan eski frontend,
    // ya da switcher'da hiç sekme seçilmemişse) kullanıcının varsayılan haritasına
    // otomatik düşüyoruz — bu sayede bu değişiklikten önce yazılmış hiçbir çağrı kırılmaz.
    private Task<int> ResolveMapIdAsync(int userId, int? mapId) =>
        mapId.HasValue ? Task.FromResult(mapId.Value) : _mapService.GetOrCreateDefaultMapIdAsync(userId);

    // Faz 2: bir haritayı GÖRÜNTÜLEYEBİLMEK için sahibi olmak YA DA o haritaya kabul
    // edilmiş bir MapShare daveti almış olmak gerekir.
    private async Task<bool> CanViewMapAsync(int userId, int mapId)
    {
        if (await _mapService.IsOwnerAsync(mapId, userId)) return true;
        if (await _mapShareService.HasAcceptedAccessAsync(mapId, userId)) return true;
        // Kullanıcının kendi isteği: adminler sahiplik/paylaşım aranmaksızın her haritayı
        // görebilsin (bkz. PermissionControllerBase.IsAdminAsync).
        return await IsAdminAsync(_permissionService);
    }

    // Faz 3.1 (kullanıcının kendi isteği: "çizme ayrı bir izin olsun"): ÇİZİM için sahiplik
    // GEREKMİYOR ama görüntüleme hakkı (CanView, "duraklat" dahil) YETMİYOR — davetlinin
    // ayrıca MapShare.CanDraw=true olması lazım. Faz 3'ün ilk halinde "kabul eden herkes
    // çizer" davranışıydı; CanDraw varsayılan true olduğu için mevcut paylaşımlar BOZULMUYOR,
    // sahip artık isterse tek tek kapatabiliyor.
    private async Task<IActionResult?> RequireCanDrawAsync(int mapId, int userId, string deniedMessage)
    {
        if (await _mapService.IsOwnerAsync(mapId, userId)) return null;
        // Kullanıcının kendi isteği: "adminler her şeyi yapabilecek" — sahiplik/paylaşım
        // aranmaksızın. RequirePermissionAsync'in ManageAdmin bypass'ı sadece DrawX iznini
        // kontrol ediyor, mapId'ye özel bu kısıtı DEĞİL — bu yüzden burada AYRICA gerekiyor.
        if (await IsAdminAsync(_permissionService)) return null;
        if (!await _mapShareService.HasAcceptedAccessAsync(mapId, userId)) return StatusCode(403, new { message = deniedMessage });

        var settings = await _mapShareService.GetShareForUserAsync(mapId, userId);
        if (settings?.CanDraw == true) return null;

        return StatusCode(403, new { message = deniedMessage });
    }

    // Faz 3: var olan bir kaydı DÜZENLEME için — harita sahibi HER ZAMAN yapabilir;
    // sahip değilse SADECE kendi çizdiğini (authorId == userId) düzenleyebilir, MEĞER Kİ
    // sahip bu davetliye MapShare.CanEditOthers=true vermiş olsun (o zaman haritadaki
    // HERKESİN çizimini düzenleyebilir). mapId null gelirse (MapId'siz eski kayıt) kontrolü
    // atlıyoruz ki geriye dönük hiçbir kayıt aniden düzenlenemez hale gelmesin.
    private async Task<IActionResult?> RequireCanEditFeatureAsync(int? mapId, int? authorId, int userId, string deniedMessage)
    {
        if (mapId == null) return null;
        if (await _mapService.IsOwnerAsync(mapId.Value, userId)) return null;
        if (authorId == userId) return null;
        // Kullanıcının kendi isteği: "adminler her şeyi yapabilecek."
        if (await IsAdminAsync(_permissionService)) return null;

        var settings = await _mapShareService.GetShareForUserAsync(mapId.Value, userId);
        if (settings?.CanEditOthers == true) return null;

        return StatusCode(403, new { message = deniedMessage });
    }

    // Faz 3.1: var olan bir kaydı SİLME için — DÜZENLEME'den ayrı, çünkü kullanıcı "silme
    // ayrı bir izin olsun" istedi. Sahip HER ZAMAN silebilir. Sahip değilse önce MapShare.
    // CanDelete=true olmalı (kapalıysa kendi çizdiğini bile silemez); CanDelete açıksa kendi
    // çizdiğini silebilir, BAŞKASININKİNİ silmek için ayrıca CanEditOthers=true da lazım
    // (yani "başkasını düzenleyebilir" iznini vermeden sadece silme izni vermek başkasının
    // çizimine dokunduramaz). CanDelete varsayılan true — mevcut "yazan her zaman kendi
    // çizimini silebilir" davranışı BOZULMUYOR.
    private async Task<IActionResult?> RequireCanDeleteFeatureAsync(int? mapId, int? authorId, int userId, string deniedMessage)
    {
        if (mapId == null) return null;
        if (await _mapService.IsOwnerAsync(mapId.Value, userId)) return null;
        // Kullanıcının kendi isteği: "adminler her şeyi yapabilecek."
        if (await IsAdminAsync(_permissionService)) return null;

        var settings = await _mapShareService.GetShareForUserAsync(mapId.Value, userId);
        if (settings?.CanDelete != true) return StatusCode(403, new { message = deniedMessage });

        if (authorId == userId) return null;
        if (settings?.CanEditOthers == true) return null;

        return StatusCode(403, new { message = deniedMessage });
    }

    // Hoca isteği: "Harita açıldığında sadece sisteme giriş yapmış olan kullanıcıya ait
    // çizimler listelenmelidir" — bu yüzden GET uçları artık [Authorize] ve sadece o an
    // giriş yapmış kullanıcının (InsertedUserId) kayıtlarını döndürüyor. Token'da kullanıcı
    // id'si claim'i yoksa (ör. bu özellikten ÖNCE alınmış eski bir token) 401 dönüyoruz —
    // kullanıcının tekrar giriş yapması yeterli.
    [Authorize]
    [HttpGet("point")]
    public async Task<IActionResult> GetPoints([FromQuery] int? mapId)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var resolvedMapId = await ResolveMapIdAsync(userId.Value, mapId);
            if (!await CanViewMapAsync(userId.Value, resolvedMapId)) return StatusCode(403, new { message = "Bu haritayı görüntüleme yetkin yok." });
            var isOwner = await _mapService.IsOwnerAsync(resolvedMapId, userId.Value);
            return Ok(await _pointService.GetAllAsync(resolvedMapId, userId, isOwner));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Noktalar listelenemedi.");
        }
    }

    [Authorize]
    [HttpGet("line")]
    public async Task<IActionResult> GetLines([FromQuery] int? mapId)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var resolvedMapId = await ResolveMapIdAsync(userId.Value, mapId);
            if (!await CanViewMapAsync(userId.Value, resolvedMapId)) return StatusCode(403, new { message = "Bu haritayı görüntüleme yetkin yok." });
            var isOwner = await _mapService.IsOwnerAsync(resolvedMapId, userId.Value);
            return Ok(await _lineService.GetAllAsync(resolvedMapId, userId, isOwner));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çizgiler listelenemedi.");
        }
    }

    [Authorize]
    [HttpGet("polygon")]
    public async Task<IActionResult> GetPolygons([FromQuery] int? mapId)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var resolvedMapId = await ResolveMapIdAsync(userId.Value, mapId);
            if (!await CanViewMapAsync(userId.Value, resolvedMapId)) return StatusCode(403, new { message = "Bu haritayı görüntüleme yetkin yok." });
            var isOwner = await _mapService.IsOwnerAsync(resolvedMapId, userId.Value);
            return Ok(await _polygonService.GetAllAsync(resolvedMapId, userId, isOwner));
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Alanlar listelenemedi.");
        }
    }

    // Kullanıcının kendi isteği: "Ortak Görünüm" — MapController.GetAllForAdmin ile AYNI
    // admin-only desen (PermissionCodes.None sadece ManageAdmin bypass'ıyla geçer).
    [Authorize]
    [HttpGet("point/admin/all")]
    public async Task<IActionResult> GetAllPointsForAdmin()
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.None, "Ortak görünümü görmek için yönetim yetkisi gerekiyor.");
            if (denied != null) return denied;
            return Ok(await _pointService.GetAllForAdminAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Noktalar listelenemedi.");
        }
    }

    [Authorize]
    [HttpGet("line/admin/all")]
    public async Task<IActionResult> GetAllLinesForAdmin()
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.None, "Ortak görünümü görmek için yönetim yetkisi gerekiyor.");
            if (denied != null) return denied;
            return Ok(await _lineService.GetAllForAdminAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çizgiler listelenemedi.");
        }
    }

    [Authorize]
    [HttpGet("polygon/admin/all")]
    public async Task<IActionResult> GetAllPolygonsForAdmin()
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.None, "Ortak görünümü görmek için yönetim yetkisi gerekiyor.");
            if (denied != null) return denied;
            return Ok(await _polygonService.GetAllForAdminAsync());
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Alanlar listelenemedi.");
        }
    }

    // Çizim endpoint'leri [Authorize] — kim çizdiğini bilmemiz lazım ki rolünün
    // nokta/çizgi/alan çizme iznini kontrol edebilelim, hem de InsertedUserId'yi damgalayabilelim.
    [Authorize]
    [HttpPost("point")]
    public async Task<IActionResult> CreatePoint([FromBody] CreateGeometryDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawPoint, "Bu rolün nokta çizme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var resolvedMapId = await ResolveMapIdAsync(userId.Value, dto.MapId);
            dto.MapId = resolvedMapId;
            var mapDenied = await RequireCanDrawAsync(resolvedMapId, userId.Value, "Bu haritada çizim yapma yetkin yok.");
            if (mapDenied != null) return mapDenied;

            var (success, result, error) = await _pointService.CreateAsync(dto, userId, User.Identity?.Name);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Nokta kaydedilemedi.");
        }
    }

    [Authorize]
    [HttpPost("line")]
    public async Task<IActionResult> CreateLine([FromBody] CreateGeometryDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawLine, "Bu rolün çizgi çizme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var resolvedMapId = await ResolveMapIdAsync(userId.Value, dto.MapId);
            dto.MapId = resolvedMapId;
            var mapDenied = await RequireCanDrawAsync(resolvedMapId, userId.Value, "Bu haritada çizim yapma yetkin yok.");
            if (mapDenied != null) return mapDenied;

            var (success, result, error) = await _lineService.CreateAsync(dto, userId, User.Identity?.Name);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çizgi kaydedilemedi.");
        }
    }

    [Authorize]
    [HttpPost("polygon")]
    public async Task<IActionResult> CreatePolygon([FromBody] CreateGeometryDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawPolygon, "Bu rolün alan çizme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var resolvedMapId = await ResolveMapIdAsync(userId.Value, dto.MapId);
            dto.MapId = resolvedMapId;
            var mapDenied = await RequireCanDrawAsync(resolvedMapId, userId.Value, "Bu haritada çizim yapma yetkin yok.");
            if (mapDenied != null) return mapDenied;

            var (success, result, error) = await _polygonService.CreateAsync(dto, userId, User.Identity?.Name);
            return success ? Created(string.Empty, result) : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Alan kaydedilemedi.");
        }
    }

    [Authorize]
    [HttpPatch("point/{id}/place")]
    public async Task<IActionResult> UpdatePointPlace(int id, [FromBody] UpdatePlaceDto dto)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _pointService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanEditFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada düzenleme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            return await _pointService.UpdatePlaceAsync(id, dto) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Yer bilgisi güncellenemedi.");
        }
    }

    [Authorize]
    [HttpPatch("line/{id}/place")]
    public async Task<IActionResult> UpdateLinePlace(int id, [FromBody] UpdatePlaceDto dto)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _lineService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanEditFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada düzenleme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            return await _lineService.UpdatePlaceAsync(id, dto) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Yer bilgisi güncellenemedi.");
        }
    }

    [Authorize]
    [HttpPatch("polygon/{id}/place")]
    public async Task<IActionResult> UpdatePolygonPlace(int id, [FromBody] UpdatePlaceDto dto)
    {
        try
        {
            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _polygonService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanEditFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada düzenleme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            return await _polygonService.UpdatePlaceAsync(id, dto) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Yer bilgisi güncellenemedi.");
        }
    }

    // Sağdaki panelden / detay bilgi kartından sonradan isim/renk/kategori düzenleme —
    // çizim izniyle aynı mantık.
    [Authorize]
    [HttpPatch("point/{id}/attributes")]
    public async Task<IActionResult> UpdatePointAttributes(int id, [FromBody] UpdateAttributesDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawPoint, "Bu rolün nokta düzenleme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _pointService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanEditFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada düzenleme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            var (attrsOk, attrsError) = await _pointService.UpdateAttributesAsync(id, dto, userId, User.Identity?.Name);
            return attrsOk ? NoContent() : BadRequest(new { message = attrsError });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Nokta güncellenemedi.");
        }
    }

    [Authorize]
    [HttpPatch("line/{id}/attributes")]
    public async Task<IActionResult> UpdateLineAttributes(int id, [FromBody] UpdateAttributesDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawLine, "Bu rolün çizgi düzenleme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _lineService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanEditFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada düzenleme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            var (attrsOk, attrsError) = await _lineService.UpdateAttributesAsync(id, dto, userId, User.Identity?.Name);
            return attrsOk ? NoContent() : BadRequest(new { message = attrsError });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çizgi güncellenemedi.");
        }
    }

    [Authorize]
    [HttpPatch("polygon/{id}/attributes")]
    public async Task<IActionResult> UpdatePolygonAttributes(int id, [FromBody] UpdateAttributesDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawPolygon, "Bu rolün alan düzenleme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _polygonService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanEditFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada düzenleme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            var (attrsOk, attrsError) = await _polygonService.UpdateAttributesAsync(id, dto, userId, User.Identity?.Name);
            return attrsOk ? NoContent() : BadRequest(new { message = attrsError });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Alan güncellenemedi.");
        }
    }

    // Bilgi kartındaki "Düzenle" → köşe noktaları sürüklendikten sonra yeni WKT'yi
    // kaydeder. Aynı çizim izniyle korunuyor (bir çizgiyi düzenlemek de çizme izni ister).
    [Authorize]
    [HttpPatch("point/{id}/geometry")]
    public async Task<IActionResult> UpdatePointGeometry(int id, [FromBody] UpdateGeometryDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawPoint, "Bu rolün nokta düzenleme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _pointService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanEditFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada düzenleme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            var (success, error) = await _pointService.UpdateGeometryAsync(id, dto, userId, User.Identity?.Name);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Nokta konumu güncellenemedi.");
        }
    }

    [Authorize]
    [HttpPatch("line/{id}/geometry")]
    public async Task<IActionResult> UpdateLineGeometry(int id, [FromBody] UpdateGeometryDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawLine, "Bu rolün çizgi düzenleme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _lineService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanEditFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada düzenleme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            var (success, error) = await _lineService.UpdateGeometryAsync(id, dto, userId, User.Identity?.Name);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çizgi konumu güncellenemedi.");
        }
    }

    [Authorize]
    [HttpPatch("polygon/{id}/geometry")]
    public async Task<IActionResult> UpdatePolygonGeometry(int id, [FromBody] UpdateGeometryDto dto)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawPolygon, "Bu rolün alan düzenleme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _polygonService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanEditFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada düzenleme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            var (success, error) = await _polygonService.UpdateGeometryAsync(id, dto, userId, User.Identity?.Name);
            return success ? NoContent() : BadRequest(new { message = error });
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Alan konumu güncellenemedi.");
        }
    }

    // Artık kalıcı silmiyor, çöp kutusuna (IsDeleted) düşürüyor — bkz. GeometryService.SoftDeleteAsync.
    // Not: eskiden bu üç uç [Authorize] DEĞİLDİ (herhangi biri silebilirdi) — çizme izniyle
    // aynı kapsama alındı, silme de bir "düzenleme" yetkisi gerektirmeli.
    [Authorize]
    [HttpDelete("point/{id}")]
    public async Task<IActionResult> DeletePoint(int id)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawPoint, "Bu rolün nokta silme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _pointService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanDeleteFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada silme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            return await _pointService.SoftDeleteAsync(id, User.Identity?.Name) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Nokta silinemedi.");
        }
    }

    [Authorize]
    [HttpDelete("line/{id}")]
    public async Task<IActionResult> DeleteLine(int id)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawLine, "Bu rolün çizgi silme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _lineService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanDeleteFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada silme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            return await _lineService.SoftDeleteAsync(id, User.Identity?.Name) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Çizgi silinemedi.");
        }
    }

    [Authorize]
    [HttpDelete("polygon/{id}")]
    public async Task<IActionResult> DeletePolygon(int id)
    {
        try
        {
            var denied = await RequirePermissionAsync(_permissionService, PermissionCodes.DrawPolygon, "Bu rolün alan silme yetkisi yok.");
            if (denied != null) return denied;

            var userId = _currentUser.GetUserId(User);
            if (userId == null) return Unauthorized(new { message = "Oturum geçersiz, lütfen tekrar giriş yapın." });
            var (ownMapId, ownAuthorId) = await _polygonService.GetOwnershipInfoAsync(id);
            var mapDenied = await RequireCanDeleteFeatureAsync(ownMapId, ownAuthorId, userId.Value, "Bu haritada silme yetkin yok.");
            if (mapDenied != null) return mapDenied;

            return await _polygonService.SoftDeleteAsync(id, User.Identity?.Name) ? NoContent() : NotFound();
        }
        catch (Exception ex)
        {
            return HandleException(ex, "Alan silinemedi.");
        }
    }
}

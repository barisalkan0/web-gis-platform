using Microsoft.EntityFrameworkCore;
using NetTopologySuite.Geometries;
using BasarsoftStaj.API.BackgroundServices;
using BasarsoftStaj.API.Hubs;
using BasarsoftStaj.Application.Interfaces;
using BasarsoftStaj.Application.Services;
using BasarsoftStaj.Domain.Entities;
using BasarsoftStaj.Infrastructure.Data;
using BasarsoftStaj.Infrastructure.Repositories;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Gün 6: tüm tablo/kolon isimleri artık otomatik snake_case (kucuk harf) üretiliyor
// (Id -> id, Username -> username, RoleId -> role_id vb.) — böylece raw SQL'de tırnak
// gerekmiyor. EFCore.NamingConventions paketi bunu tek satırla, gelecekte eklenecek her
// yeni entity/property için de otomatik uyguluyor (bkz. AppDbContext.OnModelCreating'teki
// açıklama). tbl_point/tbl_line/tbl_polygon zaten lowercase ToTable() ile sabitlendiği
// için bu değişiklikten etkilenmiyor.
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        npgsqlOptions => npgsqlOptions.UseNetTopologySuite())
    .UseSnakeCaseNamingConvention());

builder.Services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
builder.Services.AddScoped<ILocationService, LocationService>();

// Hoca ödevi (GeoServer entegrasyonu, bkz. docs/geoserver-kurulum.md): GeometryService
// artık nokta/çizgi/alan listesini GeoServer'ın WFS servisinden çekiyor, bunun için
// IHttpClientFactory'den yönetilen bir HttpClient'a ihtiyacı var. AddHttpClient<TI,TC>
// (Microsoft.Extensions.Http, ASP.NET Core shared framework'te hazır gelir — ekstra paket
// gerekmez) her istekte kendi `new HttpClient()` yapmak yerine soket havuzunu yönetir.
builder.Services.AddHttpClient<IGeoServerFeatureService, GeoServerFeatureService>();

// Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): IGeoServerFeatureService ile
// AYNI kayıt deseni — kendi Docker'da çalışan OSRM sunucusuna istek atan ince bir servis
// (bkz. docs/osrm-kurulum.md).
builder.Services.AddHttpClient<IOsrmService, OsrmService>();

// Katmanlı mimari: Controller'lar artık repository'lere değil bu servislere bağlı.
// Aynı GeometryService<TEntity,TGeometry> implementasyonu üç geometri tipi için de
// (Point/Line/Polygon) ayrı ayrı kayıtlı — kod tekrarı yok.
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IRoleService, RoleService>();
builder.Services.AddScoped<ICategoryService, CategoryService>();
builder.Services.AddScoped<IAuditLogService, AuditLogService>();
builder.Services.AddScoped<IAccountService, AccountService>();
builder.Services.AddScoped<IPermissionService, PermissionService>();
builder.Services.AddScoped<IGeometryService<TblPoint, Point>, GeometryService<TblPoint, Point>>();
builder.Services.AddScoped<IGeometryService<TblLine, LineString>, GeometryService<TblLine, LineString>>();
builder.Services.AddScoped<IGeometryService<TblPolygon, Polygon>, GeometryService<TblPolygon, Polygon>>();
builder.Services.AddScoped<IInventoryAnalysisService, InventoryAnalysisService>();
builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddScoped<IMapService, MapService>();
builder.Services.AddScoped<IMapShareService, MapShareService>();
builder.Services.AddScoped<IGeoRestrictionService, GeoRestrictionService>();
builder.Services.AddScoped<IPoiCategoryService, PoiCategoryService>();
builder.Services.AddScoped<IPoiService, PoiService>();
builder.Services.AddScoped<ITransitRouteService, TransitRouteService>();
builder.Services.AddScoped<ITransitStopService, TransitStopService>();

// Hoca ödevi (31 Ağustos, Operatör Simülasyon Başlatma + SignalR Canlı Veri Yayını):
// AddSignalR() Microsoft.AspNetCore.SignalR paketini shared framework'ten getirir (ekstra
// NuGet paketi GEREKMEZ — .NET 8 SDK'ya dahildir). ITransitSimulationService BİLEREK
// Singleton (aktif simülasyonların bellek içi durumu tüm istekler arasında paylaşılmalı —
// bkz. TransitSimulationService'teki gerekçe), TransitSimulationBroadcastService ise
// saniyede bir bu servisi okuyup SignalR üzerinden yayın yapan bir BackgroundService.
builder.Services.AddSignalR();
builder.Services.AddSingleton<ITransitSimulationService, TransitSimulationService>();
builder.Services.AddHostedService<TransitSimulationBroadcastService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              // SignalR'ın negotiate/websocket bağlantısı için gerekli — AllowAnyOrigin ile
              // birlikte KULLANILAMAZ ama burada zaten sabit WithOrigins var, sorun yok.
              .AllowCredentials());
});
var jwtSettings = builder.Configuration.GetSection("Jwt");
var key = Encoding.UTF8.GetBytes(jwtSettings["Key"]!);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(key)
    };
});


var app = builder.Build();
app.UseAuthentication();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowReactApp");
app.UseAuthorization();
app.MapControllers();
// Hoca ödevi (31 Ağustos, SignalR Canlı Veri Yayını): frontend bu adrese
// (@microsoft/signalr HubConnectionBuilder ile) bağlanıp JoinRouteGroup/LeaveRouteGroup
// çağırıyor, PositionUpdated/SimulationCompleted olaylarını dinliyor.
app.MapHub<TransitSimulationHub>("/hubs/transit-simulation");
app.Run();
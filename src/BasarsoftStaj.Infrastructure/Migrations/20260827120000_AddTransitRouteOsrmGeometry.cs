using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using BasarsoftStaj.Infrastructure.Data;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations;

// Hoca ödevi (27 Ağustos, OSRM ile Otomatik Rota Üretimi): "Hesaplanan rotaları ilgili
// güzergah için veritabanına kaydedin." — TransitRoute.RouteGeometry (OSRM'in hesapladığı
// gerçek yol rotası) + RouteGeneratedAt (ne zaman üretildiği, admin panelinde gösterilecek).
// Var olan Path sütunundan (adminin elle büktüğü hat) KASITLI OLARAK AYRI — bkz. TransitRoute.cs
// yorumu.
//
// [DbContext]/[Migration] öznitelikleri yine BİLE BİLE eklendi (bkz. önceki migration'lardaki
// AYNI uyarı — bunları unutmak "dotnet ef migrations list"in migration'ı hiç göstermemesine
// yol açıyor).
[DbContext(typeof(AppDbContext))]
[Migration("20260827120000_AddTransitRouteOsrmGeometry")]
public partial class AddTransitRouteOsrmGeometry : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<LineString>(
            name: "route_geometry",
            table: "route",
            type: "geometry",
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "route_generated_at",
            table: "route",
            type: "timestamp with time zone",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "route_geometry", table: "route");
        migrationBuilder.DropColumn(name: "route_generated_at", table: "route");
    }
}

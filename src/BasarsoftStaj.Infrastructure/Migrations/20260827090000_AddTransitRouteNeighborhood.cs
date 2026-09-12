using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BasarsoftStaj.Infrastructure.Data;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations;

// Kullanıcının kendi isteği (hoca ödevi değil — Ulaşım Modülü UX turu, FAZ 2): "il ilçe
// mahalle vs otomatik oluştursun" — Province/District'in YANINA eklenen üçüncü serbest-metin
// alan. Otomatik doldurma frontend'de (MapPage.jsx confirmStopDraw, reverseGeocode ile)
// yapılıyor; bu alan sadece depolama.
//
// [DbContext]/[Migration] öznitelikleri yine BİLE BİLE eklendi (bkz. önceki üç migration'daki
// AYNI uyarı — bunları unutmak "dotnet ef migrations list"in migration'ı hiç göstermemesine
// yol açıyor).
[DbContext(typeof(AppDbContext))]
[Migration("20260827090000_AddTransitRouteNeighborhood")]
public partial class AddTransitRouteNeighborhood : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "neighborhood",
            table: "route",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "neighborhood", table: "route");
    }
}

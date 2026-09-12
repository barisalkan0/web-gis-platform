using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using BasarsoftStaj.Infrastructure.Data;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations;

// Kullanıcının kendi isteği (hoca ödevi değil — Ulaşım Modülü'nün UX polish turu):
// "istediğimiz durağı veya güzergahı duraklatma şeyi de olsun duraklatınca görünmesinler...
// bizim eklediğimiz güzergahlar düz çizgi olarak birleşiyor... en kötü ihtimalle aralarındaki
// çizgileri tutup kırabiliyor olalım bükebilelim." — route/stop'a IsPaused (GeoRestriction/
// MapShare ile AYNI desen), route'a nullable Path (LineString, elle bükülen hat) eklendi.
//
// [DbContext]/[Migration] öznitelikleri BİLE BİLE eklendi — 20260826120000_AddTransitRoutesAndStops
// migration'ında bunları unutmak "dotnet ef migrations list"in migration'ı HİÇ göstermemesine
// yol açmıştı, o hatayı burada tekrarlamamak için.
[DbContext(typeof(AppDbContext))]
[Migration("20260826180000_AddTransitPauseAndPath")]
public partial class AddTransitPauseAndPath : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "is_paused",
            table: "route",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<bool>(
            name: "is_paused",
            table: "stop",
            type: "boolean",
            nullable: false,
            defaultValue: false);

        migrationBuilder.AddColumn<LineString>(
            name: "path",
            table: "route",
            type: "geometry",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "is_paused", table: "route");
        migrationBuilder.DropColumn(name: "is_paused", table: "stop");
        migrationBuilder.DropColumn(name: "path", table: "route");
    }
}

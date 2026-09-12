using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BasarsoftStaj.Infrastructure.Data;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations;

// Kullanıcının kendi isteği (hoca ödevi değil — Ulaşım Modülü UX turu): "şehre, ilçeye göre
// filtre olsun" — Poi.Province/District ile AYNI serbest-metin desen, sadece arama/filtre
// amaçlı (bkz. TransitRoute.cs yorumu: bir güzergahın birden fazla durağı olduğu için otomatik
// reverse-geocode yok, admin elle etiketliyor).
//
// [DbContext]/[Migration] öznitelikleri yine BİLE BİLE eklendi (bkz. önceki iki migration'daki
// AYNI uyarı — bunları unutmak "dotnet ef migrations list"in migration'ı hiç göstermemesine
// yol açıyor).
[DbContext(typeof(AppDbContext))]
[Migration("20260826200000_AddTransitRouteProvinceDistrict")]
public partial class AddTransitRouteProvinceDistrict : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "province",
            table: "route",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "district",
            table: "route",
            type: "character varying(100)",
            maxLength: 100,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "province", table: "route");
        migrationBuilder.DropColumn(name: "district", table: "route");
    }
}

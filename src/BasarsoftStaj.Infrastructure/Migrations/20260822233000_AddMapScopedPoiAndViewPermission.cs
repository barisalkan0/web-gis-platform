using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BasarsoftStaj.Infrastructure.Data;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260822233000_AddMapScopedPoiAndViewPermission")]
public partial class AddMapScopedPoiAndViewPermission : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "map_id",
            table: "poi",
            type: "integer",
            nullable: true);

        // Bu migration elle eklendiği için ayrı bir designer/TargetModel taşımıyor.
        // DataOperation yerine açık SQL kullanmak, EF'in tablo-model eşlemesi aramasını
        // önler. ON CONFLICT tekrar çalıştırma veya kısmi manuel seed durumunda güvenlidir.
        migrationBuilder.Sql("""
            UPDATE permissions
            SET description = 'Haritada POI oluşturma ve kendi POI''lerini düzenleme.',
                name = 'POI Ekleme ve Düzenleme'
            WHERE id = 11;

            INSERT INTO permissions (id, code, description, name)
            VALUES (13, 'ViewPoi', 'Erişilebilen haritalardaki POI katmanını görüntüleme.', 'POI Görüntüleme')
            ON CONFLICT (id) DO UPDATE
            SET code = EXCLUDED.code,
                description = EXCLUDED.description,
                name = EXCLUDED.name;

            INSERT INTO role_permissions (id, permission_id, role_id)
            VALUES (-1, 13, 1), (-2, 13, 2), (-3, 13, 3)
            ON CONFLICT DO NOTHING;
            """);

        // Eski POI'ler önce üreticinin varsayılan, varsayılan yoksa en eski aktif
        // haritasına bağlanır. Kullanıcısı/haritası olmayanlar null kalır ve admin
        // panelindeki "Atanmamış" akışından sonradan atanır.
        migrationBuilder.Sql("""
            UPDATE poi AS p
            SET map_id = (
                SELECT m.id
                FROM maps AS m
                WHERE m.owner_user_id = p.user_id
                  AND m.is_deleted = FALSE
                ORDER BY m.is_default DESC, m.created_date ASC, m.id ASC
                LIMIT 1
            )
            WHERE p.map_id IS NULL
              AND p.user_id IS NOT NULL;
            """);

        migrationBuilder.CreateIndex(
            name: "ix_poi_map_id",
            table: "poi",
            column: "map_id");

        migrationBuilder.AddForeignKey(
            name: "fk_poi_maps_map_id",
            table: "poi",
            column: "map_id",
            principalTable: "maps",
            principalColumn: "id",
            onDelete: ReferentialAction.SetNull);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(name: "fk_poi_maps_map_id", table: "poi");
        migrationBuilder.DropIndex(name: "ix_poi_map_id", table: "poi");
        migrationBuilder.DropColumn(name: "map_id", table: "poi");

        migrationBuilder.Sql("""
            DELETE FROM role_permissions WHERE id IN (-1, -2, -3);
            DELETE FROM permissions WHERE id = 13;
            UPDATE permissions
            SET description = 'Haritada yeni POI (ilgi noktası) ekleyebilme. Var olan POI''leri görüntüleme bu izinden bağımsız, herkese açık.',
                name = 'POI Ekleme'
            WHERE id = 11;
            """);
    }
}

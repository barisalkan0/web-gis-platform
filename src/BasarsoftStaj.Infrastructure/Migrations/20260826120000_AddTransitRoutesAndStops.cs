using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using BasarsoftStaj.Infrastructure.Data;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations;

// Hoca ödevi (Akıllı Ulaşım Modülü, Durak ve Güzergah Yönetimi):
// "1. Veritabanı Yapısı ve İlişkiler: Ulaşım modülü için durak ve güzergah tablolarını
// oluşturun. Her bir durak bir güzergaha ait olacak şekilde 1-N ilişki kurun. Sisteme Ulaşım
// Modülü için Operatör ve Kullanıcı rolleri tanımlayın." — AddPoiAndPoiCategory.cs (tablo
// oluşturma) ve AddMapScopedPoiAndViewPermission.cs (idempotent raw-SQL izin/rol seed) İLE
// AYNI iki desen bir arada kullanılıyor.
//
// DÜZELTME (kullanıcının tespiti: "dotnet ef migrations list" bu migration'ı hiç
// göstermiyordu): [DbContext]/[Migration] öznitelikleri eksikti — EF Core bir migration'ı
// SADECE bu öznitelikler (ya da normal `dotnet ef migrations add` scaffold'unun ürettiği
// Designer.cs eşleniği) üzerinden keşfediyor, dosya adı/sınıf adı tek başına YETMİYOR.
[DbContext(typeof(AppDbContext))]
[Migration("20260826120000_AddTransitRoutesAndStops")]
public partial class AddTransitRoutesAndStops : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "route",
            columns: table => new
            {
                id = table.Column<int>(type: "integer", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                color = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                created_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                user_id = table.Column<int>(type: "integer", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_route", x => x.id);
                table.ForeignKey(
                    name: "fk_route_users_user_id",
                    column: x => x.user_id,
                    principalTable: "users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateTable(
            name: "stop",
            columns: table => new
            {
                id = table.Column<int>(type: "integer", nullable: false)
                    .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                geometry = table.Column<Point>(type: "geometry", nullable: false),
                name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                route_id = table.Column<int>(type: "integer", nullable: false),
                sort_order = table.Column<int>(type: "integer", nullable: false),
                is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                created_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                user_id = table.Column<int>(type: "integer", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("pk_stop", x => x.id);
                // Hoca ödevi: "Her bir durak bir güzergaha ait olacak şekilde 1-N ilişki
                // kurun" — route_id NOT NULL, bkz. TransitStop.cs/AppDbContext.cs yorumları
                // (Restrict — servis katmanı zaten önce durakları soft-delete ediyor, gerçek
                // bir SQL DELETE hiç tetiklenmiyor).
                table.ForeignKey(
                    name: "fk_stop_route_route_id",
                    column: x => x.route_id,
                    principalTable: "route",
                    principalColumn: "id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "fk_stop_users_user_id",
                    column: x => x.user_id,
                    principalTable: "users",
                    principalColumn: "id",
                    onDelete: ReferentialAction.SetNull);
            });

        migrationBuilder.CreateIndex(
            name: "ix_stop_route_id",
            table: "stop",
            column: "route_id");

        migrationBuilder.CreateIndex(
            name: "ix_stop_user_id",
            table: "stop",
            column: "user_id");

        // ON CONFLICT ile idempotent — tekrar çalıştırma veya kısmi manuel seed durumunda
        // güvenli (AddMapScopedPoiAndViewPermission.cs'teki AYNI desen).
        migrationBuilder.Sql("""
            INSERT INTO permissions (id, code, description, name)
            VALUES
                (14, 'ManageRoutes', 'Güzergah/durak oluşturma, düzenleme, silme ve durak sıralama.', 'Güzergah/Durak Yönetimi'),
                (15, 'ViewRoutes', 'Haritadaki güzergah/durak katmanını görüntüleme.', 'Güzergah/Durak Görüntüleme')
            ON CONFLICT (id) DO UPDATE
            SET code = EXCLUDED.code,
                description = EXCLUDED.description,
                name = EXCLUDED.name;

            -- Hoca ödevi: "Sisteme Ulaşım Modülü için Operatör ve Kullanıcı rolleri
            -- tanımlayın. NOT: Bu yeni rolleri eklerken daha önce yapılan POI ve Harita Çizim
            -- araçlarını bu roldekiler ekleme işlemlerini yapmasınlar yetkileri olmasın,
            -- eklenen POI'leri görüntüleyebilsinler." — bilinçli olarak mevcut
            -- Operatör/Kullanıcı rollerinden AYRI iki yeni rol: bu roller ManagePoi/DrawPoint/
            -- DrawLine/DrawPolygon içermez, sadece ManageRoutes/ViewRoutes + ViewPoi taşır.
            INSERT INTO roles (id, color, created_date, description, is_built_in, name)
            VALUES
                (4, '#f97316', TIMESTAMPTZ '2026-01-01 00:00:00Z', 'Sadece güzergah/durak ekleyip düzenleyebilir; POI/çizim ekleyemez, mevcut POI''leri görüntüleyebilir.', TRUE, 'Ulaşım Operatörü'),
                (5, '#22c55e', TIMESTAMPTZ '2026-01-01 00:00:00Z', 'Güzergah/durak ve POI katmanlarını görüntüleyebilir; hiçbir şey ekleyemez/düzenleyemez.', TRUE, 'Ulaşım Kullanıcısı')
            ON CONFLICT (id) DO UPDATE
            SET color = EXCLUDED.color,
                description = EXCLUDED.description,
                is_built_in = EXCLUDED.is_built_in,
                name = EXCLUDED.name;

            INSERT INTO role_permissions (id, permission_id, role_id)
            VALUES
                (18, 14, 2), -- ManageRoutes: Admin
                (19, 14, 4), -- ManageRoutes: Ulaşım Operatörü
                (20, 15, 1), -- ViewRoutes: Kullanıcı
                (21, 15, 2), -- ViewRoutes: Admin
                (22, 15, 3), -- ViewRoutes: Operatör
                (23, 15, 4), -- ViewRoutes: Ulaşım Operatörü
                (24, 15, 5), -- ViewRoutes: Ulaşım Kullanıcısı
                (25, 13, 4), -- ViewPoi: Ulaşım Operatörü (hoca notu: "eklenen POI'leri görüntüleyebilsinler")
                (26, 13, 5)  -- ViewPoi: Ulaşım Kullanıcısı
            ON CONFLICT DO NOTHING;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM role_permissions WHERE id BETWEEN 18 AND 26;
            DELETE FROM roles WHERE id IN (4, 5);
            DELETE FROM permissions WHERE id IN (14, 15);
            """);

        migrationBuilder.DropTable(name: "stop");
        migrationBuilder.DropTable(name: "route");
    }
}

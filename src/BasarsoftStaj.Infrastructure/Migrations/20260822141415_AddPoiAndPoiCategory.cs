using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPoiAndPoiCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "poi_category",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "text", nullable: false),
                    parent_id = table.Column<int>(type: "integer", nullable: true),
                    created_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_poi_category", x => x.id);
                    table.ForeignKey(
                        name: "fk_poi_category_poi_category_parent_id",
                        column: x => x.parent_id,
                        principalTable: "poi_category",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "poi",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    geometry = table.Column<Point>(type: "geometry", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    category_id = table.Column<int>(type: "integer", nullable: true),
                    working_hours = table.Column<string>(type: "text", nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    created_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    user_id = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_poi", x => x.id);
                    table.ForeignKey(
                        name: "fk_poi_poi_category_category_id",
                        column: x => x.category_id,
                        principalTable: "poi_category",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_poi_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.InsertData(
                table: "permissions",
                columns: new[] { "id", "code", "description", "name" },
                values: new object[,]
                {
                    { 11, "ManagePoi", "Haritada yeni POI (ilgi noktası) ekleyebilme. Var olan POI'leri görüntüleme bu izinden bağımsız, herkese açık.", "POI Ekleme" },
                    { 12, "ManagePoiCategories", "POI kategorilerini (hiyerarşik) oluşturma/düzenleme/silme.", "POI Kategori Yönetimi" }
                });

            migrationBuilder.InsertData(
                table: "roles",
                columns: new[] { "id", "color", "created_date", "description", "is_built_in", "name" },
                values: new object[] { 3, "#0ea5e9", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, true, "Operatör" });

            migrationBuilder.InsertData(
                table: "role_permissions",
                columns: new[] { "id", "permission_id", "role_id" },
                values: new object[,]
                {
                    { 15, 11, 3 },
                    { 16, 11, 2 },
                    { 17, 12, 2 }
                });

            migrationBuilder.CreateIndex(
                name: "ix_poi_category_id",
                table: "poi",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "ix_poi_user_id",
                table: "poi",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_poi_category_parent_id",
                table: "poi_category",
                column: "parent_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "poi");

            migrationBuilder.DropTable(
                name: "poi_category");

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumn: "id",
                keyValue: 15);

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumn: "id",
                keyValue: 16);

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumn: "id",
                keyValue: 17);

            migrationBuilder.DeleteData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 11);

            migrationBuilder.DeleteData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 12);

            migrationBuilder.DeleteData(
                table: "roles",
                keyColumn: "id",
                keyValue: 3);
        }
    }
}

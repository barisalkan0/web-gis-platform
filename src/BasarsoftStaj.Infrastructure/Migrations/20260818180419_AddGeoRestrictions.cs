using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NetTopologySuite.Geometries;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGeoRestrictions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "geo_restrictions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    role_id = table.Column<int>(type: "integer", nullable: true),
                    user_id = table.Column<int>(type: "integer", nullable: true),
                    area = table.Column<Polygon>(type: "geometry", nullable: false),
                    created_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    modified_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_geo_restrictions", x => x.id);
                    table.CheckConstraint("ck_geo_restrictions_one_target", "(role_id IS NOT NULL AND user_id IS NULL) OR (role_id IS NULL AND user_id IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_geo_restrictions_roles_role_id",
                        column: x => x.role_id,
                        principalTable: "roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_geo_restrictions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "permissions",
                columns: new[] { "id", "code", "description", "name" },
                values: new object[] { 9, "ManageGeoRestrictions", "Bir rol veya kullanıcı için haritada coğrafi sınır (poligon) tanımlayabilme.", "Coğrafi Yetki Tanımlama" });

            migrationBuilder.InsertData(
                table: "role_permissions",
                columns: new[] { "id", "permission_id", "role_id" },
                values: new object[] { 13, 9, 2 });

            migrationBuilder.CreateIndex(
                name: "ix_geo_restrictions_role_id",
                table: "geo_restrictions",
                column: "role_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_geo_restrictions_user_id",
                table: "geo_restrictions",
                column: "user_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "geo_restrictions");

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumn: "id",
                keyValue: 13);

            migrationBuilder.DeleteData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 9);
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMultipleMaps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "map_id",
                table: "tbl_polygon",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "map_id",
                table: "tbl_point",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "map_id",
                table: "tbl_line",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "maps",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    name = table.Column<string>(type: "text", nullable: false),
                    owner_user_id = table.Column<int>(type: "integer", nullable: false),
                    is_default = table.Column<bool>(type: "boolean", nullable: false),
                    created_date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_maps", x => x.id);
                    table.ForeignKey(
                        name: "fk_maps_users_owner_user_id",
                        column: x => x.owner_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "permissions",
                columns: new[] { "id", "code", "description", "name" },
                values: new object[] { 8, "ManageMultipleMaps", "Birden fazla harita oluşturabilme, çoğaltabilme, isimlendirebilme ve paylaşabilme.", "Çoklu Harita Yönetimi" });

            migrationBuilder.InsertData(
                table: "role_permissions",
                columns: new[] { "id", "permission_id", "role_id" },
                values: new object[] { 12, 8, 2 });

            migrationBuilder.CreateIndex(
                name: "ix_tbl_polygon_map_id",
                table: "tbl_polygon",
                column: "map_id");

            migrationBuilder.CreateIndex(
                name: "ix_tbl_point_map_id",
                table: "tbl_point",
                column: "map_id");

            migrationBuilder.CreateIndex(
                name: "ix_tbl_line_map_id",
                table: "tbl_line",
                column: "map_id");

            migrationBuilder.CreateIndex(
                name: "ix_maps_owner_user_id",
                table: "maps",
                column: "owner_user_id");

            migrationBuilder.AddForeignKey(
                name: "fk_tbl_line_maps_map_id",
                table: "tbl_line",
                column: "map_id",
                principalTable: "maps",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_tbl_point_maps_map_id",
                table: "tbl_point",
                column: "map_id",
                principalTable: "maps",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_tbl_polygon_maps_map_id",
                table: "tbl_polygon",
                column: "map_id",
                principalTable: "maps",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

                migrationBuilder.Sql(@"
                INSERT INTO maps (name, owner_user_id, created_date, is_default)
                SELECT 'Haritam', id, now(), true FROM users;

                UPDATE tbl_point SET map_id = (SELECT id FROM maps WHERE owner_user_id = tbl_point.inserted_user_id AND is_default = true) WHERE inserted_user_id IS NOT NULL;
                UPDATE tbl_line SET map_id = (SELECT id FROM maps WHERE owner_user_id = tbl_line.inserted_user_id AND is_default = true) WHERE inserted_user_id IS NOT NULL;
                UPDATE tbl_polygon SET map_id = (SELECT id FROM maps WHERE owner_user_id = tbl_polygon.inserted_user_id AND is_default = true) WHERE inserted_user_id IS NOT NULL;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_tbl_line_maps_map_id",
                table: "tbl_line");

            migrationBuilder.DropForeignKey(
                name: "fk_tbl_point_maps_map_id",
                table: "tbl_point");

            migrationBuilder.DropForeignKey(
                name: "fk_tbl_polygon_maps_map_id",
                table: "tbl_polygon");

            migrationBuilder.DropTable(
                name: "maps");

            migrationBuilder.DropIndex(
                name: "ix_tbl_polygon_map_id",
                table: "tbl_polygon");

            migrationBuilder.DropIndex(
                name: "ix_tbl_point_map_id",
                table: "tbl_point");

            migrationBuilder.DropIndex(
                name: "ix_tbl_line_map_id",
                table: "tbl_line");

            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumn: "id",
                keyValue: 12);

            migrationBuilder.DeleteData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 8);

            migrationBuilder.DropColumn(
                name: "map_id",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "map_id",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "map_id",
                table: "tbl_line");
        }
    }
}

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class GeoRestrictionMapScopeAndPause : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_paused",
                table: "geo_restrictions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "map_id",
                table: "geo_restrictions",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_geo_restrictions_map_id",
                table: "geo_restrictions",
                column: "map_id");

            migrationBuilder.AddForeignKey(
                name: "fk_geo_restrictions_maps_map_id",
                table: "geo_restrictions",
                column: "map_id",
                principalTable: "maps",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_geo_restrictions_maps_map_id",
                table: "geo_restrictions");

            migrationBuilder.DropIndex(
                name: "ix_geo_restrictions_map_id",
                table: "geo_restrictions");

            migrationBuilder.DropColumn(
                name: "is_paused",
                table: "geo_restrictions");

            migrationBuilder.DropColumn(
                name: "map_id",
                table: "geo_restrictions");
        }
    }
}

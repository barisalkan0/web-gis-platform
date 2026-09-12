using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPoiNotesLocationAndCategoryOrdering : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "poi_category",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "sort_order",
                table: "poi_category",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "district",
                table: "poi",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "note",
                table: "poi",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "province",
                table: "poi",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.Sql("""
                WITH ranked AS (
                    SELECT id,
                           ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY name, id) - 1 AS position
                    FROM poi_category
                )
                UPDATE poi_category AS category
                SET sort_order = ranked.position
                FROM ranked
                WHERE category.id = ranked.id;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "description",
                table: "poi_category");

            migrationBuilder.DropColumn(
                name: "sort_order",
                table: "poi_category");

            migrationBuilder.DropColumn(
                name: "district",
                table: "poi");

            migrationBuilder.DropColumn(
                name: "note",
                table: "poi");

            migrationBuilder.DropColumn(
                name: "province",
                table: "poi");
        }
    }
}

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlaceColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Place",
                table: "tbl_polygon",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Province",
                table: "tbl_polygon",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Place",
                table: "tbl_point",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Province",
                table: "tbl_point",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Place",
                table: "tbl_line",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Province",
                table: "tbl_line",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Place",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "Province",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "Place",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "Province",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "Place",
                table: "tbl_line");

            migrationBuilder.DropColumn(
                name: "Province",
                table: "tbl_line");
        }
    }
}

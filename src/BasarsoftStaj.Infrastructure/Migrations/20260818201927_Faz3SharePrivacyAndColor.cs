using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Faz3SharePrivacyAndColor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_private",
                table: "tbl_polygon",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_private",
                table: "tbl_point",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_private",
                table: "tbl_line",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "allowed_colors",
                table: "map_shares",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "can_edit_others",
                table: "map_shares",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "map_id",
                table: "audit_logs",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_private",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "is_private",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "is_private",
                table: "tbl_line");

            migrationBuilder.DropColumn(
                name: "allowed_colors",
                table: "map_shares");

            migrationBuilder.DropColumn(
                name: "can_edit_others",
                table: "map_shares");

            migrationBuilder.DropColumn(
                name: "map_id",
                table: "audit_logs");
        }
    }
}

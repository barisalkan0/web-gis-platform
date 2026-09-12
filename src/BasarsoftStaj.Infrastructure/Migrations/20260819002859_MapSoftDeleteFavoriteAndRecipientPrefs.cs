using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class MapSoftDeleteFavoriteAndRecipientPrefs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "deleted_date",
                table: "maps",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_deleted",
                table: "maps",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "is_favorite",
                table: "maps",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "sort_order",
                table: "maps",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "recipient_is_archived",
                table: "map_shares",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "recipient_is_favorite",
                table: "map_shares",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "recipient_note",
                table: "map_shares",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "deleted_date",
                table: "maps");

            migrationBuilder.DropColumn(
                name: "is_deleted",
                table: "maps");

            migrationBuilder.DropColumn(
                name: "is_favorite",
                table: "maps");

            migrationBuilder.DropColumn(
                name: "sort_order",
                table: "maps");

            migrationBuilder.DropColumn(
                name: "recipient_is_archived",
                table: "map_shares");

            migrationBuilder.DropColumn(
                name: "recipient_is_favorite",
                table: "map_shares");

            migrationBuilder.DropColumn(
                name: "recipient_note",
                table: "map_shares");
        }
    }
}

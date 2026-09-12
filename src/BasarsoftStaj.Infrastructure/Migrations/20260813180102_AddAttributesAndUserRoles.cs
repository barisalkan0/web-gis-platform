using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAttributesAndUserRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "can_draw_line",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "can_draw_point",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "can_draw_polygon",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "created_date",
                table: "Users",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<int>(
                name: "role",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Color",
                table: "tbl_polygon",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedDate",
                table: "tbl_polygon",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "tbl_polygon",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "tbl_polygon",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Color",
                table: "tbl_point",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedDate",
                table: "tbl_point",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "tbl_point",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "tbl_point",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Color",
                table: "tbl_line",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedDate",
                table: "tbl_line",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "tbl_line",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "tbl_line",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "can_draw_line",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "can_draw_point",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "can_draw_polygon",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "created_date",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "role",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Color",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "CreatedDate",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "Name",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "Color",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "CreatedDate",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "Name",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "Color",
                table: "tbl_line");

            migrationBuilder.DropColumn(
                name: "CreatedDate",
                table: "tbl_line");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "tbl_line");

            migrationBuilder.DropColumn(
                name: "Name",
                table: "tbl_line");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTrackingColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "IsDeleted",
                table: "tbl_polygon",
                newName: "is_deleted");

            migrationBuilder.RenameColumn(
                name: "CreatedDate",
                table: "tbl_polygon",
                newName: "inserted_date");

            migrationBuilder.RenameColumn(
                name: "IsDeleted",
                table: "tbl_point",
                newName: "is_deleted");

            migrationBuilder.RenameColumn(
                name: "CreatedDate",
                table: "tbl_point",
                newName: "inserted_date");

            migrationBuilder.RenameColumn(
                name: "IsDeleted",
                table: "tbl_line",
                newName: "is_deleted");

            migrationBuilder.RenameColumn(
                name: "CreatedDate",
                table: "tbl_line",
                newName: "inserted_date");

            migrationBuilder.AddColumn<int>(
                name: "inserted_user_id",
                table: "tbl_polygon",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_active",
                table: "tbl_polygon",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "modified_date",
                table: "tbl_polygon",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "inserted_user_id",
                table: "tbl_point",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_active",
                table: "tbl_point",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "modified_date",
                table: "tbl_point",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "inserted_user_id",
                table: "tbl_line",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_active",
                table: "tbl_line",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "modified_date",
                table: "tbl_line",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_tbl_polygon_inserted_user_id",
                table: "tbl_polygon",
                column: "inserted_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_tbl_point_inserted_user_id",
                table: "tbl_point",
                column: "inserted_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_tbl_line_inserted_user_id",
                table: "tbl_line",
                column: "inserted_user_id");

            migrationBuilder.AddForeignKey(
                name: "FK_tbl_line_Users_inserted_user_id",
                table: "tbl_line",
                column: "inserted_user_id",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_tbl_point_Users_inserted_user_id",
                table: "tbl_point",
                column: "inserted_user_id",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_tbl_polygon_Users_inserted_user_id",
                table: "tbl_polygon",
                column: "inserted_user_id",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_tbl_line_Users_inserted_user_id",
                table: "tbl_line");

            migrationBuilder.DropForeignKey(
                name: "FK_tbl_point_Users_inserted_user_id",
                table: "tbl_point");

            migrationBuilder.DropForeignKey(
                name: "FK_tbl_polygon_Users_inserted_user_id",
                table: "tbl_polygon");

            migrationBuilder.DropIndex(
                name: "IX_tbl_polygon_inserted_user_id",
                table: "tbl_polygon");

            migrationBuilder.DropIndex(
                name: "IX_tbl_point_inserted_user_id",
                table: "tbl_point");

            migrationBuilder.DropIndex(
                name: "IX_tbl_line_inserted_user_id",
                table: "tbl_line");

            migrationBuilder.DropColumn(
                name: "inserted_user_id",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "is_active",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "modified_date",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "inserted_user_id",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "is_active",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "modified_date",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "inserted_user_id",
                table: "tbl_line");

            migrationBuilder.DropColumn(
                name: "is_active",
                table: "tbl_line");

            migrationBuilder.DropColumn(
                name: "modified_date",
                table: "tbl_line");

            migrationBuilder.RenameColumn(
                name: "is_deleted",
                table: "tbl_polygon",
                newName: "IsDeleted");

            migrationBuilder.RenameColumn(
                name: "inserted_date",
                table: "tbl_polygon",
                newName: "CreatedDate");

            migrationBuilder.RenameColumn(
                name: "is_deleted",
                table: "tbl_point",
                newName: "IsDeleted");

            migrationBuilder.RenameColumn(
                name: "inserted_date",
                table: "tbl_point",
                newName: "CreatedDate");

            migrationBuilder.RenameColumn(
                name: "is_deleted",
                table: "tbl_line",
                newName: "IsDeleted");

            migrationBuilder.RenameColumn(
                name: "inserted_date",
                table: "tbl_line",
                newName: "CreatedDate");
        }
    }
}

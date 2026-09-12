using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRolesCategoriesAuditLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "can_draw_line",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "can_draw_point",
                table: "Users");

            migrationBuilder.AddColumn<int>(
                name: "role_id",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.Sql(@"UPDATE ""Users"" SET ""role_id"" = 2 WHERE ""role"" = 1;");

            migrationBuilder.DropColumn(
                name: "role",
                table: "Users");

            migrationBuilder.RenameColumn(
                name: "can_draw_polygon",
                table: "Users",
                newName: "two_factor_enabled");

            migrationBuilder.AddColumn<DateTime>(
                name: "deleted_at",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CategoryId",
                table: "tbl_polygon",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CategoryId",
                table: "tbl_point",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CategoryId",
                table: "tbl_line",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AuditLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ActorUsername = table.Column<string>(type: "text", nullable: false),
                    Action = table.Column<string>(type: "text", nullable: false),
                    Details = table.Column<string>(type: "text", nullable: false),
                    CreatedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Categories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Color = table.Column<string>(type: "text", nullable: false),
                    CreatedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedByUsername = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Categories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Roles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Color = table.Column<string>(type: "text", nullable: false),
                    IsBuiltIn = table.Column<bool>(type: "boolean", nullable: false),
                    CanManageAdmin = table.Column<bool>(type: "boolean", nullable: false),
                    CanDrawPoint = table.Column<bool>(type: "boolean", nullable: false),
                    CanDrawLine = table.Column<bool>(type: "boolean", nullable: false),
                    CanDrawPolygon = table.Column<bool>(type: "boolean", nullable: false),
                    CanUseAnalysisTool = table.Column<bool>(type: "boolean", nullable: false),
                    CanManageCategories = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Roles", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "Roles",
                columns: new[] { "Id", "CanDrawLine", "CanDrawPoint", "CanDrawPolygon", "CanManageAdmin", "CanManageCategories", "CanUseAnalysisTool", "Color", "CreatedDate", "IsBuiltIn", "Name" },
                values: new object[,]
                {
                    { 1, true, true, true, false, true, true, "#6b7280", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, "Kullanıcı" },
                    { 2, true, true, true, true, true, true, "#9333ea", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), true, "Admin" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_role_id",
                table: "Users",
                column: "role_id");

            migrationBuilder.CreateIndex(
                name: "IX_tbl_polygon_CategoryId",
                table: "tbl_polygon",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_tbl_point_CategoryId",
                table: "tbl_point",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_tbl_line_CategoryId",
                table: "tbl_line",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Roles_Name",
                table: "Roles",
                column: "Name",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_tbl_line_Categories_CategoryId",
                table: "tbl_line",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_tbl_point_Categories_CategoryId",
                table: "tbl_point",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_tbl_polygon_Categories_CategoryId",
                table: "tbl_polygon",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Roles_role_id",
                table: "Users",
                column: "role_id",
                principalTable: "Roles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_tbl_line_Categories_CategoryId",
                table: "tbl_line");

            migrationBuilder.DropForeignKey(
                name: "FK_tbl_point_Categories_CategoryId",
                table: "tbl_point");

            migrationBuilder.DropForeignKey(
                name: "FK_tbl_polygon_Categories_CategoryId",
                table: "tbl_polygon");

            migrationBuilder.DropForeignKey(
                name: "FK_Users_Roles_role_id",
                table: "Users");

            migrationBuilder.DropTable(
                name: "AuditLogs");

            migrationBuilder.DropTable(
                name: "Categories");

            migrationBuilder.DropTable(
                name: "Roles");

            migrationBuilder.DropIndex(
                name: "IX_Users_role_id",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_tbl_polygon_CategoryId",
                table: "tbl_polygon");

            migrationBuilder.DropIndex(
                name: "IX_tbl_point_CategoryId",
                table: "tbl_point");

            migrationBuilder.DropIndex(
                name: "IX_tbl_line_CategoryId",
                table: "tbl_line");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "role_id",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "tbl_polygon");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "tbl_point");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "tbl_line");

            migrationBuilder.RenameColumn(
                name: "two_factor_enabled",
                table: "Users",
                newName: "can_draw_polygon");

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

            migrationBuilder.AddColumn<int>(
                name: "role",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }
    }
}

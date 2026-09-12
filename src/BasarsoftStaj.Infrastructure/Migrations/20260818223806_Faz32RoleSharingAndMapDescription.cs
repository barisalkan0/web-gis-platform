using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Faz32RoleSharingAndMapDescription : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_map_shares_map_id_invited_user_id",
                table: "map_shares");

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "maps",
                type: "text",
                nullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "invited_user_id",
                table: "map_shares",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<int>(
                name: "role_id",
                table: "map_shares",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_map_shares_map_id_invited_user_id",
                table: "map_shares",
                columns: new[] { "map_id", "invited_user_id" },
                unique: true,
                filter: "invited_user_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_map_shares_map_id_role_id",
                table: "map_shares",
                columns: new[] { "map_id", "role_id" },
                unique: true,
                filter: "role_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_map_shares_role_id",
                table: "map_shares",
                column: "role_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_map_shares_one_target",
                table: "map_shares",
                sql: "(invited_user_id IS NOT NULL AND role_id IS NULL) OR (invited_user_id IS NULL AND role_id IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "fk_map_shares_roles_role_id",
                table: "map_shares",
                column: "role_id",
                principalTable: "roles",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_map_shares_roles_role_id",
                table: "map_shares");

            migrationBuilder.DropIndex(
                name: "ix_map_shares_map_id_invited_user_id",
                table: "map_shares");

            migrationBuilder.DropIndex(
                name: "ix_map_shares_map_id_role_id",
                table: "map_shares");

            migrationBuilder.DropIndex(
                name: "ix_map_shares_role_id",
                table: "map_shares");

            migrationBuilder.DropCheckConstraint(
                name: "ck_map_shares_one_target",
                table: "map_shares");

            migrationBuilder.DropColumn(
                name: "description",
                table: "maps");

            migrationBuilder.DropColumn(
                name: "role_id",
                table: "map_shares");

            migrationBuilder.AlterColumn<int>(
                name: "invited_user_id",
                table: "map_shares",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_map_shares_map_id_invited_user_id",
                table: "map_shares",
                columns: new[] { "map_id", "invited_user_id" },
                unique: true);
        }
    }
}

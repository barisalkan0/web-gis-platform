using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class GeoRestrictionMultiArea : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_geo_restrictions_role_id",
                table: "geo_restrictions");

            migrationBuilder.DropIndex(
                name: "ix_geo_restrictions_user_id",
                table: "geo_restrictions");

            migrationBuilder.AddColumn<string>(
                name: "kind",
                table: "geo_restrictions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "name",
                table: "geo_restrictions",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_geo_restrictions_role_id",
                table: "geo_restrictions",
                column: "role_id");

            migrationBuilder.CreateIndex(
                name: "ix_geo_restrictions_user_id",
                table: "geo_restrictions",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_geo_restrictions_role_id",
                table: "geo_restrictions");

            migrationBuilder.DropIndex(
                name: "ix_geo_restrictions_user_id",
                table: "geo_restrictions");

            migrationBuilder.DropColumn(
                name: "kind",
                table: "geo_restrictions");

            migrationBuilder.DropColumn(
                name: "name",
                table: "geo_restrictions");

            migrationBuilder.CreateIndex(
                name: "ix_geo_restrictions_role_id",
                table: "geo_restrictions",
                column: "role_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_geo_restrictions_user_id",
                table: "geo_restrictions",
                column: "user_id",
                unique: true);
        }
    }
}

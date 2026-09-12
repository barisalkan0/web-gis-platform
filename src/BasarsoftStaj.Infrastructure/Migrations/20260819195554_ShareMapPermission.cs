using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ShareMapPermission : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 8,
                column: "description",
                value: "Birden fazla harita oluşturabilme, çoğaltabilme ve isimlendirebilme.");

            migrationBuilder.InsertData(
                table: "permissions",
                columns: new[] { "id", "code", "description", "name" },
                values: new object[] { 10, "ShareMap", "Kendi haritalarını başka kullanıcılarla veya rollerle paylaşabilme (davet gönderme/role paylaşma). Var olan bir paylaşımı yönetme (duraklatma/kaldırma/ayar) bu izne bağlı DEĞİL, ManageMultipleMaps'e bağlı kalıyor.", "Harita Paylaşma" });

            migrationBuilder.InsertData(
                table: "role_permissions",
                columns: new[] { "id", "permission_id", "role_id" },
                values: new object[] { 14, 10, 2 });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "role_permissions",
                keyColumn: "id",
                keyValue: 14);

            migrationBuilder.DeleteData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 10);

            migrationBuilder.UpdateData(
                table: "permissions",
                keyColumn: "id",
                keyValue: 8,
                column: "description",
                value: "Birden fazla harita oluşturabilme, çoğaltabilme, isimlendirebilme ve paylaşabilme.");
        }
    }
}

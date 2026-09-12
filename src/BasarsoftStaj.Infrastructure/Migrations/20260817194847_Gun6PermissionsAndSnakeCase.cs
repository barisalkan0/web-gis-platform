using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Gun6PermissionsAndSnakeCase : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_tbl_line_Categories_CategoryId",
                table: "tbl_line");

            migrationBuilder.DropForeignKey(
                name: "FK_tbl_line_Users_inserted_user_id",
                table: "tbl_line");

            migrationBuilder.DropForeignKey(
                name: "FK_tbl_point_Categories_CategoryId",
                table: "tbl_point");

            migrationBuilder.DropForeignKey(
                name: "FK_tbl_point_Users_inserted_user_id",
                table: "tbl_point");

            migrationBuilder.DropForeignKey(
                name: "FK_tbl_polygon_Categories_CategoryId",
                table: "tbl_polygon");

            migrationBuilder.DropForeignKey(
                name: "FK_tbl_polygon_Users_inserted_user_id",
                table: "tbl_polygon");

            migrationBuilder.DropForeignKey(
                name: "FK_Users_Roles_role_id",
                table: "Users");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Users",
                table: "Users");

            migrationBuilder.DropPrimaryKey(
                name: "PK_tbl_polygon",
                table: "tbl_polygon");

            migrationBuilder.DropPrimaryKey(
                name: "PK_tbl_point",
                table: "tbl_point");

            migrationBuilder.DropPrimaryKey(
                name: "PK_tbl_line",
                table: "tbl_line");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Roles",
                table: "Roles");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Locations",
                table: "Locations");

            migrationBuilder.DropPrimaryKey(
                name: "PK_Categories",
                table: "Categories");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AuditLogs",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "CanDeleteCategories",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanDrawLine",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanDrawPoint",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanDrawPolygon",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanManageAdmin",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanManageCategories",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "CanUseAnalysisTool",
                table: "Roles");

            migrationBuilder.RenameTable(
                name: "Users",
                newName: "users");

            migrationBuilder.RenameTable(
                name: "Roles",
                newName: "roles");

            migrationBuilder.RenameTable(
                name: "Locations",
                newName: "locations");

            migrationBuilder.RenameTable(
                name: "Categories",
                newName: "categories");

            migrationBuilder.RenameTable(
                name: "AuditLogs",
                newName: "audit_logs");

            migrationBuilder.RenameColumn(
                name: "Username",
                table: "users",
                newName: "username");

            migrationBuilder.RenameColumn(
                name: "Id",
                table: "users",
                newName: "id");

            migrationBuilder.RenameColumn(
                name: "PasswordHash",
                table: "users",
                newName: "password_hash");

            migrationBuilder.RenameIndex(
                name: "IX_Users_Username",
                table: "users",
                newName: "ix_users_username");

            migrationBuilder.RenameIndex(
                name: "IX_Users_role_id",
                table: "users",
                newName: "ix_users_role_id");

            migrationBuilder.RenameColumn(
                name: "Province",
                table: "tbl_polygon",
                newName: "province");

            migrationBuilder.RenameColumn(
                name: "Place",
                table: "tbl_polygon",
                newName: "place");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "tbl_polygon",
                newName: "name");

            migrationBuilder.RenameColumn(
                name: "Geometry",
                table: "tbl_polygon",
                newName: "geometry");

            migrationBuilder.RenameColumn(
                name: "Color",
                table: "tbl_polygon",
                newName: "color");

            migrationBuilder.RenameColumn(
                name: "Id",
                table: "tbl_polygon",
                newName: "id");

            migrationBuilder.RenameColumn(
                name: "CategoryId",
                table: "tbl_polygon",
                newName: "category_id");

            migrationBuilder.RenameIndex(
                name: "IX_tbl_polygon_inserted_user_id",
                table: "tbl_polygon",
                newName: "ix_tbl_polygon_inserted_user_id");

            migrationBuilder.RenameIndex(
                name: "IX_tbl_polygon_CategoryId",
                table: "tbl_polygon",
                newName: "ix_tbl_polygon_category_id");

            migrationBuilder.RenameColumn(
                name: "Province",
                table: "tbl_point",
                newName: "province");

            migrationBuilder.RenameColumn(
                name: "Place",
                table: "tbl_point",
                newName: "place");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "tbl_point",
                newName: "name");

            migrationBuilder.RenameColumn(
                name: "Geometry",
                table: "tbl_point",
                newName: "geometry");

            migrationBuilder.RenameColumn(
                name: "Color",
                table: "tbl_point",
                newName: "color");

            migrationBuilder.RenameColumn(
                name: "Id",
                table: "tbl_point",
                newName: "id");

            migrationBuilder.RenameColumn(
                name: "CategoryId",
                table: "tbl_point",
                newName: "category_id");

            migrationBuilder.RenameIndex(
                name: "IX_tbl_point_inserted_user_id",
                table: "tbl_point",
                newName: "ix_tbl_point_inserted_user_id");

            migrationBuilder.RenameIndex(
                name: "IX_tbl_point_CategoryId",
                table: "tbl_point",
                newName: "ix_tbl_point_category_id");

            migrationBuilder.RenameColumn(
                name: "Province",
                table: "tbl_line",
                newName: "province");

            migrationBuilder.RenameColumn(
                name: "Place",
                table: "tbl_line",
                newName: "place");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "tbl_line",
                newName: "name");

            migrationBuilder.RenameColumn(
                name: "Geometry",
                table: "tbl_line",
                newName: "geometry");

            migrationBuilder.RenameColumn(
                name: "Color",
                table: "tbl_line",
                newName: "color");

            migrationBuilder.RenameColumn(
                name: "Id",
                table: "tbl_line",
                newName: "id");

            migrationBuilder.RenameColumn(
                name: "CategoryId",
                table: "tbl_line",
                newName: "category_id");

            migrationBuilder.RenameIndex(
                name: "IX_tbl_line_inserted_user_id",
                table: "tbl_line",
                newName: "ix_tbl_line_inserted_user_id");

            migrationBuilder.RenameIndex(
                name: "IX_tbl_line_CategoryId",
                table: "tbl_line",
                newName: "ix_tbl_line_category_id");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "roles",
                newName: "name");

            migrationBuilder.RenameColumn(
                name: "Description",
                table: "roles",
                newName: "description");

            migrationBuilder.RenameColumn(
                name: "Color",
                table: "roles",
                newName: "color");

            migrationBuilder.RenameColumn(
                name: "Id",
                table: "roles",
                newName: "id");

            migrationBuilder.RenameColumn(
                name: "IsBuiltIn",
                table: "roles",
                newName: "is_built_in");

            migrationBuilder.RenameColumn(
                name: "CreatedDate",
                table: "roles",
                newName: "created_date");

            migrationBuilder.RenameIndex(
                name: "IX_Roles_Name",
                table: "roles",
                newName: "ix_roles_name");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "locations",
                newName: "name");

            migrationBuilder.RenameColumn(
                name: "Longitude",
                table: "locations",
                newName: "longitude");

            migrationBuilder.RenameColumn(
                name: "Latitude",
                table: "locations",
                newName: "latitude");

            migrationBuilder.RenameColumn(
                name: "Id",
                table: "locations",
                newName: "id");

            migrationBuilder.RenameColumn(
                name: "CreatedAt",
                table: "locations",
                newName: "created_at");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "categories",
                newName: "name");

            migrationBuilder.RenameColumn(
                name: "Color",
                table: "categories",
                newName: "color");

            migrationBuilder.RenameColumn(
                name: "Id",
                table: "categories",
                newName: "id");

            migrationBuilder.RenameColumn(
                name: "CreatedDate",
                table: "categories",
                newName: "created_date");

            migrationBuilder.RenameColumn(
                name: "CreatedByUsername",
                table: "categories",
                newName: "created_by_username");

            migrationBuilder.RenameColumn(
                name: "Details",
                table: "audit_logs",
                newName: "details");

            migrationBuilder.RenameColumn(
                name: "Action",
                table: "audit_logs",
                newName: "action");

            migrationBuilder.RenameColumn(
                name: "Id",
                table: "audit_logs",
                newName: "id");

            migrationBuilder.RenameColumn(
                name: "CreatedDate",
                table: "audit_logs",
                newName: "created_date");

            migrationBuilder.RenameColumn(
                name: "ActorUsername",
                table: "audit_logs",
                newName: "actor_username");

            migrationBuilder.AddPrimaryKey(
                name: "pk_users",
                table: "users",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "pk_tbl_polygon",
                table: "tbl_polygon",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "pk_tbl_point",
                table: "tbl_point",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "pk_tbl_line",
                table: "tbl_line",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "pk_roles",
                table: "roles",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "pk_locations",
                table: "locations",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "pk_categories",
                table: "categories",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "pk_audit_logs",
                table: "audit_logs",
                column: "id");

            migrationBuilder.CreateTable(
                name: "permissions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    code = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_permissions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "role_permissions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    role_id = table.Column<int>(type: "integer", nullable: false),
                    permission_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_role_permissions", x => x.id);
                    table.ForeignKey(
                        name: "fk_role_permissions_permissions_permission_id",
                        column: x => x.permission_id,
                        principalTable: "permissions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_role_permissions_roles_role_id",
                        column: x => x.role_id,
                        principalTable: "roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_permissions",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    permission_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_user_permissions", x => x.id);
                    table.ForeignKey(
                        name: "fk_user_permissions_permissions_permission_id",
                        column: x => x.permission_id,
                        principalTable: "permissions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_user_permissions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "permissions",
                columns: new[] { "id", "code", "description", "name" },
                values: new object[,]
                {
                    { 1, "ManageAdmin", "Admin panelini görüntüleme ve yönetme. Bu izne sahip roller/kullanıcılar diğer tüm izin kontrollerini otomatik geçer.", "Yönetim Paneli" },
                    { 2, "DrawPoint", "Haritada nokta çizip kaydedebilme.", "Nokta Ekleme" },
                    { 3, "DrawLine", "Haritada çizgi çizip kaydedebilme.", "Çizgi Ekleme" },
                    { 4, "DrawPolygon", "Haritada poligon (alan) çizip kaydedebilme.", "Alan Ekleme" },
                    { 5, "UseAnalysisTool", "Envanter kesişim analiz aracını kullanabilme.", "Envanter Analizi" },
                    { 6, "ManageCategories", "Kategori oluşturma ve düzenleme (isim/renk).", "Kategori Yönetimi" },
                    { 7, "DeleteCategories", "Var olan bir kategoriyi silebilme.", "Kategori Silme" }
                });

            migrationBuilder.InsertData(
                table: "role_permissions",
                columns: new[] { "id", "permission_id", "role_id" },
                values: new object[,]
                {
                    { 1, 2, 1 },
                    { 2, 3, 1 },
                    { 3, 4, 1 },
                    { 4, 5, 1 },
                    { 5, 1, 2 },
                    { 6, 2, 2 },
                    { 7, 3, 2 },
                    { 8, 4, 2 },
                    { 9, 5, 2 },
                    { 10, 6, 2 },
                    { 11, 7, 2 }
                });

            migrationBuilder.CreateIndex(
                name: "ix_role_permissions_permission_id",
                table: "role_permissions",
                column: "permission_id");

            migrationBuilder.CreateIndex(
                name: "ix_role_permissions_role_id_permission_id",
                table: "role_permissions",
                columns: new[] { "role_id", "permission_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_user_permissions_permission_id",
                table: "user_permissions",
                column: "permission_id");

            migrationBuilder.CreateIndex(
                name: "ix_user_permissions_user_id_permission_id",
                table: "user_permissions",
                columns: new[] { "user_id", "permission_id" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "fk_tbl_line_categories_category_id",
                table: "tbl_line",
                column: "category_id",
                principalTable: "categories",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_tbl_line_users_inserted_user_id",
                table: "tbl_line",
                column: "inserted_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_tbl_point_categories_category_id",
                table: "tbl_point",
                column: "category_id",
                principalTable: "categories",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_tbl_point_users_inserted_user_id",
                table: "tbl_point",
                column: "inserted_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_tbl_polygon_categories_category_id",
                table: "tbl_polygon",
                column: "category_id",
                principalTable: "categories",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_tbl_polygon_users_inserted_user_id",
                table: "tbl_polygon",
                column: "inserted_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "fk_users_roles_role_id",
                table: "users",
                column: "role_id",
                principalTable: "roles",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_tbl_line_categories_category_id",
                table: "tbl_line");

            migrationBuilder.DropForeignKey(
                name: "fk_tbl_line_users_inserted_user_id",
                table: "tbl_line");

            migrationBuilder.DropForeignKey(
                name: "fk_tbl_point_categories_category_id",
                table: "tbl_point");

            migrationBuilder.DropForeignKey(
                name: "fk_tbl_point_users_inserted_user_id",
                table: "tbl_point");

            migrationBuilder.DropForeignKey(
                name: "fk_tbl_polygon_categories_category_id",
                table: "tbl_polygon");

            migrationBuilder.DropForeignKey(
                name: "fk_tbl_polygon_users_inserted_user_id",
                table: "tbl_polygon");

            migrationBuilder.DropForeignKey(
                name: "fk_users_roles_role_id",
                table: "users");

            migrationBuilder.DropTable(
                name: "role_permissions");

            migrationBuilder.DropTable(
                name: "user_permissions");

            migrationBuilder.DropTable(
                name: "permissions");

            migrationBuilder.DropPrimaryKey(
                name: "pk_users",
                table: "users");

            migrationBuilder.DropPrimaryKey(
                name: "pk_tbl_polygon",
                table: "tbl_polygon");

            migrationBuilder.DropPrimaryKey(
                name: "pk_tbl_point",
                table: "tbl_point");

            migrationBuilder.DropPrimaryKey(
                name: "pk_tbl_line",
                table: "tbl_line");

            migrationBuilder.DropPrimaryKey(
                name: "pk_roles",
                table: "roles");

            migrationBuilder.DropPrimaryKey(
                name: "pk_locations",
                table: "locations");

            migrationBuilder.DropPrimaryKey(
                name: "pk_categories",
                table: "categories");

            migrationBuilder.DropPrimaryKey(
                name: "pk_audit_logs",
                table: "audit_logs");

            migrationBuilder.RenameTable(
                name: "users",
                newName: "Users");

            migrationBuilder.RenameTable(
                name: "roles",
                newName: "Roles");

            migrationBuilder.RenameTable(
                name: "locations",
                newName: "Locations");

            migrationBuilder.RenameTable(
                name: "categories",
                newName: "Categories");

            migrationBuilder.RenameTable(
                name: "audit_logs",
                newName: "AuditLogs");

            migrationBuilder.RenameColumn(
                name: "username",
                table: "Users",
                newName: "Username");

            migrationBuilder.RenameColumn(
                name: "id",
                table: "Users",
                newName: "Id");

            migrationBuilder.RenameColumn(
                name: "password_hash",
                table: "Users",
                newName: "PasswordHash");

            migrationBuilder.RenameIndex(
                name: "ix_users_username",
                table: "Users",
                newName: "IX_Users_Username");

            migrationBuilder.RenameIndex(
                name: "ix_users_role_id",
                table: "Users",
                newName: "IX_Users_role_id");

            migrationBuilder.RenameColumn(
                name: "province",
                table: "tbl_polygon",
                newName: "Province");

            migrationBuilder.RenameColumn(
                name: "place",
                table: "tbl_polygon",
                newName: "Place");

            migrationBuilder.RenameColumn(
                name: "name",
                table: "tbl_polygon",
                newName: "Name");

            migrationBuilder.RenameColumn(
                name: "geometry",
                table: "tbl_polygon",
                newName: "Geometry");

            migrationBuilder.RenameColumn(
                name: "color",
                table: "tbl_polygon",
                newName: "Color");

            migrationBuilder.RenameColumn(
                name: "id",
                table: "tbl_polygon",
                newName: "Id");

            migrationBuilder.RenameColumn(
                name: "category_id",
                table: "tbl_polygon",
                newName: "CategoryId");

            migrationBuilder.RenameIndex(
                name: "ix_tbl_polygon_inserted_user_id",
                table: "tbl_polygon",
                newName: "IX_tbl_polygon_inserted_user_id");

            migrationBuilder.RenameIndex(
                name: "ix_tbl_polygon_category_id",
                table: "tbl_polygon",
                newName: "IX_tbl_polygon_CategoryId");

            migrationBuilder.RenameColumn(
                name: "province",
                table: "tbl_point",
                newName: "Province");

            migrationBuilder.RenameColumn(
                name: "place",
                table: "tbl_point",
                newName: "Place");

            migrationBuilder.RenameColumn(
                name: "name",
                table: "tbl_point",
                newName: "Name");

            migrationBuilder.RenameColumn(
                name: "geometry",
                table: "tbl_point",
                newName: "Geometry");

            migrationBuilder.RenameColumn(
                name: "color",
                table: "tbl_point",
                newName: "Color");

            migrationBuilder.RenameColumn(
                name: "id",
                table: "tbl_point",
                newName: "Id");

            migrationBuilder.RenameColumn(
                name: "category_id",
                table: "tbl_point",
                newName: "CategoryId");

            migrationBuilder.RenameIndex(
                name: "ix_tbl_point_inserted_user_id",
                table: "tbl_point",
                newName: "IX_tbl_point_inserted_user_id");

            migrationBuilder.RenameIndex(
                name: "ix_tbl_point_category_id",
                table: "tbl_point",
                newName: "IX_tbl_point_CategoryId");

            migrationBuilder.RenameColumn(
                name: "province",
                table: "tbl_line",
                newName: "Province");

            migrationBuilder.RenameColumn(
                name: "place",
                table: "tbl_line",
                newName: "Place");

            migrationBuilder.RenameColumn(
                name: "name",
                table: "tbl_line",
                newName: "Name");

            migrationBuilder.RenameColumn(
                name: "geometry",
                table: "tbl_line",
                newName: "Geometry");

            migrationBuilder.RenameColumn(
                name: "color",
                table: "tbl_line",
                newName: "Color");

            migrationBuilder.RenameColumn(
                name: "id",
                table: "tbl_line",
                newName: "Id");

            migrationBuilder.RenameColumn(
                name: "category_id",
                table: "tbl_line",
                newName: "CategoryId");

            migrationBuilder.RenameIndex(
                name: "ix_tbl_line_inserted_user_id",
                table: "tbl_line",
                newName: "IX_tbl_line_inserted_user_id");

            migrationBuilder.RenameIndex(
                name: "ix_tbl_line_category_id",
                table: "tbl_line",
                newName: "IX_tbl_line_CategoryId");

            migrationBuilder.RenameColumn(
                name: "name",
                table: "Roles",
                newName: "Name");

            migrationBuilder.RenameColumn(
                name: "description",
                table: "Roles",
                newName: "Description");

            migrationBuilder.RenameColumn(
                name: "color",
                table: "Roles",
                newName: "Color");

            migrationBuilder.RenameColumn(
                name: "id",
                table: "Roles",
                newName: "Id");

            migrationBuilder.RenameColumn(
                name: "is_built_in",
                table: "Roles",
                newName: "IsBuiltIn");

            migrationBuilder.RenameColumn(
                name: "created_date",
                table: "Roles",
                newName: "CreatedDate");

            migrationBuilder.RenameIndex(
                name: "ix_roles_name",
                table: "Roles",
                newName: "IX_Roles_Name");

            migrationBuilder.RenameColumn(
                name: "name",
                table: "Locations",
                newName: "Name");

            migrationBuilder.RenameColumn(
                name: "longitude",
                table: "Locations",
                newName: "Longitude");

            migrationBuilder.RenameColumn(
                name: "latitude",
                table: "Locations",
                newName: "Latitude");

            migrationBuilder.RenameColumn(
                name: "id",
                table: "Locations",
                newName: "Id");

            migrationBuilder.RenameColumn(
                name: "created_at",
                table: "Locations",
                newName: "CreatedAt");

            migrationBuilder.RenameColumn(
                name: "name",
                table: "Categories",
                newName: "Name");

            migrationBuilder.RenameColumn(
                name: "color",
                table: "Categories",
                newName: "Color");

            migrationBuilder.RenameColumn(
                name: "id",
                table: "Categories",
                newName: "Id");

            migrationBuilder.RenameColumn(
                name: "created_date",
                table: "Categories",
                newName: "CreatedDate");

            migrationBuilder.RenameColumn(
                name: "created_by_username",
                table: "Categories",
                newName: "CreatedByUsername");

            migrationBuilder.RenameColumn(
                name: "details",
                table: "AuditLogs",
                newName: "Details");

            migrationBuilder.RenameColumn(
                name: "action",
                table: "AuditLogs",
                newName: "Action");

            migrationBuilder.RenameColumn(
                name: "id",
                table: "AuditLogs",
                newName: "Id");

            migrationBuilder.RenameColumn(
                name: "created_date",
                table: "AuditLogs",
                newName: "CreatedDate");

            migrationBuilder.RenameColumn(
                name: "actor_username",
                table: "AuditLogs",
                newName: "ActorUsername");

            migrationBuilder.AddColumn<bool>(
                name: "CanDeleteCategories",
                table: "Roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanDrawLine",
                table: "Roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanDrawPoint",
                table: "Roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanDrawPolygon",
                table: "Roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanManageAdmin",
                table: "Roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanManageCategories",
                table: "Roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "CanUseAnalysisTool",
                table: "Roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddPrimaryKey(
                name: "PK_Users",
                table: "Users",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_tbl_polygon",
                table: "tbl_polygon",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_tbl_point",
                table: "tbl_point",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_tbl_line",
                table: "tbl_line",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Roles",
                table: "Roles",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Locations",
                table: "Locations",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_Categories",
                table: "Categories",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_AuditLogs",
                table: "AuditLogs",
                column: "Id");

            migrationBuilder.UpdateData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "CanDeleteCategories", "CanDrawLine", "CanDrawPoint", "CanDrawPolygon", "CanManageAdmin", "CanManageCategories", "CanUseAnalysisTool" },
                values: new object[] { false, true, true, true, false, false, true });

            migrationBuilder.UpdateData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "CanDeleteCategories", "CanDrawLine", "CanDrawPoint", "CanDrawPolygon", "CanManageAdmin", "CanManageCategories", "CanUseAnalysisTool" },
                values: new object[] { true, true, true, true, true, true, true });

            migrationBuilder.AddForeignKey(
                name: "FK_tbl_line_Categories_CategoryId",
                table: "tbl_line",
                column: "CategoryId",
                principalTable: "Categories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_tbl_line_Users_inserted_user_id",
                table: "tbl_line",
                column: "inserted_user_id",
                principalTable: "Users",
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
                name: "FK_tbl_point_Users_inserted_user_id",
                table: "tbl_point",
                column: "inserted_user_id",
                principalTable: "Users",
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
                name: "FK_tbl_polygon_Users_inserted_user_id",
                table: "tbl_polygon",
                column: "inserted_user_id",
                principalTable: "Users",
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
    }
}

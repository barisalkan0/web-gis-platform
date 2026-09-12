using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace BasarsoftStaj.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPoiWorkingHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "poi_working_hour",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    poi_id = table.Column<int>(type: "integer", nullable: false),
                    day_of_week = table.Column<int>(type: "integer", nullable: false),
                    is_open = table.Column<bool>(type: "boolean", nullable: false),
                    is_24_hours = table.Column<bool>(type: "boolean", nullable: false),
                    start_time = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    end_time = table.Column<TimeOnly>(type: "time without time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_poi_working_hour", x => x.id);
                    table.ForeignKey(
                        name: "fk_poi_working_hour_poi_poi_id",
                        column: x => x.poi_id,
                        principalTable: "poi",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_poi_working_hour_poi_id_day_of_week",
                table: "poi_working_hour",
                columns: new[] { "poi_id", "day_of_week" },
                unique: true);

            migrationBuilder.Sql("""
                WITH parsed AS (
                    SELECT
                        id,
                        lower(working_hours) AS raw_hours,
                        regexp_match(
                            replace(working_hours, '.', ':'),
                            '([0-9]{1,2}):([0-9]{2})\s*-\s*([0-9]{1,2}):([0-9]{2})'
                        ) AS parts
                    FROM poi
                    WHERE working_hours IS NOT NULL
                ), valid AS (
                    SELECT
                        id,
                        raw_hours,
                        parts[1]::int AS start_hour,
                        parts[2]::int AS start_minute,
                        parts[3]::int AS end_hour,
                        parts[4]::int AS end_minute
                    FROM parsed
                    WHERE parts IS NOT NULL
                )
                INSERT INTO poi_working_hour
                    (poi_id, day_of_week, is_open, is_24_hours, start_time, end_time)
                SELECT
                    valid.id,
                    day_number,
                    CASE WHEN raw_hours LIKE 'pzt-cuma%' THEN day_number BETWEEN 1 AND 5 ELSE true END,
                    false,
                    CASE WHEN raw_hours LIKE 'pzt-cuma%' AND day_number NOT BETWEEN 1 AND 5
                        THEN NULL ELSE make_time(start_hour, start_minute, 0) END,
                    CASE WHEN raw_hours LIKE 'pzt-cuma%' AND day_number NOT BETWEEN 1 AND 5
                        THEN NULL ELSE make_time(end_hour, end_minute, 0) END
                FROM valid
                CROSS JOIN generate_series(0, 6) AS day_number
                WHERE start_hour BETWEEN 0 AND 23
                  AND end_hour BETWEEN 0 AND 23
                  AND start_minute BETWEEN 0 AND 59
                  AND end_minute BETWEEN 0 AND 59
                ON CONFLICT (poi_id, day_of_week) DO NOTHING;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "poi_working_hour");
        }
    }
}

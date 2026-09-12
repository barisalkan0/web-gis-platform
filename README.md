# Web GIS Platform

A full-stack web GIS application for drawing, sharing and analyzing spatial data on a map.
Built as an internship project at Başarsoft (Ankara, Summer 2026).

**Stack:** .NET 8 · PostgreSQL + PostGIS · GeoServer · React 19 · OpenLayers · SignalR · OSRM

## Features

**Maps and drawing**
- Draw points, lines and polygons; each shape is stored in PostGIS with attributes (name, category, city, color).
- Multiple maps per user, undo/redo, city and category filters, live map preview on hover.
- Share a map with specific users or roles, with per-share permissions.
- Restrict drawing to a defined area: a shared user can only draw inside a polygon the owner sets.

**Places (POI)**
- Nested categories with custom icons, opening hours and schedule exceptions.
- Bulk import from JSON with deduplication (same name within ~150 m is skipped, not duplicated).
- Loaded 8,700+ real places in Ankara from OpenStreetMap across 19 categories.
- Search with results ranked by what is currently visible on screen, plus category shortcuts.

**Location analysis**
- The user picks 2–5 POI categories and assigns weights that must total 100%.
- The app builds a heat map of matching places and scans a grid over the selected area.
- Each candidate point is scored by proximity and by how many options are within walking distance; the top 5 non-clustered points are returned with a per-criterion breakdown.
- Selecting a suggestion draws its walking radius and highlights the places that contributed to its score.

**Transit module**
- Route and stop management with drag-and-drop ordering.
- Automatic road-snapped route generation through OSRM, with manual override for cases like roadworks.
- Bulk import of real transit lines: 6 Ankara metro and commuter rail lines with 83 stops, using their actual OpenStreetMap geometry.
- Live vehicle simulation broadcast over SignalR, with per-stop ETA, current segment and a trip duration calculator.

**Access control**
- JWT authentication, roles (Admin, Operator, User, Transit Operator) and granular permission codes.
- Audit logging for every write operation.

## Architecture

```
src/
  BasarsoftStaj.Domain/          Entities
  BasarsoftStaj.Application/     Services, DTOs, interfaces
  BasarsoftStaj.Infrastructure/  EF Core, repositories, PostGIS access
  BasarsoftStaj.API/             Controllers, SignalR hub, auth
frontend/                        React + OpenLayers SPA
docs/                            Setup guides, SLD styles, sample data
```

Geometries are handled with NetTopologySuite and stored as PostGIS types. Map layers are published
through GeoServer as WMS/WFS, so rendering large layers does not go through the API.

## Setup

Requirements: .NET 8 SDK, PostgreSQL with PostGIS, Node.js 20+, and optionally GeoServer and an OSRM server.

```bash
# 1. Configuration
cp src/BasarsoftStaj.API/appsettings.Example.json src/BasarsoftStaj.API/appsettings.json
# then fill in your database password and a JWT key

# 2. Database
dotnet ef database update --project src/BasarsoftStaj.Infrastructure --startup-project src/BasarsoftStaj.API

# 3. Backend
dotnet run --project src/BasarsoftStaj.API

# 4. Frontend
cd frontend
npm install
npm run dev
```

GeoServer and OSRM are optional: without them the map still works, but WMS layers and automatic
route generation are disabled. Setup notes for both are in `docs/`.

Sample data for bulk import is in `docs/`:
`ankara-poi-osm-genis.json` (places) and `ankara-toplu-tasima-hatlari.json` (transit lines).

## Screenshots

<!-- Görselleri docs/screenshots/ klasörüne koyup aşağıdaki satırların yorumunu kaldır -->
<!-- ![Location analysis](docs/screenshots/location-analysis.png) -->
<!-- ![Transit simulation](docs/screenshots/transit-simulation.png) -->
<!-- ![Map drawing](docs/screenshots/map-drawing.png) -->

## Notes

POI data comes from OpenStreetMap contributors (ODbL). Transit line geometries are also from
OpenStreetMap. The vehicle simulation is a simulation, not live GPS data: speed is derived from
route type and distance, with a dwell time added at each stop.

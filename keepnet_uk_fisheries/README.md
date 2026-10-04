# Keepnet Discover: UK pleasure fisheries seed

Research date: 2026-10-04. Schema: 1.0.0.

64 researched venues across all four UK countries (England: 40, Northern Ireland: 8, Scotland: 8, Wales: 8).
This is a seed list, not a complete UK directory or a live statement of opening,
bookability, admission, safety or public rights of access. The scope is leisure
freshwater/coarse fishing, including commercial day-ticket fisheries and selected
permit-based public waters. Some venues also offer trout or specialist carp fishing.
The Republic of Ireland, Crown Dependencies and private user fishing spots are outside scope.

## Files

- keepnet_uk_fisheries.json: canonical structured data, metadata and all records.
- keepnet_uk_fisheries.csv: UTF-8 with BOM, same records and fields, suitable for import/review.
- keepnet_uk_fisheries.preview.geojson: 35 points with coordinates, for a preview map.
- keepnet_uk_fisheries.schema.json: JSON Schema for the canonical JSON document.
- validation_report.json: count, coordinate and duplicate-ID checks.

## Location accuracy is separate from source verification

Coordinate counts:
- postcode_centroid: 19
- unknown: 29
- venue_map_pin: 2
- official_venue_point: 1
- official_location_pin: 1
- official_map_centre: 5
- official_venue_pin: 1
- official_waterbody_pin: 1
- published_venue_pin: 5

29 records have no usable coordinate pair and are excluded from GeoJSON.
They remain in JSON/CSV. Never substitute zero, a town centre or a guessed lake point.
56 records are marked needs_pin_review=true.

- postcode_centroid: a real Postcodes.io/ONS postcode location, not the fishery
  boundary, lake, parking area or entrance. It can be a substantial distance away.
- official_map_centre: centre of a map linked by an official source. It may identify
  a broad area only and is not an entrance or a verified venue marker.
- published_venue_pin / official_venue_point / venue_map_pin / official_venue_pin /
  official_location_pin: an official source explicitly publishes the point or location
  link. A published point still needs the review stated in needs_pin_review.
- official_waterbody_pin: identifies a waterbody rather than an access point.
- unknown: no reliable point was used.

Source checking on the stated date establishes that supporting pages were available
to research. It does not establish that the fishery is open now or that a map pin is
safe for navigation. Do not offer turn-by-turn routing to these seed coordinates.
Use official access directions and confirm the legal/public entrance before launch.
Do not direct people across private land or assume that every visible lake is accessible.

Hillhead Loch is intentionally not geocoded from its estate contact postcode.
postcode_geocoding_allowed=false takes precedence over any automated address fallback.
Northern Ireland BT postcode geocoding is also excluded from this package; see licensing.

## Import guidance for the coding agent

1. Treat this as staged public-venue seed data for Keepnet's Discover map.
   Read records from the top-level records array in the JSON. Use id as the upsert key.
   Do not regenerate identifiers from names during refresh, and do not overwrite
   owner-verified app records with lower-confidence seed values.
2. Store latitude/longitude as nullable numbers and needs_pin_review/has_coordinates
   as booleans. In CSV, blanks mean null, booleans are lowercase true/false, and species
   and source_urls are JSON arrays encoded inside quoted CSV cells.
3. GeoJSON uses [longitude, latitude] in WGS84 (EPSG:4326). Libraries such as Leaflet
   use [latitude, longitude] when constructing their own LatLng objects; convert only
   at that API boundary. Never reverse the GeoJSON coordinates.
4. Use a separate preview/review layer for records requiring pin review. Show
   approximate-position text on preview markers and keep unknown coordinates out of
   the map. has_coordinates means only that numbers exist, not production readiness.
5. Keep source_url, source_urls, coordinate_source_url, precision and dates with each
   record. Display the venue website and access_notes. Do not create current prices,
   opening hours, availability, booking integrations, ratings or photos from this seed.
6. Review each source and verify the entrance/venue location before publishing a
   navigation-capable map. Preserve permit, booking and lake-access restrictions.
   Mark source dates separately from any future operator verification date.
7. Keep the public venue layer separate from private user locations and fishing logs.
   This package contains public venue information only.

Field notes:
- country: England, Scotland, Wales or Northern Ireland.
- region: research geography label, not a guaranteed administrative boundary.
- fishery_type/access_type: descriptive seed categories. Map them explicitly to the
  app taxonomy without losing the underlying source values or access restrictions.
- species: only species supported in the research; not a stocking/catch guarantee.
- postcode_location_quality: raw Postcodes.io code, not a venue accuracy score or metres.
- last_checked: research check date. coordinate_checked_on: separate location lookup date.
- address_source_url/species_source_url may be null when support is in source_urls.

## Provenance and reuse

Venue information is a small factual research compilation from the per-record linked
official/operator, club, tourism and government sources. Descriptions were summarized;
no directory photographs, logos, reviews or promotional descriptions are licensed by
this package. Review source-specific terms and obtain any necessary permissions for
production reuse. This is not a blanket open-data licence for third-party venue content.

Great Britain postcode locations come from Postcodes.io, whose documentation identifies
the ONS Postcode Directory as its source (August 2026 edition listed at research time).
Postcode locations remain approximate even where the coordinate has many decimals.
Retain/display the relevant attribution when reusing that coordinate data:

Contains OS data © Crown copyright and database right 2026.
Contains Royal Mail data © Royal Mail copyright and database right 2026.
Source: Office for National Statistics licensed under the Open Government Licence v.3.0.

Reference documentation:
- https://postcodes.io/docs/overview/
- https://postcodes.io/docs/licences/
- https://www.ons.gov.uk/methodology/geography/licences
- https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

ONS and Postcodes.io state that commercial reuse of Northern Ireland (BT) postcode data
requires a separate licence from Land & Property Services. No BT postcode-coordinate
lookup results are included. NI location values, when present, come from the linked
locations in the official fishery sources and are labelled by their limited precision.
DAERA source-content terms are at https://www.daera-ni.gov.uk/articles/crown-copyright-daera.
That page excludes OSNI/LPS mapping and third-party content from its general OGL coverage.
Attribution: Contains public-sector information from the Department of Agriculture,
Environment and Rural Affairs, licensed under the Open Government Licence.
No map imagery, road geometry, boundaries or map tiles are included. Check the terms of
your chosen basemap and any geocoding service independently before production use.

## Maintenance

Before launch, check venue existence, current pleasure-access conditions, source rights,
public entrance and pin. Recheck on a schedule suited to the app and when a venue reports
a change. A failed fetch does not prove closure. Keep a correction/claim process and
retain the last known source and verification date. Empty fields are unknown, not false.

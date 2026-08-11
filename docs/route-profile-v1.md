# TransitCore Route Profile v1

Route Profile v1 describes one public transport line. A registry may enable any number of profiles, and the web lab can display all enabled profiles simultaneously.

## Required fields

- `schemaVersion`: must be `1`.
- `id`: unique profile identifier.
- `name`: user-facing name.
- `provider.codespaceId`: Entur codespace.
- `provider.vehicleEndpoint`: live vehicle endpoint.
- `line.id`, `line.publicCode`, `line.mode`, `line.longName`: line identity.
- `directions`: one or more direction definitions with unique IDs, labels, destination matches and colors.
- `stops`: ordered stops with unique quay IDs, coordinates and increasing `shapeDistanceMeters`.
- `shape`: ordered route geometry with at least two coordinates.
- `display.layout`: `route-live`, `route-leds` or `cards`.

## Positioning strategies

When `positioning` is omitted, the profile uses live vehicle coordinates projected onto `shape`.

`positioning.strategy: "estimated-station-calls"` uses Entur estimated calls. This is intended for services such as metro lines where reliable public vehicle GPS is unavailable. These results are station events, not continuous GPS positions.

## Hardware mapping

Hardware fields are optional for software-only profiles. When `display.showVled` is true:

- every stop must have a unique integer `vled`
- every stop except the final stop must have `segmentToNext.vledStart` and a positive `vledCount`
- all station and segment VLED numbers must be unique and within `hardwareMapping.totalVleds`

Gråkallbanen is the reference hardware profile. Its existing 47 VLED numbers, GPIO values, segment starts and segment counts must remain unchanged unless a separate hardware migration is explicitly approved.

## Multiple simultaneous routes

`config/routes/routes.json` is the registry. Every entry with `enabled: true` is loaded independently. Profiles do not share VLED namespaces unless they are explicitly connected to the same physical hardware profile. The web lab may render all enabled routes at once; a failure in one panel must not stop the others.



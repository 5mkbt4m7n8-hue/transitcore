# TransitCore Board Profile v1

A board profile connects one physical LED board to one or more Route Profile v1 routes. Route profiles describe transit data; board profiles describe hardware.

## Goals

- show many routes on one physical board
- allow routes to share stations and LEDs
- keep hardware numbering independent from Entur and GTFS identifiers
- support station-based metro boards and segment-based tram or bus boards
- preserve the existing Gråkallbanen 47-VLED mapping unchanged

## Required fields

- `schemaVersion`: must be `1`
- `id` and `name`: unique board identity and label
- `layout`: `station-network` or `route-segments`
- `routes`: Route Profile IDs allowed on the board
- `leds`: physical LED count, data pin and brightness limit
- `nodes`: physical board points and their LED assignments
- `render`: route colors and collision behaviour

## Station-network boards

This layout is intended for metro and selected bus networks. A node represents a physical station or stop on the board. Several routes may reference the same node and therefore the same LED.

An arrival event is translated as:

`Route Profile stop ID -> Board node -> physical LED index`

The LED is activated only when a vehicle or estimated call is inside the route profile's configured arrival window.

## Route-segment boards

This layout is intended for boards where vehicles move between stops. Each route-to-node link may include a segment LED range in addition to the station LED. The Gråkallbanen profile remains the reference implementation.

## Multiple routes on one LED

`render.collisionMode` defines the behaviour when more than one route activates the same LED:

- `blend`: combine route colors
- `alternate`: alternate route colors without blocking network updates
- `priority`: use the first route in `render.routePriority`

The physical renderer must receive a complete frame containing route ID, direction, state and event timestamp. A temporary data failure must preserve the last valid frame until the board profile's freshness limit expires.

## Safety

- brightness is capped by the board profile
- route profiles cannot select arbitrary GPIO pins
- every physical LED index must be inside `0..count-1`
- duplicate LED indices are allowed only for explicitly shared station nodes
- Wi-Fi and API credentials are never stored in board profiles



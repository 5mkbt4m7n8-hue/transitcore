# Provider data semantics

## Vehicle position

Gråkallbanen and the Trondheim bus position pipelines use Entur vehicle
observations. A location is a reported coordinate, not guaranteed ground truth.
`lastUpdated` is the source observation timestamp. Fetch completion/cache time
must never replace it. Engine freshness uses that timestamp and the existing
board freshnessSeconds. A recently fetched response can contain stale vehicles.

The phase C provider tags observations `vehicle-position`; missing coordinates
remain null in the normalized view. Missing timestamp is unknown, never now.
Malformed source records are preserved in raw for legacy handling. Duplicates
are not merged by the provider: current engines select records using their
existing route filters, timestamps and vehicle IDs. Cross-provider identity
normalization is a future engine migration, not silently changed here.

## Estimated calls

Oslo metro and Flybuss configurations using `estimated-station-calls` read
Entur Journey Planner stop calls, not vehicle GPS. Their ID is a service journey,
not necessarily a physical vehicle. Expected/aimed arrival and departure times
describe a stop event and are NOT the age/timestamp of a GPS observation.
An expected field alone does not establish that the event is realtime-confirmed.

These paths remain outside `loadVehicles` in phase C. They must not be passed
through the vehicle-position normalizer or acquire synthetic coordinates.
A future adapter needs explicitly typed `estimated-call` observations (or
separate stopCalls), with event time and source-update time distinguished.
Current timestamp selection, station windows and polling remain unchanged.
This phase does not implement GPS-like PASSED/PARKED for Flybuss, or import
PR #190. Existing ETA limitations are not fixed by introducing a provider layer.

## Three separate clocks

1. Source observation age: provider lastUpdated (when available).
2. Retrieval/cache age: eight seconds for vehicle response reuse per isolate.
3. PixelFrame generatedAt/TTL and existing server/ESP hold policies.

None can substitute for the others. Provider exceptions propagate as errors,
not zero vehicles. Existing server hold and ESP last-valid-frame logic remain
responsible for outages. Empty successful responses remain genuinely empty
inputs to that same logic. No new polling or artificial motion is introduced.

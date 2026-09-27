# Frame Pipeline v1 — Phase D

## Scope and compatibility

Based on main 6ae617e (PR #194). This is an internal refactor, not a new
frame protocol or changed transit behavior. Universal BoardClient 1.2.13,
API routes, OTA, device registry, configuration JSON, colors, brightness,
motion policy and TTL/cache durations are unchanged. No deployment is included.

Before: Worker loads Entur -> normalized vehicles -> raw adapter -> two large
raw-aware GPS builders; separate arrival builder -> existing motion lifecycle.

After:

```
Entur provider -> TransitVehicle[] ──> position interpretation
BoardConfig + route/hardware config ──────────────┘
                                   -> logical LED candidates
                                   -> generic physical LED mapper
                                   -> strategy renderer -> PixelFrame v1
Entur estimated calls -> legacy selection -> physical candidates -> renderer
                                   -> existing merge/motion/history/response
```

## Modules and contracts

- `core/frame/frame-context.mjs`: explicit request clock, compatible board,
  route profiles, hardware, **separate** vehicles and estimatedCalls arrays,
  injected signal policy and optional non-wire provider/freshness metadata.
  No fetching, cloning, cache ownership or current-time inference beyond the
  existing default clock.
- `core/engines/position-interpretation.mjs`: unchanged nearest-station/track,
  direction, freshness, deduplication and terminal-zone algorithms. Outputs
  logical candidate IDs, strongest candidates and all occupants. It reads
  canonical fields, never Entur nesting or raw.
- `core/frame/led-mapper.mjs`: logical -> physical assignment only; also maps
  nearestStationLed used by departure memory. No Entur, GPS, colors or timing.
- `core/frame/mapping-support.mjs`: existing geometry, route-direction, color
  and configuration helpers. Worker re-exports original public helpers.
- `core/frame/frame-renderer.mjs`: common PixelFrame envelope and three small
  strategies (station, linear, selected arrivals), preserving optional vehicle,
  occupants, motionPolicy, profileRevision and fingerprint fields.
- `core/frame/build-frame.mjs`: composition, stage errors and opt-in validation.
  Worker invokes this directly with provider-normalized GPS observations.
- `core/frame/frame-validator.mjs`: Phase B validator re-export plus assertion.
  Runs with `{validate:true}` in tests; no mandatory request-time schema walk.

The internal BoardConfig remains Phase B's compatible board/profiles/hardware
components. No config files or profile identities are migrated.
The Worker supplies Gråkallbanen's existing confirmation default; the engine
does not hardcode board IDs. The larger motion lifecycle stays in Worker to
avoid coupling this extraction to a behavior rewrite.

## Normalized fields and legacy/raw boundary

GPS interpretation now uses only:

| Canonical field | Former Entur field |
| --- | --- |
| id | vehicleId |
| publicCode | line.publicCode |
| destination | destinationName |
| timestamp | lastUpdated |
| latitude / longitude | location.latitude / longitude |

Normal observations use these TransitVehicle fields directly. No production
GPS builder reads TransitVehicle.raw or calls toLegacyEnturVehicles.

Malformed/missing fields can have different legacy semantics: numeric strings,
numeric public codes, missing IDs, missing longitude, or timestamps without
timezone. The Entur normalizer therefore adds an internal `frameCompatibility`
projection **only when source and normalized values differ**. It uses the six
canonical names above and preserves old undefined/null/coercion semantics.
It is never serialized into a frame. Changing its policy requires a separate
data-quality migration, especially ID deduplication and invalid coordinates.
One legacy malformed-coordinate path still fails rather than emitting a new
blank frame; tests preserve the same error message.

Remaining raw dependencies:

1. Entur normalizer necessarily reads the six source fields above. Raw is still
   retained for the existing compatibility adapter and old exported Worker
   builder signatures. These wrappers normalize input, but production GPS
   requests no longer pass through them.
2. `liveStationArrivals` remains the legacy estimated-call interpreter in Worker.
   It reads aimed/expected arrival/departure, destinationDisplay.frontText,
   serviceJourney.id and journeyPattern.line.id/publicCode. Its query, selection,
   timing and physical mapping are deliberately unchanged. The renderer only
   receives selected generic candidates, not these raw calls.
3. Lifecycle/history and multi-strategy merge remain existing Worker code.

Later work may normalize estimated calls into a dedicated forecast model and
retire raw wrappers after callers migrate. Do not reinterpret forecasts as
actual vehicle positions, or mix them into TransitVehicle[].

## Errors and last valid frame

GPS provider failures remain ProviderError with original transport code/cause.
FramePipelineError identifies config, interpretation, mapping, render or
validation failure and retains original message/cause/code when present.
Configuration-load and estimated-call transport errors retain existing Worker
stage handling; they have not been rewritten as provider adapters.
No pipeline catch substitutes an empty successful frame. Existing Worker
last-good/empty-feed hold, motion storage and ESP TTL behavior remain unchanged.

## Tests and cost

- All 29 repository test scripts pass (25 scripts and four Worker tests).
- Original 18 comparisons now use a frozen pre-refactor reference, not two
  paths through the new builder.
- 57 additional reference comparisons cover Gråkallbanen 47/16, Trondheim bus,
  empty/stale/duplicate/malformed observations, shared occupants, between-stop
  positions and selected estimated arrivals. Successful outputs are both
  structurally and JSON-serialized identical; legacy exceptions are compared.
- Additional tests exercise raw-free provider-neutral input, full route
  lifecycle sequences, expected identity/count, stale validation and errors.
- Existing provider tests verify 8-second cache, shared in-flight request,
  endpoint/codespace isolation and error eviction. No request/query change.
- Illustrative local 5,000 warmed bus builds: old 165.7 ms, new 163.2 ms in one
  run. This is not a Cloudflare CPU guarantee or a statistically significant
  speedup. No network is included. Mapping uses transient candidate maps/copies
  proportional to active observations; no new persistent cache/history.
  No heap/production CPU measurement has been made.

## Before Phase E

Review this PR before merge/deploy. Test results are not a live hardware
certification. Keep malformed-observation policy, global provider identity and
estimated-call normalization explicit follow-ups. Do not change APIs or move
lifecycle policy as a side effect of route aliases. PR #190 is not imported.

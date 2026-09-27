# Provider Layer v1 — phase C

Entry point: `createEnturProvider({fetchJson, clientName, clock?, ttlMs?})`
in `core/providers/entur/entur-provider.mjs`. An instance exposes
`loadVehicles({endpoint, codespaceId}) -> Promise<TransitVehicle[]>`.
One instance is created at Worker module scope; never create one per board.
There are no background timers, board IDs, LED mapping or rendering here.

`provider-contract.mjs` documents the interface and exports ProviderError.
`entur-normalizer.mjs` maps existing source fields to the phase B model:

| Entur | Internal |
|---|---|
| vehicleId | id |
| constant namespace | provider = entur |
| line.publicCode | publicCode |
| destinationName | destination |
| location.latitude/longitude | paired latitude/longitude |
| lastUpdated | timestamp (source timestamp, not retrieval time) |
| entire original observation | raw |
| data-source kind | observationType = vehicle-position |

Mode, full lineId, heading, speed and state are null: the current query does
not request them. Do not infer mode from publicCode or assign AT_STOP here.
Missing strings are null; invalid/unpaired numeric coordinates become null
in the normalized view. Raw is preserved without conversion or mutation.
Invalid source IDs remain null, not invented. Such malformed observations do
not pass the phase B validator; phase C deliberately does not add a new dropping
or rejection policy to production. This boundary must be resolved explicitly
before phase D engines consume normalized fields exclusively.

## Compatibility boundary

Worker `liveVehicles` delegates to the provider and then uses
`toLegacyEnturVehicles` to supply original raw records to the unchanged frame
engines. The adapter rejects non-Entur/non-position observations. Raw is NOT
spread into PixelFrames or diagnostics. All GPS fields currently still traverse
this adapter; normalized models are introduced without rewriting engines.
Estimated-call fetching and interpretation remain in Worker and existing web
code, explicitly separate from this GPS adapter. No Flybuss provider is added.

## Cache and requests

- Same GraphQL query, POST headers, client name, endpoint and codespace.
- Same 8000 ms cache lifetime measured from successful response processing.
- Key is endpoint + `|` + codespaceId, not board ID. An empty successful array
  is cached. Concurrent requests share a pending promise.
- Rejected promises are removed, never converted into an empty success.
- No added retries. Next normal poll can retry after failure.
- Cache remains memory-local to one Worker isolate, not globally shared across
  Cloudflare locations. This does not promise constant total cost for any fleet.
- Existing `boundedFetchJson`, source deadlines, frame budget, config cache,
  motion storage, frame TTL and ESP poll interval are unchanged.

Freshness/deduplication stay in the current engines, after board filtering.
Moving them into the provider could choose a different record for a board.

ProviderError adds provider='entur', preserves source message and timeout code
and keeps the cause. Worker still reports the existing live_data stage and
503 error format; monitoring/last-valid-frame/TTL behavior is unchanged. No raw
payload is logged by the provider. Config failures remain outside this wrapper.

## Verification and remaining work

`scripts/test-entur-provider.mjs` verifies normalization, nulls, raw roundtrip,
missing coordinates/destination/timestamp/identity, stale and duplicate records,
query/headers, cache expiry, empty cache, concurrency, source isolation, error
eviction and unchanged timeout code. Six fixtures each for real Gråkallbanen
47, Gråkallbanen 16 and Trondheim buss profiles compare serialized frames and
motion lifecycle results before/after. Active fixtures must contain LEDs.

This proves these deterministic cases, not all possible live input or physical
LED behavior. Phase D must retain this oracle while removing raw consumption,
and define malformed-record policy, identity namespace and ETA observations.
No API, board schema, registry, OTA or firmware changes are part of this phase.

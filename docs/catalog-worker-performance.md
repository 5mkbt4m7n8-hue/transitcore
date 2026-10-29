# Catalog Worker performance audit

Base: `aa5cfc73ef2738b4d618d63364126c3538bea51f` (PR 277). No deployment performed.

## Findings and change

The catalog GPS interpreter scanned all 1282 nodes per vehicle for bounding-box
selection, then allocated another full-catalog filter for same-station direction
resolution. Configuration validation scanned nodes for every hardware assignment
(quadratic), including each GPS frame. Rendering visits active LEDs/occupants,
not every catalog node per vehicle; its measured cost is smaller. Keep rendering
and all user direction filters unchanged.

Add a lazy spatial hash and stationId lookup keyed by the configuration's node
array in a WeakMap. Warm frames and mixed GPS/ETA board views reuse that array.
Configuration loading prewarms the index once; TTL refresh replaces the array,
invalidating geometry/station lookup without retaining old configurations. Profiles
and headsign evidence are still read during interpretation. Configuration node
arrays must not be mutated in place. The existing configuration loader creates
new arrays, and physical boards do not use this index.

The grid only narrows candidates: the original bounding box, haversine calculation,
lowest-LED equality tie-break, same-station direction evidence, approach radius,
confidence and GPS-only behavior remain unchanged. Large bounding boxes fall back
to the original node list to bound grid enumeration. Every catalog Quay sees on
average 0.915% of the former candidate visits; CI asserts below 10% rather than
enforcing machine-dependent milliseconds. Validation now uses a Set but still
validates every frame and rejects the same assignments.

Concurrent cold/expired configuration requests previously each fetched, parsed,
validated and fingerprinted the catalog. A single-flight promise now shares that
work and is removed on both success and failure. Upstream vehicle retrieval
already shares pending loads and normalized observations for 8 seconds. FB73 ETA
is separate and remains unchanged (one limited quay query per frame). No new
vehicle cache, frame cache, or stale TTL extension is introduced.

Cron history and legacy checks are already offset by one minute; their 5.5-second
frame deadlines make ordinary cross-cron overlap unlikely. Concurrent HTTP/cron
loads can still share configuration and vehicle requests within the same isolate.
Different isolates do not share these caches. Existing cron tests verify the two
schedules, legacy-board isolation and the subrequest count. No cron/deployment
configuration, historical 147-LED mapping, hardware or original map is changed.

## Measurements: local Node, not Cloudflare billed CPU

Windows, Node 24.22.1. 30 warmups and 300 samples per stage (100 for 1000 buses),
fixed 1282-node production catalog and 48 profiles. Before is imported from the
fixed base commit using `git show`; checkout must include that commit. No raw
GPS/vehicle identifiers are printed or persisted. Optional `--live` performs one
public Entur query and keeps its observations in process memory only.

An initial live run saw 430 provider observations and exact interpretation parity:

| Stage | Before p95 wall ms | After p95 wall ms | Before/after mean process CPU ms |
|---|---:|---:|---:|
| GPS, 250 synthetic buses | 5.018 | 0.617 | 4.010 / 0.627 |
| GPS, 430 real observations | 2.484 | 0.396 | 1.873 / 0.313 |
| Hardware validation | 0.745 | 0.161 | 0.627 / 0.103 |

The real feed includes vehicles not eligible for these catalog routes, so its
count is not the number of rendered buses. A later run including Worker module
import and configuration fingerprinting reported synthetic GPS p95 4.744 -> 1.403
ms, validation 0.952 -> 0.168 ms. This variation is why timings are diagnostics.
In that run normalization p95 was 0.217 ms, mapping 0.238 ms, rendering 0.382 ms,
render-plus-serialization 0.950 ms, cold index 0.248 ms, 1000-bus GPS 3.886 ms.
CPU is process CPU averaged across a batch, not a per-request CPU percentile.

Cold configuration fingerprinting still costs about 4.38 ms p95 locally. Module
import with core modules already loaded measured 80.6 ms wall / 78 ms process CPU
and 1.68 MB heap growth. This includes Node module/JSON loading and is NOT an edge
isolate startup measurement. Wrangler dry-run successfully bundles the actual
Worker: 726.25 KiB, gzip 127.98 KiB. It does not verify request CPU limits.

With GC before each isolated memory sample (20 samples), observed 250-bus heap
growth was 13.26 MB before / 0.658 MB after in the live run; another run saw 24.88
MB / 0.663 MB. A new index added about 0.378 MB including temporary allocations.
These are sampled heap deltas, not retained size or exact peak live memory.
Batch high-water heap/RSS includes all benchmark fixtures, both implementations,
JIT and uncollected garbage. It must not be compared to the 128 MB Worker limit.
A synthetic-only Node CPU profile also identifies interpretation, GC and validation
as major sampled costs. There is evidence of both CPU work and allocation pressure;
no Cloudflare outcome telemetry is available to distinguish exceededCpu from
exceededMemory. Do not claim the production 1102 cause is conclusively CPU.

The mocked whole-Worker test sends 32 concurrent cold and 32 warm requests, each
with 250 buses, and exercises TTL refresh, failed loads and recovery. One run:
cold batch CPU 187 ms / p95 request wall 174 ms; warm batch CPU 157 ms / p95 wall
122 ms. Warm retained heap delta after GC was 35 KB, cold 5.28 MB. These include
JSON bodies, mocked configuration/upstream/monitor IO and scheduling contention.
Motion is bypassed by this catalog configuration, not silently measured as zero
execution time. The test verifies HTTP 200, CORS, TTL 30, 1282 LED count and no
GPS AT_STOP. It does not emulate Cloudflare scheduling or Durable Object costs.

## Reproduce and verify

```
node --expose-gc scripts/benchmark-catalog-worker.mjs
node --expose-gc scripts/benchmark-catalog-worker.mjs --live
node --expose-gc scripts/test-catalog-worker-concurrency.mjs
node scripts/test-catalog-platform-direction.mjs
node scripts/test-frame-pipeline.mjs
node scripts/test-led-feed-worker.mjs
node scripts/test-trondheim-day-history.mjs
node scripts/test-feed-timing.mjs
npx --no-install wrangler deploy --config worker/wrangler.toml --dry-run
node scripts/probe-catalog-performance.mjs
```

Use Wrangler 4.43.0 as pinned in CI. Local regressions and dry-run passed. CI runs
the benchmark/parity, concurrency/refresh and existing regression suites and bundles
the Worker. Tests cover every catalog Quay with empty/unknown/explicit headsigns,
radius boundaries, reversed ordering/equal distances, 250/1000 buses, station
ambiguity, Bukkvollan 134/135, Norrkopingveien 769 vs Nyborg 770, route-free GPS,
uncertain confidence, expiry, FB73 mixed routing and legacy/history behavior.

## Production evidence and release gate

Unchanged production was probed on 2026-10-29 at 12:29:38--12:29:47 UTC (13:29 Oslo).
All five consecutive frame requests returned HTTP 503, missing CORS and a 1102
resource-limit page. No frame TTL/1282 validation was possible. The public
`/v1/trondheim/history` list and a two-record history page both returned 200.
These are BEFORE observations; no improvement is verified live.

Leave this PR open until the production gate can be verified: CI and actual bundle
dry-run green; isolated staging/canary with Cloudflare CPU and memory outcome
telemetry for cold/warm and 200+ eligible vehicles; review request-stage costs,
failure rate and cron behavior. The Free 10 ms request CPU budget is a target,
not a verified guarantee here. Account-level memory and cold isolate behavior
remain unverified. After an authorized controlled rollout, repeat read-only
measurements across multiple TTL windows: HTTP200 + CORS, fresh generatedAt/TTL,
1282 LEDs, no 1102, meaningful failure rate, and working history list/pages/new
scheduled records. Roll back if those checks fail. Do not merge based only on
these local benchmark numbers.

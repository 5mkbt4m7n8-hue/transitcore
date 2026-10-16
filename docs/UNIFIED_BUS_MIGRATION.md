# Unified bus pipeline – local migration candidate

Status: implemented locally, NOT approved for production. No deployment, device
mutation, firmware build/flash or production activation is part of this change.
Branch: `agent/unified-bus-frame-pipeline`, based on main after PR #207.

## Authority and activation

GPS observations and normalized estimated calls feed `createStopAccuracyShadow`
(the existing motion-v1 reducer/mapper, despite its historical name).
`BUS_LIFECYCLE_BOARDS` is a comma-separated allowlist of exact board IDs. It opts
only listed bus-only station-network configurations into that shared pipeline.
The old global `BUS_LIFECYCLE_V1` switch is ignored. Wildcards/invalid entries
fail closed. Missing values preserve existing routing. This release
gate is not set in Wrangler. Existing Bus1 `render.stopAccuracy=motion-v1` remains
unchanged and uses its existing history. No other existing board profile changes.
Tram/metro configurations cannot enter the new bus lane through this gate.

Canonical published frames: `GET /api/v1/frame/{boardId}`. The compatibility
`/v1/boards/{boardId}/frame` route still delegates to the same frame response.
The unified lane bypasses the legacy motion stabilizer: there is only one reducer
per active pipeline. Legacy implementation remains solely for staged rollout and
rollback, not as a second post-processing state machine.

Coverage: Bus1 8 LEDs; Trondheim lines 1/2/3 with 147 LEDs; shared stops (40
routes/147 LEDs); catalogue (47 city bus routes plus FB73). The full catalogue
has 1282 logical points, not 147. Routes absent from a physical 147-point board
are not fabricated or assigned to unrelated LEDs.

## GPS and ETA

GPS keeps the existing motion-v1 policy. Codespace/line/vehicle/journey identity
is retained when available; timestamp replay cannot establish dwell. Existing
limitations remain: a sub-poll stop can be missed, and GPS cannot distinguish a
stationary queue inside the close-stop zone from boarding with certainty.

ETA adapter batches at most 32 quays, requests actual and expected arrival and
departure separately, and filters by exact line ID. It never creates GPS.
Future forecasts can be APPROACHING. Expired forecasts without an actual event
are OFF with an internal uncertainty reason, not inferred physical AT_STOP or
PASSED. Actual events use the same reducer. Provider receivedAt is response
freshness, not proof the operator refreshed its prediction.

The new FB73 logical board contains 46 direction-specific quay LEDs derived
from its existing route profile. GPIO is null: NOT a flashable hardware profile.
This does not prove actual event availability or complete GPS coverage for FB73.

Uncertainty is persisted separately and exposed through the read-only sidecar
`GET /api/v1/frame/{boardId}/diagnostics`. It does not change PixelFrame v1.
The shared web diagnostics panel fetches it only on request and compares board,
sequence and generation time. Evidence from another/expired frame is not labelled
as current. OFF is explicitly not proof of an empty stop. Diagnostics are bounded
to 512 observations with a truncation count; unobserved vehicles cannot be
invented. Legacy/non-enabled boards report NOT_ENABLED, not false certainty.

## Web source inventory

| View | Candidate source/behavior |
|---|---|
| board | Canonical client; raw GPS selection removed; server LED/state wins |
| linear | Canonical client; FB73 browser ETA and generated mapping removed; catalogue route selection |
| feed | Canonical client; raw GPS/frame reconstruction removed |
| map | Canonical client; profile positions only, no vehicle-position interpretation |
| board/client-diagnostics | Canonical client + existing ESP report context; measured hardware parity not claimed |
| lab | Canonical board selection/cards replaces raw GPS/ETA/projection engine |
| network | Canonical client; separate physical LED circles replace browser-selected station winner |
| oslo | Canonical client; removed occupant/state reprioritization; metro backend unchanged |
| diagnostics | Canonical client; observational warnings do not change LED state |
| preview | Explicit unpublished DRAFT; existing admin preview frame endpoint, shared acceptance/expiry, no local afterglow |
| signal-test/editor/wizards | Explicit isolated tests/config editing, not published live authority |

`web/shared/canonical-frame-client.js` owns transport, validation, last-valid
frame and expiry through the existing BoardClient reference model. Renderers
read wire LED IDs, vehicle, state/lifecycle; they may filter visibility, label
configured positions and choose colors. They do not infer transit events.

Preview is deliberately not the published board endpoint: its input is an
unpublished config. Its server path still uses the legacy draft frame builder;
isolated persistent preview history for the new reducer remains to be designed
before claiming *every* draft/live mode uses the new reducer. Never reuse a
physical board's DO history for a draft with the same ID.

Local simulation buttons are visibly separate. Some older LED-only visual test
controls still need conversion to fully validated synthetic PixelFrames; these
are not production feed paths.

## Storage and performance

Unified history uses transactional `unifiedBusV1:*` chunks, 12000 characters per
chunk, maximum 128 chunks, plus metadata. This avoids oversized individual DO
values. Old `stopAccuracyV1`, motion, Fleet/soak and registry keys are untouched.
SHA-256 binds history to board/hardware/routes without storing full configuration
in the binding. History retention stays ten minutes.

DO checks its shared ten-second frame window before provider IO. A cache hit
does not query GPS/ETA. Tests recreate the DO between calls and verify provider
call counts and persistence. Each request still reads persisted chunks; each
new frame writes chunks transactionally. This is not free and is not a measured
Cloudflare cost reduction. No background scheduler is added.

Illustrative local synthetic benchmark, 35 builds (not Cloudflare CPU):

| Board | Vehicles | Total time | Saved JSON characters |
|---|---:|---:|---:|
| Bus1 | 3 | ~8 ms | 3842 |
| Trondheim 147 | 9 | ~15 ms | 10067 |
| Shared 147 | 120 | ~94 ms | 122483 |
| City catalogue | 141 | ~353 ms | 144517 |

Risks before broad enablement: free-tier CPU budget on the largest boards,
DO transaction/read/write billing, up to 128 chunks, provider latency within
serialized DO work, and six-call-per-quay query truncation. Full catalogue live
polling is substantially larger than an eight-LED bench. Measure in a staging
Worker before production activation; do not infer capacity from this benchmark.

## Verification and remaining gates

Tests cover canonical transport/expiry, identical 8/147 LED vectors against the
ESP reference model, station/map syntax and source boundaries, exact FB73 quays,
47-route synthetic load, shared occupancy, persistence/chunk cleanup, forecast
uncertainty and actual events. Existing motion-v1 sequences cover short stops,
drive-through, queues, departure, missing observations and PARKED.
57 frozen frame comparisons and 388 Trondheim legacy comparisons pass.

Model parity is NOT browser DOM QA or a measurement of the physical ESP.
Local browser smoke QA has now run with synthetic data: Linear route switching,
Board, Feed, Map, Network, Lab, Oslo and Bus1 diagnostics. Linear displayed
physical indices 0/1/2/3 as APPROACHING/AT_STOP/PASSED/PARKED. Mobile screenshots
were inspected for Linear, Board, Map, Network and Lab. ETA uncertainty displayed
OFF with a same-frame uncertainty explanation. This is NOT full QA acceptance:
the complete desktop/mobile, expiry/invalid, multi-occupant and hidden/resume
matrix still requires completion. No physical accuracy claim is made.

## Controlled rollout / rollback

1. Complete outstanding diagnostics and preview decisions; run full tests and
   browser QA with local fixtures (including route switching, expired/invalid
   frames and hidden tabs). Review diff for protected paths.
2. Review separate server and web/assets commits/PRs. No automatic merge here.
3. Deploy the isolated staging Worker described in UNIFIED_BUS_STAGED_RELEASE.md.
   Measure CPU, DO storage and
   upstream requests with 8/147/catalogue inputs, including endpoint failures.
4. Publish required static FB73 profiles before enabling the corresponding web
   release. A missing profile must fail visibly, never fall back to browser ETA.
5. Production enablement requires explicit approval and acceptance of all tested
   board sizes/data sources. Main merge may deploy via Cloudflare integration.
6. Roll back one board by removing its ID from BUS_LIFECYCLE_BOARDS. Existing
   Bus1 motion-v1 remains; tram/metro are unaffected. Old storage is retained.
   Revert the web commit separately if necessary; no firmware rollback needed.

READY FOR PRODUCTION / PUBLISH: NO, until the gates and gaps above are closed.

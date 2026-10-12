# Bus1 controlled activation and client parity

Date: 2026-10-12. Branch: `agent/bus-arrival-departure-accuracy`, base `263ad4e`.

## Controlled release revision

First PR: `agent/bus-arrival-departure-disabled-release`. **All repository board profiles, including Bus1, remain legacy.** The Bus1 activation flag was removed; tests opt in only on an in-memory copy. The existing `web/board/index.html` redirect/link change is intentionally excluded from this PR and retained locally for the later activation. New diagnostics remain opt-in by direct URL. No profile, firmware, OTA or Fleet/soak files change.

User-verified Cloudflare information: current production `b078cc0d`, previous `b0484ee7`, rollback available; main uses Wrangler deploy and other branches versions upload; watch paths checked by user. This PR must not be merged automatically. Later Bus1 activation is a separate controlled change. The original activation design and earlier access blockers below are historical context, not the current profile state.

## Original local activation review

Implemented and tested locally. **NOT published or physically activated.** No commits, push, merge, deploy, firmware flash or production data writes were performed. Grakallbanen, FB73, Fleet/soak, OTA and hardware profiles are unchanged.

Publication is blocked pending actual Cloudflare production-version, build-trigger and rollback verification. This session had no browser surfaces, usable Wrangler installation or configured Cloudflare API credentials. Repository configuration alone cannot prove the external integration settings. Do not treat this as permission to publish without those checks. Browser visual QA was also unavailable; host-side tests are not a visual inspection.

## Activation and shared pipeline

Only `config/boards/trondheim-bus-1-visual-test.json` opts in with `render.stopAccuracy: "motion-v1"`. Missing flag or `"legacy"` retains the existing path. The generic BoardConfig validator rejects other values. No product-specific conditional is added to the engine.

The Worker loads the existing normalized provider data and passes it to the common stop-evidence/reducer/mapping/rendering pipeline. `worker/stop-accuracy.mjs` supports GPS station boards; estimated-call activation is deliberately rejected for now. FB73 remains unchanged. No DeviceConfig or firmware change is necessary to consume the existing PixelFrame v1 states/lifecycle fields.

The existing per-board Durable Object persists candidate history and its shared frame under additive key `stopAccuracyV1`. Serialized updates reuse the same result for 10 seconds, so extra viewers do not advance the reducer. Changed configuration invalidates the saved binding. Existing legacy motion history is not overwritten. No new Durable Object class or storage migration is required.

GPS arrival/departure thresholds remain provisional; see the shadow investigation. PARKED is supported after 300 seconds stationary within 15 m of the anchor. PASSED is encoded through the existing lifecycle field and lasts 10 seconds. The candidate bypasses legacy motion stabilization to avoid applying two histories.

## Web/ESP parity boundary

The Bus1 board URL redirects to the modest frame-driven diagnostic view. Other board pages retain their existing initialization. The view reads the exact canonical frame endpoint used by ESP:

`https://transitcore-led-feed.lgb84.workers.dev/api/v1/frame/trondheim-bus-1-visual-test`

Planned simulator URL (new behavior is **not published**):

`https://5mkbt4m7n8-hue.github.io/transitcore/web/board/?board=trondheim-bus-1-visual-test`

Direct planned diagnostic URL:

`https://5mkbt4m7n8-hue.github.io/transitcore/web/board/client-diagnostics.html?board=trondheim-bus-1-visual-test&device=trondheim-bus-1-visual-test-enl-6w6r`

`web/shared/board-client-model.js` interprets the wire frame, not GPS/ETA. It models firmware 1.3.1 visual-rc1 effective lifecycle states, physical indices, same-priority occupants (maximum four), 1200 ms occupant alternation, integer triangular APPROACHING pulse, PASSED dimming and last-valid-frame expiry. Brightness comparisons intentionally exclude the hardware safety cap. No browser departure history is synthesized.

Diagnostics display sequence, generation time/age, algorithm response header, physical LED 0–7, vehicle identities, state, logical level and browser-observed change time. This last time is **not** a server-observed arrival timestamp. Missing reported telemetry is labelled rather than inferred. The existing public status projection omits canonical health sequence in current code, so ESP sequence may correctly show “Ikke rapportert”; this task does not widen that endpoint.

### Known limitations: actual parity is PARTIAL

- Host tests compare a JavaScript firmware reference model, not running C++ or measured LEDs.
- ESP and browser have independent polling/network delays. The 10-second shared frame window reduces differences but cannot guarantee they receive the same sequence simultaneously.
- ESP uses boot-relative millis; browser uses its own monotonic clock. Pulse/occupant phases match for equal supplied times, not necessarily wall-clock time across devices.
- The view uses board visual defaults. DeviceConfig overrides, local Serial overrides, ambient mode and master dimming may differ; no authenticated config or actual visual telemetry is assumed.
- Current telemetry does not report per-LED state or animation phase. No measured hardware-difference claim is made.
- Invalid/missing frames retain the last valid model frame until remaining TTL expires. A physical ambient setting can leave background illumination after transit pixels expire.
- The candidate cannot confirm a stop seen in only one GPS sample. ETA alone on this GPS board is not converted into a fake position. Queueing within the close arrival zone remains a field-validation risk.

## Verification

Full local suite: **43 scripts PASS**, including **57 frozen frame comparisons**, **388 Trondheim comparisons**, existing Fleet/health/soak and firmware guards. Initial stop-accuracy suite: 22 grouped checks. No firmware compilation is required because firmware was not edited.

`scripts/test-bus1-activation-parity.mjs` compares complete eight-LED state/identity/level sequences with `scripts/fixtures/esp-visual-rc1-reference.cjs`, including intermediate pulse samples:

| Scenario | Model result |
| --- | --- |
| A arrival / B departure | APPROACHING -> AT_STOP -> PASSED -> OFF; PASS |
| C pass-through | No invented AT_STOP; PASS |
| D queue outside close zone | No invented arrival; PASS |
| E sub-poll short stop | Not falsely confirmed; PASS |
| F stale/missing GPS | No invented departure; PASS |
| G ETA without GPS | No synthetic position; PASS |
| H competing occupants | Shared priority/identity behavior; PASS |
| I invalid/missing frame | Last valid retained, expires, recovers; PASS |
| PARKED | Long stationary sequence; PASS |
| Persisted history | New DO instance restores history; same window reuses frame; PASS |

LED mapping and state/afterglow model tests PASS. Actual production timing accuracy and physical web/ESP parity have not been measured. Existing profiles remain unchanged except the local Bus1 flag; regression outputs remain identical for legacy boards.

## Files

Shared candidate: `core/engines/stop-evidence.mjs`, `core/engines/stop-lifecycle-candidate.mjs`, `core/frame/stop-accuracy-shadow.mjs`, `core/providers/entur/stop-call-evidence.mjs`.

Activation: `worker/stop-accuracy.mjs`, `worker/led-feed-worker.mjs`, `core/models/board-config.mjs`, `config/boards/trondheim-bus-1-visual-test.json`.

Web: `web/board/index.html`, `web/board/client-diagnostics.html`, `web/board/client-diagnostics.js`, `web/shared/board-client-model.js`.

Tests/diagnostics: `scripts/test-stop-accuracy.mjs`, `scripts/diagnose-stop-accuracy.mjs`, `scripts/test-bus1-activation-parity.mjs`, `scripts/fixtures/esp-visual-rc1-reference.cjs`, `scripts/test-bus1-visual-bench.mjs`, `.github/workflows/api-v1.yml`.

Documentation: this file and `docs/BUS_STOP_ACCURACY_CANDIDATE.md`.

## Safe publication plan — not executed

1. Verify actual Cloudflare production version, branch/main commands and path filters; record exact rollback version. Verify GitHub Pages source/build settings (no Pages workflow is present in this checkout).
2. Review full diff. Stage backend with Bus1 flag absent/legacy first, so deployment does not simultaneously change physical behavior. Current local flag is enabled: do not blindly publish the whole working tree as one activation.
3. Production Worker must include `DEVICE_STATUS`. Preview configuration has no binding; successful upload alone cannot validate persistent candidate behavior. Test an isolated non-production binding before production activation.
4. Deploy approved backend with all profiles still legacy; smoke-test frame contracts and existing devices without changing configuration or restarting them.
5. Publish the diagnostic static files through verified Pages mechanism. Confirm mapping, response headers, invalid-frame handling and actual browser layout.
6. Publish only Bus1 profile flag after checks. Raw/main profile fetch is cached for up to five minutes. Confirm `x-transitcore-stop-algorithm: motion-v1`, valid eight-LED frames and normal device feed/health. Observe real arrival/departure alongside sequence numbers; do not infer physical correctness from HTTP 200.
7. Rollback Bus1 by removing the flag or setting `render.stopAccuracy: "legacy"`; allow configuration cache expiry. No token/device/firmware change. If backend rollback is necessary, restore the previously verified Worker version; additive candidate storage can remain inert. Static view can be reverted separately.

Do not publish until the missing deployment checks can be completed. No request to disclose secrets in chat is necessary.

# Bus1 GPS proximity in the Unified Bus staging candidate

Local implementation on `agent/unified-bus-staging-candidate`, extending the
unchanged candidate commit `fbe5e6ba7edc6427c516f81356081225bc7fb59c`.
The original `agent/bus1-gps-proximity` worktree remains untouched, including its
uncommitted changes. This document supersedes that worktree's identity/staging
limitations. No commit, publication, deployment or physical test was performed.

## Changed-file inventory relative to fbe5e6b

12 tracked modifications and three new files; none staged or committed:

```text
config/boards/trondheim-bus-1-visual-test.json
core/engines/stop-evidence.mjs
core/engines/stop-lifecycle-candidate.mjs
core/frame/stop-accuracy-shadow.mjs
core/models/board-config.mjs
docs/STAGING_CANDIDATE_CHECKPOINT.md
scripts/diagnose-stop-accuracy.mjs
scripts/test-bus1-visual-bench.mjs
scripts/test-unified-bus-engine.mjs
worker/frame-diagnostics.mjs
worker/led-feed-worker.mjs
worker/stop-accuracy.mjs
docs/BUS1_GPS_PROXIMITY.md (new)
scripts/test-gps-proximity.mjs (new)
scripts/test-gps-proximity-staging.mjs (new)
```

The original source worktree was checked by HEAD, Git status and SHA256 hashes of
all13 modified/untracked source files. All remained identical. Staging entry,
Wrangler config, guard and manual workflow were also byte-identical to the local
origin/main worktree at d7266f5. `git diff --check` passed; Git emits ordinary
LF-to-CRLF checkout-normalization warnings, with no unexpected file-mode change.

## Activation and shared pipeline

Only `config/boards/trondheim-bus-1-visual-test.json` selects
`render.stopAccuracy: "gps-proximity-v1"`. All other profiles retain their prior
contents and behavior. Existing GPS/ETA adapters, `createStopAccuracyShadow`,
`gpsEvidence`, `reduceStop`, mapper, renderer and `DeviceStatus` are reused.
No new engine, storage namespace or PixelFrame field was introduced.

`usesUnifiedBus` and its explicit staging board allowlist remain unchanged.
`buildStopAccuracy` chooses the proximity policy from the board config even when
the existing staging wrapper passes `unifiedBus: true`. All other boards continue
through the original policy. Existing motion-v1 and ETA regression scenarios run
explicitly in their original mode.

The staging wrapper, Wrangler config, deploy guard and workflow are unchanged.
They still require authentication, the reviewed account/name, isolated
`UnifiedBusStaging` storage, immutable candidate SHA and environment approval.
There are no production bindings, cron, device, admin, publish or OTA endpoints.
The wrapper's `x-transitcore-stop-algorithm` remains `unified-bus-v1` (engine
family); Bus1 diagnostics additionally reports `mode: "gps-proximity-v1"`.
Non-unified canonical requests report the board's explicit proximity mode.

## Stable identity and stop-visit safety

GPS proximity history uses configured provider endpoint + codespace, full line ID
and vehicle ID. An optional normalized provider label cannot change the configured
namespace. Destination text is never part of the key. The current Entur GPS query
does not provide a verified service-journey identity; no journey is guessed.
Optional journey metadata cannot clear an already completed physical stop visit.
This keeps the safety latch at vehicle scope across trip and direction changes.
The legacy/motion policy keeps its original identity behavior in this change.

Each vehicle retains the entered/left stop visits in the existing history map:

- First fresh, plausible GPS observation at distance <=70m: AT_STOP immediately.
- Once entered, distance <=90m retains AT_STOP; the first accepted >90m sample
  sets OFF, without PASSED, PARKED, dwell confirmation or afterglow.
- `50m -> 100m -> 69m`, including a changed headsign or journey, stays
  `AT_STOP -> OFF -> OFF`.
- Re-entry requires a fresh plausible sample outside250m AND a later continuous
  inward sample. The sample after a long GPS gap cannot alone prove approach.
- Duplicate, out-of-order, future, stale or implausible-jump samples cannot rearm
  the latch. Missing/invalid observations render OFF without manufacturing exit.
- A direction change selects only an eligible quay and retains the old quay's
  visit latch. Intermediate headsign text (for example "Kattem via Strindheim")
  cannot override the first configured destination match and select the opposite
  quay. This is configured destination evidence, not verified vehicle heading.

Unfinished visit latches survive the ordinary ten-minute idle-history expiry.
Time alone therefore cannot erase an unobserved exit. Empty, fully rearmed records
still use ordinary retention. At most the board's stop set is retained per vehicle;
these vehicle records can persist until actual exit/approach evidence arrives.
Existing transactional history chunk/capacity limits still apply and fail closed;
storage growth for many vehicles remains a staging observation, not a measured
Cloudflare result.

## Diagnostics and timing

Authenticated endpoints in the existing staging Worker:

- `/api/v1/frame/trondheim-bus-1-visual-test`
- `/api/v1/frame/trondheim-bus-1-visual-test/diagnostics`

The diagnostics sidecar preserves frame sequence/generatedAt and reports mode,
GPS timestamp/age, distance, physical/logical LED, state-change time and reason.
Only an explicit projection is returned; internal keys, raw observations and
credentials are not exposed. Other modes keep the previous diagnostics shape.
`stateChangedAt` is the server evaluation time. Neither it nor a browser change
timestamp is a measured physical boundary-crossing time.

Intervals remain unchanged: provider cache8s, shared DO frame cache10s, browser
polling about10s plus request time. Unified DO cache hits occur BEFORE provider
IO. Extra clients in that window neither advance state nor add provider requests.
Source freshness is30s and continuous speed>45m/s is rejected. Short visits between
observations can be missed. Do not interpret8+10+10 as a guaranteed latency bound;
include Entur observation age, network time and polling/cache phase alignment.

The local `scripts/diagnose-stop-accuracy.mjs --gps-proximity --replay <file>`
supports explicit shadow comparison. It bypasses staging caches and is not proof
of actual deployed-frame timing. Web/ESP checks use the existing reference decoder,
not a measurement of physical ESP output. Existing web views were not changed.

## Local verification

49 test scripts verified:48 passed directly. `test-device-enrollment.mjs` could
not fetch its public GitHub config in the restricted environment; it passed with
only those GET requests mapped to local config fixtures. Its registry is in-memory.
No production registration was performed. The suite includes57 frozen frame
comparisons,388 Trondheim comparisons, available Oslo/Grakallbanen regressions,
motion-v1/ETA, client parity, Fleet/health/soak and staging safety.

New tests cover exact70/90m boundaries, passing/short/slow/stationary visits, changed
headsign, new/missing journey ID, reversed direction, GPS noise/gaps/jumps/replays,
multiple vehicles, physical mapping, JSON-restored history, rearm and rollback.
The staging integration test exercises the actual wrapper -> actual DO -> mocked
Entur -> chunked persisted history path across object recreation, cache hits and
authenticated diagnostics. All five staging profile sizes are checked.

No actual Cloudflare deployment, real-time provider sample, browser visual QA,
performance measurement or physical trip was performed during this extension.

## Controlled live test and rollback (requires separate approval)

1. Review the local diff and preserve the source worktree. An approved commit
   must later supply the immutable candidate SHA; the deploy guard correctly
   rejects this currently dirty/uncommitted checkout.
2. Recheck trusted wrapper/config equality and all staging safety tests, approve
   that SHA through the existing manual staging workflow/environment, then deploy
   only the isolated staging Worker. Do not publish the changed board profile to
   GitHub raw/main separately or change the existing public gateway's pinned SHA.
3. Verify authenticated HTTP200, schemaVersion1, board ID, eight LEDs, family
   header, source SHA and diagnostics `mode: gps-proximity-v1`. Verify unauthorized
   and blocked paths. Check the other staging boards still report their old mode.
4. Record successive frame sequences/times, GPS timestamp/age, stop distance,
   LED state-change time and request receipt time. Match diagnostics by sequence
   and generatedAt. Record independent timestamped observations near70/90m.
5. Include drive-through, normal/short dwell, queue50m, noise at70/90m, departure
   without relight, two buses, and a genuine return after observed exit beyond250m.
   Separate Entur latency from cache/polling delay before changing any intervals.
6. Roll back only the test profile to `motion-v1` in a separately reviewed
   candidate (or restore the previous staging version). Configuration digest
   invalidates incompatible cached frames/history. Unified history remains in the
   existing staging-only namespace; non-unified motion-v1 storage is untouched.

Local readiness: ready for isolated staging code review. Publication/deployment,
an approved immutable SHA and actual live measurements remain separate steps.

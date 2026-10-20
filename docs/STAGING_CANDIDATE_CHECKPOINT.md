# Staging candidate checkpoint — updated 2026-10-16

## Current local mobile follow-up — 2026-10-20

HEAD is `9701d459d3e9ae8dd90c9356497f359321f7d3e7`, pushed with separate approval.
Subsequent uncommitted work connects the existing full147-slot Bus1 view to a
staging-only derived board `trondheim-bus-1-gps-staging`. See
`BUS1_GPS_MOBILE_TEST.md` for current status, security pins, test coverage and the
publication dependencies. The original eight-LED profile remains available.
The new staging wrapper/config differ from trusted main and need explicit review;
the equality guard is retained. The new gateway path remains closed until a new
exact candidate SHA is approved/pinned. Production is still the default source.
No commit/push/deploy is authorized or performed for this mobile follow-up.
52 scripts PASS (enrollment with local config GET fixtures), including57 frame
regressions and388 Trondheim comparisons. Browser checks passed on synthetic
desktop/mobile data; actual HTTPS staging and field accuracy remain untested.

## Local Bus1 GPS extension — 2026-10-20

Current worktree remains `agent/unified-bus-staging-candidate` at committed base
`fbe5e6ba7edc6427c516f81356081225bc7fb59c`, with an uncommitted Bus1-only
`gps-proximity-v1` extension. See `BUS1_GPS_PROXIMITY.md` for the current identity,
visit rearm, diagnostics, verification and staged live-test/rollback plan.
The older milestone below describes the already committed candidate, not approval
to publish this new local extension. The source `agent/bus1-gps-proximity` worktree
and all its original uncommitted changes are preserved.

Stable configured provider/line/vehicle identity now survives destination and
journey changes. The reported50m ->100m ->69m case remains AT_STOP ->OFF ->OFF.
Rearm needs observed >250m exit and a later fresh inward sample. The same Unified
Bus engine/DO/mapper/renderer and PixelFrame v1 are used. Trusted staging wrapper,
config, guard and workflow are unchanged; all other profiles retain their modes.

49 scripts verified (48 direct PASS, enrollment PASS with local public-config GET
fixtures because network access was unavailable), including57 frozen frame and388
Trondheim comparisons. Actual staging wrapper/DO integration uses synthetic Entur
data and in-memory persistent storage. No new Cloudflare, browser or physical
measurement is claimed. Ready for isolated staging code review; no commit, push
or deployment is authorized/performed for this extension.

## Current follow-up outcome (supersedes historical findings below)

READY FOR FIRST LOCAL COMMIT: YES, subject to explicit user approval. This is a locally reviewed API-first candidate, not approval for staging or production deployment. The original inspection below is retained as history; its Linear/Lab blockers and browser-test inventory are superseded here.

- Restored Linear occupant color alternation without changing the frame-selected lifecycle or vehicle. PASSED/PARKED retain status colors. Existing pulse, timing and route controls remain.
- Restored Lab simultaneous route panels, checkboxes and category selections, retaining separate-view links. Parent does not poll; children consume canonical frames. All 54 selectable routes were opened locally; large selections can cause substantial duplicate client polling and have not been cloud load-tested.
- Fixed real mobile overflow in editor filter/select layout and diagnostics source text. No redesign.
- Extended the loopback-only QA fixture with synthetic preview/signal-test responses and multi-color occupants. It neither forwards requests upstream nor uses real credentials.
- Added `scripts/test-web-preservation.cjs` and its existing API CI test step.

Follow-up touched eight files: `web/linear/index.html`, `web/lab/index.html`, `web/editor/index.html`, `web/board/client-diagnostics.html`, `scripts/serve-unified-web-qa.mjs`, `scripts/test-web-preservation.cjs`, `.github/workflows/api-v1.yml`, and this checkpoint.

Current full candidate inventory: **21 modified + 17 new = 38 files**. Relative to the original 35-file copied inventory below, the additions are `web/editor/index.html` (modified), `scripts/test-web-preservation.cjs` (new), and this checkpoint (new). Recommend including this checkpoint in a future approved commit to preserve decisions and limitations.

### Follow-up verification

All **47 test scripts pass**, including 57 frame regressions and 388 Trondheim comparisons. Enrollment required a network-enabled rerun for its public profile fetch; its registry remains in-memory. No production device was registered. No GitHub CI or Cloudflare performance result is implied.

Actual browser checks used synthetic loopback data, desktop and 375/390-pixel mobile viewports:

- Linear: blue/orange alternation observed on the same LED while canonical vehicle identity remained unchanged; route selection, shared 147-point board, pulse/PASSED/PARKED styling and LED test controls exercised.
- Lab: simultaneous panels, category selection, two-route selection and deselection, embedded views and mobile layout checked.
- Editor to preview: actual navigation transferred the 147 assignments, directions and colors; configuration/frame checks passed against the synthetic fixture. Local signal test started; return navigation preserved the project.
- Diagnostics: eight Bus1 indices, identities, states, source and explicit model-versus-hardware disclaimer checked. Mobile source overflow corrected.

Limitations: no real authenticated draft preview, physical ESP observation, exhaustive import/export, every signal-test animation stage, hidden-tab browser cycle or cloud load test. Automated coverage is not a substitute for these. Primary Linear still uses 147 LEDs whereas default Bus1 diagnostics uses eight: measured parity requires matching board context. The draft unified-history boundary described below remains follow-up work; no staging proxy was built.

The eight bootstrap files have no diff and match main byte-for-byte after Git checkout filters; disk CRLF differs from raw Git LF blobs only. Do not normalize or modify bootstrap for this candidate.

Next approval point: inspect the complete 38-file candidate and authorize a local commit if desired. No commit, push, PR, merge, deploy, environment change or physical-device operation is authorized by this checkpoint.

---

## Historical initial inspection — 2026-10-15

## Decision and scope

Local preparation only. No commit, push, PR, merge, deploy, settings change, device operation or production mutation was performed.
TransitCore is the shared engine; InTransit is the product. GråkallBoard is the only built physical prototype and remains untouched. Bus1 is the first staging accuracy/reference test, not evidence of measured ESP parity.

Preserve the whole existing web platform, including its design, animations, colors, route selection and workflows. A canonical frame migration does not authorize simplified replacement interfaces. API-only is the first technical staging gate; existing Linear is the subsequent field-testing tool.

## Workspace / reproducibility

- Source: `../transitcore-bus-accuracy`, branch `agent/unified-bus-frame-pipeline`, HEAD `c7a32145ca82b63bd9c6b54f17a0385fcaf872a3`.
- Candidate: `../transitcore-staging-candidate`, branch `agent/unified-bus-staging-candidate`.
- Fetched main / candidate base: `f2c7303436552f67b8617b5f7bebc1735d8b89d2` (PR #208 merged).
- Copied exactly the previously inspected 20 modified and 15 new files, comparing SHA256 for every copy. Source workspace was not edited, reset or cleaned.
- Eight staging-bootstrap files are inherited from main, not copied from the dirty source. They have no candidate diff.
- This checkpoint is one additional documentation file: total candidate inventory is 20 modified + 16 untracked files. Nothing is staged or committed.

## Copied inventory against main

Modified (20):

```text
.github/workflows/api-v1.yml
core/engines/stop-evidence.mjs
core/frame/stop-accuracy-shadow.mjs
scripts/test-board-page.mjs
scripts/test-linear-platform-coverage.mjs
scripts/test-oslo-network-map.mjs
web/board/client-diagnostics.html
web/board/client-diagnostics.js
web/board/index.html
web/diagnostics/index.html
web/feed/index.html
web/lab/index.html
web/linear/index.html
web/map/index.html
web/network/index.html
web/oslo/index.html
web/preview/index.html
worker/api/v1.mjs
worker/led-feed-worker.mjs
worker/stop-accuracy.mjs
```

New copied files (15):

```text
config/boards/trondheim-flybuss-live.json
config/hardware/trondheim-flybuss-live-hardware.json
core/providers/entur/stop-call-loader.mjs
docs/UNIFIED_BUS_MIGRATION.md
docs/UNIFIED_BUS_STAGED_RELEASE.md
scripts/serve-unified-web-qa.mjs
scripts/test-canonical-diagnostics.cjs
scripts/test-canonical-frame-client.cjs
scripts/test-canonical-web-syntax.mjs
scripts/test-unified-bus-engine.mjs
scripts/test-unified-release.mjs
scripts/test-unified-staging.mjs
web/shared/canonical-frame-client.js
worker/bus-history.mjs
worker/frame-diagnostics.mjs
```

## Verification

All 46 existing `scripts/test-*.mjs` / `scripts/test-*.cjs` scripts passed in the candidate. Enrollment first failed in the restricted sandbox because its public GitHub profile lookup was unavailable; the isolated enrollment test passed when network access was available. It uses a local in-memory registry, not production registration.

Included: 57 frame regressions, 388 Trondheim comparisons, GPS/ETA/lifecycle, unified engine and history, frame validation, canonical client, staging isolation/guard, Fleet/health/soak regressions. Local Node was 24.19.0; this is not a claim of a new GitHub CI run or Cloudflare execution.

Synthetic benchmark samples for 35 builds: Bus1 8.1 ms, Trondheim147 16.0 ms, shared147 101.7 ms, catalog1282 385 ms. These are local timings, not Cloudflare CPU/wall-time measurements or production accuracy evidence.

`git diff --check` passed. Firmware, OTA, Fleet/soak and existing Gråkallbanen profiles are outside the changed-file inventory. Production behavior is unchanged because nothing was published.

## Actual browser checks and limits

Used the existing loopback synthetic QA server (`scripts/serve-unified-web-qa.mjs`, port 8098). No credentials, production telemetry or physical devices were used.

| View | Verified locally | Limit / result |
| --- | --- | --- |
| Builder | Existing 147-LED editor loads, controls present, no configuration errors; clicked Test med live-data | Configuration transfer succeeds; export/import/publish were not exhaustively exercised |
| Preview from editor | Actual navigation to `web/preview/?from=editor`; project, mapping and configuration checks displayed; publish disabled without valid frame | Real authenticated draft-feed generation was not exercised; synthetic server does not implement admin preview |
| Linear `?v=110` | Desktop rendered existing design and route controls; synthetic APPROACHING, AT_STOP, PASSED and PARKED; changed route to line 2 | Multi-occupant color regression found by source comparison; not full visual acceptance |
| Client diagnostics | Eight Bus1 indices, names, vehicle IDs, lifecycle states and OFF entries; canonical source and algorithm shown | Explicitly no measured ESP/hardware state; synthetic data only |

No mobile, all-route, hidden-tab, expired-frame or complete animation browser acceptance is claimed for this pass. Automated shared-client tests do not substitute for each page's real integration: several contract tests instantiate the same client under different view labels.

## Blockers / narrow follow-up work

1. **Linear presentation regression:** `prioritizedOccupants()` now returns one synthesized occupant, making `cycleLedColors()` ineffective for multi-occupant LEDs. Preserve authoritative LED/lifecycle/vehicle selection, while restoring the established occupant-color presentation. Do not recreate a browser transit-state engine.
2. **Lab workflow regression:** `Vis alle samtidig` now displays board links instead of simultaneous route panels and selection. Restore existing workflow using canonical frames. It is not acceptable to replace it with the simpler implementation merely to complete migration.
3. **Different board context:** primary Linear defaults to `trondheim-bus-board` (147), whereas default client diagnostics uses Bus1 test (8). The `v=110` parameter does not select the eight-LED board. Same-frame parity requires explicit shared boardId/mapping context. Route selection alone is insufficient.
4. **Draft preview boundary:** existing `/v1/admin/preview` calls `liveFrameForConfiguration` without the environment argument and then legacy stabilization. This is not evidence that drafts use the unified allowlist/history path. Published LIVE should consume canonical frames; draft validation/rendering must preserve the builder workflow and use safely isolated history if unified state is later enabled. Staging intentionally exposes no admin preview.
5. End-to-end browser QA and actual staging measurements remain incomplete. No physical timing parity can be asserted from synthetic frames.

No runtime fixes were made in this preparation pass. These findings concern the pre-existing copied migration.

## Staging compatibility / secure future Linear data access

Keep approved bootstrap unchanged. The staging wrapper and Wrangler configuration are inherited verbatim from main; separate staging Worker/DO binding and staging-only authentication are enforced by existing guard tests. Actual cloud resource/environment configuration still needs verification at deployment approval. No cloud resource was created or queried by this preparation.

The approved staging configuration allows five board groups; the first API-only test should explicitly request Bus1 only. Do not silently change approved bootstrap to narrow the list. No cron computes other boards automatically.

Direct browser fetch is not a safe staging integration: staging requires bearer authentication, including its current handling of preflight, and the shared browser client does not provide staging authentication. Never embed the staging token in JS, HTML, URLs, browser storage or a distributed static config.

Recommended later implementation, requiring approval:

1. A local loopback, same-origin proxy serves the existing web files and canonical API route. Staging token stays in server-side environment/memory only, never logs or responses.
2. Fixed upstream `transitcore-staging` only; allowlist GET frame/diagnostics for approved board IDs. No arbitrary upstream URL, admin, provisioning, OTA or publish requests. No production fallback.
3. Forward PixelFrame unchanged, including sequence/timestamps and algorithm headers. Share normal polling/cache behavior; compute no state in the proxy.
4. Make staging origin/context explicit in the existing shared client and UI without redesign, and align Linear boardId with the diagnostic/test mapping.
5. Loopback only initially. Phone/remote field access requires a separately approved HTTPS/authenticated proxy/session design; do not expose an unauthenticated LAN service. Keep draft-editor admin credentials separate.

## Approval gates / next conversation

Current outcome: technical candidate preparation PASS, combined web-preservation acceptance BLOCKED; **not ready for the first combined local commit**.

Next: obtain approval for narrowly restoring existing Linear color presentation and Lab simultaneous-view behavior, resolving shared board context and the draft-preview boundary. Add actual integration tests, finish desktop/mobile browser QA, rerun regressions, then review exact diff including untracked files. An API-only subset may be proposed separately, but no subset was silently committed or promoted.

Only after explicit approval: create immutable candidate commit; review push/build triggers; approve SHA in staging environment; manually run approved staging workflow. Cloudflare CPU/DO/provider/cache/error metrics and real GPS observations remain staging gates. No production activation or GråkallBoard change is implied by any of these steps.

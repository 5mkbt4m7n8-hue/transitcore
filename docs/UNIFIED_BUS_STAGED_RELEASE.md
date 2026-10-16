# Unified bus staged release checkpoint

Local candidate only. No production activation, push, merge, device change or
firmware flash. Branch: `agent/unified-bus-frame-pipeline`.

## Independent gates

`BUS_LIFECYCLE_BOARDS` contains exact comma-separated IDs. Add one group after
its acceptance checks; remove that ID for rollback. No separate algorithms.

| Group | ID | LEDs |
|---|---|---:|
| A | trondheim-bus-1-visual-test | 8 |
| B | trondheim-bus-board | 147 |
| C | trondheim-shared-stops-board | 147 |
| D | trondheim-city-lines-catalog | 1282 |
| E | trondheim-flybuss-live | 46 |

An empty allowlist preserves current production behavior, including Bus1's
existing profile-based motion-v1. Removing A restores that old lane; it does not
disable Bus1. Tram/metro cannot enter the unified bus lane even if mistakenly
listed. Old history is retained; rollback does not delete storage.

## Isolated staging

`deploy/staging/wrangler.json` uses Worker `transitcore-staging` and its own
`UnifiedBusStaging` DO class/namespace. There is no production script_name,
production route, cron or secret binding. The public entry accepts only the
five frame endpoints and their read-only diagnostics. No device/Fleet/OTA or
admin routes are exposed. The class inherits the actual DeviceStatus engine;
there is no test transit engine. Candidate JSON profiles are bundled, avoiding
accidental reads of different main-branch profiles during staging.

Wrangler 4.43.0 local dry-run succeeded: 2412.32 KiB bundle, 224.81 KiB gzip.
This is build validation, NOT Cloudflare performance validation.

Deployment is now prepared through a manual, approval-gated GitHub Actions
workflow, not local authentication. See STAGING_GITHUB_ACTIONS.md for bootstrap,
fixed candidate SHA, separate secrets and settings. The entry requires a
staging-only access token. No staging version has been uploaded. CPU, live DO
operations, billing, provider truncation, error rates and latency remain
UNMEASURED. Production branch-preview is not accepted as isolated staging.

## Required staging measurements (not completed)

For each group, capture version ID, account plan/CPU limit and a bounded test
window. First poll at 10 seconds for at least 10 minutes, then repeat with five
concurrent readers (same board) and cold/recreated instances. Record median/p95
wall time, Cloudflare CPU, exceptions/timeouts, provider subrequests, frame
sequence/age, repeated-frame cache hits, DO read/write counts and storage growth.
Inspect six-call-per-quay ETA limits explicitly; response receipt time is not
the operator's observation time. Do not mark missing instrumentation as zero.

Acceptance: no CPU limit exceptions/timeouts, valid frames for every size,
shared-cache readers do not multiply provider queries inside the same frame
window, bounded history and diagnostic size, no fabricated ETA arrivals, and
documented headroom under the actual account plan. No blanket PASS from local
benchmarks. Large synthetic load on Cloudflare still needs a bounded fixture
runner; the public staging endpoint deliberately cannot accept arbitrary config
or injected observations.

## Browser QA checkpoint

Run `node scripts/serve-unified-web-qa.mjs`, then open localhost:8098/qa. The
server binds loopback, serves public web/config assets and synthetic API frames,
and does not call providers. Its scenario links control only in-memory test
responses. Do not deploy this script.

Completed smoke checks: canonical states and physical IDs in Linear, Board,
Feed, Map, Network, Lab and Bus1 diagnostics; Oslo module loads; route 1/2
switching; mobile screenshots for Linear/Board/Map/Network/Lab; ETA uncertainty
panel and mismatched-frame warning. A long Linear direction label was given
word wrapping. Diagnostics from a previous frame no longer claim current parity.

Also completed: invalid frame retains the last valid frame; expiry clears the
logical LEDs; Diagnostics reports no valid fresh frame instead of remaining at
the startup message, and recovers on a valid frame. Preview without a project
is explicitly labelled isolated draft, not LIVE.

Still required: all pages desktop AND mobile, full Preview interactions,
multiple occupants, hidden tab pause/resume, and full control-window sequence
comparison. Do not mark the matrix PASS yet.

## Latest local verification — 2026-10-14

All 45 scripts matching scripts/test-*.mjs or scripts/test-*.cjs passed,
including the frame and Trondheim regressions. git diff --check passed.
CI path filters now include all scripts/test-unified-* tests, not only the
engine test. No commit, push or deployment was performed.

Local Wrangler authentication is no longer a prerequisite. Real staging awaits
reviewed GitHub workflow publication, protected environment, dedicated secrets,
an immutable candidate commit and approval for first deployment.

## Actual production triggers inspected 2026-10-13

Cloudflare UI showed production `acaaf310` at 100%, branch `main`.
Production command: `npx wrangler deploy --config worker/wrangler.toml`.
Non-production builds enabled; version command:
`npx wrangler versions upload --config worker/wrangler.preview.toml`.
Include: `worker/*`, `core/*`, `package.json`, `package-lock.json`,
`npm-shrinkwrap.json`, `.npmrc`.
Exclude: `*.md`, `*.test.mjs`, `worker/wrangler.preview.toml`.
No settings were changed. Re-check active version and rollback menu before merge.
GitHub Pages settings have not yet been independently verified in this pass.

## Reviewable release parts

1. Server/core + optional sidecar API + allowlist + related tests and CI. Empty
   production allowlist; old clients ignore the new sidecar. Keep staging files
   identifiable and never change the production Wrangler entry to staging.
2. FB73 logical static profiles before web clients reference them.
3. Shared web client + migrated views + UI/contract tests. Publish only after
   browser QA. Existing frame contract remains usable against the old backend;
   unavailable sidecar must not blank the frame.
4. Separate explicit activation for each approved group A–E, observing metrics
   and valid frame/health reports before advancing. No automatic broad enable.

Rollback: remove only the affected allowlist ID, verify response algorithm after
the deploy/cache window; retain DO history. Revert web separately. Cloudflare
version rollback does not restore storage and must be checked against migration
compatibility. Do not roll back the whole Worker merely for one board's gate.

READY FOR STAGED PRODUCTION: NO until real staging and remaining QA are complete.

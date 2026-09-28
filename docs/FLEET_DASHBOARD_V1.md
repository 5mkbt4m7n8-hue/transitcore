# Fleet Dashboard v1 — Phase G

## Scope and files

Read-only operator dashboard: `web/fleet/index.html`, `fleet.css`,
`app.mjs` (UI/lifecycle), `client.mjs` (transport/paging) and
`model.mjs` (explicit display projections). No dependencies in the shipped page.
Serve with the existing GitHub Pages site at `/transitcore/web/fleet/`
after an approved merge/deployment. This phase does not deploy it.

Uses only existing authenticated GET endpoints:
- `/api/v1/devices?limit=20&cursor=...`
- `/api/v1/devices/{deviceId}`, only while an operator has selected a device.

No public status fallback, config mutation, firmware download, OTA selection,
provider calls, or frame generation. Server-computed states are displayed, never
recalculated in the browser. Missing values are **Ikke rapportert**; zero and
false remain meaningful. Metrics describe the last report, not a live measurement.

## UI and pagination

List, device/label search, status/board/firmware filters, status counts, firmware
and board distributions, and an on-demand detail panel. Filters and counts apply
to loaded readable records, independent of the active filters.
The API does not supply global aggregate totals. Until the last page is loaded,
the UI explicitly says **Minst N** and that more pages exist. Once all pages
are loaded, the registration count includes unreadable device IDs, but unreadable
devices are not classified OFFLINE or assigned invented metrics.
Pagination is not a transactional fleet snapshot; concurrent registrations can
change counts between refreshes. IDs are deduplicated.

History is a compact scrollable table (latest first), not an interpolated graph:
stored status, RSSI, frame age, heap, cumulative failed polls. No synthetic
offline samples or counters inferred between reports. Errors show active/resolved,
code, severity, first/last seen, occurrences, static safe message; recurring
errors are highlighted.

## Refresh and cost

- Initial list: one GET for up to 20 records; next page only on explicit click.
- List refresh: 60 seconds **after completion**, atomically refreshing the P pages
  already loaded. No per-device detail prefetch. Old snapshot remains visibly
  stale if a refresh fails.
- Detail: one GET on open, then a separate 60-second completion-based timer.
  Close cancels it. Requests have a 20-second timeout. No immediate retry loop.
- Hidden tab: abort requests, stop timers. Visible again: refresh.
- Disconnect/page exit/auth failure: abort and clear token/data.
- One loaded page: approximately 60 list GET/hour while visible. One open detail
  adds approximately 60 GET/hour. P loaded pages: approximately 60P list GET/hour.
  Manual clicks and page loading add requests. Actual rate is lower due to latency.
- Cross-origin Authorization requires OPTIONS preflights: budget up to one extra
  Worker request per GET (browser caching may reduce this), so one page plus
  detail is up to roughly 240 HTTP requests/hour, excluding manual refresh.
- Existing backend list fan-out still costs one registry read plus up to 20
  telemetry reads per page. Detail reads its registry and telemetry object.
  These estimates are not Cloudflare billing/load measurements.

## Authentication: restricted operator/dev mode

The existing API uses a powerful static administrator Bearer key, not individual
user sessions. The UI therefore is a prototype **operator/dev mode**, not a
production customer login. Manually enter the administrator key on a trusted
machine over HTTPS (localhost only for development). It is never bundled, stored
in local/session storage, put in URLs, logged, or rendered back. The password
field clears immediately; the API client retains the key only in memory.
Logout/401/403/page exit clear it. Memory-only handling cannot protect against a
compromised browser/extension, same-origin XSS, or someone with developer tools.

Requests go only to the fixed official Worker HTTPS origin, credentials omitted,
redirects refused. CSP disallows third-party scripts and limits connect-src.
No analytics, device secrets, or raw JSON dumps. Display fields are allowlisted
and escaped. API errors do not echo upstream body text.

For production: replace manual administrator credentials with scoped operator
sessions (e.g. an authenticated same-origin gateway), audit roles, expiry and
rate limits. This is deferred; no public fallback or weakened authentication.

Two small additive server changes were necessary:
1. Fleet JSON responses now send the same CORS header as the existing API v1.
   OPTIONS already supported Authorization; GET previously lacked ACAO. CORS
   does not grant API access: all fleet reads still require the admin key.
2. DeviceRecord projects `otaEnabled` only from an explicitly provisioned boolean
   in registry deviceConfig; otherwise null. No OTA decision behavior changed.
   `updateAvailable` is unknown because the fleet backend does not compute it.
   Desired firmware is shown only when provided by the registry.

## Firmware 1.2.13 gaps

RSSI, health boot ID/count, last frame sequence, device timestamp and structured
last OTA result are not reported by baseline firmware. Hardware profile comes
from registry provision, not independently attested by the ESP. Desired firmware
and OTA enabled are registry facts if available. No values are guessed from
logs, versions, direction, LED state or elapsed uptime.
See FIRMWARE_TELEMETRY_GAPS.md for the complete distinction.

## Validation

- `node scripts/test-fleet-dashboard.mjs`: rendering/filtering/unknown and zero,
  empty list, errors/history, pagination, on-demand detail, failed refresh,
  cancellation, credential exclusion.
- `node scripts/test-health-telemetry.mjs`: existing backend/auth/retention tests
  plus additive OTA projection and fleet CORS/no-store.
- `node scripts/browser-fleet-dashboard.mjs`: optional Playwright acceptance
  test with intercepted synthetic API responses, desktop/mobile layout, secret
  storage exclusion, page loading, detail, API/auth errors, hidden-tab polling,
  empty fleet and logout. No real credentials or live Worker requests.
  Uses installed `playwright`, or `PLAYWRIGHT_MODULE` pointing to its package;
  optional `BROWSER_CHANNEL=msedge`, `FLEET_SCREENSHOT=/local/path.png`.
- Run all existing `scripts/test-*.mjs` and `worker/*.test.mjs` before PR.

## Remaining risks before next phase

No production Worker load test or live administrator session was used. Real
device firmware gaps remain. Full-fleet counts need explicit page loading;
large fleets will need server-side aggregate/filter design in a later phase.
Historical data is bounded by existing retention and reflects report samples,
not continuous connectivity. Production authentication and stronger edge rate
limits remain separate work. Firmware, providers, frame pipeline and OTA
selection are intentionally unchanged.

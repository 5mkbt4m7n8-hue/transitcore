# Linear production fetch investigation — 2026-10-29

## Confirmed read-only browser observations

From the real `https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/` origin at approximately 12:07 UTC:

- Production `https://transitcore-led-feed.lgb84.workers.dev/api/v1/frame/trondheim-city-lines-catalog` intermittently failed cross-origin GETs. Chromium reported missing `Access-Control-Allow-Origin` and `net::ERR_FAILED`; JavaScript received only `TypeError: Failed to fetch`. The browser does not expose the blocked response status or body to application code.
- A successful production response returned HTTP 200, `Access-Control-Allow-Origin: *`, `Cache-Control: no-store`, `x-transitcore-stop-algorithm: legacy`, `ledCount: 1282`, and a fresh timestamp (age 0.131 s, TTL 30 s). 1282 is the board capacity, not the active bus count: that frame contained 104 active LED entries.
- Direct navigation to the same production endpoint also returned Cloudflare error **1102: Worker exceeded resource limits**. This is evidence of a server/resource failure producing a response without usable CORS, rather than proof that the application's normal successful responses have incorrect CORS. Worker logs/CPU profiling would be required to identify the expensive operation. Bounded client retries cannot repair a persistent Worker resource limit.
- Three staging requests per probe succeeded with HTTP 200, CORS response type, the explicit GitHub Pages allowed origin, `Cache-Control: no-store`, `unified-bus-v1`, `ledCount: 1282`, and ages of roughly 2–5 seconds. No staging fallback is introduced.
- Production LED 855 had vehicle 1548, destination `Østre Lund`, about 5 m from the quay, with `platformEvidence: direction-conflict` and `platformConfirmed: false`. Line 1's profile explicitly lists Østre Lund southbound. This does not establish erroneous platform data: a bus may be near the terminus while announcing its next journey. Preserve the existing uncertainty marker and mapping.

## Request and hydration path

`web/linear/index.html` hydrates the static board/hardware/profiles from repository JSON, selects the production or staging origin, then invokes `web/shared/canonical-frame-client.js`. All city route dropdown choices use the same 1282 LED catalog frame; FB73 uses its own board. Thus a failed catalog request affects all city routes, regardless of the working static station list. Route/source changes reset the client and increment a generation guard, preventing an older pending response from painting the new selection.

The shared client previously made one `no-store` fetch per poll, without a timeout. It now coalesces simultaneous refreshes, makes at most three attempts, retries transport failures/timeouts/408/429/5xx only, and bounds each request including JSON hydration to six seconds. It retains the same endpoint and `no-store`, uses a simple CORS GET with omitted credentials, and never uses opaque responses, a proxy, timestamp rewriting, or a source fallback. An existing valid frame stays explicitly LAST_VALID after failure and is extinguished at its original TTL. Invalid/mismatched/stale frames are rejected without retry or timestamp renewal. Expiry checks both wall clock and monotonic time, including the exact TTL boundary.

Diagnostics expose endpoint, attempt count, transport category, and server validation error separately from sample validity. A browser `Failed to fetch` is described as network/CORS unavailable or blocked, without claiming the application can identify an underlying 1102. NO_FRAME has no accepted frame; EXPIRED has all LED entries removed. Linear labels LAST_VALID as the last valid data with a fetch error, rather than LIVE.

## Validation and limits

Automated tests cover intermittent transport recovery, exhaustion and later recovery, coalescing, stalled headers and JSON hydration, HTTP retry classification, invalid/stale frames, exact TTL, suspended-tab wall clock expiry, and isolation of source/route selection. A real local browser regression also checks the red/green legend after frame painting, delayed production response after switching to staging, TTL OFF, and subsequent recovery. The CI workflow runs both suites.

No Worker GPS proximity mapping, board catalog, historic 147 LED configuration, or deployment configuration is modified. This change improves frontend resilience and makes failures diagnosable; it does not claim to remove the production Worker's CPU/resource constraint. No production deployment was performed as part of this investigation.

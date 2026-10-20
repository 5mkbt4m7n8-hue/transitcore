# Linear staging gateway

Separate read-only Worker for trondheim-bus-board (147), trondheim-shared-stops-board (147), trondheim-city-lines-catalog (1282), trondheim-flybuss-live (46).
Only frame/diagnostics GET and CORS OPTIONS. No admin, device, OTA, production bindings or own DO.
Server secret STAGING_ACCESS_TOKEN authenticates to transitcore-staging. Never put it in client code or logs.
Exact required source SHA after this PR: eb43b06e26e38c558e3beabf033274172b0eecdc.
15-second upstream timeout, 256 KiB streaming limit, pinned origin, no redirects, strict diagnostics projection.
Native per-IP/location rate limit 60/minute; not a global budget. CORS is not authentication; data is public.

Standalone test: node scripts/test-linear-staging-gateway.mjs.
Dependencies core/models/pixel-frame.mjs and common.mjs already exist on main. No web-PR dependency.

Do not deploy on merge automatically. Separate approval required to create Worker, check namespace 110008 and native rate limiter support, and install server secret. Then verify HTTPS for all four real profiles (including payload sizes), error behavior and source SHA before publishing the separate Linear web integration.
Production Worker, firmware and GrakallBoard remain unchanged. Rollback: disable this separate gateway; no automatic production fallback.

## Controlled update after first publication

The first publication created the gateway, but live verification returned 502.
The `global_fetch_strictly_public` compatibility flag enables its HTTPS fetch to
the separate staging Worker on the same account; the upstream SHA remains pinned.

After review/merge, use **Manual Linear staging gateway deployment** on `main`:
choose `mode=update`. The authenticated Cloudflare API supplies the active
gateway version UUID automatically; no mobile copy/paste is needed. Approve the existing `staging`
Environment gate. Never use `create` to retry the existing Worker.

Update checks the exact account, name, runtime, two bindings and a single active
version with 100% traffic, twice before mutation. The first validated UUID is
retained in memory and must be identical immediately before deployment. Missing
or empty compatibility flags are accepted before this fix; unexpected flags are
rejected. Unexpected state stops the run.
It deploys only this config with `--keep-vars`, never calls `secret put`, and
checks bindings and the compatibility flag afterwards. Create remains fail-closed
if the name already exists. No automatic mutation retries or rollback.

The same live verification checks all five frames and diagnostics, pinned SHA,
environment, count/schema/freshness, 256 KiB and denied endpoints. PASSED LED counts
are reported from real frames; zero means no observed departure, not a lifecycle
accuracy PASS. If verification fails, one authenticated read of the exact staging
endpoint reports only HTTP/check stage/size, never token or raw body, then stops.
This distinguishes upstream HTTP, size, identity and frame/diagnostics failures
from gateway-path failures. No gateway/engine code is modified by this probe.

## Bus1 GPS Proximity · 147 LEDs (2026-10-20)
The new allowed read-only board is `trondheim-bus-1-gps-staging` (147 positions).
It uses the existing `transitcore-staging` source at the exact pinned SHA above,
with server-only STAGING_ACCESS_TOKEN and public GPS diagnostics projection.
The original four allowed routes are pinned to the same updated upstream SHA.
Do not expose the token in the browser.

After merge, run the existing manual gateway workflow from `main` with
`mode=update` (NOT create) and approve the `staging` environment gate.
That workflow checks all five public profiles, exact SHA, frame schema,
diagnostics and denied endpoints. Do not publish the Linear frontend until
live verification succeeds. No production Worker or ESP32 deploy is involved.
Then GitHub Pages can show normal Linear with
`?v=110&route=atb-bus-1-live&source=staging`.


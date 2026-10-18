# Linear staging gateway

Separate read-only Worker for trondheim-bus-board (147), trondheim-shared-stops-board (147), trondheim-city-lines-catalog (1282), trondheim-flybuss-live (46).
Only frame/diagnostics GET and CORS OPTIONS. No admin, device, OTA, production bindings or own DO.
Server secret STAGING_ACCESS_TOKEN authenticates to transitcore-staging. Never put it in client code or logs.
Exact required source SHA: fbe5e6ba7edc6427c516f81356081225bc7fb59c.
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
choose `mode=update` and enter the independently reviewed, currently active
gateway version UUID as `expected_version`. Approve the existing `staging`
Environment gate. Never use `create` to retry the existing Worker.

Update checks the exact account, name, runtime, two bindings and a single active
version with 100% traffic, twice before mutation. Unexpected state stops the run.
It deploys only this config with `--keep-vars`, never calls `secret put`, and
checks bindings and the compatibility flag afterwards. Create remains fail-closed
if the name already exists. No automatic mutation retries or rollback.

The same live verification checks all four frames and diagnostics, pinned SHA,
environment, count/schema/freshness, 256 KiB and denied endpoints. PASSED LED counts
are reported from real frames; zero means no observed departure, not a lifecycle
accuracy PASS. If verification fails, one authenticated read of the exact staging
endpoint reports only HTTP/check stage/size, never token or raw body, then stops.
This distinguishes upstream HTTP, size, identity and frame/diagnostics failures
from gateway-path failures. No gateway/engine code is modified by this probe.

Pending: actual update and live verification. Local tests do not prove the 502
is resolved. Do not publish PR #215/Pages until the live checks pass.

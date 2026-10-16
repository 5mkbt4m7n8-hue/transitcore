# Linear staging gateway (not deployed)

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

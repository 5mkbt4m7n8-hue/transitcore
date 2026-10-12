# Bus1 motion-v1 activation PR

Prepared 2026-10-12 from main `0fb47b2` (merged PR #206). No merge, manual deploy, device restart or flash.

## Before activation

Read-only production checks at 21:23:56–57 UTC:

- Bus1: HTTP 200, valid PixelFrame v1, 8 LEDs, `x-transitcore-stop-algorithm: legacy`.
- Grakallbanen prototype: HTTP 200, valid PixelFrame v1, 16 LEDs, same `legacy` header.
- Grakall device status received 21:21:35 UTC: uptime 46963 s, frame valid, frame age 0 s, feed failures 0.
- Bus1 status received 21:21:33 UTC: uptime 393499 s, frame valid, frame age 9 s, feed failures 0.
- Canonical admin Fleet detail `/api/v1/devices/grakallbanen-prototype-board-7luypks1` returned 401 without authentication. No local admin token is available. Public status is not sufficient to certify persisted soak continuity or absence of earlier resets. **Confirm Fleet/soak in the authenticated dashboard before merge.** No credentials are requested in chat.

User confirmed production Worker `acaaf310`, Ready/100% traffic, zero error rate at inspection; previous `b078cc0d` and rollback available.

## Scope and activation

Only `config/boards/trondheim-bus-1-visual-test.json` gains `render.stopAccuracy: "motion-v1"`. Tests assert that every other board remains legacy. No Worker engine, PixelFrame contract, firmware, hardware, OTA, Fleet/soak or other profile change is included.

The already-built shared engine and diagnostic assets were merged in #206. This PR restores only the previously withheld Bus1 redirect/link in `web/board/index.html`. Existing web routing for other boards is unchanged.

Publishing the feature branch does NOT activate production: the Worker loads profiles from raw/main. Merging/publishing the profile to main can activate Bus1 after the existing configuration cache (up to five minutes), independently of Worker deployment. Follow verified Cloudflare watch-path policy; no manual deploy is needed for the profile flag. Pages must publish index.html for the redirect to appear.

## Web and physical parity

Simulator: `https://5mkbt4m7n8-hue.github.io/transitcore/web/board/?board=trondheim-bus-1-visual-test`

It redirects to the existing `client-diagnostics.html` and reads exactly `/api/v1/frame/trondheim-bus-1-visual-test` from `https://transitcore-led-feed.lgb84.workers.dev`, as ESP does. Physical indices 0–7 and lifecycle states come from the frame, not a second GPS engine.

Host tests compare complete state/identity/logical-level sequences with an ESP reference model, not measured hardware. Independent network polling and boot-relative pulse/occupant phases can differ. Device/Serial visual overrides are not known to the page; it uses profile defaults. Per-LED ESP telemetry is unavailable, and public status may omit frame sequence. Browser transition times are browser-observed, not measured arrival times. No exact physical parity claim.

## Rollback and merge gate

Set only Bus1 `render.stopAccuracy` to `"legacy"` or remove the field and publish that profile to main. Allow up to five minutes for config cache expiry, then verify the response header is `legacy`, frame validation succeeds and device health continues. No firmware/token changes. Candidate history may remain inert. The existing web view can display either algorithm.

Before merge: all CI/build checks green, authenticated Grakall Fleet/soak review complete, current production version/rollback still known. After merge: confirm Bus1 header `motion-v1`, all control boards still `legacy`, 8-LED valid frames and normal device reporting. Observe arrivals physically before claiming accuracy improvement. New thresholds remain provisional.

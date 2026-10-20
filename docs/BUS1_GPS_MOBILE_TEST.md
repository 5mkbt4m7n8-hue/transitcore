# Bus1 GPS Proximity in the existing Linear view

Status: locally implemented and tested; not pushed or deployed. The committed
engine candidate remains `9701d459d3e9ae8dd90c9356497f359321f7d3e7`.
This local extension needs a new reviewed immutable SHA before publication.

## Mobile use after approved publication

Open this bookmark on the normal GitHub Pages site:

https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/?v=110&route=atb-bus-1-live&source=staging

It selects line1 and staging. Alternatively use the existing route selector and
Datakilde -> STAGING. Leave "Vis alle bylinjer" off for the GPS-only Bus1 test.
Changing source to "Eksisterende tavler", or omitting `source=staging`, uses
production. No login, copied token, Serial Monitor or local PC is needed once the
HTTPS gateway and Pages changes have been published. The URL contains no secrets.
The bookmark is NOT yet evidence of a live GPS deployment.

## Same view, full mapping

Linear keeps its existing HTML/CSS, route list, controls, animations, colors and
station layout. Bus1 still uses the normal147-slot board mapping; its selected
line view shows32 stations and62 visible LEDs, including the normal shared LEDs.
Only the canonical frame boardId changes to `trondheim-bus-1-gps-staging` when
line1 + single-line + staging is selected. No eight-LED mapping is projected onto
the full board. The physical eight-LED test profile remains unchanged.

The staging variant is derived in `deploy/staging/entry.mjs` from the existing
147-slot board/hardware data. It keeps every coordinate, LED index and hardware
assignment, selects only the existing line1 RouteProfile, and uses the existing
GPS reducer through `render.stopAccuracy: gps-proximity-v1`. Unused slots stay
OFF. A distinct boardId gives this variant its own object within the existing
staging DO namespace; no new Cloudflare storage resource or engine is needed.
No production board/profile file is modified. Ordinary line2/3, shared stops,
catalog and Flybuss configuration remains unchanged.

Selecting another line keeps its existing production/staging behavior. The
multi-line checkbox still selects Shared Stops; its existing policy is retained
and the scope note no longer labels that view GPS Proximity. Source/route changes
clear previous frame/presentation state and ignore obsolete in-flight results.
There is no automatic fallback from an unavailable staging feed to production.

## Authentication and release pins

The existing `transitcore-linear-staging` gateway is reused. The browser talks
only to its public HTTPS read endpoint. The gateway supplies the existing
STAGING_ACCESS_TOKEN in the server-side upstream Authorization header. It accepts
only the fixed staging host, allowlisted frame/diagnostics paths, expected board
and LED count, and an exact reviewed SHA. No device/admin/OTA route is exposed.
The existing native60/minute limit,15s timeout and256KiB body limit remain.

GPS diagnostics has an explicit schema projection: mode, distance, observation
age, state-change time and physical LED. Unknown fields, invalid indices, wrong
mode and sensitive raw fields are rejected; free-text upstream reasons are
replaced. Frames remain PixelFrame v1. Invalid responses become API errors;
valid empty frames are accepted. Clients retain the last valid frame only until
its normal TTL.

The new GPS gateway path is deliberately closed by default (HTTP503):
`createGateway()` has no approved `gpsCandidateSha` yet. Its injected test pin is
used only by local synthetic tests. Before release, pin the default export to
the exact SHA of the reviewed NEW staging candidate. Do not use9701d45 as that
new pin: it contains the GPS engine/eight-LED configuration but not this147-slot
staging variant. The four existing gateway paths retain their previous approved
SHA and behavior in this local preparation.

## Publication steps requiring separate approval

1. Review the changed staging entry, exact allowlist/config and guard together.
   The trusted wrapper/config equality check is unchanged. The currently trusted
   main wrapper will correctly REJECT this changed staging boundary.
2. Publish the reviewed staging boundary/allowlist/guard as a small bootstrap
   change through the existing review process, separate from engine/web changes.
   The bootstrap file policy is not bypassed. No workflow is changed here.
3. With separate approval, commit the compatible engine/config candidate, obtain
   its exact SHA and review/pin that SHA for both staging deployment and the
   gateway. Since the existing staging Worker is shared, its new SHA also needs
   to be pinned for the four existing gateway paths when updating that Worker.
   Keep production as the normal web source throughout this controlled update.
4. Use existing manual GitHub Actions and the staging Environment approval.
   Keep the existing server secret; no copying credentials into chat/browser.
   Extend the existing gateway verification inventory to this fifth public
   profile when pinning the approved candidate; keep its original four smoke
   checks. Do not run the create workflow for the already existing gateway.
5. Verify actual HTTPS frame + diagnostics for all five public profiles, exact
   SHA/environment,147 LEDs for the new variant, <=256KiB and blocked paths.
   Verify that other staging profiles retain their policies. No correctness
   claim is based only on zero active buses or synthetic tests.
6. Only then publish the minimal Linear web diff to existing Pages. No whole
   engine merge or production Worker deploy is needed for the frontend.

No such publication or setting change was performed. A gateway update is required
before this phone bookmark can reach the newly reviewed staging variant.

## Verification and limits

52 test scripts PASS:51 ran directly and enrollment used local public-config GET
fixtures (in-memory registry). This includes57 frozen frame regressions and388
Trondheim comparisons. `git diff --check` passed. No GitHub CI or Cloudflare
execution is claimed for this uncommitted extension.

Local inventory relative to9701d45: nine tracked files changed and seven new files.
The gateway's two files, gateway documentation and the two Linear/gateway tests
are existing main files brought into this older candidate before applying the
small Bus1 changes. Wrangler gateway configuration is identical to current
origin/main; normal diff does not show these untracked additions, so they must
be included explicitly in any later review. The full inventory is:

```text
deploy/staging/entry.mjs
deploy/staging/wrangler.json
scripts/staging-deploy-guard.mjs
web/linear/index.html
scripts/serve-unified-web-qa.mjs
scripts/test-gps-proximity-staging.mjs
scripts/test-unified-staging.mjs
docs/BUS1_GPS_PROXIMITY.md
docs/STAGING_CANDIDATE_CHECKPOINT.md
deploy/linear-staging/entry.mjs (existing main; new in candidate)
deploy/linear-staging/wrangler.json (existing main; new in candidate)
docs/LINEAR_STAGING_GATEWAY.md (existing main; new in candidate)
scripts/test-linear-mobile-integration.mjs (existing main; new in candidate)
scripts/test-linear-staging-gateway.mjs (existing main; new in candidate)
scripts/test-bus1-gps-mobile.mjs (new)
docs/BUS1_GPS_MOBILE_TEST.md (new)
```

Automated tests execute the actual staging wrapper, provider adapter, reducer,
mapper, chunked history, gateway and canonical client using synthetic Entur data.
They check full147 mapping, exclusion of other lines,50 ->100 ->69m latching,
documented rearm, safe diagnostics, wrong valid SHA, oversized response,
empty/error/expired frames and production-default/deep-link behavior.

The actual Linear HTML select is parsed and both source choices are executed.
HTML/CSS and route/source changes are checked against existing full-board mapping;
remaining route choices keep147/1282/46 counts. Native browser QA used synthetic
loopback data at desktop and390px mobile viewport:32 Bus1 station rows,62 displayed
LEDs, source change, line2, multi-line Shared Stops and return to GPS were verified.
No horizontal overflow was observed. This is not a real bus/ESP measurement.
No staging token was used for browser QA.

The existing approved13-file GPS source worktree and physical GrakallBoard were
not changed. Current diff is local and uncommitted; no push, deploy, secret,
GitHub/Cloudflare setting change or new resource was made.

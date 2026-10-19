# Isolated Oslo staging — local preparation, not deployed

## Scope and resources

Target: `transitcore-oslo-staging`, same account but separate Worker.
The existing Oslo adapter uses Entur Journey Planner and a 20-second per-isolate
raw-response cache. It requires NO DO, KV, R2, device registry or persistent history.
The wrapper bundles the existing board, hardware and five route profiles; it never
fetches GitHub main configuration. Only the fixed Entur endpoint is accepted.
It imports the existing adapter and PixelFrame renderer, not the production router.
There is no scheduled handler, administration, OTA, publishing or production route.
The adapter is merely exported and accepts an optional diagnostic output object;
its query, filtering, cache and traffic interpretation are unchanged by staging work.

Authenticated GET only:
`https://transitcore-oslo-staging.lgb84.workers.dev/api/v1/frame/oslo-metro-wizard-separate`

PixelFrame v1 remains unchanged, 201 LEDs. Staging-only response headers identify
environment, immutable source SHA and source outcome. `VALID_EMPTY` and
`FILTERED_EMPTY` are successful empty frames; `INVALID_SOURCE`/`FETCH_ERROR` give
503. A single invalid quay fails the entire frame. Invalid cached payloads remain
errors until normal 20-second refresh; no partial/stale frame fallback exists.
Aggregate diagnostics are emitted by the existing adapter; no new public diagnostic
endpoint or raw provider/error body is exposed.

## Manual setup required BEFORE publication/deployment

1. Independently review workflow, policy, wrapper and runner. A new workflow must
   become available on main before dispatch. The trusted checkout is the workflow
   SHA, not the candidate. Wrapper/config must match that trusted copy exactly.
   Integration tests run only from the exact candidate checkout, without secrets.
   The main bootstrap does not need the candidate's adapter export or engine changes.
2. Verify current Cloudflare Git Builds settings, include/exclude paths, branch
   builds and production command in the dashboard. Repo workflows inspected here
   do not automatically run this Oslo deploy. External Cloudflare integration is
   NOT verified locally. Existing worker/core changes may trigger it at merge.
   STOP publication until production auto-deploy risk has been explicitly cleared.
3. Create GitHub Environment `oslo-staging`, required reviewers, prevent self-review
   where supported, disallow bypass, and allow only main deployments. YAML naming
   an environment does NOT itself configure required approval. If unavailable,
   do not run this workflow without an equivalent independently approved gate.
4. Environment variables: `OSLO_STAGING_CLOUDFLARE_ACCOUNT_ID` = reviewed account
   `f40d632e8a57c44d9059ed316e22b80d`, and `OSLO_STAGING_APPROVED_CANDIDATE_SHA` =
   reviewed full 40-character commit. Never set to a moving branch name.
5. Environment secrets: separate `OSLO_STAGING_CLOUDFLARE_API_TOKEN` and
   `OSLO_STAGING_ACCESS_TOKEN`. No production/device tokens. Use minimum Cloudflare
   Worker-edit permissions needed in this account; account-wide edit authority is
   still a risk and must not be mistaken for per-script authorization.
6. Confirm `transitcore-oslo-staging` is absent or is the explicitly owned Oslo
   staging Worker. STOP if an unexpected Worker owns the name. Confirm workers.dev
   subdomain is `lgb84`, no custom production routes and no inherited bindings.
   No resources have been created by local preparation.

## Controlled deploy after separate approval

### Two-part publication

Publish the reviewed engine/diagnostic changes and integration tests on a separate
candidate branch, never merge that branch as part of bootstrap. Record its full SHA.
The separate bootstrap PR to updated main contains exactly these seven files:

```
.github/workflows/oslo-staging-deploy.yml
deploy/oslo-staging/entry.mjs
deploy/oslo-staging/wrangler.json
scripts/oslo-staging-policy.mjs
scripts/oslo-staging-deploy.mjs
scripts/oslo-staging-smoke.mjs
docs/OSLO_STAGING.md
```

The wrapper on main is a trusted comparison reference, NOT imported/executed by
preflight or the deploy runner. The actual bundle uses the candidate wrapper and
engine. Policy, runner and smoke code execute from the immutable workflow SHA on
main; the smoke validator imports the existing main PixelFrame validator only.
The guard still requires candidate wrapper/config to match the trusted copies.

Preflight checks out the exact candidate SHA with credentials not persisted, then
runs its Oslo integration test and regression scripts in a dedicated step. It has
no Environment, no secrets and only contents:read token permission. Tests can alter
their own runner files/environment, but deploy is a different GitHub-hosted job
with fresh checkouts. No artifacts, cache, outputs or test-generated environment
variables are consumed there. `needs: preflight` carries success/failure only;
the original workflow input supplies the SHA, never a test-generated value.
Deployment rechecks clean checkout, SHA, account, exact config and wrapper before
using the separately approved environment credentials. A compromised test can lie
about its own assertions; immutable candidate review remains mandatory.

Environment branch policy allows main (the workflow ref), even when the candidate
SHA is on a feature branch. Required reviewers must be configured manually.
The existing bus bootstrap-diff check does not cover these Oslo paths: independent
review of the seven-file PR is required. User-confirmed CF settings: main production
branch, previews disabled, versions upload command and include paths worker/*,
core/* and package manifest/config files. The seven-file bootstrap avoids those
paths; engine changes must stay off main. Reconfirm settings before publication.

- Commit/push require new authorization. Review an immutable candidate SHA.
- Dispatch `Manual isolated Oslo staging` from main with that SHA. Preflight has no
  deploy secrets, checks a clean checkout and exact no-bindings config, then runs
  all test scripts. Environment approval gates the deployment job.
- Trusted runner checks repository/ref/event/account/approved SHA again; Wrangler
  4.43.0 is installed outside candidate with npm hooks disabled. Dry-run and deploy
  target only the Oslo config/name. Runtime token goes via stdin secret bulk, not
  command line. CLI output is suppressed to prevent credential leakage.
- A first deployment fails closed until secret installation. Secret installation
  may itself create a version. Smoke waits 10 seconds, then performs read-only
  HTTP checks with 15-second request timeouts. If propagation is slower, it fails
  safely; no automatic redeploy, secret rewrite or rollback. Investigate before retry.
- Smoke checks HTTP200, exact SHA/environment, fresh PixelFrame, 201 LEDs, metadata,
  evidence semantics, bounded 256 KiB body, anonymous401 and blocked endpoints404.
  No fixed active-train count. Actual departure alone permits PASSED.

## Test and acceptance protocol

Local tests cover real wrapper + adapter + renderer, synthetic active forecast,
valid empty, filtered empty, one null quay ->503, cache reuse and recovery at20s,
wrong profile/count/outcome/future time, auth/route restrictions, forbidden config.
Existing Oslo tests cover actual arrival/departure, ambiguities, multiple occupants,
GraphQL faults and saved Entur replay. Fixtures are not production observations.

All44 test scripts passed across full run + network-enabled enrollment rerun.
Existing bus-staging files, profiles, UI, firmware and other engines are unchanged.
Cloudflare bundle/deploy and live HTTPS have NOT been executed locally.

After approved deploy: collect10–15min at normal10s polling, repeat at another time.
Measure real Cloudflare CPU, wall time, cache age/hits, provider requests, errors,
timeouts and log volume. Cache is per isolate, not globally deduplicated. No DO
reads/writes should exist. Compare counts and states with captured responses at
fixed time; do not equate forecast dwell with physically measured train position.
Require validempty vs filteredempty vs invalid source to remain distinct. Fault
injection uses local tests; never corrupt production/Entur data for staging tests.
Before any production decision, inspect client behavior on503 (existing Oslo web
clears LEDs), actual query freshness and the unresolved direction mappings.

## Local bootstrap/preflight verification (2026-10-19)

An archive of local origin/main d7266f58167cee8359370d71a3038fe5fc9460d8
plus exactly the seven bootstrap files was inspected outside the working tree.
Existing main contents matched (allowing Git archive CRLF conversion), with no
candidate engine export and no candidate integration test added to main. Trusted
policy and smoke imports worked; production target, routes, DO and service bindings
were rejected. Runner rejected non-workflow execution; guard rejected the dirty
uncommitted candidate, as required. Workflow inspection confirmed separate hosted
jobs, fresh SHA checkouts, no test secrets/environment, and no artifact/cache/output
transfer. Main's wrapper was deliberately not executed.

Candidate tests ran in child processes with an environment-variable allowlist and
no credentials: 43 passed directly. Enrollment initially failed because public
GitHub access was unavailable; its rerun passed fully offline with public config
GETs served from local files and all other external fetches forbidden. The test's
registry/status objects are in-memory mocks. No production data was accessed.
Targeted Oslo integration, Oslo engine and existing staging-policy tests passed;
git diff --check passed. This is local simulation, not GitHub-hosted execution or
a successful immutable candidate deployment: a new committed candidate SHA does
not exist yet. Recheck against updated main and the actual SHA before publication.

## Rollback

Record current Oslo-only version and settings before each approved update. If smoke
fails, stop and inspect; do not change production or bus-staging. Restore the last
reviewed Oslo-only version via a separately approved Cloudflare action, preserving
the Oslo access secret and no-bindings boundary. First deployment has no previous
version: disable/delete only the new Oslo Worker after approval. Production has
no traffic route to this Worker, so no production traffic rollback is needed.

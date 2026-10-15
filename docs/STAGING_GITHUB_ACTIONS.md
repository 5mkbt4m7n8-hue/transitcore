# Manual isolated TransitCore staging

Local preparation only, 2026-10-14. Nothing has been committed, pushed, created
in Cloudflare or deployed. Existing production devices must keep their URLs.

## Target and isolation

- Worker: **transitcore-staging**, in the existing Cloudflare account.
- Account ID: f40d632e8a57c44d9059ed316e22b80d (identifier, not a secret).
- Config: deploy/staging/wrangler.json; entry: deploy/staging/entry.mjs.
- Binding DEVICE_STATUS -> **UnifiedBusStaging**, a class owned by this new
  Worker, with its own SQLite namespace/migration. No production script_name.
- The class reuses DeviceStatus and the Unified Engine, not a separate engine.
- Public surface: authenticated GET frame and diagnostics for the five test
  board sizes only. No registry, device status/config, Fleet, publishing or OTA
  HTTP endpoints. No scheduled handler or cron configuration.
- Profiles are bundled from the exact candidate checkout, never raw/main.
- STAGING_ACCESS_TOKEN is a new staging-only secret. Without it all requests
  fail closed (401), including the interval before first secret installation.
- No production device registry, telemetry, soak history or tokens are copied.
- PixelFrame v1 remains unchanged. Environment and source SHA are HTTP headers.

Same-account isolation does **not** isolate account quotas, billing or the
permissions of a broadly scoped deployment token. The account and upstream
provider capacity remain shared. Begin with bounded manual requests, not soak
or load generation. No test data or request may target production URLs.

## Workflow and trust boundaries

### Security review follow-up (2026-10-15)

The PR safety job now uses `pull_request_target`, executes ONLY the base SHA's
guard, fetches the PR Git objects without checking out/executing PR code, and
verifies FETCH_HEAD against the event's exact head SHA. It examines the entire
base-to-head diff with rename detection disabled and NUL-delimited paths.
Both sides of a rename are checked. All changed paths must belong to the exact
eight-file bootstrap allowlist; deletion, symlink, submodule and executable
entries are rejected. Extra files under deploy/staging are not implicitly safe.
There is no workflow path filter. Unrelated PRs with no staging paths return
not-applicable; any PR touching staging is checked in full. This deliberately
requires staging changes to be split from engine/profile/web changes.

Require the `bootstrap-diff` check in main's branch protection/ruleset, restrict
bypass, and require the branch to be up to date before merge. A green check on
an older base does not approve a newer base. PR code cannot weaken the base
policy by changing its own workflow/guard. Changes to the trusted policy still
require human code review: a path allowlist is not a code-content audit.

FIRST-INSTALL LIMITATION: this target workflow/guard is not yet on main, so it
cannot independently validate its own initial installation. Do not claim that
the initial bootstrap PR is protected by this new CI job. Its exact diff must
be reviewed using a trusted out-of-band copy, or an organization-required
workflow must be installed separately. Until that trust anchor is approved,
initial publication is BLOCKED. No bypass/fallback to executing PR code exists.

Deploy now also requires the staging Environment variable
`STAGING_APPROVED_CANDIDATE_SHA` to equal the exact dispatched 40-character SHA.
The reviewer sets this non-secret pin only after reviewing the candidate diff;
missing/mismatched pins fail before dry-run/deploy. This is an additional
accidental-selection guard, not a replacement for required Environment review.
Limit who may edit Environment variables, and confirm the pin and input when
approving. No production or staging runtime config is changed by this pin.

Local follow-up validation: test-staging-deploy, test-unified-staging,
test-unified-release and test-unified-bus-engine all PASS; Node syntax checks
for guard/runner and git diff --check PASS. Negative cases include mixed PRs
with worker/core/web/config/root dependency/unapproved workflow paths,
unapproved staging files, unusual filenames, rename source paths, deletion,
symlinks, submodules, executable entries, empty input and approval-pin failures.
These are local policy/regression tests, NOT a remotely executed GitHub PR.
No commit, push, merge, deployment or manual settings change was performed.

The deploy workflow has only workflow_dispatch, requires main as the workflow
ref, and accepts only a lowercase full 40-character candidate commit SHA.
There is no branch-name/default-latest fallback and no user-supplied CLI flags,
Worker target, account, config path or repository.

1. Preflight checks out trusted orchestration at github.workflow_sha and the
   candidate at the input SHA. Checkout credentials are not persisted.
2. It verifies the candidate HEAD, pristine checkout, exact config and exact
   staging wrapper against the trusted workflow copy; local environment files
   are forbidden. It runs the candidate tests without Cloudflare secrets.
3. A separate fresh-runner job waits for Environment staging approval.
4. The job installs pinned Wrangler 4.43.0 outside the candidate, with npm
   lifecycle scripts disabled. Actions themselves are pinned by commit SHA.
5. Trusted runner repeats the checks, performs a dry-run and deploys only the
   explicit staging config/name. It then installs STAGING_ACCESS_TOKEN via
   stdin to secret bulk (never a command argument/file/artifact) and performs
   an authenticated smoke test on the staging hostname.
6. Source SHA, environment header, PixelFrame schema, board and LED count must
   match. Secret-tool output is redacted defensively. No automatic rollback,
   production deployment, token rotation, device provisioning or retry exists.

If smoke/secret installation fails **after** deployment, the job fails but the
staging deployment may already exist. Inspect staging only; do not claim that
failure undid deployment. Preserve logs without secrets. Rollback is a reviewed
manual rerun with a prior compatible candidate SHA, or staging-only rollback
in Cloudflare. Code rollback is not a storage rollback.

The guards reduce accidental deployment risk; they are not a sandbox for
malicious engine code. Review the complete candidate diff before approval.
Changes to the wrapper/config require a reviewed bootstrap update in main;
otherwise exact comparison rejects the candidate.

## Safe bootstrap to main — separate approval required

GitHub requires the workflow file on the default branch for workflow_dispatch.
Do **not** merge the existing unified-engine branch merely to install it.

Prepare a separate, later bootstrap PR containing only:

- .github/workflows/staging-deploy.yml
- .github/workflows/staging-config-check.yml
- deploy/staging/entry.mjs
- deploy/staging/wrangler.json
- scripts/staging-deploy-guard.mjs
- scripts/staging-deploy-runner.mjs
- scripts/test-staging-deploy.mjs
- docs/STAGING_GITHUB_ACTIONS.md

The wrapper is inert source on main; the bootstrap safety test does not import
the not-yet-merged engine. Only a subsequently reviewed candidate SHA containing
the engine, profiles and tests can pass deployment preflight.

The audited Cloudflare includes are worker/*, core/*, package.json,
package-lock.json, npm-shrinkwrap.json and .npmrc; excludes are *.md,
*.test.mjs and worker/wrangler.preview.toml. None of the eight bootstrap paths
matches an include. Tests check this conservatively. Recheck dashboard filters
and the exact bootstrap PR file list immediately before merge; tests do not
query live Cloudflare settings.

Do not include worker/, core/, config/, web/ or root dependency files in that
bootstrap PR. The existing branch contains these and is NOT a safe bootstrap.
Publishing a candidate feature branch may still trigger Cloudflare versions
upload under the current integration, but not production promotion. Review
that preview configuration/command again before the separately authorized push.

GitHub Pages builds from main/root. A bootstrap merge may rebuild Pages and
make these non-secret source files available, although it changes no live web
client. This is not a promise of zero publishing side effects.

## Manual GitHub settings — user performs after approval

Repository Settings -> Environments -> create **staging** BEFORE any dispatch.

1. Add required reviewer(s) who can review the candidate SHA and the preflight
   result. Enable prevent self-review and disallow administrator bypass where
   available. If only one user is available, resolve the reviewer arrangement
   explicitly; do not silently remove approval protection.
2. Deployment branches/tags: selected branches, **main only**. The workflow is
   from main; candidate code is separately pinned to the reviewed SHA.
3. Environment variable:
   STAGING_CLOUDFLARE_ACCOUNT_ID = f40d632e8a57c44d9059ed316e22b80d.
4. Environment secrets (NOT repository-wide secrets):
   - STAGING_CLOUDFLARE_API_TOKEN: new dedicated Cloudflare deployment token.
   - STAGING_ACCESS_TOKEN: independent random high-entropy token, at least
     32 characters, only for the staging HTTP surface.
5. Confirm required reviewers really appear in the environment settings.
   YAML naming an environment does not create its approval protections.
6. Protect main and require review for workflow/guard changes. Keep Actions
   default token permission read-only. Do not pass production application
   secrets into this workflow.

No real secrets should be pasted into chat, config JSON, commits or test logs.
The setup deliberately needs no local wrangler login or local Node installation.

## Manual Cloudflare settings — user performs after approval

1. Record current production version/traffic; do not modify production.
2. Create a new API token restricted to this account with only permissions
   required for Worker script deployment/secrets and its own DO migrations
   (Workers Scripts Edit; add Account Settings Read if required by the account's
   CLI authorization). No production zone routes, R2, KV, D1 or DNS permissions
   are needed by this staging config. Verify granted permissions before use.
3. Prefer per-resource restriction to transitcore-staging if the account's
   token system supports it. Do not assume an account-scoped Workers Scripts
   Edit token cannot modify production. Environment approval and fixed target
   guards are mandatory compensating controls in this same-account design.
4. Put that token only in the GitHub staging environment secret above.
   Do not reuse the existing transitcore build token or runtime secrets.
5. Do NOT connect transitcore-staging to Cloudflare Git Builds. GitHub Actions
   is its only deploy path. No cron, custom domain, production route or service
   binding is added.
6. A later approved first Actions deployment creates the Worker and its own
   namespace. Afterwards inspect that DEVICE_STATUS points to the staging
   class/namespace, record its ID and confirm no production binding.
7. Confirm the workers.dev subdomain is still lgb84 (smoke test is deliberately
   fixed to transitcore-staging.lgb84.workers.dev), and set budget/usage alerts.

Do not manually create a placeholder production-linked DO or copy registry
data. If a Worker named transitcore-staging already exists, stop and inspect
its owner, routes, bindings and secrets before the first run; do not overwrite
an unrelated service.

## First run — NOT authorized by this preparation

After bootstrap PR review/merge, environment setup and separate approval:

1. Commit/publish the complete candidate through a separately approved step;
   obtain its immutable SHA. It does not have to be merged to main.
2. Actions -> Manual isolated TransitCore staging -> Run workflow -> branch
   main -> paste the reviewed 40-character SHA. Never substitute a branch.
3. Verify preflight PASS and review the SHA/diff before approving environment.
4. Inspect logs and smoke result; record staging deployment/version/namespace
   IDs and source SHA. Confirm production version and 100% traffic unchanged.
5. Only then approve bounded functional/performance tests. No ESP URL changes.

The current uncommitted candidate has no deployable source SHA yet. Do not use
the current main SHA as a substitute: it lacks the candidate implementation.

## Local validation and remaining gates

Automated negative tests cover target/account/SHA, production bindings, build
hooks, cron, service/storage additions, OTA/admin variables, workflow event/ref,
missing secrets, no automatic deploy trigger and bootstrap path isolation.
Staging endpoint tests cover authentication failing closed, five board sizes,
shared engine, source headers and absent device/OTA/publish endpoints.

Local suite: 46 scripts plus four Worker tests passed (50 executions total),
including existing frame/Trondheim/Fleet/soak regressions. git diff --check
passed. Actions has not run remotely; environment approvals, CI installation,
Cloudflare permissions and actual resource isolation still need first-run
verification. A local policy test is not a live deployment result.

Local dry-run: 2412.87 KiB bundle / 224.94 KiB gzip, correct UnifiedBusStaging
binding. This proves bundling only, not deployment, permissions, DO creation,
environment approval or Cloudflare performance.

Next approval point: review the eight-file bootstrap plan, same-account token
risk and manual environment settings. No commit/push/merge/resource creation/
deployment is included in the local preparation.

References:
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch
- https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- https://developers.cloudflare.com/durable-objects/reference/environments/

<!-- TEMPORARY CI TEST: allowed staging documentation path. Draft PR only; never merge. -->

# GPS V2.16 — source validation and current-frame diagnostics

## Evidence collected 2026-11-02 (Europe/Oslo)

Baseline: main `2c470da5251a94593e8e00edc421fd4ef9b7d1b8` (PR #319).
Read-only Cloudflare deployment page showed `de012e2b` at 100% traffic.
This alone does not identify the Git commit in that deployment.

At 12:53, live Entur Transit Data `line.journeyPatterns.quays(first:200)`
returned 8 patterns for `ATB:Line:2_1` and 7 for `ATB:Line:2_11`.
Every connection had `hasNextPage:false`. Compared by pattern ID, direction
and full ordered Quay list, all matched the checked-in pilot inventory.
The live API returned a different pattern order: array indexes are private
implementation references, not authoritative direction or physical evidence.

Journey Planner `stopPlace.quays.estimatedCalls.serviceJourney.journeyPattern`
independently returned these planned assignments:

| Site / line | Source direction | Quay | Public platform |
|---|---|---|---|
| Tonstadkrysset / 1 | inbound AND outbound | NSR:Quay:102733 | 1 |
| Lerkendal / 1 | inbound | NSR:Quay:73729 | 1 |
| Lerkendal / 1 | outbound | NSR:Quay:102720 | 2 |
| Lerkendal / 11 | inbound | NSR:Quay:73420 | 4 |
| Lerkendal / 11 | outbound | NSR:Quay:73421 | 3 |

Selected authoritative sequences (numbers below are Quay suffixes):

* Line 1 inbound: 71518 → **102733** → 103404;
  71981 → **73729** → 71204.
* Line 1 outbound: 107264 → **102733** → 71517;
  102719 → **102720** → 71982.
* Line 11 inbound: 102719 → **73420** → 73414 (Lerkendal gård).
* Line 11 outbound: 73415 (Lerkendal gård) → **73421** → 71204.
* One outbound line 11 pattern does not traverse Lerkendal; do not assume
  every trip on the line serves the focus site.

The Journey Planner response included a **reported actual arrival** at
Tonstadkrysset 102733, 12:53:28+01:00, inbound service journey
`ATB:ServiceJourney:1_251215112546071_105`. Actual departure was null.
The other pilot calls at Lerkendal were forecasts with null actual times.
Realtime=true and expected times alone are not observed arrival evidence.

A separate SIRI-VM XML read at 12:55:37 returned an explicit MonitoredCall
VehicleAtStop=true at 102733, recorded 12:55:34.256+01:00, line 1.
It also contained old at-stop records elsewhere: freshness must be checked,
not inferred from HTTP 200. No focus-site Lerkendal at-stop report was
observed in this bounded sample. Initial SIRI request without XML Accept
did not produce parsable XML; repeating once with Accept:application/xml
succeeded. No source error was interpreted as zero buses.

These are source-reported events, not independent roadside observation.
Neither event has been joined to a particular production HMAC lock.
No claim of physically validated GPS direction or correct road side follows.
Quay coordinates/platform codes establish planned locations, not which side
a sampled vehicle actually occupied. The opposing Lerkendal Quays are close
enough for overlapping 85m shadow candidate circles.

## Identical new production-frame comparison

Subtracting two reads of the SAME paired daily counters, latest production
sample 12:50 → 12:55 (baseline read 12:53:42, follow-up 12:55:37), yielded
one new paired frame per line. No whole-day totals were treated as new data.

| Line | 180s matched | 240s matched | 180s candidates | 240s candidates | 180s Locked | 240s Locked |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 6 | 0 | 3 | 0 | 2 |
| 11 | 0 | 4 | 0 | 4 | 0 | 3 |

There were no lost matches in this interval. The longer memory preserved
more source hypotheses; this small sample does not establish higher accuracy.
Locked counts are observation counts, can repeat an existing lock, and are
not unique buses or newly proven passages. These are pre-V2.16 diagnostics
and remain subject to the counter defect below.

## Reproduced V2.15 defect and narrow correction

The engine intentionally retains a historical track after rejecting a new
GPS observation outside the radius or incompatible with its sequence.
The follow-up classifier previously classified that unchanged historical
track, including its old lock, as current-frame evidence. A new regression
failed on V2.15 (`directionReasonLocked` was 1 instead of 0).

V2.16 requires the post-ingest track's lastSeen to equal the current ingest
time before counting follow-up support. An unaccepted observation falls in
the existing NoAfter bucket. This covers outside-radius, rejected sequence,
direction conflict and hypothesis-limit paths without changing the engine.
Historical daily records are not rewritten. The public report exposes
diagnosticRevision=216 and explains the mixed-history limitation.

Regression tests exercise both lines and both 180s/240s stores, successful
locks after recreation, outside-radius rejection, in-radius backward-sequence
rejection, later accepted stationary follow-up, numeric reason partition,
sanitization, and unchanged input frames. Existing privacy/expiry/isolation,
route-shadow and active frame/LED suites also pass.

Active GPS matching, GPS radii, LED/physical-board logic, source polling,
snapshot format, expiry and alarm policy are unchanged. Changes under
worker/ match the reported Cloudflare watch paths; web-only changes would
not establish a Worker deploy. Confirm CI, merge SHA, actual Cloudflare
deployment and runtime diagnosticRevision separately.

## Remaining limitations

* GPS-sequence locks are self-reinforcing hypotheses: direction filters
  later candidates; a conflicting observation is rejected while the old
  track survives. V2.16 corrects counting, not this tracking policy.
* Accepted same-Quay stationary follow-ups may still count Locked; no new
  move or passage is implied. Pattern-index jumps skip unobserved Quays.
* There is no exact journey/vehicle/date/Quay/time join from the public
  numeric report to SIRI/actual calls. Aggregate evidence cannot measure
  a physical false-lock rate or certify individual locks.
* Snapshot invalidation fingerprints board geometry, not pattern contents.
  A future inventory change needs explicit snapshot invalidation; the live
  inventory checked here is identical by ID and sequence.
* The focused audit performs no source polling in production and persists
  no raw vehicle identifiers or vehicle coordinates. Further physical
  validation needs a bounded, fresh, exact journey/event correlation and
  independent side-of-road evidence where required.

Sources: [Journey Planner](https://developer.entur.no/docs/open-services/journey-planner),
[Entur realtime](https://developer.entur.no/open-data/realtime),
[Norwegian SIRI-VM profile](https://entur.atlassian.net/wiki/spaces/PUBLIC/pages/637370425/).

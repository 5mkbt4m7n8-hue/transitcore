# Bus arrival/departure accuracy — local shadow candidate

Date: 2026-10-12. Base: main `263ad4e`. Branch: `agent/bus-arrival-departure-accuracy`.

**Not deployed or production-enabled.** The following report records the initial shadow-only investigation. The subsequent local Bus1 activation candidate now adds a guarded Worker integration, one test-board flag and a frame-driven web view; see [BUS1_ACTIVATION_PARITY.md](BUS1_ACTIVATION_PARITY.md) for current scope and release blockers. Statements below about new-files-only, unchanged profiles and no production imports describe the initial investigation, not the complete current working diff. No physical board or other worktree has been changed.

## Findings in current code

### Bus1: verified mechanism, physical incident causality still likely

`interpretStationVehicles` in `core/engines/position-interpretation.mjs` filters destination/quay and picks the nearest eligible node. Both `trondheim-bus-board` and the 8-LED `trondheim-bus-1-visual-test` use arrival 85 m, approach 250 m, freshness 90 s. Distance <=85 m directly yields AT_STOP; there is no speed/dwell condition there. Provider timestamps are retained; newest observation per vehicle wins.

`applyMotionLifecycle` in `worker/led-feed-worker.mjs` begins departure when the incoming state changes from AT_STOP to APPROACHING, not when movement begins inside the radius. Its stationary anchor principally supports PARKED/optional arrival confirmation. Neither bus profile sets `atStopConfirmationSeconds`, so the station renderer defaults to zero. This explains a reproducible delay until the 85 m boundary is crossed. It does not prove the exact cause of an unrecorded physical incident.

Important profile difference: `stabilizeMotionFrame` defaults to 10 s afterglow for `trondheim-bus-board`, but **zero for the Bus1 visual test board** (unless explicitly configured). With zero it bypasses the lifecycle entirely. Thus the bench can show AT_STOP -> APPROACHING, without PASSED. We do not modify either profile. Tests report the raw bench baseline and the shared lifecycle baseline separately.

Nearest-quay/destination matching is not road map matching. Current provider query uses publicCode and destination, not exact lineRef, journey, speed or heading. The local diagnostic queries exact lineRef and serviceJourneyId, avoiding UNI/NBU ambiguity; no production provider contract is changed.

### FB73: verified ETA-window mechanism, not a physical position feed

`config/routes/flybuss-trondheim-fb73-live.json`: exact `UNI:Line:FB73`, provider UNI, strategy `estimated-station-calls`. `liveStationArrivals` requests arrival/departure estimates but chooses expectedArrivalTime, then aimedArrivalTime, before considering departure as a missing-arrival fallback. It displays AT_STOP for +/-45 s around that time, including before expected arrival. It does not inspect actualArrivalTime, actualDepartureTime, realtime, predictionInaccurate or cancellation. Arrival window therefore keeps AT_STOP after an earlier departure. Repeated arrival updates can move the window again.

Journey identity is ServiceJourney.id; the legacy selection does not include service date in visit memory. Quays come from configured stopIds and direction metadata. The diagnostic preserves exact quay + journey + service date; it does not substitute another operator's similarly named line. The existing route includes 26 stop rows with directional quays (existing coverage test passes). Physical correctness of every quay requires field verification; no geometry is edited.

### Cache, polling and history

- Vehicle provider shared cache: 8 s, per endpoint/codespace. It preserves source timestamps. Repeated cached observations must not count as fresh dwell confirmations.
- Board/profile configuration cache: 5 minutes; not a vehicle cache.
- Worker frame responses: `Cache-Control: no-store`; rebuilt on request. No added cache/request rate in this change.
- Normal PixelFrame TTL: 30 s. TTL is expiry protection, not refresh frequency, and cannot prove current vehicle movement. GPS input can already be up to 90 s old in the existing station model.
- ESP polling in the reported setup: 10 s plus response latency. A stop shorter than the sample gap can be missed. Upstream age, shared cache and ESP sampling add latency; they should not simply be summed as a guaranteed worst-case without correlated timestamps.
- FB73 `pollIntervalMs=30000` is consumed by `web/lab`; it is not a forced 30 s Worker polling interval. Journey Planner is fetched by the Worker request.
- Existing station empty-frame hold is optional/default zero. Grakall-specific 300 s TTL/hold is unchanged and not part of this bus experiment.

## Actual source investigation, not simulated GPS

Read-only Entur queries on 2026-10-12:

| UTC time | Observation |
| --- | --- |
| 02:45:31, 02:46:17, 02:49:53 | HTTP 200 for `vehicles(codespaceId:"UNI")`, empty vehicles |
| 02:49:53 | `NSR:Quay:100211` resolves to Trondheim lufthavn. Upcoming exact UNI:Line:FB73 calls had realtime=false, expected=aimed, actual arrival/departure null |
| 02:54:27 | Diagnostic: exact ATB:Line:2_1 returned vehicles 1564/1566 with source times 02:36:23.754/02:44:05.180 UTC; stale and excluded by candidate. Journey IDs were present |
| 02:54:27 | Diagnostic: UNI GPS empty, but current/near-future FB73 calls at multiple configured quays returned exact UNI journey IDs; examined calls were timetable-only, actual fields null |

This is 04:45–04:54 Oslo, a limited early-morning sample, not an all-day survey. **FLYBUSS GPS AVAILABLE: UNKNOWN.** No fresh UNI FB73 vehicle sample, refresh cadence, vehicle/journey correlation or full-route coverage was demonstrated. Do not interpret an empty result as permanent absence of GPS. No NBU observations were used as UNI evidence.

Entur's live EstimatedCall schema supports actualArrivalTime, actualDepartureTime, cancellation, realtime and predictionInaccurate. Schema support does not mean FB73 populates them. Repeated successful HTTP responses with timetable data are not fresh physical observations.

Primary references checked:

- [Entur Vehicle Positions](https://developer.entur.no/apis/graphql/vehicle-positions): endpoint, ET-Client-Name, vehicle/journey data.
- [Entur realtime data](https://developer.entur.no/open-data/realtime): estimated/actual timing and vehicle position datasets.
- [Flybussen realtime information](https://flybussen.no/en/real-time-information/): operator describes Connect FB1/FB3/FB5, not a verified FB73 GPS service. No alternative documented public FB73 operator GPS API was found.

If reliable FB73 positions are later captured, join exact lineRef + serviceJourneyId + service date with quay sequence, and verify repeated source timestamps/route coverage. Let fresh matched GPS inform departure while stop calls retain forecast context. Do not fuse by publicCode alone. Fusion is intentionally not enabled without that evidence.

## Shared candidate design

`stop-evidence.mjs` has provider-neutral GPS and call evidence adapters. The Entur call adapter is at the provider boundary. Both evidence types pass through **one** `reduceStop` reducer, not product-specific state machines. Caller-owned history is keyed by vehicle/line/journey/destination for GPS and line/journey/date/quay for calls. Idle visit history expires after 10 minutes. It is local diagnostic state, never a second production registry.

`stop-accuracy-shadow.mjs` selects logical nodes; existing `mapLedStates` performs physical mapping, existing `renderStationFrame` produces PixelFrame v1 and existing validator checks it. PASSED uses existing `state:AT_STOP`, `lifecycle:PASSED`, dimmed brightness encoding. Diagnostics/confidence stay outside the frame. Original colors, hardware cap and occupants are preserved. Current production renderer/lifecycle files are not edited.

Provisional GPS policy (not physically calibrated):

- Fresh source timestamp <=30 s; reject future positions, missing direction and impossible >45 m/s jumps.
- APPROACHING within 250 m. AT_STOP requires <=25 m **and** separate fresh samples, >=5 s close observation span and <=1 m/s between samples. This is not just lowering the legacy 85 m radius.
- After arrival, require two consecutive outward changes >=5 m each, >=1.5 m/s, and >=18 m displacement from arrival anchor. Distances/speed use observation times, not polling time.
- Arrival remains latched during small GPS jitter. Departure stays latched for the visit; PASSED lasts 10 s then OFF. A clear stop/route advance releases the visit.
- Missing/stale/invalid observations give OFF/uncertain diagnostics, not an invented departure. Duplicate/out-of-order GPS does not advance dwell or movement counters.

ETA policy:

- Before expected arrival: APPROACHING (within 120 s), not early AT_STOP.
- Between arrival and expected departure: possible AT_STOP; unconfirmed dwell capped at 20 s. Missing departure uses that bound. Equal arrival/departure can skip AT_STOP; do not invent a physical stop to force all states to appear.
- Actual arrival/departure take precedence if supplied; `confidence=reported`. Otherwise explicitly `forecast` or `timetable`, not confirmed.
- Revised later forecasts may reopen an estimated visit; confirmed actual departure is not undone by an old estimate. Older response timestamps cannot overwrite newer evidence.
- Cancellation/inaccurate prediction/missing response -> OFF, no manufactured departure. Afterglow is measured from the departure estimate/event, not endlessly restarted by fetching it.
- receivedAt describes response freshness only. Without upstream update timestamps it cannot detect an operator re-serving an unchanged stale prediction. Route/timetable data cannot reveal an unreported delay or drive-through.

## Identical-input synthetic comparison

`node scripts/test-stop-accuracy.mjs` prints complete per-sample old/new transitions. These are **synthetic** GPS movements, not field measurements. Old GPS uses the real unchanged builder and lifecycle. Six ETA baseline samples are additionally compared against the actual Worker HTTP route with isolated upstream fixtures.

All times below are seconds relative to each fixture's start. GPS samples are 10 s apart and proceed through the stop (positive -> near zero -> negative signed position).

| Fixture | First stopped sample | First moving sample | Old AT_STOP ends / lifecycle PASSED | New PASSED | Improvement |
| --- | ---: | ---: | ---: | ---: | ---: |
| Normal stop | 20 | 50 | 80 | 60 | 20 s earlier |
| Short stop (10 s observed dwell) | 20 | 40 | 70 | 50 | 20 s earlier |
| Long stop | 20 | 170 | 200 | 180 | 20 s earlier |
| ETA arrival 0 / departure 10 | 0 (simulated truth) | 10 | 50 | 10 | 40 s earlier AT_STOP end |

GPS arrival tradeoff: old AT_STOP starts at t=10 (50 m away); candidate starts t=30, **20 s later than old and 10 s after first stopped sample**. Candidate departure is 10 s after the first moving sample, versus old's 30 s. Physical departure between samples remains interval-censored, not known exactly. ETA is only as accurate as its input; 40 s is a window-reduction result, not measured road accuracy.

Negative/edge sequences cover queue at 50 m, continuous pass-through, GPS jitter, missing/delayed/future/jump data, duplicates/out-of-order, multiple vehicles, departing+arriving occupants, wrong line/direction/quay, cancelled/delayed ETA, actual events, partial identity, history expiry and sub-poll stops. No false arrival/departure in those negative fixtures. A stop visible in only one GPS sample is intentionally **not confirmed**.

Unresolved physical limitations: a queue stopped within 25 m can be indistinguishable from a boarding bus without door/stop events; slow departure under thresholds can still lag; headsign is not a measured road heading; geometry/quay errors and long GPS drift can still mislead. No production accuracy or zero-error claim.

## Local live diagnostics (no deployment / no hardware)

From this worktree:

```sh
node scripts/diagnose-stop-accuracy.mjs --live --samples 1
node scripts/diagnose-stop-accuracy.mjs --live --route flybuss-trondheim-fb73-live --samples 1
node scripts/diagnose-stop-accuracy.mjs --live --samples 60
node scripts/diagnose-stop-accuracy.mjs --replay normalized-samples.json
```

Default route is Bus1, using the real 8-LED bench profile. Other routes use an in-memory logical view of their existing catalogue nodes and identity mapping; **not a published/flashable hardware profile**. FB73 comparisons are ETA-only; any captured GPS is reported separately and never silently fused.

Output is NDJSON on stdout: exact source inputs, timestamps, identity, distance/ETA, inferred speed, logical LED, old/proposed physical LED states, reason and confidence. No admin tokens, device credentials or production endpoints. Capture/replay inputs are `{now,vehicles,calls}` arrays for replay. NDJSON captures need their `input` objects collected into that array. Files are not written automatically.

Requests are direct read-only Entur GraphQL POSTs: one vehicle query/sample; FB73 adds one batched stop-call query. Minimum 10 s delay after each completed sample, default one sample, maximum 360. Errors do not poll in a tight loop. Diagnostic call query uses 30 departures/quay versus production's 6 to reduce busy-stop truncation; a missing call is still not proof of cancellation. Production provider/cache/rate is unchanged.

Controlled next test: simultaneously observe a few real stop arrivals/departures and record local shadow output during service hours, including queues and short stops. Compare source timestamps and transition intervals to field times. Repeat exact UNI GPS lookup across running trips; ask operator/Entur about FB73 realtime availability if still empty. **Ready for read-only controlled live comparison; not ready to drive boards or activate new production logic.**

## Verification and changed files

- 42 local test scripts passed (all `scripts/test-*.mjs`, `scripts/test-*.cjs`, `worker/*.test.mjs`). Node subprocess fixture tests require permission outside the default process sandbox; first sandbox EPERM was environmental, subsequent complete run passed.
- 57 frozen frame regressions and 388 Trondheim comparisons passed, including Grakall, Bus1, health/Fleet/soak and firmware source guards.
- New targeted script: 22 grouped checks, including six real Worker ETA baseline comparisons. No ESP compile/flash needed: firmware is untouched.
- Local live diagnostic smoke succeeded for both routes; limited early-morning observations above, not validation of arrival accuracy.

New files only:

1. `core/engines/stop-evidence.mjs`
2. `core/engines/stop-lifecycle-candidate.mjs`
3. `core/providers/entur/stop-call-evidence.mjs`
4. `core/frame/stop-accuracy-shadow.mjs`
5. `scripts/diagnose-stop-accuracy.mjs`
6. `scripts/test-stop-accuracy.mjs`
7. `docs/BUS_STOP_ACCURACY_CANDIDATE.md`

No production imports, existing code edits, config mutation, remote writes, commits, push, merge or deploy. No physical unit touched. Read-only controlled testing must precede any proposal to connect the candidate to the production pipeline.

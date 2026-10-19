# Oslo reliability review after #218

Base: d7266f58167cee8359370d71a3038fe5fc9460d8. Local work only.

## Findings before edits

- `liveMetroStationArrivals` requests 205 unique quays for the separate full-map
  board, 12 calls per quay, look-behind 75 s and approach horizon 120 s. A per-isolate
  20 s cache stores raw responses, not states. Calls are reevaluated at every frame
  timestamp. Different Worker versions/isolates can therefore see different samples.
- The interpreter treats missing/null quays and absent/null estimatedCalls as empty
  arrays. `{data:{}}` silently becomes a valid empty frame. Malformed lists throw;
  GraphQL errors are rejected by the Worker but not by direct interpreter callers.
- Filters can legitimately remove all calls: cancellation, non-realtime forecasts,
  inaccurate forecasts, missing line/journey identity, ambiguous/unknown direction,
  missing physical mapping, future/expired actual events, expired/out-of-window ETA.
- A stale actual departure supersedes ETA interpretation and removes that call;
  it must NOT fall back to an overlapping forecast. Actual arrival expires after
  90 s or >15 s after expected departure. Actual departure is visible for <10 s.
- Deduplication keeps one location per dated service journey/route, then combines
  occupants per LED. This reduces count but cannot by itself erase all accepted calls.
- Forecasts require realtime=true. Existing #218 explicitly accepts provider-reported
  actual events without that forecast flag (tested). Preserve this existing exception;
  do not weaken the realtime forecast requirement or synthesize PASSED.
- Saved revisjon.md, quay-counts.csv and entur-response.json were found in the sibling
  `2026-10-19/referenced-chatgpt-conversation-this-is-an-3/outputs` directory.
  Replay at the captured clock 2026-10-19T08:35:08.349Z confirms 205 valid quays,
  101 calls, 54 accepted calls, 43 journey candidates and 39 LEDs. At +10/+20 s:
  49/47 accepted calls, 41/39 journey candidates and 37/35 LEDs. No realtime rejects.
  This is the later sample, NOT evidence reproducing the reported historical 68→0.

## Direction review

For line 5, exact `Ringen via Tøyen` appears on BOTH direction rules at Ammerud,
Kalbakken and Stortinget: equal top scores, so the interpreter safely rejects it.
At Storo, `Vestli via Majorstuen` matches line 4 direction A, but neither line 5 rule.
Line identity therefore matters. The current query has journey ID and line but no
journey stop sequence/direction evidence. No historical journey IDs/stop sequences
were initially available; the saved response now confirms these mapping rejections
and journey identities, but does not provide authoritative stop sequences to resolve
direction. Do not infer new A/B rules from text. Profiles remain unchanged.

## Change boundary

Only Oslo interpreter, its existing Worker adapter, tests and this report are in scope.
No profile, renderer, schema, firmware, UI, other engine or Cloudflare changes.

## Implemented locally

- Interpreter: optional aggregate diagnostics, exclusive first-rejection counters,
  and explicit source errors for missing/null quays, malformed lists/calls or GraphQL
  errors. Legitimate empty and fully filtered responses remain valid empty frames.
- Worker: rate-limited structured aggregate logs (normal interval 60 s; changed
  outcome at least 10 s apart). No provider bodies, journey IDs or secrets logged.
  Invalid data follows existing HTTP 503 error path, never synthetic positions.
  Invalid cached payloads retain the existing 20 s TTL to avoid extra upstream calls.
- Existing Oslo test: fixed-clock source/filter/state/occupant coverage and real
  Worker route tests, including cache refresh at 20 s and unchanged PixelFrame v1.
- Existing feed-timing test: complete empty quay mock instead of invalid vehicles-only
  response for metro queries; assertions and production behavior not relaxed.

## Verification and remaining approval

All 43 existing test scripts passed across the full run and targeted reruns.
Enrollment requires public GitHub network access and passed with that access.
Includes 57 frozen frame regressions, 388 Trondheim comparisons, firmware compatibility,
and feed timing. `git diff --check` passed. Optional saved replay is reproducible via
`node scripts/test-oslo-network-map.mjs <path-to-entur-response.json>` and passed.
No fabricated historical fixture was committed or copied into the repository.

Additional cost: linear validation/counting over already fetched calls and a bounded
64-board in-memory log-throttle map. No additional Entur requests, DO writes or public
fields. Cloudflare CPU and log cost have not been measured in production.

Ready for review and a separately approved controlled staging test, not automatic
production rollout. Strict full-source validation intentionally returns 503 for a
single malformed/missing quay; this avoids silently presenting partial traffic as
complete. Existing client stale-frame policy remains unchanged. Historical incident
cause and the four direction rules remain unresolved pending authoritative evidence.
No commit, push, PR, deployment or production changes performed.

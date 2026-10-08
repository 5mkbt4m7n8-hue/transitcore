# Fleet soak monitoring

This is a local candidate. No firmware, profiles, PixelFrame, device provisioning,
or production deployment is changed. The existing authenticated Fleet API is used.
Neither Serial Monitor, a PC nor an open browser is required during monitoring.
The ESP must remain powered and able to send its usual status reports. On reopening
Fleet, server data includes any reported reboot and the archived previous period.
Serial output is optional debugging, not required evidence for these milestones.

## Evidence and status

- Monitoring starts automatically on the first accepted status with bootId and
  uptimeSeconds. Earlier uptime is never counted as monitored time.
- NOT STARTED: missing boot evidence, disabled device, or overdue report.
- RUNNING: a current observed period, without an eligible passing milestone.
- PASS 24H / 48H / 72H: both server-observed duration and uptime progression reach
  the milestone, in the same boot, with timely reports, a valid fresh frame, and
  recently advancing successfulPolls AND lastFrameSequence.
- Report tolerance is configured heartbeatSeconds + graceSeconds (default 300 +
  120 = 420 seconds). This is stricter than Fleet's OFFLINE threshold. A reporting
  gap interrupts evidence even if the ESP actually remained powered.
- A changed bootId, the existing telemetry reboot detector, or a report gap closes
  the old period and starts at zero on the next usable sample. No inferred uptime
  is backfilled. Existing duplicate/delayed/rate-limit handling still runs first.
- Transient feed errors do not reset the clock. Unhealthy or stalled feed prevents
  a current PASS badge; recovery can restore it. Milestone timestamps remain as
  historical evidence. PASS is not a firmware release approval or physical soak proof.
- Time passing in a browser never advances a milestone. All evaluations use
  accepted server reports. Offline reads remove current PASS without storage writes.

## Storage and compatibility

The existing per-device Durable Object stores a new `soak` key, in the same
transaction as `latest`. One bounded summary plus at most 20 prior periods is kept,
independent of the existing 24-hour/288-sample history. Each period stores first/
latest report time, boot identity/count/reason, maximum uptime, observed duration,
minimum heap, cumulative Wi-Fi/feed counters, heap drops and milestone timestamps.
Ended periods that reached 72h are COMPLETED; others ABORTED, with the end reason.
Counters are since boot, not deltas since monitoring began. Heap drops are an
observation, not proof of a leak (TLS allocations can lower the low watermark).

No new timer, alarm, provider call, ESP polling or browser storage is introduced.
An accepted telemetry report adds one bounded storage read and includes the soak
key in the existing write. Fleet reads fetch it from the same object. Summary pages
omit prior runs; detail pages include them. Existing registrations need no migration;
collection starts with the next usable report after a future authorized deployment.

Already available: identity, firmware, uptime, bootCount/bootId/resetReason, RSSI,
heap/minimum heap, frame validity/age/sequence, feed success/failure, Wi-Fi outages/
recoveries. Normalization now also exposes optional profileRevision,
profileFingerprint and wifiConnected. Missing fields remain null/"Ikke rapportert";
an HTTP report does not prove a separately reported Wi-Fi state. Firmware 1.3.0
already sends profile identity and Wi-Fi counters but does not send wifiConnected.
This optional missing field does not block soak tracking. No firmware change is required.

## Validation

Run `node scripts/test-fleet-soak.mjs`, `node scripts/test-health-telemetry.mjs`,
and `node scripts/test-fleet-dashboard.mjs`, plus the existing regression suite.
Host tests simulate reporting over 72h and storage across DO instances; they do
not replace a real device soak or production Cloudflare validation.

Local result (2026-10-08): all 37 existing/new test scripts passed, including 57
frozen frame comparisons and 388 Trondheim comparisons. The additional closed-
browser/recreated-DO reboot test passed. Diff whitespace validation passed.
Follow-up visual check (2026-10-08): local headless Chrome acceptance passed with
mock Grakallbanen and Bus1 devices, PASS 72H, offline/new boot and archived ABORTED
run. Desktop screenshots inspected: no overlapping text; missing Wi-Fi state is
clearly shown as "Ikke rapportert". Field assertions, mobile overflow, pagination,
filters, details, hidden-tab suspension, API errors, authentication and logout passed.
No production API requests were made: Fleet requests were intercepted with mock data.

Future publication requires explicit approval for Worker and static Fleet files.
Do not merge/push under the assumption that it cannot trigger Cloudflare Builds.

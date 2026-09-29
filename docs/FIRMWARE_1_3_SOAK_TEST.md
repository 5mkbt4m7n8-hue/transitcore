# Firmware 1.3.x — 72-hour soak plan

Use the final S3, wiring, supply, profile and candidate commit. The short ordinary
ESP32 test is separate. No firmware updates/config changes during the baseline
72 hours; planned fault injection belongs to N01/N02 before the soak.

## Setup and evidence

Run normal frame/status intervals. Do not increase Worker polling or leave an
unnecessary remote log lease enabled. Use Fleet details/history/errors at the
checkpoints, with a short Serial snapshot only when information is unavailable.
Fleet's default health history is bounded to 288 samples/24h (errors typically
7 days); it is not a 72h recorder. Save local snapshots at each checkpoint.
Do not wait until hour 72 to export the history. Preserve receivedAt/lastSeen
alongside health data so stale server snapshots cannot masquerade as fresh data.

| Checkpoint | Actual date/time | lastSeen / sample age | bootId / uptime / bootCount | Snapshot file | LED observation / comment |
|---|---|---|---|---|---|
| Start (0 h) | | | | | |
| 1 h | | | | | |
| 6 h | | | | | |
| 12 h | | | | | |
| 24 h | | | | | |
| 48 h | | | | | |
| 72 h | | | | | |

At start record metadata from HARDWARE_VALIDATION_REPORT_TEMPLATE.md, final
binary size/app-slot bytes and a warm-up observation. Confirm normal moving
display; an empty valid feed is acceptable. Note ambient/dimming settings and
active vehicle count to compare memory under similar load.

## Record at every checkpoint

| Measure | Existing source | Interpretation / limitation |
|---|---|---|
| Uptime | health uptimeSeconds / Fleet / HELSE | Must progress within boot; snapshot age matters |
| Reboot count | health bootCount, bootId, resetReason | Delta after known start; separate planned and unexplained reset; null is unknown |
| Unexpected resets | boot changes + reason + human notes | Watchdog/brownout requires investigation; final reason does not prove intermediate history |
| freeHeap | health/Fleet/HELSE | Compare same load/warm state, not a single lowest sample |
| minimumFreeHeap | health/Fleet/HELSE min | Minimum sampled by reportHealth, not every allocation/TLS peak; resets per boot |
| Wi-Fi outages | health wifiOutages / Fleet | Per-boot cumulative count |
| Recoveries | health wifiRecoveries / Serial HELSE tilbake | Not displayed in current Fleet detail table; record available authorized health snapshot or short Serial |
| Successful / failed polls | health successfulPolls / failedPolls, Fleet | Deltas only within same boot; retry not identical to poll count |
| Frame age and sequence | health lastFrameAgeSeconds / lastFrameSequence, Fleet | Age when reported, not age at viewing; null before accepted frame |
| Stale events | health FRAME_STALE / legacy FRAME_EXPIRED errors, Serial TTL | Different sources can describe same event; don't sum them |
| Config failures | configFetchResult / CONFIG_FAILED errors | Latest result is not a lifetime count; record transitions or unknown |
| OTA state | lastOtaResult / otaStage, Fleet | No-update acceptable; no spontaneous install expected without an offered eligible release |
| Error count | Fleet errors and IDs/count/active, per boot | Retention and duplicate suppression apply; active count is not total lifetime failures |

Snapshots must never contain authorization headers, device tokens or Wi-Fi
passwords. Use existing authorized Fleet/health access; no new telemetry service.
Unavailable fields are unknown/BLOCKED for that observation, never fabricated 0.

## Assess L01 and L02 manually

- L01 PASS requires actual elapsed time >=72h, checkpoint evidence and physical
  LED observations, no unexplained resets/freezes, and review of outage/error
  deltas. A seven-row spreadsheet alone is not proof of uninterrupted operation.
- L02 PASS requires explicit heap review under comparable load. Record beginning,
  end, lowest observed values and whether recovered after transient TLS/activity.
  A persistent unexplained decline or allocation failure is FAIL and investigated.
  Do not impose a universal free-heap threshold without measuring this profile.
- If evidence gaps prevent a conclusion, mark BLOCKED and repeat/extend the run.
  Firmware change, unexpected reset or power interruption requires a new baseline;
  retain the interrupted run and failure record rather than replacing it.
- Capturing bootId/bootCount changes can reveal some missed resets, but sparse
  health sampling cannot prove no brief transient occurred. State this limitation.

Report expectation/actual/result/evidence for L01/L02 in the manual JSON. The
report script only checks completeness and supplied results; it does not infer
soak duration, heap stability or hardware correctness from logs.

# HealthStatus v1 — Phase F

## Input and normalization

Both POST /api/v1/device/status and legacy POST /v1/devices/{id}/status use
existing authentication and the same per-device storage. No provider/frame work.
Firmware1.2.13's existing body is accepted unchanged; its strict legacy checks
remain. Canonical clients use firmwareVersion and may omit unavailable metrics.
schemaVersion1 and matching board identity are required. Missing telemetry is
null, never invented zero. deviceId is supplied by authenticated URL identity;
the API v1 body still requires it. Conflicting old/new aliases are rejected.

Canonical fields:
deviceId, boardProfile, hardwareProfile, firmwareVersion, timestamp (optional
device time), receivedAt (server), uptimeSeconds, wifiRssi, freeHeap,
minimumFreeHeap, bootCount, bootId, resetReason, lastFrameAgeSeconds,
lastFrameSequence, successfulPolls, failedPolls, wifiOutages, wifiRecoveries,
frameValid, lastOtaResult, errors and capabilities.

Legacy aliases:
firmware -> firmwareVersion; frameAgeSeconds -> lastFrameAgeSeconds;
feedSuccesses -> successfulPolls; feedFailures -> failedPolls.
Capabilities contains reportedFields, legacy and errorSnapshot.
Reset reason accepts bounded numeric ESP reason or a short identifier.
RSSI is integer -127..0, counters uint32, heap0..16,000,000.
lastOtaResult is none/pending/success/failed. Hardware assertion, when supplied,
must match a configured registry hardwareProfile. Client time is never lastSeen.

## Central policy and state

Defaults in core/models/device-record.mjs. Optional Worker HEALTH_POLICY JSON
overrides validated numeric settings; no secrets required. Registry
deviceConfig.statusIntervalSeconds takes precedence for expected heartbeat.

- DISABLED: registry enabled=false, regardless of telemetry.
- OFFLINE: never seen, or receipt age > 3 * expected interval +120s.
- ERROR: reporting with an explicit active severity:error.
- DEGRADED: heartbeat late (> interval+120s), stale/invalid frame, RSSI< -85,
  freeHeap<40,000, lastOtaResult=failed, at least3 new failed polls with
  failure ratio>=0.25, at least3 reconnects, or3 observed reboots within900s.
  Active warning errors also degrade.
- ONLINE: timely heartbeat and no observed condition above.

Default interval300s => late after420s, offline after1020s. Offline takes
precedence over old errors. Stale threshold defaults300s and is **not** a change
to PixelFrame TTL. Reads evaluate current receipt age; no offline cron writes.
Poll/reconnect conditions use deltas between reports in the same boot, not
lifetime counts. First report/counter resets cannot establish a delta.
Policy also controls minPostSeconds10, historySampleSeconds300, historyHours24,
historyLimit288, errorDays7 and errorLimit100 (bounded upper limits).

## Error lifecycle

Input example:
```json
{"code":"INVALID_FRAME","severity":"error","count":2,"active":true}
```

Safe read model: code, severity, firstSeen, lastSeen, count, message, active,
resolvedAt. Times are server observed; message is code-derived.
Known aliases include FEED_RECEIVE -> FRAME_FETCH_FAILED, FRAME_EXPIRED ->
FRAME_STALE and WIFI_DISCONNECTED -> WIFI_DOWN.

Canonical errors is an active-state snapshot: [] resolves prior active errors.
Omitting errors is partial telemetry and does not silently clear an active
error. Legacy errorQueue/lastError are historical reports, not proof of an
ongoing fatal state. Repeated snapshots do not increase occurrence counts.
Increased reported count adds only the delta; reactivation after resolution
starts a new occurrence. Event IDs are scoped to inferred/explicit boot epoch.

Duplicate fingerprints retain the last8 reports. Error-count watermarks are
bounded to100 to avoid recreating recently retained historical lastError entries
after pruning. These are bounded protections, not forever exactly-once delivery.
Without health bootId/bootCount (1.2.13), a decreasing uptime is only inferred
restart evidence; long-delayed legacy reports or uptime wrap remain ambiguous.
Modern same-boot older reports are ignored, using uptime before optional clock
time so wall-clock corrections cannot override increasing uptime.

## Storage, retention and responses

Existing latest/history/errors keys only. latest contains normalized health
plus compatible legacy fields and bounded private metadata. Actual DO writes
run transactionally; unchanged history/error keys are not rewritten.
Both ingest paths reject oversized bodies (32768-character limit).
Successful reply stays small: {ok:true,logSeconds:n}, so
1.2.13 can keep reading diagnostics leases (512-byte response budget).

Identical retries are acknowledged200 without writes/count increments or
reviving lastSeen. Distinct posts closer than minPostSeconds return429 plus
Retry-After. A telemetry-storage write timeout/failure returns503. Normal and
urgent1.2.13 reporting intervals fit this limit.

history stores at most288 samples/24h. Samples at least300s apart, state/reason
transitions and observed reboots are retained; repeated ordinary posts are not
all appended. errors are separate, at most100 records/7 days since last event
activity. Resolved historical events age out; actively reported faults remain.
Old latest/history/errors data needs no destructive migration.

Cleanup occurs on accepted posts; fleet reads filter expired rows but do not
write. An offline device's bounded on-disk rows may remain until its next post;
this is NOT a hard wall-clock erasure SLA. latest remains for offline diagnosis.
Diagnostics sessions/300-line log ring are separate and unchanged.
No new alarms, per-heartbeat global registry write or upstream requests.

Legacy GET latest/history/errors keys remain, with safe legacy error field
names. History/count semantics intentionally change to deduplication and bounded
sampling; they are not a complete event-by-event archive.

## Firmware 1.3.0 additive fields (Phase H)

Optional configSource: LIVE/CACHED/DEFAULT; configFetchResult:
NOT_CHECKED/SUCCESS/FAILED_HTTP/FAILED_VALIDATION/PROFILE_MISMATCH.
Optional otaStage: NOT_CHECKED/NO_UPDATE/UPDATE_AVAILABLE/DOWNLOAD_STARTED/
TRIAL_BOOT/SUCCESS/FAILED_HTTP/FAILED_VALIDATION/FAILED_FLASH/DISABLED.
Unknown enum values are rejected; omitted fields normalize to null. Existing
lastOtaResult remains none/pending/success/failed. No schemaVersion change.
The fleet detail view adds these three diagnostic fields without redesign.
Firmware1.3 supplies canonical fields, boot-scoped counters, monotonic uptime,
RSSI and normalized reset reason; see FIRMWARE_1_3.md. Firmware1.2.13 aliases
and numeric resetReason are still supported. NVS errors are explicit warnings.

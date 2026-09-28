# Firmware telemetry gaps: Universal BoardClient 1.2.13 -> future 1.3.x

Source inspected: sendHealthStatus/reportHealth in
firmware/esp32/TransitCore_Universal_BoardClient_v1_2_13.ino.
Firmware is not edited in Phase F.

| Metric | 1.2.13 behavior | Future contract |
| --- | --- | --- |
| Identity | deviceId, boardProfile | unchanged |
| Hardware | not in health | optional hardwareProfile, validate actual hardware separately |
| Firmware | firmware=1.2.13 | firmwareVersion alias |
| Time | uptimeSeconds | optional timestamp; server receipt still authoritative |
| RSSI | printed in network diagnostic, not posted | wifiRssi |
| Heap | freeHeap/minimumFreeHeap | unchanged |
| Restarts | numeric resetReason | add persistent bootCount and unique bootId |
| Frame | frameValid/frameAgeSeconds | add lastFrameSequence; age alias |
| Polls | feedSuccesses/feedFailures | successfulPolls/failedPolls aliases |
| Wi-Fi | wifiOutages/wifiRecoveries | unchanged |
| OTA | some failure codes in error queue, Serial result | lastOtaResult enum |
| Errors | lastError plus up to10 queued errors with IDs/counts | explicit active/severity snapshot |
| Profile | revision/fingerprint | retained in compatible latest fields |
| Signal policy | signalPolicyVersion sent, old sanitizer ignores it | optional future telemetry decision |

Normal remote heartbeat is five minutes plus throttled urgent reports.
Do not increase reporting frequency. RSSI/boot/sequence/OTA absence is unknown,
not zero or success. Diagnostics bootId is currently for remote log batches;
it is not a health-report boot identity and is not silently reused server-side.

Before1.3.x: implement stable boot identity, handle429/backoff and retries with
unchanged sample identity, distinguish active vs historical error reports,
test power loss/counter wrap and optional-field negotiation. Dynamic config
adoption is still separate firmware work. This server PR does not reflash,
start OTA, alter LED behavior or change frame TTL.

## Phase H implementation: opt-in 1.3.0

Closed in source: RSSI, boot-scoped unique bootId, persistent bootCount (nullable
on failure), normalized resetReason, accepted frame sequence, monotonic frame
age/uptime, canonical poll counters, configSource/configFetchResult and otaStage.
HardwareProfile reports compiled identity, not hardware auto-detection.
SUCCESS requires confirmed trial boot; download completion alone is pending.

Still missing/deferred: physical validation; device wall-clock timestamp in
health (server receivedAt remains authoritative); durable OTA result across
arbitrary reboot; physically observed LED output/voltage/temperature; reliable
boot count if NVS fails; production credential hardening. Legacy error history
can overlap canonical active-state events; do not sum both as unique failures.
Existing 1.2.13 remains supported with its original unknown fields. No automatic
fleet migration or package promotion is performed.

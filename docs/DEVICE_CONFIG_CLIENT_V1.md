# DeviceConfig v1 client — firmware 1.3.0

## Sources

LIVE = accepted authenticated config this boot.
CACHED = last valid NVS config loaded during boot.
DEFAULT = explicitly provisioned compiled board/hardware/origin; never guessed.

On config failure retain the active config as a whole. An already active LIVE
config stays LIVE with FAILED_HTTP/FAILED_VALIDATION and CONFIG_FAILED; it is
not mislabelled as loaded from NVS. With no valid identity/origin, no config/frame/
OTA request is sent. A valid compiled fallback may fetch frames while the
config endpoint is unavailable. CONFIG_FAILED remains active until live success.

## Validation and atomicity

Require schemaVersion1, matching deviceId, exact compiled board/hardware IDs,
strict JSON string/boolean/integer types and mandatory fields. Reject malformed
JSON, null/missing fields, negative/zero/fractional intervals, oversized body,
mismatched profile, credential-bearing/alternate-origin/query URLs.

frameUrl must exactly equal trusted origin + /api/v1/frame/{compiled board}.
otaManifestUrl must exactly equal trusted origin + /api/v1/ota/{deviceId}.
Status derives from that compiled origin + /api/v1/device/status (existing API);
diagnostic logs retain /v1/devices/{deviceId}/logs.
Origin is a compiled HTTPS DNS host, never taken from an untrusted config URL.
Config redirects disabled; no credentials forwarded to another host.

Positive uint32 polling intervals clamp BEFORE multiplication:
frame5..300sec, status300..900sec. Server's validator already enforces these;
client still clamps defensively. Brightness must be integer0..255, capped to
min(local brightness limit, compiled hardware ceiling). OTA is a required bool.
At most32 boolean feature flags with valid names; recognized flags are
ambientLighting and warmWhiteVehicles. Unknown well-formed flags are ignored.
Accepted config reasserts these flags; Serial overrides last until next activation.

A local candidate is fully decoded before any live fields change. Only then are
runtime config and shared render scalars committed. Physical output definitions
never change. Cache serialization uses normalized fields in stable order.

## Hardware

OutputCapability array declares output0's GPIO, logical/physical count and RGB
type. This build supports one output; compile assertion prevents silently
pretending to support multiple outputs. Physical capacity<=2048 and >=logical
count. A future renderer can extend this boundary, but is not implemented here.
The existing DeviceConfig contains no pin/type/layout descriptors, so it cannot
authorize a different build. Exact IDs plus compiled geometry are mandatory.
Hardware compatibility is not electrical auto-detection. Same-ID server mapping
changes cannot be detected as a new physical layout by this contract: use a new
profile/build for incompatible geometry. No new hardware API was invented.

## Persistence

Preferences namespace tc-platform:
- bootCount uint32, increment once per boot; no guessed count on failure.
- config string, canonical DeviceConfig + cacheBinding.

Binding includes device ID, board/hardware profile, API origin, GPIO, logical and
physical counts, RGB type and hardware brightness ceiling. Same validator is
used after reboot. Binding mismatch/corrupt/oversized cache is ignored.
One NVS key is replaced, not a multi-key config transaction. Atomic activation in
RAM does not depend on persistence succeeding; a failed write reports NVS_FAILED
and the old persisted copy remains the reboot fallback. Physical power-loss
behavior needs hardware testing. No token or Wi-Fi password is stored here.

## Failure handling

| Failure | Behavior |
| --- | --- |
| No Wi-Fi at boot | cached/default loaded, bounded reconnect/provisioning, no HTTP |
| Wi-Fi lost later | retain frame until TTL; count real outage; reconnect without timed reboot |
| Config timeout /401/404/429/500 | preserve whole config; retry >=5min; report failure when possible |
| Invalid JSON/profile | no partial activation/cache overwrite; CONFIG_FAILED/PROFILE_MISMATCH |
| Frame HTTP/invalid/old | retain last accepted frame until unchanged TTL; bounded retry |
| Stale frame | renderer enforces TTL independently, FRAME_STALE reported, no fake freshness |
| Status failure | attempt timestamp still advances; rendering continues; bounded later retry |
| OTA failure | retain running app, structured failure; original trial rollback preserved |
| NVS failure | boot count unknown; RAM config may work, cache durability not assumed |

A registry reassignment may reject health whose compiled profile no longer
matches; this client does not falsify identity to bypass it. Local mismatch logs
remain available, central lastSeen may eventually show offline.

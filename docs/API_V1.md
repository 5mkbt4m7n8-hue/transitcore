# TransitCore API v1 (Phase E)

Phase E is additive. No new transit logic, PixelFrame version, firmware,
cache policy or deployment is introduced. Firmware baseline is 1.2.13.

| Method and path | Behavior |
| --- | --- |
| GET /api/v1/frame/{boardId} | In-process alias of /v1/boards/{boardId}/frame |
| POST /api/v1/device/status | Existing status handler; deviceId required in JSON |
| GET /api/v1/device/config/{deviceId} | Authenticated DeviceConfig v1 |
| GET /api/v1/ota/{deviceId} | Registry policy check, then existing OTA handler |
| GET /api/v1/platform/health | Cheap liveness/capability snapshot; no IO |
| GET /api/v1/devices | Admin-only paginated DeviceRecord list (Phase F) |
| GET /api/v1/devices/{deviceId} | Admin-only health/history/errors (Phase F) |

JSON responses use no-store. Frame response retains existing headers/body and
TTL. Aliases invoke the same handler in-process, not a second Worker HTTP
request. They share provider/config caches and existing motion/hold storage.
The requested board is not replaced with a hardcoded product ID.

## Authentication and identity

Frame and health are public like the legacy routes. Device endpoints require
Authorization: Bearer <existing device key>. Never put keys in URLs.
Config/OTA use the authoritative Durable Object registry and its tokenHash.
They do not fall back to secret maps if storage is missing, invalid or unavailable.
Optional X-TransitCore-Device must match the URL (or status payload) deviceId.

POST status requires the existing schemaVersion:1 body including deviceId and
boardProfile; the old payload validator/auth/storage remain authoritative.
A payload/header mismatch is rejected. Maximum new-route body length is 32768
characters; legacy route behavior is unchanged.
See DEVICE_PROTOCOL_V1.md for accepted telemetry fields.

OTA retains X-TransitCore-Chip, X-TransitCore-Gpio, X-TransitCore-Leds,
X-TransitCore-Physical-Leds and X-TransitCore-Firmware checks. Device/board
headers are filled from authenticated registry identity; a conflicting supplied
board header is rejected. There is no wildcard release or new updater.

## Compatibility and deprecation

These paths remain fully supported for 1.2.13:

- GET /v1/boards/{boardId}/frame
- POST /v1/devices/{deviceId}/status
- GET /v1/firmware/manifest

They are legacy/deprecated **for new integrations**, with no removal date.
Do not remove or redirect them. Static clients do not need DeviceConfig.
Other status, history, diagnostics and admin endpoints are unchanged.
Legacy manifest selection keeps the existing release-manifest policy when
settings are absent. Explicit otaEnabled=false is honored on both paths,
so the new policy cannot be bypassed using the old URL.
New OTA callers require provisioned config.
Disabling a registry device continues to revoke legacy authentication as before.

## Errors

New endpoint errors are JSON { "error": "code" }. No registry contents, tokens,
config exception details or secrets are returned.

- 400: invalid_status, invalid_device_id, device_id_mismatch.
- 401: unauthorized.
- 403: device_disabled (authenticated config/OTA).
- 404: not_found (unknown device or unmatched route).
- 405: method_not_allowed.
- 409: device_config_not_provisioned, profile_mismatch,
  brightness_exceeds_hardware_limit.
- 413: body_too_large (new status route).
- 503: device_storage_unavailable, invalid_registry,
  board_configuration_unavailable.

Frame/status/OTA delegated responses retain their existing status and error
shape, including detailed frame stage metadata. In particular a syntactically
valid but unpublished board still produces the legacy frame 503, not a newly
invented 404. No-frame/last-valid policy is unchanged.
An OTA 204 means disabled by dynamic policy or no matching newer release,
not an installation failure. Do not parse a JSON body on 204.

## Health semantics

Health reports api.status=ok and version=1, config.cachedProfiles and
status=not_probed, providers.status=not_probed, framePipeline.status=available
and schemaVersion=1, deviceStorage.status=bound_not_probed or unavailable,
and timestamp. HTTP 200 is liveness, not proof of upstream/storage availability.
No upstream query, registry scan, storage probe or new recurring monitor.
Use existing diagnostics/monitor history for actual operational health.

## Versioning

API v1, DeviceConfig schemaVersion 1 and PixelFrame schemaVersion 1 are separate.
Additive response fields can be ignored. An incompatible contract requires a
new version/migration plan, not a silent change to v1.

Phase F adds optional canonical HealthStatus names to both status paths while
keeping legacy1.2.13 payloads. Distinct excessive posts may return429 with
Retry-After; retries are deduplicated. See HEALTH_STATUS_V1.md for retention and
DEVICE_REGISTRY_V1.md for the admin-only read contract.

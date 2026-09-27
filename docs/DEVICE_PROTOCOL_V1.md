# Device Protocol v1 — Phase E transition

## Existing clients

Universal BoardClient 1.2.13 remains unchanged. It uses packaged static
board/hardware settings, legacy frame/status/manifest URLs, existing key,
health interval, frame validation and recovery. No reflash is required for
this server-side API addition. No live deployment is part of this PR.

## Future dynamic client bootstrap (not implemented in firmware yet)

1. Boot with a provisioned deviceId, device key, trusted API origin and hardware identity.
2. Connect Wi-Fi.
3. GET /api/v1/device/config/{deviceId} with Bearer authentication.
4. Validate DeviceConfig v1, board/hardware compatibility and supported flags.
5. Apply only a compatible configuration; persist it as last-known-good.
6. GET frameUrl; validate PixelFrame v1 and render using existing LED behavior.
7. POST /api/v1/device/status using statusIntervalSeconds (300–900).
8. If otaEnabled, GET otaManifestUrl with existing firmware/hardware headers.
9. Existing OTA compatibility/integrity/recovery safeguards remain mandatory.

Do not let a temporary config failure blank a healthy display. Future client
must retain last-known-good config with bounded retry/backoff, while respecting
frame expiry and explicit device revocation. Detailed firmware behavior and
physical tests are a later phase; no new fallback prediction is added here.

## Status payload

Use existing schemaVersion 1 fields: deviceId, boardProfile, firmware,
uptimeSeconds, wifiOutages, wifiRecoveries, feedSuccesses, feedFailures,
frameAgeSeconds, frameValid, freeHeap, minimumFreeHeap; optional existing
profileRevision/profileFingerprint, resetReason, lastError/errorQueue and
OTA/diagnostics fields supported by cleanStatusPayload.
Field names are **not** renamed to firmwareVersion or successfulPolls.
Existing bounds, accepted firmware versions and queue retention remain.

New status path requires deviceId in body. Legacy path can still identify it
in the URL. Authentication and payload board binding remain enforced.
No telemetry frequency changes to 1.2.13; dynamic interval only affects future
clients. Existing serious-error reporting policy remains unchanged.

## Security and limitations

Per-device token hashes and admin authentication are reused, not replaced.
Config and new OTA paths fail closed if registry is unavailable; old environment
token migration paths still exist on legacy endpoints/status handling.
Public frame/health/status access rules are unchanged; this is not fleet
authorization hardening. Device enumeration responses, rate limiting, immutable
hardware identity and signed configuration need assessment before sales.
No Wi-Fi passwords or secrets are introduced in repo/config responses.

OTA binary validation/selection remains existing code. New endpoint checks
registry otaEnabled before delegating. Explicit false is also honored by the
legacy manifest endpoint; absent settings keep old static-client behavior.
A new config URL alone does not make old firmware dynamically configurable.

See API_V1.md for route/error compatibility and DEVICE_CONFIG_V1.md for
provisioning and schema.

## Phase F health transition

Both status URLs now normalize optional HealthStatus v1 into the existing
per-device storage. Legacy1.2.13 names/body/reply remain supported; canonical
clients can use firmwareVersion and partial optional measurements.
See HEALTH_STATUS_V1.md for aliases, active errors, derived status, deduplication,
429/Retry-After and retention. No firmware reporting interval is changed.

GET /api/v1/devices and /api/v1/devices/{deviceId} are admin-only fleet data
projections, not public status pages. See DEVICE_REGISTRY_V1.md for auth,
pagination and bounded fan-out. Existing legacy public status access remains
a security limitation; private health/deduplication metadata is not added there.
Non-404 registry failure is fail-closed. Firmware gaps and reboot ambiguity are
explicitly listed in FIRMWARE_TELEMETRY_GAPS.md.

# DeviceConfig v1

New, opt-in configuration. Universal BoardClient 1.2.13 does not consume it.

Example (IDs illustrative; HTTPS host comes from the request origin):

```json
{
  "schemaVersion": 1,
  "deviceId": "prototype-test",
  "boardProfile": "grakallbanen-prototype-board",
  "hardwareProfile": "grakallbanen-prototype-board-hardware",
  "frameUrl": "https://transitcore-led-feed.lgb84.workers.dev/api/v1/frame/grakallbanen-prototype-board",
  "pollIntervalSeconds": 10,
  "statusIntervalSeconds": 300,
  "brightnessLimit": 32,
  "otaEnabled": false,
  "otaManifestUrl": "https://transitcore-led-feed.lgb84.workers.dev/api/v1/ota/prototype-test",
  "featureFlags": {}
}
```

## Registry authority and provisioning

Durable Object registry is authoritative for deviceId, boardProfile, enabled,
hardwareProfile and deviceConfig settings (including OTA opt-in/feature flags).
No inference from device IDs, recent telemetry or query-string overrides.
The existing board/config loader resolves the registered board; its hardware.id
must match the explicit registered hardwareProfile.

Existing records lacking settings return 409 device_config_not_provisioned.
This is intentional: never guess the GPIO/hardware of a sold/static device.
Existing status/OTA paths still work without dynamic config.
Devices registered only through legacy environment secrets must be enrolled
in the Durable Object registry before using dynamic config. No auto-migration
or credential rotation is performed by a GET.

Authenticated administrators may use the existing /v1/admin/devices POST:

```json
{
  "action": "configure",
  "deviceId": "prototype-test",
  "hardwareProfile": "grakallbanen-prototype-board-hardware",
  "deviceConfig": {
    "pollIntervalSeconds": 10,
    "statusIntervalSeconds": 300,
    "brightnessLimit": 32,
    "otaEnabled": false,
    "featureFlags": {}
  }
}
```

Use the existing admin Bearer token; never commit it. All settings are explicit,
not a partial patch. Recommended starting values are 10/300/board brightness,
OTA false until compatible firmware/manifest is ready. Current boardProfile,
enabled state and credentials are preserved. This action cannot re-enable,
reassign a board, rotate a token or provision unknown hardware. It checks
published config and stores only allowlisted settings. No new admin UI yet.
Existing create/rotate/revoke behavior remains unchanged.

## Validation and limits

- deviceId: existing 3..120 character lowercase letters/digits/hyphen/underscore.
- boardProfile/hardwareProfile: 3..120 lowercase letters/digits/hyphens.
  Runtime also checks published board identity and hardware ID.
- pollIntervalSeconds: integer 5..300.
- statusIntervalSeconds: integer 300..900 (5–15 minutes).
- brightnessLimit: integer 0..255, additionally no higher than board hardware
  limit (existing fallback 32). It is a cap, not automatic brightening.
- otaEnabled: boolean. Explicit false suppresses releases on both OTA paths;
  absent settings retain the existing legacy release policy.
- featureFlags: at most 32 named boolean values. No arbitrary strings/objects.
  Flags are configuration transport, not implemented firmware features.
- URLs: HTTPS v1 paths, no credentials, query strings or fragments.

Config GET authenticates before checking disabled/provisioning details.
Responses are allowlist projections: no Wi-Fi, tokens, tokenHash, signing keys,
raw registry records or admin metadata. Cache-Control is no-store.
Validator: core/models/device-config.mjs. Unknown fields are not emitted.

## Remaining work

HardwareProfile identifies the current published mapping, not an immutable
silicon/GPIO attestation. Future firmware must validate the downloaded profile
against its actual chip, GPIO, LED allocation and supported features before
applying it. Full mapping distribution/hardware capability negotiation is
outside Phase E. Existing OTA hardware guards remain mandatory.

Before hardware adoption: implement client config fetch/validation, persist
last-known-good config, backoff on failure, prevent accidental board reassignment,
test revoked credentials and power-loss recovery. Do not deploy this as a
firmware change; it only enables future clients.

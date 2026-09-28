# Device Registry v1 — Phase F

## Existing storage, not a second registry

DEVICE_STATUS is still the only Durable Object namespace. The object named
__device-registry__ owns device:<id> identity, tokenHash, board/hardware profile,
enabled, label, createdAt and Phase E configuration. The existing object named
deviceId owns latest, history, errors and diagnostic sessions.

DeviceRecord is a **read projection joining these existing objects**. lastSeen,
firmware and derived status are not copied into a global hot registry on each
heartbeat. There is no new binding, storage migration, provider call, scheduler
or firmware update. PHASE_F_ANALYSIS.md records the pre-change inventory.

## DeviceRecord v1

```json
{
  "schemaVersion": 1,
  "deviceId": "prototype-test",
  "label": "Prototype",
  "boardProfile": "grakallbanen-prototype-board",
  "hardwareProfile": "grakallbanen-prototype-board-hardware",
  "enabled": true,
  "createdAt": "2026-09-27T12:00:00.000Z",
  "lastSeen": "2026-09-27T12:05:00.000Z",
  "firmwareVersion": "1.2.13",
  "desiredFirmwareVersion": null,
  "otaEnabled": null,
  "status": "ONLINE",
  "reasons": [],
  "featureFlags": {},
  "health": {}
}
```

health is normalized HealthStatus or null. hardwareProfile stays null for
unprovisioned records; no hardware guessing. desiredFirmwareVersion is optional
registry metadata, null unless explicitly present/valid. Phase F does not
derive/modify OTA releases or add a firmware-policy write endpoint.
Status and reasons are calculated at read time, including silence/offline.
Phase G adds nullable otaEnabled, projecting only an explicitly provisioned
deviceConfig boolean. It does not infer update availability or change OTA policy.
ONLINE means a timely heartbeat with no observed fault, not proof that every
unknown metric or physical LED is healthy.

## Lifecycle

Existing authenticated admin create enrolls a device and returns its key once.
configure explicitly assigns Phase E hardware/settings. Status POST uses the
registered board identity and existing key. rotate replaces the key (and
re-enables as it did before); revoke sets enabled=false. DISABLED wins over
heartbeat state and rejects future status authentication. None of these actions
is automatically applied to existing devices by this PR.

Old latest records are normalized on fleet read without writes when possible;
malformed historical samples show LEGACY_UNNORMALIZED until a valid heartbeat.
Existing environment-token registrations remain supported for ingestion but
are not automatically enrolled/listed in the DO registry.

## Protected fleet read API (no dashboard yet)

- GET /api/v1/devices?limit=20&cursor=<last-device-id>
- GET /api/v1/devices/{deviceId}

Requires existing PUBLISH_ADMIN_TOKEN as Bearer token. Device keys cannot list
or read these endpoints. Unconfigured admin/storage returns 503; bad auth401,
unknown detail404, invalid pagination400, non-GET405.

List returns devices, nextCursor, unavailable and generatedAt. Default20,
maximum50. It uses a bounded prefix list with startAfter, then batches of at
most five telemetry reads. No full scan/provider/config/frame call. A failing
device read is listed in unavailable, not falsely labelled OFFLINE.
Pagination is eventually consistent during concurrent registrations.
Detail returns DeviceRecord plus short history and safe error records.

Each list page costs one registry RPC plus at most limit per-device reads;
detail costs one registry and one per-device read. No write on reads.
A larger fleet still requires measured Cloudflare capacity/cost planning;
these tests are not a many-thousand-device load certification.

## Security

Read output is allowlisted, never a spread of registry records: no token,
tokenHash, admin/Cloudflare/Wi-Fi/OTA secrets. Error messages are generic
code-derived text, not arbitrary device strings. Feature flags are booleans.
Existing public legacy status endpoints retain their legacy fields; no new
normalized telemetry or private deduplication metadata is exposed there.
Their public access is a remaining pre-sales security decision.

A compromised unique device key can fabricate that device's telemetry, obtain
its config/matching OTA and submit session logs while a lease is active. It
cannot administer the fleet, enable a log lease or authenticate as another
uniquely keyed device. Legacy shared-token installs have wider exposure and
should be migrated before sales. Device IDs are identifiers, never secrets.
A non-404 registry failure now fails closed rather than falling through to
legacy environment credentials; this protects revocation.

Per-device ingest throttling limits accepted writes, not edge request charges.
No WAF/distributed edge rate limit/PKI is configured here. Add edge controls and
review legacy public status access before broader commercial exposure.

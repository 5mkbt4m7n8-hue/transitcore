# Device security

Board Client v1.0.10 verifies the Worker hostname and TLS certificate chain with
the full public CA bundle maintained by Espressif. It no longer uses
`setInsecure()`.

## Register one physical device

Create a random token of at least 32 characters. Add or update the encrypted
Worker secret `DEVICE_INGEST_TOKENS` as a JSON object:

```json
{
  "trondheim-demo-001": {
    "boardProfile": "trondheim-bus-board",
    "token": "A_UNIQUE_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS",
    "enabled": true
  }
}
```

Put the matching values only in that device's local `secrets.h`:

```cpp
#define TRANSITCORE_DEVICE_ID "trondheim-demo-001"
#define TRANSITCORE_DEVICE_TOKEN "A_UNIQUE_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS"
```

Never commit either value. A device is revoked by setting `enabled` to `false`
or removing its entry. Rotating one device token does not affect other boards.

## Migration

Existing devices whose device ID equals their board profile can temporarily use
the shared `STATUS_INGEST_TOKEN`. This fallback keeps deployed v1.0.4-v1.0.9
clients online while they are upgraded. New devices must use
`DEVICE_INGEST_TOKENS`; remove the legacy secret when migration is complete.

The JSON secret is suitable for development and a small pilot. Before a larger
fleet, registrations should move to dedicated encrypted device storage with an
administrative enrollment and rotation workflow.

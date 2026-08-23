# Device security

Board Client v1.0.10 verifies the Worker hostname and TLS certificate chain with
the full public CA bundle maintained by Espressif. It no longer uses
`setInsecure()`.

## Register one physical device

The normal workflow is the **Fysiske enheter** section on `web/publish/`:

1. Load the published project package.
2. Enter the publishing administrator key.
3. Choose **Opprett enhet og last ned ESP-pakke**.
4. Keep the downloaded ZIP file. The unique device token cannot be read back
   from the Worker.

The Worker stores only a SHA-256 digest. The same page can list devices, revoke
one installation, or rotate its token. Rotation immediately invalidates the old
token and creates one replacement ESP package.

## Temporary secret-map fallback

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

The JSON secret remains available only as a migration fallback. New devices are
registered in the existing Durable Object storage through the authenticated
administration endpoint.

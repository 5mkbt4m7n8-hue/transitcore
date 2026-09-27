# Phase F analysis (before implementation)

Baseline: merged Phase E, main 1f8488d. No firmware/provider/frame/OTA rewrite.

- Registry: existing DEVICE_STATUS Durable Object named __device-registry__,
  device:<id> records with tokenHash, enabled, boardProfile, label, timestamps,
  and optional Phase E hardwareProfile/deviceConfig.
- Per-device status: same namespace, object named deviceId. Existing latest,
  history (288 samples) and errors (100 items). Do not create another store.
- Both status URLs authenticate before forwarding to that per-device object.
  Legacy env-token fallback exists; storage failures must not bypass revocation.
- Diagnostics: existing /logs/session lease (15 min), max300 lines, bootId/seq
  dedup; leave this flow separate and unchanged.
- Firmware1.2.13 posts every300s plus throttled urgent errors. Sends firmware,
  uptime, feed counters, reconnect counters, frameValid/frameAgeSeconds, heap,
  numeric resetReason, profile identity, signalPolicyVersion and error queue.
  Does NOT send RSSI, bootCount, health bootId, frame sequence, hardwareProfile,
  device timestamp or structured last OTA result.
- Add normalized optional HealthStatus alongside compatible latest fields;
  do not fabricate missing measurements. Fleet DeviceRecord is a safe joined
  projection, not a second authoritative record.
- Central configurable policy, bounded history/events, duplicate and ingest
  rate protection in the existing per-device object. Receipt time is authoritative.
- Admin-only paginated fleet reads, bounded fan-out, no provider/frame calls.
- Keep existing latest/history/errors response keys. History semantics change
  from every post to bounded/downsampled samples; error records gain lifecycle
  metadata. Tests must explicitly cover this intentional retention change.


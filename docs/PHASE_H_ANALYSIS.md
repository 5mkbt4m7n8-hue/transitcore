# Phase H baseline analysis

Base: main 27a8179, merged Phase G / PR198. Baseline remains the unchanged
TransitCore_Universal_BoardClient_v1_2_13.ino. New line: 1.3.0, opt-in only.

## Existing behavior retained

Single-output NeoPixel render task, frame parsing/priority/colors, per-frame TTL,
Wi-Fi provisioning/reset button/backoff, diagnostics lease, TLS CA bundle,
device-targeted OTA manifest checks and trial-boot confirmation/rollback.
No changes to PixelFrame, provider, mapping or server OTA selection.

## Contract gaps and bounded changes

- DeviceConfig v1 has board/hardware IDs, frameUrl, otaManifestUrl, poll/status
  intervals, brightness and flags. It has no status URL or physical pins/layout.
  Derive status URL from the compiled trusted origin + existing v1 status route.
- Exact compiled board and hardware IDs are required. Runtime cannot change
  GPIO, LED count/type or layout. Builds explicitly attest output descriptors;
  profile renaming/reassignment needs a matching build, not unsafe guessing.
- HealthStatus accepts only none/pending/success/failed OTA results. Keep these,
  add optional otaStage/configSource/configFetchResult fields for diagnostics.
  Old firmware and API schemaVersion remain accepted unchanged.
- NVS tc-platform holds one last-valid config, binding signature and bootCount.
  Canonical serialization avoids writes on unchanged responses. No secrets in
  config storage. Corrupt/unbound cache is rejected using the same validator.
- Fetch config on first stable connection, then hourly (failed attempt every
  five minutes). Never on each poll. Use safe exact-profile compiled defaults
  if fully provisioned; otherwise do not fetch frames or enable OTA.
- Legacy firmware reboots after ten minutes without Wi-Fi and provisioning
  timeout. New unattended line stays in bounded reconnect/provisioning mode
  instead of automatic outage-driven reboot loops. Explicit user reset and
  existing OTA trial rollback remain intact.
- Health canonical errors are bounded active-state transitions. Legacy error
  queue is kept for historical delivery, but no per-loop flash writes.

## Verification plan

Compile ESP32 and ESP32-S3 with core3.3.11; deterministic client-policy tests,
telemetry normalization/error fixtures and all regression scripts. Preserve
baseline package/version selection; new compile preparation is opt-in. Physical
network/power/LED/OTA tests and long-run heap observations remain pending.

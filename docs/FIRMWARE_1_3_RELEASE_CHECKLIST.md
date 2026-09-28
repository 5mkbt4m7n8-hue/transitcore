# Firmware 1.3.x release candidate checklist

Keep 1.2.13 as the current release until each gate is explicitly signed off.

| Gate | Evidence required | Status |
|---|---|---|
| Automated tests | Full Node/API/frame/provider/health/edge suite passes | PENDING |
| Compile | Both board fixtures compile for ESP32 and ESP32-S3; no synthetic fixture is flashed | PENDING |
| Ordinary ESP32 quick test | Hardware protocol Q-01..Q-09 completed | PENDING |
| ESP32-S3 physical test | Protocol S-01..S-06 completed on real wiring | PENDING |
| OTA test | Compatible update, telemetry and confirmation observed | PENDING |
| Rollback test | Failed trial rolls back; USB 1.2.13 recovery documented | PENDING |
| Power loss/NVS | Interrupted-write and repeated-boot evidence | PENDING |
| Wi-Fi failure | Long outage, reconnect and endpoint error matrix | PENDING |
| 72 h soak | No memory/request/LED/NVS regression | PENDING |
| Heap stability | Free/min heap trend and largest-block data if diagnostics enabled | PENDING |
| Flash margin | Final binary vs OTA partition, with growth margin reviewed | PENDING |
| Security review | No secrets in repo, logs, fixtures or health payloads | PENDING |
| Release package switch | Explicitly change package selection from 1.2.13 to approved 1.3.x only after all gates | PENDING |

Do not merge/deploy or make 1.3.x the default firmware until physical S3,
OTA/rollback and soak gates pass.

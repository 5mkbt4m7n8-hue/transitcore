# Firmware 1.3.x release candidate checklist

Keep 1.2.13 as the current release until each gate is explicitly signed off.
Use HARDWARE_VALIDATION_REPORT_TEMPLATE.md and HARDWARE_TEST_RESULT_V1.md for
manual evidence. No gate has been physically passed by this documentation PR.

| Gate | Evidence required | Status |
|---|---|---|
| Automated tests | Full Node/API/frame/provider/health/edge suite passes | PENDING |
| Compile | Both board fixtures compile for ESP32 and ESP32-S3; no synthetic fixture is flashed | PENDING |
| Ordinary ESP32 quick test | Q01–Q17 PASS with observations, correct candidate and real hardware | PENDING |
| ESP32-S3 physical test | S01 PASS on final S3/GPIO/strip | PENDING |
| Invalid/stale frames | S02 PASS: invalid data rejected, TTL and recovery verified | PENDING |
| Health/dashboard | Q08/Q09/Q17 and S03 PASS, fresh matching telemetry | PENDING |
| OTA test | O01 PASS: compatible update and confirmed trial boot | PENDING |
| Rollback test | O02 PASS: failed trial rollback; USB recovery documented | PENDING |
| Power loss/NVS | P01/P02 PASS: interrupted write, binding and boots | PENDING |
| Wi-Fi failure | Q13/Q14 and N01/N02 PASS: reconnect and failure matrix | PENDING |
| 72 h soak | L01 PASS with actual 72h and checkpoint evidence | PENDING |
| Heap stability | L02 PASS after human review of sampled heap and observation gaps | PENDING |
| Flash margin | R01 PASS: final binary/app-slot remaining bytes reviewed | PENDING |
| Automated/compile reviews | R02/R03 PASS with actual test/build evidence | PENDING |
| Security review | R04 PASS: no secrets in shared reports, logs or packages | PENDING |
| Release package switch | Explicitly change package selection from 1.2.13 to approved 1.3.x only after all gates | PENDING |

Do not merge/deploy or make 1.3.x the default firmware until physical S3,
OTA/rollback and soak gates pass.

The report tool marks the gate FAIL on any manual FAIL, otherwise BLOCKED if
anything is missing, BLOCKED or NOT_RUN (including metadata/evidence). It cannot
certify physical truth; even a complete manual PASS report requires an explicit
release decision. Automated suite success does not fill physical rows.

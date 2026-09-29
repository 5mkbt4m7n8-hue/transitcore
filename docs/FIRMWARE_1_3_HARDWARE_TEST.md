# Firmware 1.3.0 hardware validation protocol

This protocol records physical evidence; automated tests and compilation do not
replace it. Record commit, board/module, core/libraries, partition scheme,
profile IDs (never secrets), timestamps, free/min heap and evidence.

## A. Ordinary ESP32 quick validation (15–20 minutes)

Use a real board with its correct GPIO/strip and stable 5 V supply. Do not flash a
CI fixture with a synthetic GPIO.

| Test-ID | Setup | Handling | Expected result | Actual result | PASS/FAIL | Comment |
|---|---|---|---|---|---|---|
| Q-01 | USB + strip | Cold boot | 1.3.0 banner, no reset loop, LED test completes | | | |
| Q-02 | Credentials saved | Wait Wi-Fi | IP and stable connection; startup is not an outage | | | |
| Q-03 | Worker available | Wait config/frame | LIVE config accepted; valid frame renders; profile/version match | | | |
| Q-04 | Worker available | Observe health | device/profile/firmware, RSSI, heap, boot ID/count and frame fields; no secrets | | | |
| Q-05 | Running device | Power-cycle once | boot count increments; boot ID changes; reset reason is sensible | | | |
| Q-06 | Network switch | Disconnect briefly, reconnect | reconnects without reboot loop; TTL/last frame behavior remains | | | |
| Q-07 | Cached config | Block config, restart | cached config used; no wrong layout | | | |
| Q-08 | Network restored | Wait one poll | returns to LIVE config/frame automatically | | | |
| Q-09 | Serial available | Check version/frame | 1.3.0, expected count/GPIO; no credential output | | | |

This quick pass intentionally does not test OTA, rollback, NVS power loss, long
outages or a 72-hour trend.

## B. ESP32-S3 full validation

Run the same rows plus these gates on the real S3 module and final wiring.

| Test-ID | Setup | Handling | Expected result | Actual result | PASS/FAIL | Comment |
|---|---|---|---|---|---|---|
| S-01 | Final S3 + production strip | Cold boot and normal display | correct mapping, colors, pulse/PASSED/PARKED and collisions | | | |
| S-02 | Controlled endpoints | Block config/frame/status/OTA; test timeout, 401/404/429/500 and malformed JSON | no reboot loop; last valid/cache/degraded behavior preserved | | | |
| S-03 | NVS setup | Restart and interrupt one config write | old cache or safe fallback; no wrong identity/layout | | | |
| S-04 | OTA staging + rollback partition | Compatible update, trial and failed trial | pending during trial; success only after confirmation; rollback works | | | |
| S-05 | Reset instrumentation | Power cycle and reset checks | boot count, boot ID and normalized reason correct | | | |
| S-06 | Health collector | Observe 30–60 minutes | heap/min heap stable; counters safe; no auth/secret output | | | |
| S-07 | Unattended device | Run 72 hours | no hung LEDs, reboot loop, memory trend, excessive requests/NVS writes | | | |
| S-08 | Final candidate | Compare 1.2.13 rollback and 1.3.0 | USB recovery remains possible and credentials/layout understood | | | |

## Evidence and release rule

Attach serial excerpts, health payloads, request counts and binary/partition data
to each completed run. A blank or failed row blocks release. Compile/host/web
checks are not physical PASS. Never flash a CI-only synthetic GPIO fixture.

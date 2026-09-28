# Firmware 1.3.0 hardware acceptance — ALL PENDING

No item below has been physically verified by this PR. Use a non-production
prototype with known GPIO/layout, suitable power and an accessible USB rollback.
Record exact board/module, core/library versions, partition scheme, firmware
commit, device/profile IDs (no secrets), free/min heap and test time.

- [ ] Cold boot: expected GPIO/output count, startup and first valid display.
- [ ] Wi-Fi provisioning and saved-network reconnect; boot-connect is not an outage.
- [ ] LIVE config accepted before normal polling; known config shown in Serial/Fleet.
- [ ] Power cycle: bootCount increments, bootId changes and remains stable per session.
- [ ] CACHED fallback with config endpoint blocked, frame endpoint still reachable.
- [ ] No cache plus valid compiled defaults; missing identity stays safely degraded.
- [ ] Corrupt/binding-mismatched cache is rejected without driving another layout.
- [ ] Invalid JSON, wrong board/hardware, malicious URL: no partial activation.
- [ ] NVS write failure/power loss during config write: old valid cache or safe fallback.
- [ ] Wi-Fi unavailable at boot and >10min outage: no automatic reboot loop.
- [ ] Wi-Fi disconnect/reconnect: real outage increments once; display respects TTL.
- [ ] Config/frame/status/OTA endpoints independently unavailable/time out.
- [ ] Exercise401/404/429/500 on each endpoint using a controlled staging setup.
- [ ] Valid/invalid/older/stale frames; sequence changes only on accepted data.
- [ ] Status posting failure does not freeze independent LED render/TTL task.
- [ ] Brightness0/low/ceiling and out-of-range polling inputs; confirm clamps.
- [ ] Pulsing/PASSED/PARKED/collision colors/ambient/Serial dimming match baseline.
- [ ] OTA NO_UPDATE without excessive requests.
- [ ] OTA compatible update: download is pending; SUCCESS only after trial confirmation.
- [ ] OTA wrong target/digest/size, failed download, failed trial; rollback works.
- [ ] Verify rollback-enabled partition layout and binary margin before any OTA.
- [ ] Confirm USB rollback to1.2.13 and retained Wi-Fi/device credentials.
- [ ] Fleet shows RSSI, boot count/ID, reset reason, frame sequence, config and OTA stage.
- [ ] Normalized reset reasons for power/software reset; don't induce unsafe brownout.
- [ ] Continuous72h run: no memory trend, no hung LEDs, bounded requests/NVS writes.
- [ ] Longer rollover/monotonic-time scenario in controlled harness.
- [ ] Both ESP32 and ESP32-S3; use actual production physical strip/GPIO.
- [ ] Log review: no tokens/passwords/auth headers; disable temporary diagnostic lease.

Record pass/fail plus evidence for each item. Compilation and JS simulations are
not substitutes for these checks. Do not declare production readiness until the
pending physical tests and failures are resolved.

# TransitCore Universal BoardClient

The same ESP32 engine supports every TransitCore board. Only the local board
configuration changes.

## Arduino setup

1. Put `TransitCore_Universal_BoardClient_v1_0_9.ino` in a sketch folder with
   `secrets.h` and `board_config.h`.
2. Copy `secrets.example.h` to `secrets.h` and enter local Wi-Fi credentials.
3. Copy the relevant file from `board-configs/` to `board_config.h`:
   - `grakallbanen-board.h`
   - `oslo-metro-board.h`
   - `trondheim-bus-board.h`
4. Keep hardware disabled for the first serial test.
5. Verify that the received `boardProfile` and `ledCount` match the board.

The client rejects mismatched, stale, malformed, duplicate or out-of-range LED
data. It keeps the last valid frame through short feed failures and switches all
LEDs off when the frame TTL expires.

Version 1.0.1 keeps the polling, retry, TTL and LED behavior from 1.0.0. When an
HTTP request fails, it additionally logs the HTTP error text, elapsed request
time, Wi-Fi status/RSSI, local network configuration, a diagnostic DNS lookup
and the latest TLS client error.

Version 1.0.2 makes Wi-Fi recovery deterministic. The client owns reconnect
timing, increases the delay between failed attempts, resets the Wi-Fi radio
after repeated failures and restarts the ESP32 after ten continuous minutes
offline. Feed validation, TTL handling and LED rendering are unchanged.

Version 1.0.3 adds a local five-minute health report with uptime, Wi-Fi outages
and recoveries, successful and failed feed polls, frame freshness, current free
heap and minimum observed free heap. It sends no telemetry and does not change
network recovery, feed validation, TTL handling or LED rendering.

Version 1.0.4 sends the same health summary to the authenticated Worker status
endpoint every five minutes. Add `TRANSITCORE_STATUS_TOKEN` to `secrets.h` and
configure the matching encrypted Worker secret `STATUS_INGEST_TOKEN`. No Wi-Fi
credentials, vehicle data or LED frame contents are included in telemetry.

Version 1.0.5 adds board profile revision and fingerprint reporting so the
Worker and ESP32 can detect profile mismatches.

Version 1.0.6 keeps the LED and feed behavior unchanged, but waits for Wi-Fi
before consuming the first five-minute health interval. The first remote status
report is therefore sent immediately after Wi-Fi connects. Startup logging also
states whether a status token is configured without exposing its value.

Version 1.0.7 adds a safe, non-blocking LED commissioning sequence.

Version 1.0.8 validates the Worker's versioned signal policy and uses its
approach pulse period. Frames without policy metadata remain compatible and use
the established 1800 ms pulse period.

Version 1.0.9 pins the physical approach pulse to the compiled 1800 ms policy.
It rejects a versioned frame whose pulse period differs, and frame reception
never restarts the local animation phase.



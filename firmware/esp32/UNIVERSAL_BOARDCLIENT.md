# TransitCore Universal BoardClient

The same ESP32 engine supports every TransitCore board. Only the local board
configuration changes.

## Arduino setup

1. Put `TransitCore_Universal_BoardClient_v1_0_0.ino` in a sketch folder with
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


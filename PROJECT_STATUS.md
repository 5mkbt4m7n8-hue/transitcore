# TransitCore project status

## Current confirmed firmware checkpoint

**TransitCore v0.40.1 – RGB Hardware Bench Test**

Verified with DOIT ESP32 DEVKIT V1 using target `esp32:esp32:esp32doit-devkit-v1`.

Compilation:

| Configuration | Program storage | Global RAM | Remaining RAM |
|---|---:|---:|---:|
| RGB hardware off | 1,085,989 bytes (82%) | 52,640 bytes | 275,040 bytes |
| Hardware on, bench off | 1,087,105 bytes (82%) | 52,648 bytes | 275,032 bytes |
| Hardware and bench on | 1,087,401 bytes (82%) | 52,656 bytes | 275,024 bytes |

Runtime verification with RGB hardware and bench test disabled:

- Complete Entur responses are received before JSON parsing.
- No `IncompleteInput` or JSON errors occurred in the verification sample.
- Heap remained stable at approximately 215.5 kB before requests.
- Approximately 96–99 kB remained after parsing.
- Wi-Fi reconnection recovered automatically.
- Position, confidence, state, terminal, VLED and RGB render behavior remained operational.
- The last valid station/VLED frame is retained on temporary transport or JSON errors.

RGB status:

- Addressable RGB driver compiles in all three configurations.
- Bench test is non-blocking and limited to brightness 20.
- Physical RGB hardware remains unverified until the LED chain is available.
- Keep `RGB_HARDWARE_ENABLED` and `RGB_BENCH_TEST_ENABLED` disabled during normal operation without hardware.

## Local Wi-Fi configuration

Copy `firmware/esp32/secrets.example.h` to `firmware/esp32/secrets.h` and enter local credentials. The real `secrets.h` file is ignored by Git and must never be committed.

## Web interface

The GitHub Pages root `index.html` is **TransitCore Mobile Live v2** and remains unchanged.

## Next planned development

Build a separate TransitCore Replay Lab for deterministic testing with recorded Entur data. Keep v0.40.1 unchanged as the stable firmware checkpoint until physical RGB hardware is available.

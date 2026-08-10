# TransitCore project status

## Current confirmed firmware checkpoint

**TransitCore v0.39.2 – Entur Response Reliability**

Verified with DOIT ESP32 DEVKIT V1 using target `esp32:esp32:esp32doit-devkit-v1`.

Compilation:

- Program storage: 1,070,088 bytes (81%)
- Global variables: 51,888 bytes (15%)
- Remaining dynamic memory reported by compiler: 275,792 bytes

Runtime verification:

- Complete Entur responses are received before JSON parsing.
- Responses with unknown `Content-Length` are handled.
- Five consecutive observed requests completed successfully.
- No `IncompleteInput` occurred in the verification sample.
- Heap returned to approximately 219 kB before each request.
- Lowest observed heap after parsing was approximately 96 kB.
- The last valid station/VLED frame is retained on temporary transport or JSON errors.

Confirmed unchanged:

- Entur query and filtering
- vehicle deduplication and freshness filtering
- Position Engine and Position Confidence
- State Engine and Terminal Stabilizer
- segment/VLED mapping
- RGB render rules
- physical GPIO output

## Local Wi-Fi configuration

Copy `firmware/esp32/secrets.example.h` to `firmware/esp32/secrets.h` and enter local credentials. The real `secrets.h` file is ignored by Git and must never be committed.

## Web interface

The GitHub Pages root `index.html` is **TransitCore Mobile Live v2** and remains unchanged.

## Next planned development

TransitCore v0.40.0 – Addressable RGB Hardware Driver v1, behind a configuration flag and disabled by default until RGB hardware testing.

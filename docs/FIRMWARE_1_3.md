# Universal BoardClient 1.3.0 — Phase H

Opt-in firmware, derived from the unchanged 1.2.13 file. No merge/deploy or
automatic package/OTA-release promotion is part of this change.
Read PHASE_H_ANALYSIS.md and DEVICE_CONFIG_CLIENT_V1.md first.

## Files and build

Use TransitCore_Universal_BoardClient_v1_3_0.ino **together with**
TransitCore_Platform_v1.h, your local secrets.h and board_config.h.
Arduino ESP32 core >=3.3.11, ArduinoJson and Adafruit NeoPixel are required.
The sketch folder and .ino basename must match. Existing package generator
still selects 1.2.13: do not expect downloading the old package to install 1.3.

Keep explicit compiled GPIO, LED_COUNT, physical count, RGB type, expected board
and brightness ceiling. Add these non-secret board_config.h definitions:

```cpp
#define TRANSITCORE_API_ORIGIN "https://transitcore-led-feed.lgb84.workers.dev"
#define TRANSITCORE_HARDWARE_PROFILE "your-exact-provisioned-hardware-id"
#define TRANSITCORE_HARDWARE_BRIGHTNESS_LIMIT 32
```

These are build inputs, not guessed from a board name. Match the registry and
actual wiring. Set LED_HARDWARE_ENABLED=true for a physical board, as in generated
compile fixtures; source baseline safely defaults false. The fixture generator
uses dummy CI credentials and is NOT a provisioned installation package.

`node scripts/prepare-esp13-compile.mjs` creates ignored .build compile fixtures
for Gråkallbanen prototype and Trondheim bus. Never flash CI_ONLY credentials.

### Incomplete hardware profiles in CI

Trondheim bus currently has `leds.dataPin: null`: it is not a provisioned physical
GPIO mapping. The compile-only generator uses synthetic GPIO 14 when dataPin is
null or missing, prints a GitHub Actions warning and marks the generated header
with `TRANSITCORE_CI_SYNTHETIC_GPIO=1` and a DO NOT FLASH comment. This exercises
the hardware-enabled code on both ESP32 and ESP32-S3 without inventing a production
board mapping. Board/hardware JSON and production packaging remain unchanged.
Configured numeric GPIOs are retained; malformed non-null values fail generation
instead of being silently replaced. Integer bounds are not electrical validation.
The fixture test covers missing/invalid pins, generated C++ and unchanged profiles.
Successful CI compilation does not make an unprovisioned board physically ready.

## Boot and network

NVS boot counter + random session ID -> compiled defaults/cached config ->
Wi-Fi provisioning/reconnect -> first stable connection fetches config ->
atomic activation -> frame fetch/validation/render -> bounded health -> OTA.

No transit-specific behavior. Accepted-frame sequence is updated only after the
unchanged validator and old-sequence check succeed. Pulsing/collisions/TTL render
logic is preserved; brightness ceiling becomes a bounded runtime scalar.
Wi-Fi reconnection backoff/radio recovery and explicit reset button remain.
Long outage/provisioning timeout no longer forces repeated device reboots.
Frame HTTP failures no longer force Wi-Fi reconnection just because upstream is
unavailable. The render task runs independently of HTTP/status/config waits.

## Counters and health

RSSI, firmwareVersion, hardwareProfile, bootCount (null on NVS failure),
bootId, normalized resetReason, accepted frame sequence/age, successful/failed
polls, Wi-Fi outages/recoveries, heap, configSource/configFetchResult, canonical
errors and OTA stage are added/reported. No firmware alias is sent, avoiding the
legacy numeric resetReason sanitizer.

Poll counters count completed poll cycles, not individual retry attempts, since
boot. Outages count loss after a first established Wi-Fi connection, not startup.
Frame sequence is null before any valid frame. Frame age and uptime use the
ESP monotonic 64-bit clock, saturating to uint32 seconds for the API.

bootId: two zero-padded random uint32 hex strings separated by a dash; constant
for the session, probabilistically unique, not a cryptographic identity.
bootCount: tc-platform/bootCount incremented once per boot; unknown on write
failure or saturation. Unknown reset codes remain UNKNOWN. Boot count measures
application starts, not every electrical interruption.

Canonical errors are state transitions with per-boot event IDs and count=1 per
activation; repeated health snapshots do not increase the count. Recovered state
is reported inactive. A very brief event may only be seen after recovery.
Existing bounded persistent legacy error queue remains for compatibility and
historical delivery; a transport incident can appear as both a historical legacy
event and a canonical state event. No sum across those sources is claimed.

## OTA

Existing chip/device/board/GPIO/count/partition/digest targeting is retained.
No release selection/backend changes. none/pending/success/failed stay the
canonical result vocabulary; otaStage gives more detail:

NOT_CHECKED, DISABLED, NO_UPDATE -> none.
UPDATE_AVAILABLE, DOWNLOAD_STARTED, TRIAL_BOOT -> pending.
FAILED_HTTP, FAILED_VALIDATION, FAILED_FLASH -> failed.
SUCCESS -> success, ONLY after esp_ota_mark_app_valid_cancel_rollback succeeds
under the existing >60s / >=2 good frames / alive renderer / non-stale criteria.

Download-complete is not SUCCESS. Trial failure retains the existing five-minute
rollback. Without rollback-enabled partitions/core, confirmed SUCCESS may never
be reported; do not infer confirmation from download or reboot. The result is
session-local, not a permanent OTA audit trail. Rollback to old firmware cannot
guarantee reporting of a failed trial from that newer firmware.

## Request cadence

Config: first stable connection + hourly after success; failed config at most
once per five minutes. Frame: 5..300 seconds, default10, measured after completion.
One existing retry per failed poll. Health: 300..900 seconds, default300; urgent
state/error posts at most once per60 seconds, including scheduled attempts.
OTA: existing first delay2min and six-hour check interval. Diagnostics: only
existing admin lease, up to one log POST/10s while leased (max15min).

Typical healthy daily upper estimate at defaults: 8,640 frame GET + 288 health
POST + 24 config GET + 4 OTA checks = 8,956, plus initial boot/manual activity.
Actual completion-based rate is lower with latency. Failed frames may double
frame requests due to the retained retry; urgent errors may raise health to
1,440/day, failed config up to288/day. ESP has no browser CORS preflight.
A 5s config allows ~17,280 frame GET/day before retries: this is a deliberate
existing contract bound, not a fleet-wide scalability guarantee.

## Memory and verification boundaries

Local Gråkallbanen 16-LED compile, core 3.3.11 / ArduinoJson 7.4.3:
ESP32-S3 uses 1,201,569 bytes flash (91% of 1,310,720-byte app partition),
59,576 bytes static RAM, compiler remainder 268,104 bytes. ESP32 also compiled
at approximately 1.24 MB flash (94%) and 62,480 bytes static RAM.
These are linker figures, NOT measured free heap under Wi-Fi/TLS/render load.
The default OTA partition leaves limited growth margin; do not choose a
non-OTA partition merely to make a future binary fit. CI separately compiles
both generated board fixtures on both targets; local results above are for the
16-LED prototype, not every product. No physical hardware tests were run.

All 34 test scripts pass, including compile-fixture validation and old 1.2.13 ingestion after a canonical 1.3
report. Fleet browser acceptance also passes with synthetic responses. Frame
pipeline reference tests pass; source guards compare the actual parser, pulse
and render functions to1.2.13 (only parser board-context expression differs).

Bodies bounded: config4KiB, frame32KiB, OTA manifest4KiB; bounded streaming avoids
unlimited getString allocation. Config JSON nominal capacity6KiB, canonical
cache3KiB, frame32KiB, health8KiB. ArduinoJson7 treats legacy capacity arguments
as compatibility hints, not hard allocation ceilings; bounded input is important.
NVS config writes only when accepted canonical content changes (and retry if a
prior write failed); boot count once per boot. Existing error-queue writes remain.

Config logs heap before/after. Existing frame log reports heap around parsing,
health tracks minimum sampled free heap; none proves absence of fragmentation
or captures every transient allocation. **No physical runtime heap measurement
or long-run stability result is claimed.**

See FIRMWARE_1_3_HARDWARE_TEST.md. Automated tests cover backend canonical/legacy
payloads, client-policy simulations and source regression guards; they are not an
ESP emulator. Compilation confirms toolchain integration, not electrical behavior.

## Rollback and remaining risks

Retain the original 1.2.13 .ino and its board_config/secrets, GPIO and LED layout.
USB-flash that version if needed; no NVS erase is required, tc-platform is
ignored by 1.2.13. Do not assume OTA allows a version downgrade (existing
newer-version selection does not). Keep the rollback-enabled partition layout.

Production risks: hardware validation pending; flash margin/partition choice,
power-loss during writes/update, TLS/network latency and heap under long run;
profile IDs must not be repurposed with different physical mapping. Device keys
remain local compiled secrets (readable with physical flash access); secure boot,
flash encryption and credential rotation are separate work. 401/404 retain last
valid config and TTL-governed display, not an immediate remote kill switch.

## Pre-hardware review

The release-prep host test covers unsigned-32-bit `millis()` wrap arithmetic,
counter saturation, repeated config/frame/health failures, cached config across
simulated boots, duplicate-write suppression, OTA state transitions and
secret-safe logging. It is a policy test, not a soak-test substitute.

Large allocations are bounded separately: frame input 32 KiB, health 8 KiB,
config 4 KiB, OTA manifest 4 KiB and the persistent error queue 3 KiB. Peak risk
is overlap of a TLS/HTTP response, ArduinoJson document and temporary `String`;
health/log payloads are the largest routine cases. Existing health/serial fields
are the default heap observation. A largest-free-block diagnostic should remain a
compile-time opt-in and be added only if physical testing shows fragmentation.

NVS writes are bounded: boot count once per boot, canonical config only when
content changes (or retry after a failed write), error queue on state changes or
queue delivery, and Wi-Fi credentials only during provisioning/reset. No periodic
health/frame write occurs. Interrupted writes and wear still require hardware.

Config/frame/status/OTA errors, HTTP 401/404/429/500, timeout and malformed JSON
retain the accepted state or cached/default safe state and do not intentionally
reboot. Wi-Fi reconnect backoff and radio recovery remain; long outages stay
degraded. Brownout/watchdog behavior remains a physical validation item.

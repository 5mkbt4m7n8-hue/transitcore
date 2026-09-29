# Hardware validation — manual report

Copy for each candidate. Blank fields are untested, never PASS. This template
records evidence; hardware-test-report.mjs uses equivalent JSON with fixed IDs.
Expectations below and FIRMWARE_1_3_QUICK_TEST.md are the authoritative I-A protocol.

| Metadata | Ordinary ESP32 | ESP32-S3 |
|---|---|---|
| Date/time + timezone | | |
| Firmware version | | |
| Firmware commit SHA (40 characters) | | |
| ESP32/module type | | |
| boardProfile | | |
| hardwareProfile | | |
| Actual flash size, bytes | | |
| Device ID (no token) | | |
| GPIO / logical & physical LED count | | |
| Core/library versions | | |
| Partition scheme / OTA slot bytes | | |
| Tester / power / network setup | | |

Use PASS / FAIL / BLOCKED / NOT_RUN in each Result cell. Attach observation or
evidence for PASS/FAIL. Different candidate commits need separate reports and
revalidation; do not combine old hardware evidence silently.

## A. Ordinary ESP32 quick validation

| Test-ID | Expected result | Actual result | Result | Comment / evidence |
|---|---|---|---|---|
| Q01 | One cold boot; startup completes | | NOT_RUN | |
| Q02 | Correct 1.3.x version | | NOT_RUN | |
| Q03 | Wi-Fi connects | | NOT_RUN | |
| Q04 | Config fetch SUCCESS | | NOT_RUN | |
| Q05 | Config source LIVE | | NOT_RUN | |
| Q06 | Valid frame accepted | | NOT_RUN | |
| Q07 | Accepted sequence nondecreasing; newer valid data accepted | | NOT_RUN | |
| Q08 | Health POST HTTP 200 | | NOT_RUN | |
| Q09 | RSSI in health/Fleet | | NOT_RUN | |
| Q10 | Boot count increments once per planned boot | | NOT_RUN | |
| Q11 | Boot ID changes on reset, stable otherwise | | NOT_RUN | |
| Q12 | Reset reason consistent with action | | NOT_RUN | |
| Q13 | Short disconnect detected, no reboot | | NOT_RUN | |
| Q14 | Wi-Fi/frame reconnect automatically | | NOT_RUN | |
| Q15 | CACHED config on offline reboot | | NOT_RUN | |
| Q16 | No unplanned reboot loop | | NOT_RUN | |
| Q17 | Matching fresh Fleet record | | NOT_RUN | |

Relevant Serial excerpts A (redacted, include timestamps and test IDs):

```text
Paste actual short boot/config/frame/status excerpts here.
```

## B. ESP32-S3 full validation

| Test-ID | Setup / handling | Expected result | Actual result | Result | Comment |
|---|---|---|---|---|---|
| S01 | Final S3 GPIO/strip/power; boot, config, frames; exercise existing pulse, PASSED, PARKED, collisions and dimming | Correct profile/layout and baseline display, no freeze; record boot/version/RSSI/sequence too | | NOT_RUN | |
| S02 | Staging feeds: valid then stale, older sequence, malformed, wrong profile/count, then valid | Invalid data never replaces last accepted frame/sequence; TTL expiry is safe; valid feed recovers | | NOT_RUN | |
| S03 | Compare Serial and new health/Fleet snapshot on S3 | Matching device/version/boot/config/sequence/RSSI; fresh lastSeen, no secret output | | NOT_RUN | |

Relevant Serial excerpts / Fleet evidence B:

```text
Paste actual evidence.
```

## C. OTA / rollback (S3)

| Test-ID | Setup / handling | Expected result | Actual result | Result | Comment |
|---|---|---|---|---|---|
| O01 | Controlled OTA target, recorded binary/digest/slot; perform update | Correct hardware target, pending until verified trial confirmation; SUCCESS only after confirmation | | NOT_RUN | |
| O02 | Controlled failed trial and incompatible/digest-invalid update; USB recovery available | Invalid target rejected; failed trial rolls back with rollback-enabled build/partition; USB fallback works | | NOT_RUN | |

Relevant Serial excerpts / old and new binary identities C:

```text
Paste actual evidence. Record both OTA image versions and commits.
```

## D. Power / NVS (S3)

| Test-ID | Setup / handling | Expected result | Actual result | Result | Comment |
|---|---|---|---|---|---|
| P01 | Controlled power interruption during config save, spare prototype and USB recovery | Old valid cache or safe default; no wrong hardware/layout or reboot loop | | NOT_RUN | |
| P02 | Several boots, unchanged config; controlled corrupt/binding-mismatched cache | Correct bootCount/bootId, cache accepted only for matching identity; invalid cache safely rejected | | NOT_RUN | |

Relevant Serial excerpts / power method D:

```text
Paste actual evidence. Do not induce unsafe short circuits/brownouts.
```

## E. Network failure (S3)

| Test-ID | Setup / handling | Expected result | Actual result | Result | Comment |
|---|---|---|---|---|---|
| N01 | Wi-Fi absent at boot and >10 min while running, then restore | No unplanned reboot loop, backoff, correct outage/recovery and usable frame after return | | NOT_RUN | |
| N02 | Controlled config/frame/health/OTA failures independently: 401/404/429/500, timeout, malformed JSON | Rate-limited attempts; no partial config/invalid frame activation; TTL respected; recovery without reset | | NOT_RUN | |

Record each endpoint/error combination separately in comments or an attached
matrix. Missing combinations keep N02 BLOCKED. Health malformed response testing
must distinguish accepted status POST from invalid optional response/lease data.

Relevant Serial excerpts / fault injection details E:

```text
Paste actual evidence.
```

## F. Long-run / soak (S3)

| Test-ID | Expected result | Actual result | Result | Comment |
|---|---|---|---|---|
| L01 | Complete 72h with checkpoint evidence, functioning LEDs and no unexplained resets/freezes | | NOT_RUN | |
| L02 | Free/min heap reviewed under comparable load; no unexplained downward trend; observation gaps documented | | NOT_RUN | |

Use FIRMWARE_1_3_SOAK_TEST.md for 0/1/6/12/24/48/72h snapshots.
Relevant Serial excerpts / snapshot files F:

```text
Paste snapshot references and observed issues.
```

## Candidate reviews (record in S3 run)

| Test-ID | Expected result | Actual result | Result | Comment |
|---|---|---|---|---|
| R01 | Final binary fits selected OTA slots; remaining bytes and reviewed growth margin recorded | | NOT_RUN | |
| R02 | Automated suite passes for candidate/support code; exact commits recorded | | NOT_RUN | |
| R03 | ESP32 and S3 compile evidence matches candidate/core/libraries | | NOT_RUN | |
| R04 | Credentials/logs/OTA targeting/security limitations reviewed for intended release | | NOT_RUN | |

Overall gate: BLOCKED until every required test has evidence and PASS.
Reviewer/date: ________. Deployment/package promotion requires separate approval.

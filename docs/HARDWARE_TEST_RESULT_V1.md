# Hardware Test Result v1

Local, manually recorded evidence for firmware 1.3.x. No database, automatic
hardware scoring, release promotion or deployment. The fixed test registry is
`CHECKS` in `scripts/hardware-test-report.mjs`.

## Results

| Result | Meaning |
|---|---|
| PASS | A person observed the expected result on the recorded hardware/candidate; include observation or evidence. |
| FAIL | Observed behavior contradicts the expectation; include the failure and evidence. |
| BLOCKED | Cannot complete the test (e.g. unavailable S3, credentials or controlled endpoint). Explain why. |
| NOT_RUN | Not attempted. An absent required test is reported as NOT_RUN, never PASS. |

## Input

UTF-8 JSON (BOM allowed), at most 1 MiB. Schema version defaults to 1 if omitted.
Single-run form accepts the user's minimal example:

```json
{
  "firmware": "1.3.0",
  "device": "esp32",
  "tests": [{"id":"Q01","result":"PASS","comment":""}]
}
```

This input is readable but the release gate is BLOCKED: it lacks metadata,
observation evidence and the remaining tests. It does not prove physical success.
Start with `docs/hardware-validation/quick-results.example.json`, whose result
is deliberately NOT_RUN.

Each run supports:

| Field | Format / purpose |
|---|---|
| device / hardwareFamily | Exactly esp32 or esp32s3. hardwareFamily is the travel-template alias; existing device inputs remain supported. If both are supplied they must agree. |
| date | ISO timestamp with timezone, e.g. 2026-09-29T10:00:00+02:00. |
| commitSha | Full 40-character Git commit of the tested firmware, not the report tooling. |
| esp32Type | Actual module/development board marking. |
| boardProfile, hardwareProfile | Exact provisioned identifiers from that build. |
| flashSizeBytes | Positive integer, actual module flash capacity; separate from app partition capacity. |
| deviceId | Optional identifier to correlate Fleet data; never the device token. |
| partitionScheme | Optional but recommended exact scheme and app-slot capacity. |
| coreVersion, libraryVersions | Optional version strings for reproducibility. |
| tester | Optional name or local tester identifier. |
| tests | Array of unique results for this family. |

The six fields date, commitSha, esp32Type, boardProfile, hardwareProfile and
flashSizeBytes are required for a PASS release gate. Metadata may be null as an
explicit unfilled placeholder (including commitSha); null is missing, never
evidence. Replace it with actual observed data before assessment.
Missing fields are listed;
malformed supplied fields are rejected. The root firmware must be a 1.3.x version.
Each test has id and result, plus optional string fields actual, comment,
evidence (a local filename/reference) and serialExcerpt. At least one nonblank
observation/reference is needed for each PASS/FAIL row to be considered evidenced.
The script cannot verify whether the human observation is true.

For combined assessment use `{"schemaVersion":1,"firmware":"1.3.0","runs":[... ]}`
where each run has the fields above. Use one run per family (maximum two).
Both must refer to the same candidate commit; consolidate repeated observations
manually and retain original reports. Never silently override a failed run with a
later PASS. Root single-run fields cannot be mixed with runs.

Unknown fields/IDs, duplicate IDs/families, wrong-family IDs, invalid statuses,
mixed candidate commits, malformed JSON and wrong types are errors. No partial
report is generated on error. Text fields are limited to 20,000 characters.
No secrets, Wi-Fi passwords, tokens or authorization headers belong in reports.
Free text is not a secret scrubber; review/redact excerpts before sharing.

The travel template at hardware-tests/examples/esp32-quick-test.json includes
Q01–Q17 as NOT_RUN and all metadata slots. See FIRMWARE_1_3_TRAVEL_TEST.md for
build, upload, snapshots and the manual report workflow. Hardware family is never
inferred from esp32Type, boardProfile or a comment.

## Required IDs and release decision

| Group | IDs | Hardware / expectation source |
|---|---|---|
| A | Q01–Q17 | Ordinary ESP32; FIRMWARE_1_3_QUICK_TEST.md |
| B | S01–S03 | ESP32-S3: normal rendering, invalid/stale frames, health/dashboard |
| C | O01–O02 | ESP32-S3: OTA confirmation, failed-trial rollback/USB recovery |
| D | P01–P02 | ESP32-S3: interrupted config write, NVS binding/reboots |
| E | N01–N02 | ESP32-S3: long Wi-Fi outage/recovery and independent endpoint failures |
| F | L01–L02 | ESP32-S3: 72h soak and human heap review |
| Review | R01–R04 | Attach to the S3 candidate run: flash margin, automated suite, both compiles, security |

Expectations for B–F/review are in HARDWARE_VALIDATION_REPORT_TEMPLATE.md.
All 32 required IDs must be PASS, with metadata/evidence, for a PASS release gate.
Any FAIL makes the gate FAIL. Otherwise a BLOCKED/NOT_RUN/missing row, metadata
or evidence makes it BLOCKED. Totals count every required ID once (missing counts
as NOT_RUN), while the missing list distinguishes absent from explicit NOT_RUN.
A gate PASS is a summary of manual records, not authorization to publish.

## Command

```sh
node scripts/hardware-test-report.mjs path/to/results.json
node scripts/hardware-test-report.mjs path/to/results.json --output path/to/new-report.md
```

Default is Markdown to stdout. Output filenames must be new; existing files
(including the input) are never overwritten. Exit 0 means a valid report was
generated, even when the gate is BLOCKED/FAIL. Exit 1 means invalid input/file
operation. This CLI is a report tool, not an automated release switch.

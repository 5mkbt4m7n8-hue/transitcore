import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// A fixed checklist: callers cannot reduce the required set through input JSON.
export const CHECKS = [
  ...["Cold boot", "Firmware version", "Wi-Fi connect", "DeviceConfig fetch",
    "Config source LIVE", "Frame fetch", "Accepted sequence", "Health POST",
    "RSSI", "Boot count", "Boot ID", "Reset reason", "Wi-Fi disconnect",
    "Reconnect", "Cached config after reboot", "No reboot loop", "Fleet visibility"]
    .map((name, i) => ({ id: "Q" + String(i + 1).padStart(2, "0"), name, device: "esp32", group: "A" })),
  ...[
    ["S01", "S3 boot/config/frame and physical rendering", "B"],
    ["S02", "Invalid/stale frame rejection and recovery", "B"],
    ["S03", "S3 health and dashboard telemetry", "B"],
    ["O01", "OTA update and confirmed boot", "C"],
    ["O02", "Failed trial rollback and USB recovery", "C"],
    ["P01", "Power loss during config write", "D"],
    ["P02", "NVS cache binding and repeated boots", "D"],
    ["N01", "Long Wi-Fi outage and reconnect", "E"],
    ["N02", "Endpoint error/timeout/malformed-response matrix", "E"],
    ["L01", "72-hour physical soak", "F"],
    ["L02", "Heap stability reviewed", "F"],
    ["R01", "Flash and OTA partition margin reviewed", "R"],
    ["R02", "Automated tests reviewed", "R"],
    ["R03", "Both ESP targets compiled", "R"],
    ["R04", "Security/log review", "R"]
  ].map(([id, name, group]) => ({ id, name, group, device: "esp32s3" }))
];
const RESULTS = ["PASS", "FAIL", "BLOCKED", "NOT_RUN"];
const META = ["date", "commitSha", "esp32Type", "boardProfile", "hardwareProfile",
  "flashSizeBytes", "deviceId", "partitionScheme", "coreVersion", "libraryVersions", "tester"];
const REQUIRED_META = ["date", "commitSha", "esp32Type", "boardProfile", "hardwareProfile", "flashSizeBytes"];
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = message => { throw new Error(message); };
function keys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(label + ": unknown field");
}
function string(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 20000) fail(label + ": invalid string");
}
export function summarize(input) {
  if (!object(input)) fail("Report must be an object");
  keys(input, ["schemaVersion", "firmware", "runs", "device", "hardwareFamily", "tests", ...META], "report");
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) fail("Unsupported schemaVersion");
  if (typeof input.firmware !== "string" || !/^1\.3\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(input.firmware)) fail("Expected firmware 1.3.x");
  const grouped = input.runs !== undefined;
  if (grouped && ["device", "hardwareFamily", "tests", ...META].some(key => key in input)) fail("Do not mix runs with single-run fields");
  const runs = grouped ? input.runs : [input];
  if (!Array.isArray(runs) || runs.length < 1 || runs.length > 2) fail("Expected one or two runs");
  const rows = new Map(), devices = new Set(), metadataMissing = [], commits = new Set();
  const normalizedRuns = [];
  for (const run of runs) {
    if (!object(run)) fail("Run must be an object");
    if (grouped) keys(run, ["device", "hardwareFamily", "tests", ...META], "run");
    for (const key of ["device", "hardwareFamily"]) if (key in run && !["esp32", "esp32s3"].includes(run[key])) fail("Invalid hardware family");
    if (run.device !== undefined && run.hardwareFamily !== undefined && run.device !== run.hardwareFamily) fail("Conflicting hardware family");
    const family = run.hardwareFamily ?? run.device;
    if (!["esp32", "esp32s3"].includes(family) || devices.has(family)) fail("Invalid or duplicate device family");
    devices.add(family);
    normalizedRuns.push({ ...run, device: family });
    for (const key of META) if (run[key] !== undefined && run[key] !== null) {
      if (key === "flashSizeBytes") {
        if (!Number.isSafeInteger(run[key]) || run[key] <= 0) fail("Invalid flashSizeBytes");
      } else string(run[key], key);
    }
    if (run.date != null && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(run.date) || !Number.isFinite(Date.parse(run.date)))) fail("date must be an ISO timestamp with timezone");
    if (run.commitSha != null && !/^[a-f0-9]{40}$/i.test(run.commitSha)) fail("commitSha must be a full Git SHA");
    if (run.commitSha) commits.add(run.commitSha.toLowerCase());
    for (const key of REQUIRED_META) if (run[key] == null) metadataMissing.push(family + "." + key);
    if (!Array.isArray(run.tests) || run.tests.length > CHECKS.length) fail("tests must be a bounded array");
    for (const test of run.tests) {
      if (!object(test)) fail("Test must be an object");
      keys(test, ["id", "result", "comment", "actual", "serialExcerpt", "evidence"], "test");
      const definition = CHECKS.find(check => check.id === test.id);
      if (!definition) fail("Unknown test ID");
      if (definition.device !== family) fail("Test belongs to a different device family");
      if (rows.has(test.id)) fail("Duplicate test ID");
      if (!RESULTS.includes(test.result)) fail("Invalid test result");
      for (const key of ["comment", "actual", "serialExcerpt", "evidence"]) {
        if (test[key] !== undefined && (typeof test[key] !== "string" || test[key].length > 20000)) fail("Invalid test text");
      }
      rows.set(test.id, test);
    }
  }
  if (commits.size > 1) fail("Runs must validate the same candidate commit");
  const missing = CHECKS.filter(check => !rows.has(check.id)).map(check => check.id);
  const counts = Object.fromEntries(RESULTS.map(result => [result, 0]));
  for (const check of CHECKS) counts[rows.get(check.id)?.result ?? "NOT_RUN"]++;
  // PASS/FAIL must be supported by a human observation/reference. Never infer it from Serial.
  const evidenceMissing = [...rows.values()].filter(test =>
    ["PASS", "FAIL"].includes(test.result) && ![test.actual, test.comment, test.evidence, test.serialExcerpt].some(text => text?.trim())
  ).map(test => test.id);
  const gate = counts.FAIL ? "FAIL" :
    counts.BLOCKED || counts.NOT_RUN || metadataMissing.length || evidenceMissing.length ? "BLOCKED" : "PASS";
  return { firmware: input.firmware, runs: normalizedRuns, rows, missing, counts, metadataMissing, evidenceMissing, gate };
}
// Render user-supplied text as inert Markdown table content, including Serial excerpts.
const cell = value => String(value ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/\|/g, "&#124;").replace(/\x60/g, "&#96;")
  .replace(/\[/g, "&#91;").replace(/\]/g, "&#93;").replace(/[\r\n]+/g, "<br>");
export function renderReport(input) {
  const s = summarize(input);
  const lines = ["# Hardware validation report", "", "Firmware: " + cell(s.firmware), "",
    "Release gate: **" + s.gate + "** (manual evidence only; no release/deployment authorization).", "",
    ...RESULTS.map(result => "- " + result + ": " + s.counts[result]), "",
    "Missing tests: " + (s.missing.join(", ") || "none"),
    "Missing metadata: " + (s.metadataMissing.join(", ") || "none"),
    "Missing observation/evidence: " + (s.evidenceMissing.join(", ") || "none"), "",
    "A quick ESP32 pass alone cannot satisfy S3, OTA, NVS and soak gates.", ""];
  for (const run of s.runs) {
    lines.push("## " + run.device, "", "| Metadata | Value |", "|---|---|",
      ...META.map(key => "| " + key + " | " + cell(run[key]) + " |"), "");
  }
  lines.push("| Group / ID | Required check | Result | Actual / comment | Evidence | Serial excerpt |",
    "|---|---|---|---|---|---|");
  for (const check of CHECKS) {
    const row = s.rows.get(check.id);
    lines.push("| " + check.group + " / " + check.id + " | " + check.name + " | " +
      (row?.result ?? "NOT_RUN") + " | " + cell([row?.actual, row?.comment].filter(Boolean).join("; ")) +
      " | " + cell(row?.evidence) + " | " + cell(row?.serialExcerpt) + " |");
  }
  return lines.join("\n") + "\n";
}
export function main(args) {
  if (args.length !== 1 && !(args.length === 3 && args[1] === "--output")) fail("Usage: node scripts/hardware-test-report.mjs results.json [--output report.md]");
  const input = fs.readFileSync(args[0], "utf8");
  if (Buffer.byteLength(input) > 1024 * 1024) fail("Input exceeds 1 MiB");
  const markdown = renderReport(JSON.parse(input.replace(/^\uFEFF/, "")));
  if (args.length === 3) fs.writeFileSync(args[2], markdown, { encoding: "utf8", flag: "wx" });
  else process.stdout.write(markdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch { console.error("Invalid hardware report or file operation. Check schema, IDs, metadata and paths; output must be a new file. Input contents are not logged."); process.exitCode = 1; }
}

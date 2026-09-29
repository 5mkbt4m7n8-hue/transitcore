import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CHECKS, summarize, renderReport, main } from "./hardware-test-report.mjs";

// Synthetic parser fixtures ONLY. These are not physical hardware results.
const allPass = {
  schemaVersion: 1, firmware: "1.3.0",
  runs: ["esp32", "esp32s3"].map(device => ({
    device, date: "2026-09-29T10:00:00+02:00", commitSha: "a".repeat(40),
    esp32Type: device, boardProfile: "test-board", hardwareProfile: "test-hardware",
    flashSizeBytes: 4194304,
    tests: CHECKS.filter(c => c.device === device).map(c => ({
      id: c.id, result: "PASS", actual: "Synthetic parser input; no physical validation."
    }))
  }))
};
assert.equal(summarize(allPass).gate, "PASS");
assert.equal(summarize(allPass).counts.PASS, CHECKS.length);
assert.deepEqual(summarize(allPass).missing, []);
function changed(edit) { const copy = structuredClone(allPass); edit(copy); return copy; }
assert.equal(summarize(changed(r => r.runs[0].tests[0].result = "FAIL")).gate, "FAIL");
assert.equal(summarize(changed(r => r.runs[0].tests[0].result = "BLOCKED")).gate, "BLOCKED");
assert.equal(summarize(changed(r => r.runs[0].tests[0].result = "NOT_RUN")).gate, "BLOCKED");
const absent = summarize(changed(r => r.runs[0].tests.shift()));
assert.ok(absent.missing.includes("Q01"));
assert.equal(absent.counts.NOT_RUN, 1);
assert.equal(absent.gate, "BLOCKED");
const quick = summarize({ firmware: allPass.firmware, ...allPass.runs[0] });
assert.equal(quick.gate, "BLOCKED", "Quick PASS must never release S3");
assert.ok(quick.missing.includes("L01"));
assert.equal(summarize(changed(r => delete r.runs[0].commitSha)).gate, "BLOCKED");
assert.equal(summarize(changed(r => delete r.runs[0].tests[0].actual)).gate, "BLOCKED");
for (const edit of [
  r => r.runs[0].tests[0].id = "UNKNOWN",
  r => r.runs[0].tests.push(r.runs[0].tests[0]),
  r => r.runs[0].tests[0].result = "pass",
  r => r.runs[0].tests[0].result = null,
  r => r.runs[0].tests[0].comment = {},
  r => r.runs[0].tests[0].id = "S01",
  r => r.runs[0].tests = "PASS",
  r => r.runs[0].flashSizeBytes = -1,
  r => r.runs[0].date = "yesterday",
  r => r.runs[0].commitSha = "short",
  r => r.runs[1].commitSha = "b".repeat(40),
  r => r.runs.push(r.runs[0]),
  r => r.device = "esp32",
  r => r.firmware = "1.2.13",
  r => r.schemaVersion = 2,
  r => r.token = "should-not-be-accepted"
]) assert.throws(() => summarize(changed(edit)));
for (const input of [null, [], {}, "{}", { firmware: "1.3.0", device: "esp32" }]) assert.throws(() => summarize(input));
const minimum = { firmware: "1.3.0", device: "esp32", tests: [{ id: "Q01", result: "PASS", comment: "" }] };
assert.equal(summarize(minimum).gate, "BLOCKED");
assert.match(renderReport(minimum), /Q02/);
assert.match(renderReport(allPass), /Release gate: \*\*PASS\*\*/);
const escaped = renderReport(changed(r => r.runs[0].tests[0].serialExcerpt = "<script>x</script>|[link](x)\nnext"));
assert.ok(escaped.includes("&lt;script&gt;"));
assert.ok(escaped.includes("&#124;"));
assert.ok(!escaped.includes("<script>"));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hardware-report-test-"));
try {
  const input = path.join(temp, "input.json"), output = path.join(temp, "report.md");
  fs.writeFileSync(input, JSON.stringify(minimum));
  main([input, "--output", output]);
  assert.equal(fs.readFileSync(output, "utf8"), renderReport(minimum));
  assert.throws(() => main([input, "--output", output]), /EEXIST/);
  assert.throws(() => main([input, "--output", input]), /EEXIST/);
  fs.writeFileSync(input, "{");
  assert.throws(() => main([input, "--output", path.join(temp, "invalid.md")]));
  assert.equal(fs.existsSync(path.join(temp, "invalid.md")), false);
  assert.throws(() => main([]));
} finally {
  fs.rmSync(temp, { recursive: true, force: true }); // Only this test's own temporary directory.
}
console.log("Hardware report: PASS/FAIL/BLOCKED/missing, schema, device/commit isolation and CLI output passed (synthetic data)");

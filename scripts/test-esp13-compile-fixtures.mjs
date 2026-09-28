import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CI_ONLY_LED_DATA_PIN, resolveFixtureGpio } from "./esp13-fixture-gpio.mjs";

for (const pin of [null, undefined]) {
  assert.deepEqual(resolveFixtureGpio(pin), { pin: CI_ONLY_LED_DATA_PIN, synthetic: true });
}
for (const pin of [0, 2, 14, 48]) {
  assert.deepEqual(resolveFixtureGpio(pin), { pin, synthetic: false });
}
for (const pin of ["null", "14", "", false, {}, [], -1, 49, 1.5, NaN, Infinity]) {
  assert.throws(() => resolveFixtureGpio(pin), /Invalid hardware dataPin/);
}

const root = path.resolve(import.meta.dirname, "..");
const ids = ["grakallbanen-prototype-board", "trondheim-bus-board"];
const profiles = ids.flatMap(id => [
  path.join(root, "config/hardware", `${id}-hardware.json`),
  path.join(root, "config/boards", `${id}.json`)
]);
const originalProfiles = profiles.map(file => fs.readFileSync(file, "utf8"));
const output = fs.mkdtempSync(path.join(os.tmpdir(), "transitcore-esp13-fixture-test-"));
try {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/prepare-esp13-compile.mjs"), output], { encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /::warning::trondheim-bus-board:.*CI-only GPIO.*DO NOT FLASH/);
  for (const id of ids) {
    const hardware = JSON.parse(fs.readFileSync(path.join(root, "config/hardware", `${id}-hardware.json`), "utf8"));
    const expected = resolveFixtureGpio(hardware.leds.dataPin);
    const header = fs.readFileSync(path.join(output, `TransitCore13_${id.replaceAll("-", "_")}`, "board_config.h"), "utf8");
    assert.match(header, /DO NOT FLASH/);
    assert.ok(header.includes(`const uint8_t LED_DATA_PIN = ${expected.pin};`));
    assert.ok(header.includes(`#define TRANSITCORE_CI_SYNTHETIC_GPIO ${Number(expected.synthetic)}`));
    assert.doesNotMatch(header, /\b(null|undefined|NaN|Infinity)\b/);
  }
  profiles.forEach((file, index) => assert.equal(fs.readFileSync(file, "utf8"), originalProfiles[index], "Compile generation must not change board contracts"));
} finally {
  // Only the exact temporary directory created by this test is removed.
  fs.rmSync(output, { recursive: true, force: true });
}
console.log("ESP13 compile fixtures: missing GPIO, invalid GPIO, generated C++ and unchanged profiles PASS");

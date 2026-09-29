import assert from "node:assert/strict";
import fs from "node:fs";

const firmware = fs.readFileSync(new URL("../firmware/esp32/TransitCore_Universal_BoardClient_v1_3_0.ino", import.meta.url), "utf8");
const u32 = (n) => Math.min(0xffffffff, Math.max(0, n));
assert.equal(u32(0xffffffff + 1), 0xffffffff);
const elapsed = (now, then) => (now - then) >>> 0;
assert.equal(elapsed(0x10, 0xfffffff0), 32, "millis wrap elapsed time remains valid");
assert.equal(elapsed(0x80000010, 0x7ffffff0), 32);
let frameFailures = 0, healthFailures = 0, configFailures = 0;
for (let i = 0; i < 10000; i++) { frameFailures = u32(frameFailures + 1); healthFailures = u32(healthFailures + 1); configFailures = u32(configFailures + 1); }
assert.equal(frameFailures, 10000); assert.equal(healthFailures, 10000); assert.equal(configFailures, 10000);
let cached = { version: 1 }, active = cached, source = "CACHED", writes = 0;
const configAttempt = (status, candidate) => {
  if (status !== 200 || !candidate || candidate.boardProfile !== "board") return false;
  if (JSON.stringify(candidate) !== JSON.stringify(cached)) { cached = candidate; writes++; }
  active = candidate; source = "LIVE"; return true;
};
for (const status of [-1, 401, 404, 429, 500, 503]) assert.equal(configAttempt(status), false);
assert.deepEqual(active, { version: 1 }); assert.equal(source, "CACHED");
assert.equal(configAttempt(200, { boardProfile: "wrong" }), false);
assert.equal(configAttempt(200, { boardProfile: "board", version: 2 }), true);
assert.equal(writes, 1);
for (let i = 0; i < 100; i++) assert.equal(configAttempt(503), false);
assert.equal(source, "LIVE", "repeated outage does not discard last accepted config");
assert.ok(firmware.includes('setOtaStage("SUCCESS","success")'));
assert.ok(firmware.includes('esp_ota_mark_app_valid_cancel_rollback()==ESP_OK'));
assert.ok(firmware.includes("hasEverConnected && wifiOutageCount < UINT32_MAX"));
assert.ok(firmware.includes("if (successfulFeedPolls < UINT32_MAX)"));
assert.ok(firmware.includes("if (failedFeedPolls < UINT32_MAX)"));
assert.ok(firmware.includes('encoded!=cachedConfigEncoding') || fs.readFileSync(new URL("../firmware/esp32/TransitCore_Platform_v1.h", import.meta.url), "utf8").includes('encoded!=cachedConfigEncoding'));
assert.ok(firmware.includes('if (document.overflowed())'));
assert.ok(!firmware.includes('Serial.println(body)'));
console.log("Firmware edge policies: millis wrap, saturation, outage/cache repetition, OTA transitions and secret-safe logging PASS");

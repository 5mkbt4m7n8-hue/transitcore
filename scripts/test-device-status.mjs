import assert from "node:assert/strict";
import { cleanStatusPayload, DeviceStatus, resolveDeviceRegistration, validBoardId } from "../worker/led-feed-worker.mjs";

const input = {
  schemaVersion: 1,
  boardProfile: "trondheim-bus-board",
  firmware: "1.0.4",
  uptimeSeconds: 3600,
  wifiOutages: 1,
  wifiRecoveries: 1,
  feedSuccesses: 300,
  feedFailures: 2,
  frameAgeSeconds: 4,
  frameValid: true,
  freeHeap: 214000,
  minimumFreeHeap: 208000,
  ignored: "not stored"
};
const clean = cleanStatusPayload(input, "trondheim-bus-001", "trondheim-bus-board", Date.parse("2026-08-13T18:00:00Z"));
assert.equal(clean.receivedAt, "2026-08-13T18:00:00.000Z");
assert.equal(clean.deviceId, "trondheim-bus-001");
assert.equal(clean.boardProfile, "trondheim-bus-board");
assert.equal(clean.ignored, undefined);
assert.throws(() => cleanStatusPayload({ ...input, boardProfile: "wrong" }, "trondheim-bus-001", "trondheim-bus-board", Date.now()));
assert.throws(() => cleanStatusPayload({ ...input, freeHeap: -1 }, "trondheim-bus-001", "trondheim-bus-board", Date.now()));
const uniqueToken="0123456789abcdef0123456789abcdef";
assert.equal(validBoardId("oslo-metro-wizard-shared"),true);
assert.equal(validBoardId("../not-a-board"),false);
const registration=resolveDeviceRegistration({DEVICE_INGEST_TOKENS:JSON.stringify({"trondheim-bus-001":{boardProfile:"trondheim-bus-board",token:uniqueToken}})},"trondheim-bus-001");
assert.deepEqual(registration,{deviceId:"trondheim-bus-001",boardProfile:"trondheim-bus-board",token:uniqueToken,legacy:false});
assert.equal(resolveDeviceRegistration({DEVICE_INGEST_TOKENS:JSON.stringify({"trondheim-bus-001":{boardProfile:"trondheim-bus-board",token:uniqueToken,enabled:false}})},"trondheim-bus-001"),null);
assert.equal(resolveDeviceRegistration({STATUS_INGEST_TOKEN:"legacy"},"trondheim-bus-board").legacy,true);
assert.equal(resolveDeviceRegistration({DEVICE_INGEST_TOKENS:JSON.stringify({"custom-001":{boardProfile:"future-published-board",token:uniqueToken}})},"custom-001").boardProfile,"future-published-board");

const currentFirmware = cleanStatusPayload({ ...input, firmware:"1.1.4" }, "oslo-shared-001", "trondheim-bus-board", Date.now());
assert.equal(currentFirmware.firmware,"1.1.4");

const values = new Map();
const state = { storage: {
  get: async key => values.get(key),
  put: async entries => Object.entries(entries).forEach(([key, value]) => values.set(key, value))
} };
const object = new DeviceStatus(state);
for (let i = 0; i < 300; i++) {
  await object.fetch(new Request("https://internal/", { method: "POST", body: JSON.stringify({ ...clean, uptimeSeconds: i }) }));
}
const stored = await object.fetch(new Request("https://internal/")).then(response => response.json());
assert.equal(stored.latest.uptimeSeconds, 299);
assert.equal(stored.history.length, 288);
assert.equal(stored.history[0].uptimeSeconds, 12);
console.log("Device status tests OK");


import assert from "node:assert/strict";
import { cleanStatusPayload, DeviceStatus } from "../worker/led-feed-worker.mjs";

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
const clean = cleanStatusPayload(input, "trondheim-bus-board", Date.parse("2026-08-13T18:00:00Z"));
assert.equal(clean.receivedAt, "2026-08-13T18:00:00.000Z");
assert.equal(clean.ignored, undefined);
assert.throws(() => cleanStatusPayload({ ...input, boardProfile: "wrong" }, "trondheim-bus-board", Date.now()));
assert.throws(() => cleanStatusPayload({ ...input, freeHeap: -1 }, "trondheim-bus-board", Date.now()));

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


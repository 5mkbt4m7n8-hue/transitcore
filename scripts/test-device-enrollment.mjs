import assert from "node:assert/strict";
import worker, { DeviceStatus, handleDevices } from "../worker/led-feed-worker.mjs";

const values = new Map();
const storage = {
  get: async key => values.get(key),
  put: async (key, value) => {
    if (typeof key === "string") values.set(key, value);
    else Object.entries(key).forEach(([entryKey, entryValue]) => values.set(entryKey, entryValue));
  },
  list: async ({ prefix }) => new Map([...values].filter(([key]) => key.startsWith(prefix)))
};
const registry = new DeviceStatus({ storage });
const statusValues = new Map();
const statusObject = new DeviceStatus({ storage: {
  get: async key => statusValues.get(key),
  put: async entries => Object.entries(entries).forEach(([key, value]) => statusValues.set(key, value))
} });
const namespace = {
  idFromName: name => name,
  get: id => ({ fetch: (url, options) => (id === "__device-registry__" ? registry : statusObject).fetch(new Request(url, options)) })
};
const env = { PUBLISH_ADMIN_TOKEN: "admin-secret", DEVICE_STATUS: namespace };
const endpoint = "https://worker.example/v1/admin/devices";
const adminRequest = (method, body, token = "admin-secret") => new Request(endpoint, {
  method,
  headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});

assert.equal((await handleDevices(adminRequest("GET", null, "wrong"), env)).status, 401);
const createdResponse = await handleDevices(adminRequest("POST", { action: "create", boardProfile: "trondheim-bus-board", label: "Testenhet" }), env);
assert.equal(createdResponse.status, 201);
const created = await createdResponse.json();
assert.match(created.device.deviceId, /^trondheim-bus-board-[a-z0-9_-]+$/);
assert.ok(created.token.length >= 32);
const stored = values.get(`device:${created.device.deviceId}`);
assert.match(stored.tokenHash, /^[0-9a-f]{64}$/);
assert.equal(JSON.stringify(stored).includes(created.token), false);

const statusPayload = {schemaVersion:1,deviceId:created.device.deviceId,boardProfile:"trondheim-bus-board",firmware:"1.0.10",uptimeSeconds:10,wifiOutages:0,wifiRecoveries:0,feedSuccesses:1,feedFailures:0,frameAgeSeconds:0,frameValid:true,profileRevision:1,profileFingerprint:"0123456789abcdef",freeHeap:200000,minimumFreeHeap:190000};
const statusRequest = token => new Request(`https://worker.example/v1/devices/${created.device.deviceId}/status`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(statusPayload)});
assert.equal((await worker.fetch(statusRequest("wrong"),env)).status,401);
assert.equal((await worker.fetch(statusRequest(created.token),env)).status,200);
assert.equal(statusValues.get("latest").deviceId,created.device.deviceId);

const listed = await handleDevices(adminRequest("GET"), env).then(response => response.json());
assert.equal(listed.devices.length, 1);
assert.equal(listed.devices[0].tokenHash, undefined);

const rotated = await handleDevices(adminRequest("POST", { action: "rotate", deviceId: created.device.deviceId }), env).then(response => response.json());
assert.notEqual(rotated.token, created.token);
assert.equal(JSON.stringify(values.get(`device:${created.device.deviceId}`)).includes(rotated.token), false);
assert.equal((await worker.fetch(statusRequest(created.token),env)).status,401);
assert.equal((await worker.fetch(statusRequest(rotated.token),env)).status,200);

const revokedResponse = await handleDevices(adminRequest("POST", { action: "revoke", deviceId: created.device.deviceId }), env);
assert.equal(revokedResponse.status, 200);
assert.equal(values.get(`device:${created.device.deviceId}`).enabled, false);
assert.equal((await worker.fetch(statusRequest(rotated.token),env)).status,404);
console.log("Device enrollment, one-time token, rotation and revocation tests OK");

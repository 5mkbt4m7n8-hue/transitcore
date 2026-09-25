import assert from 'node:assert/strict';
import { DeviceStatus } from '../worker/led-feed-worker.mjs';
const data = new Map();
const device = new DeviceStatus({ storage: {
  get: async key => data.get(key), put: async (key, value) => data.set(key, structuredClone(value))
} });
const base = { boardProfile: 'grakallbanen-prototype-board', ledCount: 16,
  profileFingerprint: 'test', ttlSeconds: 30 };
const led = { id: 9, state: 'AT_STOP', brightness: 32, rgb: [0,80,255],
  vehicle: { id: '97', positionType: 'station', latitude: 63.4, longitude: 10.3 } };
async function send(time, leds) {
  return (await device.fetch(new Request('https://test/motion', { method: 'POST',
    body: JSON.stringify({ now: time, frame: { ...base, leds }, afterglowMs: 10000 }) }))).json();
}
assert.equal((await send(100000, [led])).ttlSeconds, 300);
const original = structuredClone(data.get('motion'));
for (const time of [110000, 250000, 399000]) {
  const held = await send(time, []);
  assert.equal(held.leds.length, 1);
  assert.equal(held.dataQuality.state, 'held');
  assert.deepEqual(data.get('motion'), original, 'Holding must not advance motion');
}
assert.equal((await send(411000, [])).leds.length, 0, 'Night shutdown remains bounded');
assert.equal((await send(420000, [led])).dataQuality, undefined);
console.log('Empty feed hold tests passed');
await send(430000, [{ ...led, state: 'APPROACHING' }]);
const guarded = await send(440000, [{ ...led, state: 'APPROACHING' }]);
assert.equal(guarded.leds.length, 1, 'Lifecycle suppression must not black out the entire board');
assert.equal(guarded.leds[0].lifecycle, 'PASSED');
assert.equal(guarded.dataQuality.state, 'held');
assert.ok(data.get('motion')['9'].hiddenUntil, 'Keep hidden motion memory while holding display');

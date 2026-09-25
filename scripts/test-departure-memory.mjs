import assert from 'node:assert/strict';
import { applyMotionLifecycle } from '../worker/led-feed-worker.mjs';

let state = {};
function step(t, status, id = 9, vehicle = '97') {
  const frame = { boardProfile: 'grakallbanen-prototype-board', ledCount: 16,
    leds: status ? [{ id, state: status, rgb: [0,80,255], brightness: 32,
      vehicle: { id: vehicle, positionType: 'station', distanceMeters: 20,
        latitude: 63.4, longitude: 10.3 } }] : [] };
  const result = applyMotionLifecycle(frame, state, 100000 + t, 10000);
  state = result.state;
  return result.frame.leds.map(led => led.lifecycle || led.state);
}
assert.deepEqual(step(0, 'AT_STOP'), ['AT_STOP']);
assert.deepEqual(step(10000, 'APPROACHING'), ['PASSED']);
assert.deepEqual(step(20000, 'APPROACHING'), []);
assert.deepEqual(step(30000, 'APPROACHING'), []);
assert.deepEqual(step(40000, null), []);
assert.deepEqual(step(50000, 'AT_STOP'), []);
assert.deepEqual(step(60000, 'APPROACHING', 8), ['APPROACHING']);
assert.equal(state['9'], undefined, 'Advancing clears the old departure');
assert.deepEqual(step(70000, 'AT_STOP', 9), ['AT_STOP']);
assert.deepEqual(step(80000, 'APPROACHING', 9), ['PASSED']);
assert.deepEqual(step(90000, null), []);
assert.deepEqual(step(100000, 'AT_STOP', 9, '99'), ['AT_STOP']);
state = {};
step(0, 'AT_STOP'); step(10000, 'APPROACHING'); step(20000, null);
assert.deepEqual(step(141000, 'AT_STOP'), ['AT_STOP'], 'Memory is bounded');
console.log('Departure memory tests passed');
state = {};
step(0, 'AT_STOP'); step(10000, 'APPROACHING');
for (let time = 20000; time <= 300000; time += 10000) {
  assert.deepEqual(step(time, 'AT_STOP'), [], 'Continuous reports must not reset PASSED after two minutes');
}
assert.deepEqual(step(310000, 'APPROACHING', 8), ['APPROACHING']);

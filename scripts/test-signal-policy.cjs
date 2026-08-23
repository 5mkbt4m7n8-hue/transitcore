const assert = require("node:assert/strict");
const policy = require("../web/shared/signal-policy.js");

assert.equal(policy.version, 1);
assert.equal(policy.resolveEta(31), "OFF");
assert.equal(policy.resolveEta(30), "APPROACHING");
assert.equal(policy.resolveEta(1), "APPROACHING");
assert.equal(policy.resolveEta(0), "AT_STOP");
assert.equal(policy.resolveEta(-10), "AT_STOP");
assert.equal(policy.highestState([{state:"PASSED"},{state:"APPROACHING"},{state:"AT_STOP"}]), "AT_STOP");
assert.equal(policy.highestState([{state:"afterglow"},{state:"approaching"}]), "APPROACHING");
assert.equal(policy.settings.departureAfterglowSeconds, 10);
assert.equal(policy.settings.approachPulseSeconds, 1.8);

console.log("Signal policy tests OK");

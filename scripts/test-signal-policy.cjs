const assert = require("node:assert/strict");
const fs = require("node:fs");
const policy = require("../web/shared/signal-policy.js");
const css = fs.readFileSync(require.resolve("../web/shared/signal-policy.css"), "utf8");

assert.equal(policy.version, 1);
assert.equal(policy.resolveEta(31), "OFF");
assert.equal(policy.resolveEta(30), "APPROACHING");
assert.equal(policy.resolveEta(1), "APPROACHING");
assert.equal(policy.resolveEta(0), "AT_STOP");
assert.equal(policy.resolveEta(-10), "AT_STOP");
assert.equal(policy.highestState([{state:"PASSED"},{state:"APPROACHING"},{state:"AT_STOP"}]), "AT_STOP");
assert.equal(policy.highestState([{state:"AT_STOP"},{state:"PARKED"}]), "PARKED");
assert.equal(policy.highestState([{state:"afterglow"},{state:"approaching"}]), "APPROACHING");
assert.equal(policy.settings.departureAfterglowSeconds, 10);
assert.equal(policy.settings.approachPulseSeconds, 1.8);
assert.equal(policy.settings.parkedAfterSeconds, 300);
assert.equal(policy.settings.parkedMovementThresholdMeters, 15);
assert.match(css,/0%,100%\{opacity:0;/,"nettvisningen skal fade approaching helt ned til av");
assert.equal(policy.approachAnimationDelayMs(0), 0);
assert.equal(policy.approachAnimationDelayMs(1000), -1000);
assert.equal(policy.approachAnimationDelayMs(1800), 0);
assert.equal(policy.approachAnimationDelayMs(1900), -100);

console.log("Signal policy tests OK");

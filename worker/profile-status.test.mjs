import assert from "node:assert/strict";
import { cleanStatusPayload } from "./led-feed-worker.mjs";

const base={schemaVersion:1,boardProfile:"test-board",uptimeSeconds:1,wifiOutages:0,wifiRecoveries:0,feedSuccesses:1,feedFailures:0,frameAgeSeconds:0,frameValid:true,freeHeap:200000,minimumFreeHeap:190000};
const legacy=cleanStatusPayload({...base,firmware:"1.0.4"},"test-board",Date.now());
assert.equal(legacy.profileRevision,0);
assert.equal(legacy.profileFingerprint,"");
const current=cleanStatusPayload({...base,firmware:"1.0.5",profileRevision:1,profileFingerprint:"0123456789abcdef"},"test-board",Date.now());
assert.equal(current.profileRevision,1);
assert.equal(current.profileFingerprint,"0123456789abcdef");
const wifiHealthFix=cleanStatusPayload({...base,firmware:"1.0.6",profileRevision:1,profileFingerprint:"0123456789abcdef"},"test-board",Date.now());
assert.equal(wifiHealthFix.firmware,"1.0.6");
const commissioningVersion=cleanStatusPayload({...base,firmware:"1.0.7",profileRevision:1,profileFingerprint:"0123456789abcdef"},"test-board",Date.now());
assert.equal(commissioningVersion.firmware,"1.0.7");
assert.equal(wifiHealthFix.profileRevision,1);
assert.equal(wifiHealthFix.profileFingerprint,"0123456789abcdef");
assert.throws(()=>cleanStatusPayload({...base,firmware:"1.0.5",profileRevision:1,profileFingerprint:""},"test-board",Date.now()));
assert.throws(()=>cleanStatusPayload({...base,firmware:"1.0.5",profileRevision:1,profileFingerprint:"not-a-fingerprint"},"test-board",Date.now()));
console.log("ESP profile status tests OK");

import assert from "node:assert/strict";
import { attachProfileIdentity, buildSignalTestSequence } from "./led-feed-worker.mjs";

const hardware={schemaVersion:1,boardProfile:"test-board",leds:{count:1,brightnessLimit:32},assignments:[{sourceNodeId:"a",logicalLed:0,physicalLed:0}]};
const first={schemaVersion:2,id:"test-board",routes:["route-1"],leds:{count:1},nodes:[{id:"a",name:"A",led:0,stopIds:["q"],routes:["route-1"]}]};
await attachProfileIdentity(first,hardware);
assert.equal(first.profileRevision,1);
assert.match(first.profileFingerprint,/^[0-9a-f]{16}$/);
const same=JSON.parse(JSON.stringify({...first,profileFingerprint:undefined}));
await attachProfileIdentity(same,hardware);
assert.equal(same.profileFingerprint,first.profileFingerprint);
const changed=JSON.parse(JSON.stringify({...first,profileFingerprint:undefined,name:"Endret"}));
await attachProfileIdentity(changed,hardware);
assert.notEqual(changed.profileFingerprint,first.profileFingerprint);
const frames=buildSignalTestSequence({boardProfile:first.id,profileRevision:first.profileRevision,profileFingerprint:first.profileFingerprint,ledCount:1,ledId:0,firstLine:{code:"1",rgb:[1,2,3]},secondLine:{code:"2",rgb:[4,5,6]}});
assert.ok(frames.every(frame=>frame.profileRevision===1&&frame.profileFingerprint===first.profileFingerprint));
console.log("Profile revision and fingerprint tests OK");

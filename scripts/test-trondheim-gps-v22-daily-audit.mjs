import assert from 'node:assert/strict';
import {inspect,summarizeV22Daily} from './probe-trondheim-gps-v22-live.mjs';
assert.equal(summarizeV22Daily({scope:'wrong'}),null);
const privateId='ATB:Vehicle:PRIVATE-1234',quay='NSR:Quay:73377';
const v={scope:'trondheim-gps-v22-scheduled-quality',day:'2026-11-01',
 lanes:{catalog:{samples:55},'line1-fast':{samples:53},'dual-fast':{samples:6}},
 last:'2026-11-01T10:05:00.000Z',
 lines:{'1':{frames:108,gpsPrimary:200,v20Compared:200,v20Supported:2,
  v21Compared:200,v21Supported:2,retained:70,narrowed:0,resolved:0,
  privateVehicleId:privateId,latitude:63.43,quay,
  diagnostics:{frames:6,firstSeen:1,sameVehicleWithin3m:3,sameVehicleAfter3m:2,
   outsideQuayRadius:1,oneNearbyQuay:3,multipleNearbyQuays:2,
   vehicleId:privateId}},
  '11':{frames:55,gpsPrimary:49,v20Compared:49,v21Compared:49,
   extra:'UNSAFE-SECRET'}},
 spots:{'lerkendal-1':{frames:108,nearGps:7,overlappingQuays:7,
  vehicleId:privateId},'tonstadkrysset-1':{frames:108,nearGps:4,
  overlappingQuays:0,quay},'lerkendal-11':{frames:55,nearGps:3,overlappingQuays:2}}};
const s=summarizeV22Daily(v);
assert.equal(s.lines['1'].frames,108);
assert.equal(s.lines['1'].retained,70);
assert.equal(s.lines['1'].narrowed,0);
assert.equal(s.lines['1'].diagnostics.sameVehicleWithin3m,3);
assert.equal(s.lines['1'].diagnostics.frames,6);
assert.equal(s.lines['11'].diagnostics.frames,null,'Old V2.2 recordings are unmeasured, not zero');
assert.equal(s.lines['11'].gpsPrimary,49);
assert.equal(s.lines['11'].sourceStop,null,'Missing counters are unknown, never a zero sample');
assert.equal(s.sites['lerkendal-1'].overlappingQuays,7);
assert.equal(s.sites['tonstadkrysset-1'].nearGps,4);
const out=JSON.stringify(s);
for(const data of [privateId,quay,'UNSAFE-SECRET','latitude','vehicleId','privateVehicleId'])
 assert(!out.includes(data),data+' leaked into anonymous probe');
const suspicious=structuredClone(v);
suspicious.lines['1'].gpsPrimary='200';
suspicious.lines['11'].v21Compared=-2;
const safe=summarizeV22Daily(suspicious);
assert.equal(safe.lines['1'].gpsPrimary,null);
assert.equal(safe.lines['11'].v21Compared,null);
const proof=inspect(v,{now:Date.parse('2026-11-01T10:10:00.000Z')});
assert.equal(proof.status,'ACTIVE');
assert.equal(proof.line1Frames,108);
assert.equal(proof.line11Frames,55);
assert.equal(proof.legacyFast,53);
assert.equal(proof.dualFast,6);
assert.equal(proof.fast,59,'Fast proof must include new dual-line schedule lane');
console.log('V2.2 daily audit read-only: real per-line counters, locality aggregates, zero vs unknown, strict allow-list, rejects private identifiers/coordinates PASS');
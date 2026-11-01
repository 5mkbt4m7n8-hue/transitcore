import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVolatileState,evaluateV22,validateV22,recordV22Storage,
 reportV22Storage,observeV22Internal} from '../worker/trondheim-gps-v22.mjs';
const patterns=JSON.parse(readFileSync(new URL('../config/gps/atb-journey-patterns-1-11.json',import.meta.url),'utf8'));
const line1=patterns.lines['1'].patterns.find(p=>p.quays.length>=5).quays;
const line11=patterns.lines['11'].patterns.find(p=>p.quays.length>=5).quays;
const node=(quayId,led,lat,lon,code)=>({quayId,led,lat,lon,stationId:'NSR:StopPlace:'+led,
 stopIds:[quayId],routes:['atb-bus-'+code+'-live']});
const x=node(line1[2],1,63.4,10.4,'1'),y=node(line1[3],2,63.402,10.4,'1');
const z=node(line11[2],11,63.44,10.4,'11'),zz=node(line11[3],12,63.442,10.4,'11');
const board={id:'trondheim-city-lines-catalog',routes:['atb-bus-1-live','atb-bus-11-live'],
 nodes:[x,y,z,zz]};
const secret1='ATB:SECRET:Vehicle:1',secret11='ATB:SECRET:Vehicle:11';
const oslo=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Oslo',year:'numeric',
 month:'2-digit',day:'2-digit'}).format(Date.now());
const start=Date.parse(oslo+'T12:00:00Z'),now=start+9*60000;
const mk=(time,entries,fingerprint='test-v24')=>({
 boardProfile:board.id,generatedAt:new Date(time).toISOString(),ttlSeconds:30,
 profileFingerprint:fingerprint,ledCount:1282,
 leds:entries.map(([n,id,line])=>({id:n.led,state:'APPROACHING',
  vehicle:{id,line,positionType:'gps-nearest-stop',
   latitude:n.lat,longitude:n.lon,ageSeconds:1}}))
});
const first=mk(start,[[x,secret1,'1'],[z,secret11,'11']],'catalog');
const second=mk(start+120000,[[y,secret1,'1'],[zz,secret11,'11']],'dual-fast');
const noPrimary=mk(start+300000,[],'catalog');
const returnFrame=mk(start+420000,[[y,secret1,'1']],'dual-fast');
const evalState=createVolatileState(board);
const baseline=evaluateV22(first,board,evalState,{lane:'catalog',memory:'coldStart'});
assert.equal(baseline.memory.coldStart,1);
assert.equal(baseline.memory.priorUnknown,1);
assert.equal(baseline.lines['1'].frameMatch.priorFrameKnown,0);
assert.equal(baseline.lines['11'].frameMatch.uncomparablePrimary,1);
assert.equal(baseline.lines['11'].frameMatch.newSincePrior,0);
const next=evaluateV22(second,board,evalState,{lane:'dual-fast',memory:'continued'});
assert.equal(next.memory.continued,1);
assert.equal(next.memory.priorWithin3m,1);
assert.equal(next.lines['11'].frameMatch.priorFrameKnown,1);
assert.equal(next.lines['11'].frameMatch.repeatedPrimary,1);
assert.equal(next.lines['11'].frameMatch.newSincePrior,0);
assert.equal(next.lines['11'].diagnostics.sameVehicleWithin3m,1);
const missing=evaluateV22(noPrimary,board,evalState,{lane:'catalog',memory:'continued'});
assert.equal(missing.lines['11'].frameMatch.priorPrimary,1);
assert.equal(missing.lines['11'].frameMatch.currentPrimary,0);
assert.equal(missing.lines['11'].frameMatch.absentSincePrior,1);
assert.equal(missing.lines['11'].frameMatch.repeatedPrimary,0);
assert.equal(missing.memory.priorWithin3m,1);
const appeared=evaluateV22(returnFrame,board,evalState,{lane:'dual-fast',memory:'continued'});
assert.equal(appeared.lines['1'].frameMatch.priorFrameKnown,1);
assert.equal(appeared.lines['1'].frameMatch.priorPrimary,0);
assert.equal(appeared.lines['1'].frameMatch.newSincePrior,1);
assert.equal(appeared.lines['1'].frameMatch.uncomparablePrimary,0);
assert.equal(appeared.lines['1'].diagnostics.sameVehicleAfter3m,1,
 'The previous FRAME was 2min ago but the same BUS was last seen 5min ago');
assert.equal(appeared.memory.priorWithin3m,1);
for(const report of [baseline,next,missing,appeared])assert(validateV22(report));
const old=structuredClone(next);
delete old.memory;
for(const l of Object.values(old.lines))delete l.frameMatch;
assert(validateV22(old),'Previous V2.3 persisted sample stays valid');
const invalid=structuredClone(next);
invalid.lines['1'].frameMatch.newSincePrior=1;
assert.equal(validateV22(invalid),null,'Must not persist inconsistent overlap counts');
invalid.lines['1'].frameMatch.newSincePrior=0;
invalid.memory.coldStart=1;
assert.equal(validateV22(invalid),null,'Do not allow conflicting volatile lifecycle flags');
const injected=structuredClone(next);
injected.memory.vehicleId=secret1;
injected.lines['1'].frameMatch.vehicleIdentity=secret11;
assert(!JSON.stringify(validateV22(injected)).includes(secret1));
assert(!JSON.stringify(validateV22(injected)).includes(secret11));

const stored=new Map();
const store={async get(k){return stored.get(k)},async put(k,v){stored.set(k,structuredClone(v))},
 async delete(k){stored.delete(k)},async list({prefix='',limit=1000,startAfter=''}){return new Map(
 [...stored].filter(([k])=>k.startsWith(prefix)&&k>startAfter)
 .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))}};
await recordV22Storage(store,{at:first.generatedAt,lane:'catalog',metrics:baseline},now);
await recordV22Storage(store,{at:second.generatedAt,lane:'dual-fast',metrics:next},now);
await recordV22Storage(store,{at:noPrimary.generatedAt,lane:'catalog',metrics:old},now);
const rollup=await reportV22Storage(store,{now,day:oslo});
assert.equal(rollup.memory.frames,2,'Historical records must not be backfilled');
assert.equal(rollup.memory.coldStart,1);
assert.equal(rollup.memory.continued,1);
assert.equal(rollup.lines['11'].frameMatch.frames,2);
assert.equal(rollup.lines['11'].frameMatch.repeatedPrimary,1);
assert.equal(rollup.lines['11'].frameMatch.uncomparablePrimary,1);
assert(!JSON.stringify([...stored]).includes(secret1));
assert(!JSON.stringify([...stored]).includes('latitude'));
assert(!JSON.stringify([...stored]).includes(z.quayId));
const state={};
const obsMap=new Map();
const storage={...store,async get(k){return obsMap.get(k)},
 async put(k,v){obsMap.set(k,structuredClone(v))},
 async delete(k){obsMap.delete(k)},
 async list({prefix='',limit=1000,startAfter=''}){return new Map(
  [...obsMap].filter(([k])=>k.startsWith(prefix)&&k>startAfter).slice(0,limit))}};
async function observe(frame,lane,bd=board){
 const request=new Request('https://status.internal/gps-v22/observe',{method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({frame,board:bd,at:frame.generatedAt,lane})});
 const response=await observeV22Internal(storage,request,state,now);
 assert.equal(response.status,200);return response.json();
}
assert.equal((await observe(first,'catalog')).status,'OK');
assert.equal((await observe(second,'dual-fast')).status,'OK');
assert.equal((await observe(noPrimary,'catalog')).status,'OK');
const changed=structuredClone(board);changed.nodes[0].lat+=0.00001;
assert.equal((await observe(returnFrame,'dual-fast',changed)).status,'OK');
const measured=await reportV22Storage(storage,{now,day:oslo});
assert.equal(measured.memory.frames,4);
assert.equal(measured.memory.coldStart,1);
assert.equal(measured.memory.catalogReset,1);
assert.equal(measured.memory.continued,2);
assert.equal(measured.memory.priorUnknown,2);
assert.equal(measured.memory.priorWithin3m,2);
assert.equal(measured.lines['1'].frameMatch.frames,4);
assert.equal(measured.lines['1'].frameMatch.repeatedPrimary,1);
assert.equal(measured.lines['1'].frameMatch.uncomparablePrimary,2);
assert(!JSON.stringify([...obsMap]).includes(secret1));
assert(!JSON.stringify([...obsMap]).includes(secret11));
const page=readFileSync(new URL('../web/linear/gps-v22-quality.html',import.meta.url),'utf8');
assert(page.includes('V2.4 · er ruteminnet bevart'));
assert(page.includes('v24FrameMatch'));
const worker=readFileSync(new URL('../worker/led-feed-worker.mjs',import.meta.url),'utf8');
assert(worker.includes("recordScheduledV22("));
console.log('GPS V2.4 PASS: cold start vs unchanged/catalog reset, 3-minute sample gaps, missing/returning primary IDs, anonymous historical rollup, old V2.3 compatibility and zero raw identity persistence');
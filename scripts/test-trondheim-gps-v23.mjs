import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVolatileState,v23BoardSignature,evaluateV22,validateV22,
 recordV22Storage,reportV22Storage,observeV22Internal} from '../worker/trondheim-gps-v22.mjs';

const patterns=JSON.parse(readFileSync(new URL('../config/gps/atb-journey-patterns-1-11.json',import.meta.url),'utf8'));
const a=patterns.lines['1'].patterns.find(p=>p.quays.length>4).quays;
const b=patterns.lines['11'].patterns.find(p=>p.quays.length>4).quays;
const node=(quayId,led,lat,lon,code)=>({
 quayId,led,lat,lon,stationId:'NSR:StopPlace:'+led,
 stopIds:[quayId],routes:['atb-bus-'+code+'-live']
});
const q1=node(a[2],1,63.4,10.4,'1');
const q2=node(a[3],2,63.402,10.4,'1');
const q11=node(b[2],11,63.44,10.4,'11');
const q12=node(b[3],12,63.442,10.4,'11');
const board={id:'trondheim-city-lines-catalog',
 routes:['atb-bus-1-live','atb-bus-11-live'],
 nodes:[q1,q2,q11,q12]};
const osloDay=new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
const start=Date.parse(osloDay+'T12:00:00Z');
const private1='V23_SECRET_LINE1',private11='V23_SECRET_LINE11';
const frame=(at,entries,fingerprint)=>({
 boardProfile:board.id,generatedAt:new Date(at).toISOString(),ttlSeconds:30,
 profileFingerprint:fingerprint,ledCount:1282,
 leds:entries.map(([node,id,line])=>({
  id:node.led,state:'APPROACHING',
  vehicle:{id,line,positionType:'gps-nearest-stop',ageSeconds:1,
   latitude:node.lat,longitude:node.lon}
 }))
});
const first=frame(start,[[q1,private1,'1'],[q11,private11,'11']],'full-catalog');
const second=frame(start+120000,[[q2,private1,'1'],[q12,private11,'11']],'dual-fast');
const later=frame(start+420000,[[q12,private11,'11']],'dual-fast');
const state=createVolatileState(board);
assert.equal(v23BoardSignature(board),v23BoardSignature(structuredClone(board)));
const copy=JSON.stringify(first);
const sampled=evaluateV22(first,board,state,{lane:'catalog'});
assert.equal(JSON.stringify(first),copy);
assert.equal(sampled.lines['1'].diagnostics.firstSeen,1);
assert.equal(sampled.lines['11'].diagnostics.firstSeen,1);
assert.equal(sampled.lines['11'].diagnostics.oneNearbyQuay,1);
assert.equal(sampled.lines['11'].diagnostics.sameVehicleWithin3m,0);
const dual=evaluateV22(second,board,state,{lane:'dual-fast'});
assert.equal(dual.lines['1'].gpsPrimary,1);
assert.equal(dual.lines['11'].gpsPrimary,1,'Fast sampling must also count Line 11');
assert.equal(dual.lines['1'].diagnostics.sameVehicleWithin3m,1);
assert.equal(dual.lines['11'].diagnostics.sameVehicleWithin3m,1);
assert.equal(dual.lines['11'].diagnostics.firstSeen,0);
assert.equal(dual.lines['11'].diagnostics.oneNearbyQuay,1);
assert.equal(dual.lines['11'].v21Compared,1);
assert.deepEqual(Object.keys(validateV22(dual).lines),['1','11']);
const expired=evaluateV22(later,board,state,{lane:'dual-fast'});
assert.equal(expired.lines['11'].diagnostics.sameVehicleAfter3m,1);
assert.equal(expired.lines['11'].diagnostics.sameVehicleWithin3m,0);
assert.equal(expired.lines['1'].diagnostics.firstSeen,0);
const legacy=structuredClone(sampled);
for(const line of Object.values(legacy.lines))delete line.diagnostics;
assert(validateV22(legacy),'Already stored V2.2 samples remain valid without new fields');
const unsafe=structuredClone(dual);
unsafe.lines['11'].diagnostics.vehicleRef=private11;
const clean=validateV22(unsafe);
assert(clean&&!JSON.stringify(clean).includes(private11),
 'Unrecognized vehicle identity may never enter persisted diagnostics');
const corrupt=structuredClone(dual);
corrupt.lines['11'].diagnostics.sameVehicleWithin3m=400;
assert.equal(validateV22(corrupt),null,'Inconsistent diagnostics must not be saved');
const store=new Map();
const storage={async get(k){return store.get(k)},async put(k,v){store.set(k,structuredClone(v))},
 async delete(k){store.delete(k)},async list({prefix='',limit=1000,startAfter=''}){return new Map([...store]
 .filter(([key])=>key.startsWith(prefix)&&key>startAfter)
 .sort(([x],[y])=>x.localeCompare(y)).slice(0,limit))}};
const at=t=>new Date(t).toISOString(),clock=start+430000;
await recordV22Storage(storage,{at:at(start),lane:'catalog',metrics:legacy},clock);
await recordV22Storage(storage,{at:at(start+120000),lane:'dual-fast',metrics:dual},clock);
const report=await reportV22Storage(storage,{now:clock,day:osloDay});
assert.equal(report.lanes.catalog.samples,1);
assert.equal(report.lanes['line1-fast'].samples,0);
assert.equal(report.lanes['dual-fast'].samples,1);
assert.equal(report.lines['11'].frames,2);
assert.equal(report.lines['11'].diagnostics.frames,1,
 'V2.2 legacy samples must not be backfilled as V2.3 diagnostic zeroes');
assert.equal(report.lines['11'].diagnostics.sameVehicleWithin3m,1);
assert(!JSON.stringify([...store]).includes(private1));
assert(!JSON.stringify([...store]).includes(private11));
assert(!JSON.stringify([...store]).includes('latitude'));
assert(!JSON.stringify([...store]).includes(q11.quayId));
const volatile={};
const privateStore=new Map();
const storage2={...storage,async get(k){return privateStore.get(k)},
 async put(k,v){privateStore.set(k,structuredClone(v))},
 async delete(k){privateStore.delete(k)},
 async list({prefix='',limit=1000,startAfter=''}){return new Map([...privateStore]
 .filter(([k])=>k.startsWith(prefix)&&k>startAfter).slice(0,limit))}};
const observe=async(fr,lane)=>observeV22Internal(storage2,new Request(
 'https://status.internal/gps-v22/observe',{method:'POST',
 headers:{'content-type':'application/json'},
 body:JSON.stringify({at:fr.generatedAt,lane,frame:fr,board})}),volatile,clock);
const s1=await observe(first,'catalog'),s2=await observe(second,'dual-fast');
assert.equal((await s1.json()).status,'OK');
assert.equal((await s2.json()).status,'OK');
const internal=await reportV22Storage(storage2,{now:clock,day:osloDay});
assert.equal(internal.lines['11'].diagnostics.sameVehicleWithin3m,1,
 'DO integration must not erase tracks on catalog/dual-fast profile changes');
assert(!JSON.stringify([...privateStore]).includes(private1));
assert(!JSON.stringify([...privateStore]).includes(private11));
assert(!JSON.stringify([...privateStore]).includes('latitude'));
const worker=readFileSync(new URL('../worker/led-feed-worker.mjs',import.meta.url),'utf8');
const fast=worker.split('async function runFastLine1Sample(')[1]?.split('async function runBackgroundChecks')[0];
assert(fast);
assert.equal((fast.match(/liveVehicles\(/g)||[]).length,1,
 'Dual sampling must reuse existing provider fetch, never call Entur twice');
assert(fast.includes("['1','11'].includes(String(v.publicCode))"));
assert(fast.includes("env,v22Frame,v22Board,'dual-fast'"));
assert(fast.includes('summarizeLine1ScheduledFrame(frame,board)'),
 'Existing Line 1 scheduled quality remains unchanged');
const html=readFileSync(new URL('../web/linear/gps-v22-quality.html',import.meta.url),'utf8');
assert(html.includes("d.lanes?.['dual-fast']?.samples"));
assert(html.includes('gpsV23Reasons'));
console.log('GPS V2.3 PASS: same AtB source batch for lines 1+11, per-line dual-fast GPS, preserved hypotheses across differing frame fingerprints, gap reasons, legacy data, privacy, and no LED change');

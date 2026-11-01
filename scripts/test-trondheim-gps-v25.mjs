import assert from 'node:assert/strict';
import v21 from '../web/linear/network/gps-v2-shadow.js';
import {readFileSync} from 'node:fs';
import {evaluateV25,evaluateV29,expireV25State,sanitizeV25,sanitizeV29,
 V25_KEY,V25_TTL,V29_KEY,V29_TTL}
 from '../worker/trondheim-gps-v25.mjs';
import {createVolatileState,evaluateV22,validateV22,
 reportV22Storage,observeV22Internal,summarizeV25Cadence,
 summarizeV28Timing,makeV28Sample} from '../worker/trondheim-gps-v22.mjs';

const source=JSON.parse(readFileSync(new URL('../config/gps/atb-journey-patterns-1-11.json',import.meta.url),'utf8'));
const a=source.lines['1'].patterns.find(p=>p.quays.length>5).quays;
const b=source.lines['11'].patterns.find(p=>p.quays.length>5).quays;
const node=(quayId,led,lat,lon,code)=>({quayId,led,lat,lon,
 stationId:'NSR:StopPlace:'+led,stopIds:[quayId],routes:['atb-bus-'+code+'-live']});
const n1=node(a[2],1,63.4,10.4,'1'),n2=node(a[3],2,63.402,10.4,'1');
const n11=node(b[2],11,63.44,10.4,'11'),n12=node(b[3],12,63.442,10.4,'11');
const board={id:'trondheim-city-lines-catalog',routes:['atb-bus-1-live','atb-bus-11-live'],
 nodes:[n1,n2,n11,n12]};
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Oslo',
 year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now());
const t0=Date.parse(date+'T12:00:00Z');
const raw1='ENTUR_SECRET_RAW_BUS_1',raw11='ENTUR_SECRET_RAW_BUS_11';
const make=(t,loc1=n1,loc11=n11)=>({boardProfile:board.id,
 generatedAt:new Date(t).toISOString(),ttlSeconds:30,profileFingerprint:'different-per-lane',
 leds:[[loc1,raw1,'1'],[loc11,raw11,'11']].map(([n,id,line])=>({
  id:n.led,state:'APPROACHING',vehicle:{
   id,line,positionType:'gps-nearest-stop',ageSeconds:1,
   latitude:n.lat,longitude:n.lon,destination:'PRIVATE_DESTINATION'}
 }))});
function fakeStore(){
 const map=new Map(),alarms=[];
 return {map,alarms,async get(k){return structuredClone(map.get(k))},
  async put(k,v){map.set(k,structuredClone(v))},
  async delete(k){map.delete(k)},
  async setAlarm(t){alarms.push(t)},
  async list({prefix='',limit=1000,startAfter=''}){return new Map([...map]
   .filter(([k])=>k.startsWith(prefix)&&k>startAfter)
   .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))}};
}
const store=fakeStore();
const first=await evaluateV25(store,make(t0),board,{lane:'catalog',now:t0});
assert.equal(first.status,'fresh');
assert.equal(first.lines['11'].matchedPrior,0);
assert.equal(first.lines['1'].primary,1);
assert(store.alarms.length===1);
const record=store.map.get(V25_KEY);
assert(record&&record.tracks.length>=2,'First frame must write bounded hypothesis tracks');
assert.equal(record.expiresAt,t0+V25_TTL+5000);
// V2.9: 240 s is an explicit, isolated shadow-engine option. The active
// GPS V2.1 and V2.5 callers keep their implicit, unchanged 180 s default.
const at200=t0+200000;
const standard=v21.create({board,patterns:source});
const sandbox240=v21.create({board,patterns:source,trackTtlMs:240000});
assert.equal(standard.restoreSnapshot(record.tracks,{now:at200}),0,
 'Default 180s V2.1 engine must reject a 199s-old hypothesis');
assert.equal(sandbox240.restoreSnapshot(record.tracks,{now:at200}),record.tracks.length,
 'Explicit 240s engine may restore the SAME old HMAC snapshot at 199s');
assert.equal(sandbox240.exportSnapshot({now:at200}).length,record.tracks.length,
 '240s engine must preserve eligible hypothesis indexes on export');
assert.throws(()=>v21.create({board,patterns:source,trackTtlMs:241000}),
 /invalid-v21-shadow-configuration/,'Other TTL values remain forbidden');
assert.throws(()=>v21.create({board,patterns:source,trackTtlMs:0}),
 /invalid-v21-shadow-configuration/,'Zero TTL is forbidden');
// Comparison uses synthetic time and a short-lived fake-store record only;
// no additional key, alarm, token retention or provider call is introduced.
const persisted=JSON.stringify(record);
for(const forbidden of [raw1,raw11,'latitude','longitude','PRIVATE_DESTINATION',
 'NSR:Quay:','vehicleId','destination'])
 assert(!persisted.includes(forbidden),forbidden+' must never persist');
assert(record.tracks.every(t=>/^(1|11)\|[a-f0-9]{64}$/.test(t.key)));
assert(record.tracks.every(t=>t.hypotheses.every(p=>
 Array.isArray(p)&&p.length===4&&p.every(Number.isSafeInteger))));
const next=await evaluateV25(store,make(t0+120000,n2,n12),board,{
 lane:'dual-fast',now:t0+120000});
assert.equal(next.status,'restored','Recreate V2.1 from storage across a simulated DO eviction');
assert.equal(next.lines['1'].matchedPrior,1);
assert.equal(next.lines['11'].matchedPrior,1);
assert(next.restoredTracks>=2);
assert(sanitizeV25(next,'dual-fast'));
assert(!JSON.stringify(sanitizeV25(next,'dual-fast')).includes(raw1));
// Repeated samples do not keep old GPS or an old Quay ID in durable storage.
const storageLeak=JSON.stringify([...store.map]);
assert(!storageLeak.includes(raw1));
assert(!storageLeak.includes(raw11));
assert(!storageLeak.includes('latitude'));
assert(!storageLeak.includes('NSR:Quay:'));
// After the strict TTL, track history must start fresh, even if an alarm
// was delayed. No stale journey can continue simply because it was persisted.
const expired=await evaluateV25(store,make(t0+120000+V25_TTL+1000,n2,n12),board,{
 lane:'dual-fast',now:t0+120000+V25_TTL+1000});
assert.equal(expired.status,'expired');
assert.equal(expired.lines['11'].matchedPrior,0);
assert.equal(expired.restoredTracks,0);
assert.equal(store.map.size,1);
await expireV25State(store,expired.expiresAt||t0+120000+V25_TTL+V25_TTL+7000);
assert(!store.map.has(V25_KEY),'Alarm must physically delete expired pseudonymous tracks');
// Independent 4-minute token namespace: the 180s alarm MUST fire first,
// and must leave a 240s test snapshot alive only until its own deadline.
const parallel=fakeStore();
const first3=await evaluateV25(parallel,make(t0),board,{lane:'catalog',now:t0});
const first4=await evaluateV29(parallel,make(t0),board,{lane:'catalog',now:t0});
assert.equal(first3.status,'fresh');assert.equal(first4.status,'fresh');
assert.notEqual(parallel.map.get(V25_KEY).secret,parallel.map.get(V29_KEY).secret);
assert.equal(parallel.alarms.at(-1),t0+V25_TTL+5000,
 '240s candidate must not postpone original 180s alarm');
const second3=await evaluateV25(parallel,make(t0+120000,n2,n12),board,{
 lane:'dual-fast',now:t0+120000});
const second4=await evaluateV29(parallel,make(t0+120000,n2,n12),board,{
 lane:'dual-fast',now:t0+120000});
assert.equal(second3.status,'restored');
assert.equal(second4.status,'restored');
assert.equal(parallel.alarms.at(-1),t0+120000+V25_TTL+5000);
await expireV25State(parallel,t0+120000+V25_TTL+6000);
assert(!parallel.map.has(V25_KEY),'Original 180s snapshot must be physically deleted');
assert(parallel.map.has(V29_KEY),'240s experiment remains only until its expiry');
assert.equal(parallel.alarms.at(-1),t0+120000+V29_TTL+5000);
const afterGap=t0+310000;
const fresh3=await evaluateV25(parallel,make(afterGap,n2,n12),board,{
 lane:'catalog',now:afterGap});
const restored4=await evaluateV29(parallel,make(afterGap,n2,n12),board,{
 lane:'catalog',now:afterGap});
assert.equal(fresh3.status,'fresh');
assert.equal(fresh3.lines['1'].matchedPrior,0);
assert.equal(restored4.status,'restored');
assert(restored4.lines['1'].matchedPrior>=1,
 '240s sandbox must keep pseudonym candidate at a 190s gap');
assert(restored4.lines['11'].matchedPrior>=1);
assert(sanitizeV29(restored4,'catalog'));
const expiresAfter=afterGap+V29_TTL+7000;
await expireV25State(parallel,expiresAfter);
assert(!parallel.map.has(V25_KEY));
assert(!parallel.map.has(V29_KEY),'Both candidate secrets must expire separately');
const shadowStore=JSON.stringify([...parallel.map]);
for(const forbidden of [raw1,raw11,'latitude','NSR:Quay:'])
 assert(!shadowStore.includes(forbidden));
const noAlarm=fakeStore();delete noAlarm.setAlarm;
await assert.rejects(()=>evaluateV25(noAlarm,make(t0),board,{
 lane:'catalog',now:t0}),/v25_expiry_not_guaranteed/);
assert.equal(noAlarm.map.size,0,'No alarm capability => fail closed, no durable pseudonyms');
// Changing the catalog must discard prior identities and pattern indexes.
const changed=fakeStore();
await evaluateV25(changed,make(t0),board,{lane:'catalog',now:t0});
const boardChanged=structuredClone(board);boardChanged.nodes[0].lat+=0.00001;
const changedMetrics=await evaluateV25(changed,make(t0+120000,n2,n12),boardChanged,{
 lane:'dual-fast',now:t0+120000});
assert.equal(changedMetrics.status,'catalogChanged');
assert.equal(changedMetrics.restoredTracks,0);
const attack=structuredClone(next);
attack.lines['1'].rawBusId=raw1;
attack.secret=raw11;
const sanitized=sanitizeV25(attack,'dual-fast');
assert(sanitized&&!JSON.stringify(sanitized).includes(raw1)&&
 !JSON.stringify(sanitized).includes(raw11));
attack.lines['1'].matchedPrior=999;
assert.equal(sanitizeV25(attack,'dual-fast'),null);
const state=createVolatileState(board);
const ordinary=evaluateV22(make(t0),board,state,{lane:'catalog',memory:'coldStart'});
ordinary.v25=first;
assert(validateV22(ordinary),'Public rollup only stores allowlisted numeric V2.5 evidence');
// V2.5 must survive genuinely empty DO volatile memory on each observation.
const reportStore=fakeStore();
async function observe(frame,lane){
 const vol={engine:null,fingerprint:null};
 const req=new Request('https://status.internal/gps-v22/observe',{method:'POST',
 headers:{'content-type':'application/json'},body:JSON.stringify({
 at:frame.generatedAt,lane,frame,board})});
 const res=await observeV22Internal(reportStore,req,vol,Date.parse(frame.generatedAt)+1000);
 assert.equal(res.status,200);
 return res.json();
}
assert.equal((await observe(make(t0),'catalog')).status,'OK');
assert.equal((await observe(make(t0+120000,n2,n12),'dual-fast')).status,'OK');
const roll=await reportV22Storage(reportStore,{
 day:date,now:t0+120000+3000});
assert.equal(roll.v25.frames,2);
assert.equal(roll.v29.frames,2,'Parallel 240s measurements must be recorded');
assert.equal(roll.v29.states.fresh,1);
assert.equal(roll.v29.states.restored,1);
assert.equal(roll.v29.lines['1'].matchedPrior,1);
assert.equal(roll.v29.lines['11'].matchedPrior,1);
assert.equal(roll.v29.paired.frames,2);
assert.equal(roll.v29.paired.lines['1'].frames,2);
assert.equal(roll.v29.paired.lines['1'].matchedPrior,1);
assert.equal(roll.v29.paired.lines['1'].longMatchedPrior,1);
assert.equal(roll.v29.paired.lines['1'].gainFrames,0);
assert.equal(roll.v29.paired.lines['1'].sameFrames,2);
assert.equal(roll.v29.paired.lines['1'].candidateFrames,2);
assert.equal(roll.v25.states.fresh,1);
assert.equal(roll.v25.states.restored,1);
assert.equal(roll.v25.lines['11'].matchedPrior,1);
assert.equal(roll.v25.lines['1'].matchedPrior,1);
assert.equal(roll.memory.coldStart,2,'Old volatile V2.4 engine still restarts');
assert(!JSON.stringify([...reportStore.map]).includes(raw1));
assert(!JSON.stringify([...reportStore.map]).includes(raw11));
assert(!JSON.stringify([...reportStore.map]).includes('latitude'));
assert.equal((await reportV22Storage(reportStore,{
 day:date,now:t0+120000+3000})).v25.frames,2);
// A 190s-gap snapshot yields six-or-fewer aggregate identities;
 // these paired frame metrics must never be mistaken for unique buses.
const compareStore=fakeStore();
await evaluateV25(compareStore,make(t0),board,{lane:'catalog',now:t0});
await evaluateV29(compareStore,make(t0),board,{lane:'catalog',now:t0});
await evaluateV25(compareStore,make(t0+120000),board,{lane:'dual-fast',now:t0+120000});
await evaluateV29(compareStore,make(t0+120000),board,{lane:'dual-fast',now:t0+120000});
const short190=await evaluateV25(compareStore,make(t0+310000),board,{
 lane:'catalog',now:t0+310000});
const long190=await evaluateV29(compareStore,make(t0+310000),board,{
 lane:'catalog',now:t0+310000});
assert.equal(short190.lines['1'].matchedPrior,0);
assert.equal(long190.lines['1'].matchedPrior,1);
const malicious29=structuredClone(ordinary);
malicious29.v29=structuredClone(restored4);
malicious29.v29.lines['1'].primary=9999;
assert.equal(validateV22(malicious29),null,'V2.10 counters reject invalid totals');
const old=structuredClone(ordinary);
delete old.v25;
assert(validateV22(old),'Old V2.4 samples must remain compatible');
const core=readFileSync(new URL('../worker/led-feed-worker.mjs',import.meta.url),'utf8');
assert(core.includes('async alarm()'));
assert(core.includes('await expireV25State(this.state.storage)'));
assert(core.includes("recordScheduledV22("));
assert(next.lines['1'].restoredWithCandidates>=1);
assert(next.lines['11'].restoredWithCandidates>=1);
assert.equal(next.lines['1'].restoredAmbiguous,0);
assert.equal(next.lines['1'].restoredABC,0);
assert.equal(roll.v25.lines['1'].followupFrames,2);
assert.equal(roll.v25.lines['1'].restoredWithCandidates,1);
// Begin with two nearby competing Quays and then observe only the later Quay.
// This must narrow a RESTORED hypothesis rather than a fresh per-frame guess.
const ambiguousBoard=structuredClone(board);
ambiguousBoard.nodes[1].lat=ambiguousBoard.nodes[0].lat+0.001;
const ambiguousStore=fakeStore();
const ambFirst=make(t0);
ambFirst.leds[0].vehicle.latitude=ambiguousBoard.nodes[0].lat+0.0005;
const ambStart=await evaluateV25(ambiguousStore,ambFirst,ambiguousBoard,{
 lane:'catalog',now:t0});
assert(ambStart.lines['1'].retained>=1,'Two nearby Quays are retained as possibilities');
const ambSecond=make(t0+120000);
ambSecond.leds[0].vehicle.latitude=ambiguousBoard.nodes[1].lat+0.0002;
const ambFollow=await evaluateV25(ambiguousStore,ambSecond,ambiguousBoard,{
 lane:'dual-fast',now:t0+120000});
assert.equal(ambFollow.status,'restored');
assert.equal(ambFollow.lines['1'].restoredWithCandidates,1);
assert.equal(ambFollow.lines['1'].restoredAmbiguous,1);
assert.equal(ambFollow.lines['1'].restoredChanged,1);
assert.equal(ambFollow.lines['1'].restoredNarrowed,1);
assert(ambFollow.lines['1'].restoredABC<=ambFollow.lines['1'].restoredDirection);
const oldEvidence=structuredClone(next);
for(const l of ['1','11'])for(const k of ['restoredWithCandidates',
 'restoredAmbiguous','restoredChanged','restoredNarrowed',
 'restoredDirection','restoredABC'])delete oldEvidence.lines[l][k];
assert(sanitizeV25(oldEvidence,'dual-fast'),'Old V2.5 reports stay readable');
const altered=structuredClone(next);
altered.lines['1'].restoredABC=altered.lines['1'].restoredDirection+1;
assert.equal(sanitizeV25(altered,'dual-fast'),null);
assert(!JSON.stringify(ambiguousStore.map.get(V25_KEY)).includes('NSR:Quay:'));
assert(!JSON.stringify(ambiguousStore.map.get(V25_KEY)).includes(raw1));
// V2.7 analyses existing V2.5 frame statuses, never reconstructs bus history.
const paired=summarizeV25Cadence([
 {slot:t0,lane:'catalog',status:'fresh'},
 {slot:t0,lane:'dual-fast',status:'restored'},
 {slot:t0+300000,lane:'catalog',status:'fresh'},
 {slot:t0+300000,lane:'dual-fast',status:'restored'}
]);
assert.equal(paired.frames,4);
assert.equal(paired.sameSlotFreshRestored,2);
assert.equal(paired.nextSlotFreshAfterRestored,1);
assert.equal(paired.nextSlotRestoredAfterRestored,0);
assert.equal(paired.threePlusFrameContinuations,0);
assert.equal(paired.maxContinuousFrames,2);
const chained=summarizeV25Cadence([
 {slot:t0,lane:'catalog',status:'fresh'},
 {slot:t0,lane:'dual-fast',status:'restored'},
 {slot:t0+300000,lane:'catalog',status:'restored'},
 {slot:t0+300000,lane:'dual-fast',status:'restored'}
]);
assert.equal(chained.nextSlotRestoredAfterRestored,1);
assert.equal(chained.threePlusFrameContinuations,2);
assert.equal(chained.maxContinuousFrames,4);
assert.equal(roll.v25.cadence.sameSlotFreshRestored,1);
assert.equal(roll.v25.cadence.maxContinuousFrames,2);
// GPS V2.8: only anonymous frame-second offsets; no 4-minute tokens/patterns.
const oldSample=makeV28Sample(make(t0),new Date(t0).toISOString(),first);
assert.deepEqual(oldSample,{version:1,offsetSeconds:0,status:'fresh'});
const v28With=structuredClone(ordinary);
v28With.v28=oldSample;
assert(validateV22(v28With));
const badTiming=structuredClone(v28With);
badTiming.v28.offsetSeconds=300;
assert.equal(validateV22(badTiming),null);
badTiming.v28.offsetSeconds=0;
badTiming.v28.status='restored';
assert.equal(validateV22(badTiming),null);
const measuredV28=summarizeV28Timing([
 {slot:t0,lane:'catalog',offsetSeconds:1,status:'fresh'},
 {slot:t0,lane:'dual-fast',offsetSeconds:121,status:'restored'},
 {slot:t0+300000,lane:'catalog',offsetSeconds:3,status:'fresh'},
 {slot:t0+300000,lane:'dual-fast',offsetSeconds:120,status:'restored'}
]);
assert.equal(measuredV28.frames,4);
assert.equal(measuredV28.pairs,3);
assert.equal(measuredV28.under3m,2);
assert.equal(measuredV28.between3and4m,1);
assert.equal(measuredV28.fresh3to4m,1);
assert.equal(measuredV28.freshUnder3m,0);
assert.equal(measuredV28.possible4mBridges,1);
assert.equal(measuredV28.maxFrames3m,2);
assert.equal(measuredV28.maxFrames4m,4);
assert.equal(measuredV28.threeFrameChains3m,0);
assert.equal(measuredV28.threeFrameChains4m,1);
const noGain=summarizeV28Timing([
 {slot:t0,lane:'catalog',offsetSeconds:0,status:'fresh'},
 {slot:t0,lane:'dual-fast',offsetSeconds:120,status:'restored'},
 {slot:t0+300000,lane:'catalog',offsetSeconds:0,status:'fresh'}
]);
assert.equal(noGain.freshUnder3m,1);
assert.equal(noGain.possible4mBridges,0);
assert.equal(noGain.maxFrames3m,3);
assert.equal(noGain.maxFrames4m,3);
assert.equal(roll.v25.timingV28.frames,2);
assert.equal(roll.v25.timingV28.pairs,1);
assert(!JSON.stringify(roll.v25.timingV28).includes(raw1));
console.log('V2.5 PASS: HMAC-only 3m bounded storage, restore after DO cold starts, alarm expiry, catalog reset, failure isolation, V2.4 backwards compatibility and zero source GPS/identity persistence');

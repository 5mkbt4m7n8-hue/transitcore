import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateV25,expireV25State,sanitizeV25,V25_KEY,V25_TTL}
 from '../worker/trondheim-gps-v25.mjs';
import {createVolatileState,evaluateV22,validateV22,
 reportV22Storage,observeV22Internal} from '../worker/trondheim-gps-v22.mjs';

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
const old=structuredClone(ordinary);
delete old.v25;
assert(validateV22(old),'Old V2.4 samples must remain compatible');
const core=readFileSync(new URL('../worker/led-feed-worker.mjs',import.meta.url),'utf8');
assert(core.includes('async alarm()'));
assert(core.includes('await expireV25State(this.state.storage)'));
assert(core.includes("recordScheduledV22("));
console.log('V2.5 PASS: HMAC-only 3m bounded storage, restore after DO cold starts, alarm expiry, catalog reset, failure isolation, V2.4 backwards compatibility and zero source GPS/identity persistence');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create,availableLines}=require('../web/linear/network/line1-route-progress.js');
const dir=new URL('../',import.meta.url);
const config=path=>JSON.parse(readFileSync(new URL(path,dir),'utf8'));
const board=config('config/boards/trondheim-city-lines-catalog.json');
const patterns=config('config/gps/atb-journey-patterns-1-11.json');
const line11=config('config/routes/atb-bus-11-live.json');
const line1=config('config/routes/atb-bus-1-live.json');
const coverage=availableLines({board,patterns});
assert.deepEqual(coverage.map(v=>v.lineCode),['1','11']);
assert(coverage.every(v=>v.patterns>=2),'Require actual bidirectional source patterns');
assert(coverage.every(v=>v.usable),'Require at least one adjacent source Quay pair mapped to catalog');
assert(coverage.find(x=>x.lineCode==='11').mappedQuays>=2);
const now=Date.parse('2026-10-31T10:30:00Z');
const source=patterns.lines['11'].patterns.find(p=>p.quays.length>=12);
assert(source);
const ids=[...new Set(source.quays)];
const map=new Map();
for(const n of board.nodes)for(const q of [n.quayId,...(n.stopIds||[])])
 if(!map.has(q)&&Number.isInteger(n.led))map.set(q,n.led);
const consecutive=ids.findIndex((q,i)=>i<ids.length-1&&map.has(q)&&map.has(ids[i+1])&&
 [...new Set(board.nodes.filter(n=>n.led===map.get(q)).flatMap(n=>[
 n.quayId,...(n.stopIds||[])].filter(x=>ids.includes(x))))].length===1&&
 [...new Set(board.nodes.filter(n=>n.led===map.get(ids[i+1])).flatMap(n=>[
 n.quayId,...(n.stopIds||[])].filter(x=>ids.includes(x))))].length===1);
assert(consecutive>=0,'Find 2 consecutive line 11 Quays with one unique LED each');
const a=ids[consecutive],b=ids[consecutive+1];
const make=(line,quay,time,id='PRIVATE-VEHICLE')=>{
 const led=map.get(quay);
 return {boardProfile:board.id,generatedAt:new Date(time).toISOString(),ttlSeconds:30,
 leds:[{id:led,state:'APPROACHING',occupants:[{
  id,line,destination:'11 TEST',positionType:'gps-nearest-stop',nearestQuayLed:led,
  state:'APPROACHING'
 }]}]};
};
const track11=create({board,patterns,profile:line11,lineCode:'11',clock:()=>now});
const track1=create({board,patterns,profile:line1,clock:()=>now});
let snapshot=track11.ingest(make('11',a,now),{now});
assert.equal(snapshot.active.length,1,'Line 11 GPS is followed on source catalog Quay');
assert.equal(snapshot.lineCode,'11');
assert.equal(track1.ingest(make('11',a,now),{now}).active.length,0,
 'Same frame does not pollute Line 1 tracker');
snapshot=track11.ingest(make('11',b,now+10000),{now:now+10000});
assert.equal(snapshot.active.length,1);
assert.equal(snapshot.active[0].sequence.length,2);
assert.equal(snapshot.active[0].direction,source.directionType,
 'Consecutive Quays infer direction in matching source patterns');
assert(!JSON.stringify(snapshot).includes('PRIVATE-VEHICLE'));
const missingFrame={...make('11',b,now+60000),leds:[]};
snapshot=track11.ingest(missingFrame,{now:now+60000});
assert(!snapshot.events.some(e=>e.type==='NOT_VISIBLE'));
snapshot=track11.ingest({...missingFrame,generatedAt:new Date(now+70000).toISOString()},
 {now:now+70000});
const incident=snapshot.events.find(e=>e.type==='NOT_VISIBLE');
assert(incident,'Line 11 receives the same 2-frame protection');
assert.equal(incident.evidence.code,'MISSING_FROM_VALID_FRAMES');
assert.equal(incident.evidence.lastQuay,b);
assert(!JSON.stringify(snapshot).includes('PRIVATE-VEHICLE'));
const recovered=track11.ingest(make('11',b,now+80000),{now:now+80000});
assert(recovered.events.some(e=>e.evidence?.code==='REAPPEARED_IN_RENDERED_FRAME'));
const exported=JSON.parse(track11.exportJson(now+80000));
assert.equal(exported.lineCode,'11');
assert.equal(exported.format,'intransit-line11-sequence-v1');
const saved=new Map(),storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)};
const t1=create({board,patterns,profile:line1,clock:()=>now,storage});
const t11=create({board,patterns,profile:line11,lineCode:'11',clock:()=>now,storage});
const firstLine1=patterns.lines['1'].patterns.flatMap(p=>p.quays).find(q=>map.has(q));
assert(firstLine1,'Line 1 has mapped Quays');
t1.ingest(make('1',firstLine1,now),{now});
t11.ingest(make('11',a,now),{now});
assert.equal(saved.size,2,'Line 1/11 logs use distinct browser keys');
assert.throws(()=>create({board,patterns,profile:line11,lineCode:'3'}),/unsupported-route-pattern/);
const noData=availableLines({board,patterns:{lines:{'1':patterns.lines['1']}}});
assert.equal(noData.find(v=>v.lineCode==='11').usable,false,
 'Other lines without approved patterns cannot trigger route sequencing');
const sharedBoard={id:board.id,nodes:[{led:1,quayId:a,stopIds:[a,b]}]};
const ambiguous=create({board:sharedBoard,patterns,profile:line11,lineCode:'11',clock:()=>now});
const GPS=ambiguous.ingest({boardProfile:board.id,generatedAt:new Date(now).toISOString(),
 ttlSeconds:30,leds:[{id:1,state:'APPROACHING',occupants:[{
 id:'X',line:'11',positionType:'gps-nearest-stop',nearestQuayLed:1}]}]},{now});
assert.equal(GPS.active.length,0,'Never claim a unique Quay for a shared multi-Quay GPS LED');
console.log('Multi-line: catalog coverage for 1+11, source-order direction, isolation, two-frame loss, reappearance, privacy and ambiguous Quay PASS');

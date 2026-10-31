import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create}=require('../web/linear/network/line1-route-progress.js');
const data=JSON.parse(readFileSync(new URL('../config/gps/atb-journey-patterns-1-11.json',import.meta.url)));
const patterns=data.lines['1'].patterns;
const inbound=patterns.find(p=>p.directionType==='inbound'&&p.quays.length===32);
const outbound=patterns.find(p=>p.directionType==='outbound'&&p.quays.length===32);
assert(inbound&&outbound);
const keys=[...new Set([...inbound.quays,...outbound.quays])];
const board={id:'trondheim-city-lines-catalog',nodes:keys.map((quayId,led)=>({quayId,led}))};
const profile={stops:keys.map((id,i)=>({id,name:'Holdeplass '+i}))};
const id='ATB:Vehicle:private-real-id',now=Date.parse('2026-10-30T13:30:00Z');
const storage=new Map();
const state={getItem:key=>storage.get(key),setItem:(key,val)=>storage.set(key,val)};
let tracker=create({board,patterns:data,profile,storage:state,clock:()=>now});
function frame(quay,v='gps',stamp=now,vehicleId=id,destination='Ranheim'){
 const led=board.nodes.find(n=>n.quayId===quay)?.led;
 assert(Number.isInteger(led),'Unknown Quay fixture');
 const occupant={id:vehicleId,line:'1',destination,
  state:v==='siri'?'AT_STOP':'APPROACHING',ageSeconds:1,
  ...(v==='siri'?{
   quayId:quay,positionType:'entur-siri-provider-stop',
   providerReportedAtStop:true,plannedSourceDirection:'inbound'
  }:{positionType:'gps-nearest-stop',nearestQuayLed:led})};
 return {boardProfile:board.id,generatedAt:new Date(stamp).toISOString(),
  ttlSeconds:30,leds:[{id:led,state:occupant.state,occupants:[occupant]}]};
}
const a=inbound.quays[8],b=inbound.quays[9],c=inbound.quays[10];
assert(a&&b&&c);
let snap=tracker.ingest(frame(a),{now});
assert.equal(snap.active.length,1);
assert.equal(snap.active[0].stop,profile.stops.find(s=>s.id===a).name);
assert.equal(snap.active[0].direction,'unknown');
assert.equal(snap.active[0].status,'GPS_NEAR');
assert.equal(snap.events[0].type,'GPS_NEAR');
assert(!JSON.stringify(snap).includes(id));
tracker.ingest(frame(a),{now:now+10000});
assert.equal(tracker.summary(now+10000).events.length,1,'Do not duplicate same GPS position');
snap=tracker.ingest(frame(b,'gps',now+20000),{now:now+20000});
assert.equal(snap.active[0].direction,'inbound','A->B locks inferred direction');
assert.equal(snap.active[0].directionBasis,'gps-sequence');
assert.equal(snap.active[0].nextQuay,c,'Unique next Quay comes only from published route pattern');
assert.equal(snap.active[0].sequence.length,2);
assert(snap.events.some(e=>e.type==='DIRECTION'));
snap=tracker.ingest(frame(c,'siri',now+40000),{now:now+40000});
assert.equal(snap.active[0].directionBasis,'source');
assert.equal(snap.active[0].status,'SOURCE_STOP');
assert.equal(snap.active[0].sequence.length,3);
assert.equal(snap.active[0].nextQuay,inbound.quays[11]);
assert(snap.events.some(e=>e.type==='SOURCE_STOP'));
const noFrame=tracker.ingest(null,{now:now+100000});
assert(!noFrame.events.some(e=>e.type==='NOT_VISIBLE'),
 'Failed feed fetch must not imply bus disappearance');
snap=tracker.ingest({...frame(b,'gps',now+101000),leds:[]},{now:now+101000});
assert.equal(snap.active[0].status,'SOURCE_STOP','One missing frame cannot prove a tracking break');
assert(!snap.events.some(e=>e.type==='NOT_VISIBLE'));
tracker.ingest({...frame(b,'gps',now+101000),leds:[]},{now:now+102000});
assert(!tracker.summary(now+102000).events.some(e=>e.type==='NOT_VISIBLE'),
 'A repeated frame is not a second independent observation');
snap=tracker.ingest({...frame(b,'gps',now+110000),leds:[]},{now:now+110000});
assert.equal(snap.active[0].status,'NOT_VISIBLE');
assert(snap.events.some(e=>e.type==='NOT_VISIBLE'));
const incident=snap.events.find(e=>e.type==='NOT_VISIBLE');
assert.equal(incident.evidence.missingFrames,2);
assert.equal(incident.evidence.code,'MISSING_FROM_VALID_FRAMES');
assert.equal(incident.evidence.lastQuay,c);
assert.equal(incident.evidence.lastEvidence,'SIRI_AT_STOP');
assert(!snap.events.some(e=>/passert fysisk|physical pass/i.test(e.detail)));
const eventsBefore=tracker.summary(now+110000).events.length;
tracker.ingest({...frame(b,'gps',now+120000),leds:[]},{now:now+120000});
assert.equal(tracker.summary(now+120000).events.length,eventsBefore,'Only one disappearance event');
const stale=tracker.ingest(frame(b,'gps',now+110000),{now:now+200000});
assert.equal(stale.events.length,eventsBefore,'Stale frame must never update sequence');
const output=tracker.exportJson(now+200000);
assert(!output.includes(id),'No raw vehicle identifier in exported events');
assert(output.includes('MISSING_FROM_VALID_FRAMES'),'Export contains bounded evidence without private IDs');
assert(output.includes('GPS-near is NOT'));
const persisted=create({board,patterns:data,profile,storage:state,clock:()=>now+201000});
assert(persisted.summary(now+201000).events.length>=3,'Events survive browser reload without raw vehicle ID');
persisted.clear();
assert.equal(create({board,patterns:data,profile,storage:state,clock:()=>now+201000}).summary().events.length,0);
const other=create({board,patterns:data,profile,clock:()=>now});
let next=other.ingest(frame(outbound.quays[7],'gps',now,'veh-2'),{now});
next=other.ingest(frame(outbound.quays[8],'gps',now+10000,'veh-2'),{now:now+10000});
assert.equal(next.active[0].direction,'outbound');
const invalid=create({board,patterns:data,profile,clock:()=>now});
const aSnap=invalid.ingest(frame(a),{now});
const conflictFrame={...frame(a,'gps',now+10000),leds:[
 ...frame(a,'gps',now+10000).leds,...frame(b,'gps',now+10000).leds]};
assert.equal(invalid.ingest(conflictFrame,{now:now+10000}).active[0].sequence.length,1,
 'Same vehicle at two Quays cannot progress');
const contradictory=invalid.ingest(frame(inbound.quays[3],'gps',now+20000),{now:now+20000});
assert.equal(contradictory.active[0].status,'CONFLICT');
assert.equal(contradictory.active[0].direction,'unknown');
assert(contradictory.events.some(e=>e.type==='CONFLICT'));
const gap=create({board,patterns:data,profile,clock:()=>now});
gap.ingest(frame(a),{now});
const jumped=gap.ingest(frame(inbound.quays[14],'gps',now+10000),{now:now+10000});
assert(jumped.events.some(e=>e.type==='GAP'));
assert(!jumped.events.some(e=>e.type==='SOURCE_STOP'));
assert.equal(jumped.active[0].sequence.length,2,'Intermediate missing Quays are not fabricated');
const noCross=create({board,patterns:data,profile,clock:()=>now});
noCross.ingest(frame(a),{now,source:'production'});
noCross.ingest(frame(b,'gps',now+10000),{now:now+10000,source:'staging'});
assert.equal(noCross.summary(now+10000).active[0].direction,'unknown',
 'Never link two independent feed sources as one route');
assert.equal(noCross.summary(now+10000).active.length,1);
const wrongBoard={...frame(a),boardProfile:'other'};
assert.equal(noCross.ingest(wrongBoard,{now:now+20000}).active.length,1);
assert.throws(()=>create({board,patterns:{}}),/patterns-unavailable/);
console.log('Line 1 A-B-C: exact published Quays, source/GPS direction, gap, conflict, multiple LED, stale, lost frame and local history PASS');

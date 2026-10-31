import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {create}=require('../web/linear/network/line1-route-progress.js');
const patterns=JSON.parse(readFileSync(new URL('../config/gps/atb-journey-patterns-1-11.json',import.meta.url)));
const inbound=patterns.lines['1'].patterns.find(p=>p.directionType==='inbound'&&p.quays.length===32);
assert(inbound);
const [a,b,c,d]=inbound.quays.slice(8,12),keys=[...new Set(patterns.lines['1'].patterns.flatMap(p=>p.quays))];
const board={id:'trondheim-city-lines-catalog',nodes:keys.map((quayId,led)=>({quayId,led}))};
const profile={stops:keys.map((id,i)=>({id,name:'Holdeplass '+i}))};
const now=Date.parse('2026-10-31T09:20:00Z');
const privateId='ATB:Vehicle:PRIVATE-SECRET-123';
const make=(quay,at,type='gps',extra=[])=>{
 const led=board.nodes.find(n=>n.quayId===quay).led;
 const v={id:privateId,line:'1',destination:'Ranheim',
  state:type==='siri'?'AT_STOP':'APPROACHING',
  ...(type==='siri'?{quayId:quay,positionType:'entur-siri-provider-stop',
   providerReportedAtStop:true,plannedSourceDirection:'inbound'}:
   {positionType:'gps-nearest-stop',nearestQuayLed:led})};
 return {boardProfile:board.id,generatedAt:new Date(at).toISOString(),
  ttlSeconds:30,leds:[{id:led,state:v.state,occupants:[v]}],
  ...extra};
};
const empty=(at,gpsObservations)=>({
 ...make(a,at),leds:[],
 ...(gpsObservations?{gpsObservations}:{})
});
let track=create({board,patterns,profile,clock:()=>now});
let result=track.ingest(make(a,now,'siri'),{now});
assert.equal(result.events[0].type,'SOURCE_STOP');
result=track.ingest(empty(now+12000),{now:now+12000});
assert(!result.events.some(e=>e.type==='NOT_VISIBLE'),'One empty frame never triggers incident');
result=track.ingest(empty(now+12000),{now:now+58000});
assert(!result.events.some(e=>e.type==='NOT_VISIBLE'),
 'Identical frame repeated after 45s is not independent evidence');
result=track.ingest(empty(now+60000,[{
 id:privateId,line:'1',status:'unresolved',
 nearestQuayId:a,reason:'route-or-direction-unresolved',
 latitude:63.42,longitude:10.32,
 vehicleRef:privateId,token:'PRIVATE-SOURCE-TOKEN'
}]),{now:now+60000});
const missing=result.events.find(e=>e.type==='NOT_VISIBLE');
assert(missing,'Missing bus in two different fresh frames triggers a diagnosis');
assert.equal(missing.evidence.code,'UNRESOLVED_GPS_FOR_SAME_BUS');
assert.equal(missing.evidence.lastQuay,a);
assert.equal(missing.evidence.lastEvidence,'SIRI_AT_STOP');
assert.equal(missing.evidence.missingFrames,2);
assert.equal(missing.evidence.secondsSinceLastObserved,60);
assert.equal(missing.evidence.sourceReason,'route-or-direction-unresolved');
assert.equal(missing.evidence.diagnosticNearestQuay,a);
assert.equal(missing.evidence.diagnosticsAvailable,true);
assert(!JSON.stringify(missing).includes(privateId));
assert(!JSON.stringify(missing).includes('latitude'));
assert(!JSON.stringify(missing).includes('PRIVATE-SOURCE-TOKEN'));
result=track.ingest(make(b,now+70000),{now:now+70000});
const reappear=result.events.find(e=>e.type==='REAPPEARED');
assert(reappear);
assert.equal(reappear.evidence.code,'REAPPEARED_IN_RENDERED_FRAME');
assert.equal(reappear.evidence.reappearedQuay,b);
assert.equal(reappear.evidence.reappearedEvidence,'GPS_NEAR');
assert(!result.events.some(e=>/confirmed arrival/i.test(e.detail)));
const snap=JSON.stringify(result);
assert(!snap.includes(privateId),'Private vehicle keys must never appear in summary/exports');
assert(!snap.includes('longitude'));
const gap=track.ingest(make(inbound.quays[18],now+90000),{now:now+90000});
const hole=gap.events.find(e=>e.type==='GAP');
assert(hole);
assert.equal(hole.evidence.code,'UNOBSERVED_INTERMEDIATE_QUAYS');
assert.equal(hole.evidence.fromQuay,b);
assert.equal(hole.evidence.toQuay,inbound.quays[18]);
assert(hole.evidence.skippedStopsMinimum>=1);
const conflict=track.ingest(make(inbound.quays[3],now+100000),{now:now+100000});
const contrary=conflict.events.find(e=>e.type==='CONFLICT');
assert(contrary);
assert.equal(contrary.evidence.code,'ROUTE_SEQUENCE_CONFLICT');
assert.equal(contrary.evidence.compatiblePatterns,0);
const copied=JSON.parse(track.exportJson(now+100000));
assert(copied.events.some(e=>e.evidence?.code==='UNRESOLVED_GPS_FOR_SAME_BUS'));
assert(!JSON.stringify(copied).includes(privateId));
const duplicate=create({board,patterns,profile,clock:()=>now});
duplicate.ingest(make(a,now),{now});
const conflicting={...make(a,now+10000),leds:[
 ...make(a,now+10000).leds,...make(b,now+10000).leds]};
const collision=duplicate.ingest(conflicting,{now:now+10000});
assert.equal(collision.events[0].type,'CONFLICT');
assert.equal(collision.events[0].evidence.code,'DUPLICATE_QUAY_IN_FRAME');
assert.equal(collision.active[0].quay,a,'Do not progress a duplicated vehicle');
assert(!collision.events.some(e=>e.type==='NOT_VISIBLE'));
const valid=duplicate.ingest(make(b,now+20000),{now:now+20000});
assert(valid.events.some(e=>e.type==='DIRECTION'));
const directionCollision={...make(b,now+30000,'siri')};
directionCollision.leds[0].occupants[0].plannedSourceDirection='outbound';
const ambiguous=duplicate.ingest(directionCollision,{now:now+30000});
assert(ambiguous.events.some(e=>e.evidence?.code==='SOURCE_DIRECTION_CONFLICT'));
const stale=duplicate.ingest(empty(now+31000),{now:now+170000});
assert(!stale.events.some(e=>e.type==='NOT_VISIBLE'));
console.log('Line 1 diagnostic evidence: two distinct frames, same-vehicle GPS rejection, route jumps, duplicate Quays, source direction, recovery and private-ID protection PASS');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)(
 '../web/linear/network/gps-v2-shadow.js');
const t0=Date.parse('2026-10-31T17:00:00Z');
const q=i=>'NSR:Quay:'+i,route=code=>'atb-bus-'+code+'-live';
const n=(id,led,lat,lon,code,stationId)=>({
 quayId:q(id),led,lat,lon,stationId:stationId||'NSR:StopPlace:'+id,
 routes:[route(code)],stopIds:[q(id)]
});
const a=n(500001,1,63.4000,10.30,'1');
const b=n(500002,2,63.4020,10.30,'1');
const c=n(500003,3,63.4040,10.30,'1','NSR:StopPlace:500003');
const opposite=n(500004,4,63.4040,10.30012,'1','NSR:StopPlace:500003');
const d=n(500005,5,63.4100,10.30,'1');
const x=n(500006,6,63.4200,10.30,'11');
const y=n(500007,7,63.4220,10.30,'11');
const z=n(500008,8,63.4240,10.30,'11');
const board={id:'trondheim-city-lines-catalog',
 nodes:[a,b,c,opposite,d,x,y,z]};
const patterns={lines:{
 '1':{patterns:[
  {directionType:'inbound',quays:[a.quayId,b.quayId,c.quayId,d.quayId]},
  {directionType:'outbound',quays:[d.quayId,opposite.quayId,a.quayId]}
 ]},
 '11':{patterns:[
  {directionType:'outbound',quays:[x.quayId,y.quayId,z.quayId]},
  {directionType:'inbound',quays:[z.quayId,y.quayId,x.quayId]}
 ]}
}};
const marker='SECRET-VEHICLE-ID-DO-NOT-LOG';
const make=(time,node,{id=marker,code='1',latitude=node.lat,
 longitude=node.lon,positionType='gps-nearest-stop',ageSeconds=1,
 other={}}={})=>({boardProfile:board.id,
 generatedAt:new Date(time).toISOString(),ttlSeconds:30,
 leds:[{id:node.led,state:'APPROACHING',vehicle:{
 id,line:code,destination:'TEST',positionType,ageSeconds,
 latitude,longitude,...other}}]});
const shadow=create({board,patterns});
const read=frame=>shadow.ingest(frame,{now:Date.parse(frame.generatedAt)+1000});
const original=make(t0,a);const orig=JSON.stringify(original);
let result=read(original);
assert.equal(result.lines['1'].comparedGps,1);
assert.equal(result.lines['1'].unresolved,1,'First sample must not lock direction');
assert.equal(result.lines['1'].acceptedBySourceSequence,0);
assert.equal(result.lines['11'].comparedGps,0);
assert.equal(JSON.stringify(original),orig);
result=read(original);
assert.equal(result.frames,1,'Same timestamp/frame cannot count twice');
result=read(make(t0+10000,b));
assert.equal(result.lines['1'].acceptedBySourceSequence,1);
assert.equal(result.lines['1'].routeDirectionLocked,1,
 'Two different GPS waypoints with ordered source pattern lock direction');
result=read(make(t0+20000,opposite,{latitude:c.lat,longitude:c.lon}));
assert.equal(result.lines['1'].competingQuays,0,
 'Known inbound pattern narrows a 10m opposite-side competing quay');
assert.equal(result.lines['1'].acceptedBySourceSequence,1);
assert.equal(result.lines['1'].differentFromLive,1,
 'Shadow may flag a different candidate, but MUST NOT modify LED');
assert.equal(result.lines['1'].sourceReportedStop,0);
result=read(make(t0+30000,opposite));
assert.equal(result.lines['1'].unresolved,0,'Do not auto-switch direction');
assert.equal(result.lines['1'].sourceDirectionConflict,1,
 'Wrong-side candidate must be rejected, not reassign the vehicle');
assert(!JSON.stringify(result).includes(marker));
assert(!JSON.stringify(result).includes('latitude'));
assert(!JSON.stringify(result).includes(a.quayId),
 'Public summary reports totals, never raw stop or vehicle trajectory');

const single=create({board,patterns});
const v=make(t0,c);
const isolated=single.ingest(v,{now:t0+1000});
assert.equal(isolated.lines['1'].competingQuays,1,
 'Without prior route evidence adjacent platforms remain ambiguous');
assert.equal(isolated.lines['1'].acceptedBySourceSequence,0);
const eta=single.ingest(make(t0+10000,a,{positionType:'estimated-station-call'}),{now:t0+11000});
assert.equal(eta.lines['1'].comparedGps,0,'Timetable ETA is not measured GPS');
const stale=single.ingest(make(t0+20000,a,{ageSeconds:90}),{now:t0+21000});
assert.equal(stale.lines['1'].comparedGps,0,'Stale GPS does not alter direction');
const expired=single.ingest(make(t0+30000,a),{now:t0+200000});
assert.equal(expired.frames,3,'Expired frame is ignored and not counted');
const provider=create({board,patterns});
const frame=make(t0,c,{positionType:'entur-siri-provider-stop',
 other:{quayId:c.quayId,providerReportedAtStop:true,
  plannedSourceDirection:'inbound',state:'AT_STOP'}});
frame.leds[0].state='AT_STOP';
const confirmed=provider.ingest(frame,{now:t0+1000});
assert.equal(confirmed.lines['1'].sourceDirectionLocked,1,
 'Explicit correctly attributed provider stop can lock source direction');
assert.equal(confirmed.lines['1'].comparedGps,0);
const subsequent=provider.ingest(make(t0+10000,c),{now:t0+11000});
assert.equal(subsequent.lines['1'].acceptedBySourceSequence,1);
assert.equal(subsequent.lines['1'].sourceDirectionLocked,1);
const wrongSource=create({board,patterns});
const sourceWrong=structuredClone(frame);
sourceWrong.leds[0].vehicle.plannedSourceDirection='outbound';
const rejectedSource=wrongSource.ingest(sourceWrong,{now:t0+1000});
assert.equal(rejectedSource.lines['1'].sourceDirectionConflict,1,
 'Even provider-labelled direction must be on source patterns');
const newMode=provider.ingest(make(t0+10000,c),{now:t0+11000,source:'staging'});
assert.equal(newMode.lines['1'].competingQuays,1,
 'Production/staging switch resets private direction evidence');
const eleven=create({board,patterns});
const e1=make(t0,x,{code:'11',id:marker});
const e2=make(t0+10000,y,{code:'11',id:marker});
assert.equal(eleven.ingest(e1,{now:t0+1000}).lines['11'].acceptedBySourceSequence,0);
assert.equal(eleven.ingest(e2,{now:t0+11000}).lines['11'].acceptedBySourceSequence,0,
 'Reverse and forward patterns both supporting identical A/B must not infer a direction');
const js=readFileSync(new URL('../web/linear/index.html',import.meta.url),'utf8');
assert(js.includes('InTransitGpsV2Shadow.create('));
assert(js.includes('gpsV2Shadow.ingest(frame,{source})'));
assert(js.includes('id="gpsV2Shadow"'));
const flow=readFileSync(new URL('../.github/workflows/linear-mobile.yml',import.meta.url),'utf8');
assert(flow.includes('node scripts/test-gps-v2-route-shadow.mjs'));
assert(!JSON.stringify(shadow.summary()).includes(marker));
console.log('GPS V2 shadow: 1/11 source order, two-frame direction, competing opposite Quays, provider evidence, stale/ETA/isolation and unchanged live LED PASS');

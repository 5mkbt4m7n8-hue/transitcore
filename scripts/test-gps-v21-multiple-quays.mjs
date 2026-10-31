import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {create}=createRequire(import.meta.url)('../web/linear/network/gps-v2-shadow.js');
const start=Date.parse('2026-10-31T18:00:00Z'),route=code=>'atb-bus-'+code+'-live';
const quay=n=>'NSR:Quay:'+n;
const node=(id,led,lat,lon,code)=>({
 quayId:quay(id),stationId:'NSR:StopPlace:'+Math.floor(id/2),
 led,lat,lon,routes:[route(code)],stopIds:[quay(id)]
});
const a=node(900001,1,63.40,10.40,'1');
const b=node(900002,2,63.40,10.4002,'1'); // ~10m opposite side
const c=node(900003,3,63.401,10.40,'1');
const d=node(900004,4,63.402,10.40,'1');
const e=node(900005,5,63.401,10.42,'1');
const f=node(900006,6,63.402,10.42,'1');
const j=node(900007,7,63.42,10.42,'11');
const k=node(900008,8,63.421,10.42,'11');
const l=node(900009,9,63.422,10.42,'11');
const board={id:'trondheim-city-lines-catalog',nodes:[a,b,c,d,e,f,j,k,l]};
const patt=(directionType,quays)=>({directionType,quays:quays.map(n=>n.quayId)});
const patterns={lines:{
 '1':{patterns:[patt('inbound',[a,c,d]),patt('outbound',[b,e,f])]},
 '11':{patterns:[patt('inbound',[j,k,l]),patt('outbound',[l,k,j])]}
}};
const SECRET='BUS-IDENTITY-SECRET';
const mk=(time,n,{line='1',id=SECRET,coords,kind='gps-nearest-stop',ageSeconds=1,
 extras={}}={})=>({
 boardProfile:board.id,generatedAt:new Date(time).toISOString(),ttlSeconds:30,
 leds:[{id:n.led,state:kind==='entur-siri-provider-stop'?'AT_STOP':'APPROACHING',
  vehicle:{id,line,positionType:kind,ageSeconds,latitude:coords?.[0]??n.lat,
   longitude:coords?.[1]??n.lon,...extras}}]
});
const use=(model,frame,source='production')=>
 model.ingest(frame,{now:Date.parse(frame.generatedAt)+1000,source});
const near=[a.lat,a.lon+0.0001]; // central near both A and B
const shadow=create({board,patterns});
const first=mk(start,a,{coords:near}),serialized=JSON.stringify(first);
let res=use(shadow,first);
assert.equal(res.lines['1'].comparedGps,1);
assert.equal(res.lines['1'].ambiguousCandidatesRetained,1,
 'Both possible platform candidates retained rather than thrown away');
assert.equal(res.lines['1'].unresolved,1);
assert.equal(res.lines['1'].acceptedBySourceSequence,0);
assert.equal(JSON.stringify(first),serialized,'Shadow MUST NOT alter the live frame');
res=use(shadow,first);
assert.equal(res.frames,1,'Repainting a single frame must not count as a second sample');
res=use(shadow,mk(start+10000,a,{coords:near}));
assert.equal(res.lines['1'].ambiguousCandidatesRetained,1);
assert.equal(res.lines['1'].acceptedBySourceSequence,0,
 'Repeated near same platform never implies a route direction');
res=use(shadow,mk(start+20000,c));
assert.equal(res.lines['1'].ambiguityNarrowed,1);
assert.equal(res.lines['1'].ambiguityResolvedAfterFollowup,1);
assert.equal(res.lines['1'].acceptedBySourceSequence,1,
 'An independent source-ordered next Quay narrows A/B to A→C');
assert.equal(res.lines['1'].routeDirectionLocked,1);
assert(!JSON.stringify(res).includes(SECRET));
assert(!JSON.stringify(res).includes(a.quayId));
assert(!JSON.stringify(res).includes('latitude'));
const reverse=create({board,patterns});
use(reverse,mk(start,a,{coords:near}));
res=use(reverse,mk(start+10000,e));
assert.equal(res.lines['1'].ambiguityResolvedAfterFollowup,1,
 'A/B fork can also resolve to outbound B→E');
assert.equal(res.lines['1'].routeDirectionLocked,1);
const wrong=create({board,patterns});
use(wrong,mk(start,a,{coords:near}));
res=use(wrong,mk(start+10000,f));
assert.equal(res.lines['1'].acceptedBySourceSequence,1,
 'Documented pattern may skip one unobserved Quay without inventing its visit');
// A candidate at two different Quays can stay ambiguous after a subsequent
// location if the patterns share that next Quay. A third Quay disambiguates.
const shared={lines:{...patterns.lines,'1':{patterns:[
 patt('inbound',[a,c,d]),patt('outbound',[b,c,f])
]}}};
const shadowShared=create({board,patterns:shared});
use(shadowShared,mk(start,a,{coords:near}));
res=use(shadowShared,mk(start+10000,c));
assert.equal(res.lines['1'].ambiguityNarrowed,1);
assert.equal(res.lines['1'].routeDirectionLocked,0);
assert.equal(res.lines['1'].acceptedBySourceSequence,0,
 'Different origins sharing same next Quay cannot prove direction');
res=use(shadowShared,mk(start+20000,d));
assert.equal(res.lines['1'].routeDirectionLocked,1,
 'Third distinct Quay can disambiguate previously overlapping source paths');
const source=create({board,patterns});
const s=mk(start,a,{kind:'entur-siri-provider-stop',
 extras:{quayId:a.quayId,providerReportedAtStop:true,
 plannedSourceDirection:'inbound',state:'AT_STOP'}});
res=use(source,s);
assert.equal(res.lines['1'].sourceDirectionLocked,1);
res=use(source,mk(start+10000,a,{coords:near}));
assert.equal(res.lines['1'].acceptedBySourceSequence,1,
 'Source-supported route direction narrows GPS candidates without geodistance-only side guess');
const invalid=create({board,patterns});
const stale=mk(start,a,{coords:near,ageSeconds:90});
res=use(invalid,stale);assert.equal(res.lines['1'].comparedGps,0);
const eta=mk(start+10000,a,{kind:'estimated-station-call'});
res=use(invalid,eta);assert.equal(res.lines['1'].comparedGps,0);
const expired=mk(start+20000,a,{coords:near});
res=invalid.ingest(expired,{now:start+100000});
assert.equal(res.frames,2,'Expired feed cannot become a route observation');
const dup=create({board,patterns});
const both=mk(start,a,{coords:near});
both.leds.push({...both.leds[0],id:b.led,vehicle:{...both.leds[0].vehicle}});
res=use(dup,both);
assert.equal(res.lines['1'].duplicateVehicleIdentity,1);
assert.equal(res.lines['1'].comparedGps,0,
 'Same primary ID shown twice must never choose arbitrary first LED');
use(dup,mk(start+10000,c));
res=use(dup,mk(start+20000,d));
assert.equal(res.lines['1'].routeDirectionLocked,1,
 'Later distinct correct observations can start new route without duplicate identity');
const changedSource=create({board,patterns});
use(changedSource,mk(start,a,{coords:near}));
res=use(changedSource,mk(start+10000,c),'staging');
assert.equal(res.lines['1'].acceptedBySourceSequence,0);
const thirteen=create({board,patterns});
use(thirteen,mk(start,j,{line:'11'}));
res=use(thirteen,mk(start+10000,k,{line:'11'}));
assert.equal(res.lines['11'].routeDirectionLocked,1);
assert.equal(res.lines['1'].comparedGps,0);
// Existing source-vetted Quay IDs at the original target stops: first
// observation there never confirms a platform, regardless of closeness.
const actual=JSON.parse(readFileSync(new URL(
 '../config/boards/trondheim-city-lines-catalog.json',import.meta.url),'utf8'));
const sourcePatterns=JSON.parse(readFileSync(new URL(
 '../config/gps/atb-journey-patterns-1-11.json',import.meta.url),'utf8'));
for(const [line,id] of [['1','NSR:Quay:102720'],
 ['11','NSR:Quay:73421'],['1','NSR:Quay:102733']]){
 const n=actual.nodes.find(item=>item.quayId===id);
 assert(n&&sourcePatterns.lines[line].patterns.some(p=>p.quays.includes(id)));
 const frame=mk(start,n,{line,coords:[n.lat,n.lon]});
 const observation=create({board:actual,patterns:sourcePatterns}).ingest(frame,{
  now:Date.parse(frame.generatedAt)+1000});
 assert.equal(observation.lines[line].acceptedBySourceSequence,0,
  'Single GPS at Lerkendal/Tonstad cannot prove platform');
}
console.log('V2.1 multi-Quay shadow: ambiguous retention, source sequence narrowing both directions, shared intermediate ambiguity, 3rd-waypoint resolution, source stop, duplicate ID, stale/ETA and production isolation PASS');

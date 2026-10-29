import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interpretStationVehicles} from '../core/engines/position-interpretation.mjs';
import {strictDirection,safetyCatalog} from '../core/engines/strict-station-gps.mjs';
import {distance} from '../core/frame/mapping-support.mjs';
import {buildFrame,applyMotionLifecycle,holdTransientEmptyFrame} from '../worker/led-feed-worker.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const board=read('config/boards/trondheim-city-lines-catalog.json');
const profiles=board.routes.map(id=>read('config/routes/'+id+'.json'));
const line11=profiles.find(p=>p.line.publicCode==='11'),now=Date.parse('2026-10-29T14:00:00Z');
const node=id=>board.nodes.find(n=>n.led===id);
const vehicle=(at,destination='Blakli',extra={})=>({id:'synthetic-8837',publicCode:'11',destination,
 latitude:at.lat,longitude:at.lon,timestamp:new Date(now-2000).toISOString(),...extra});
const interpret=(vehicles,override=board)=>interpretStationVehicles({board:override,profiles,vehicles,now});
const pick=(at,destination,extra)=>interpret([vehicle(at,destination,extra)]);
const unresolved=(at,destination,extra)=>{const r=pick(at,destination,extra);assert.equal(r.strongest.size,0,JSON.stringify({at,destination,extra}));assert.equal(r.observations[0].status,'unresolved');return r;};
assert.equal(board.nodes.length,1282);
for(const [id,name,quay,station] of [[769,'Norrkøpingveien','74393','61416'],[770,'Nyborg','74213','43264'],
 [134,'Bukkvollan','75463','43948'],[135,'Bukkvollan','75464','43948'],[1105,'Søndre Risvolltun','73565','42906']]){
 assert.equal(node(id).name,name);assert.equal(node(id).quayId,'NSR:Quay:'+quay);assert.equal(node(id).stationId,'NSR:StopPlace:'+station);
}
for(const [id,destination] of [[134,'Blakli'],[135,'Stavset'],[769,'Stavset'],[770,'Blakli']]){
 const r=pick(node(id),destination),item=[...r.strongest.values()][0];
 assert.equal(item?.id,id);assert.equal(item.state,'APPROACHING');assert.equal(item.platformConfirmed,false);
 assert.equal(item.meters,0);assert.equal(r.observations[0].status,'matched');
}
// Wrong side, route, unknown/partial headsign and terminal headsign change.
for(const [id,destination] of [[134,'Stavset'],[135,'Blakli'],[769,'Blakli'],[1105,'Blakli'],[770,'Stavset'],
 [855,'Ranheim'],[855,'Østre Lund'],[967,'Ranheim'],[899,'Ranheim'],[997,'Kattem']])
 unresolved(node(id),destination,{publicCode:[855,967,899,997].includes(id)?'1':'11'});
for(const destination of ['', 'Unknown', 'Stav', 'Blakli Stavset','Not Blakli'])unresolved(node(134),destination);
unresolved(node(134),'Blakli',{publicCode:'1'});unresolved(node(134),'Blakli',{publicCode:'unknown'});
for(const extra of [{latitude:null},{longitude:null},{latitude:NaN},{longitude:Infinity},{latitude:'63.4'},
 {timestamp:'invalid'},{timestamp:'2026-10-29T14:00:00'},{timestamp:new Date(now+1).toISOString()},
 {timestamp:new Date(now-30001).toISOString()},{accuracyMeters:26},{accuracyMeters:Infinity},{id:null}])unresolved(node(134),'Blakli',extra);
unresolved({lat:(node(134).lat+node(135).lat)/2,lon:(node(134).lon+node(135).lon)/2},'Blakli');
unresolved({lat:63,lon:10},'Blakli');
const good=vehicle(node(134)),bad={...good,destination:'Stavset'};
for(const samples of [[good,bad],[bad,good],[good,{...bad,timestamp:new Date(now-1000).toISOString()}],[{...bad,timestamp:'bad'},good]])assert.equal(interpret(samples).strongest.size,0);
const multiple=interpret([good,vehicle(node(135),'Stavset',{id:'other'}),vehicle(node(134),'Unknown',{id:'ambiguous'})]);
assert.deepEqual([...multiple.strongest.keys()].sort((a,b)=>a-b),[134,135]);
assert.equal(multiple.observations.filter(v=>v.status==='unresolved').length,1);
assert.equal(interpret([good,{...good,id:'second'}]).occupantsByLed.get(134).length,2);
// Every accepted result is checked against an independent full-catalog scan.
const safe=safetyCatalog(board.nodes);let checked=0,accepted=0;
assert.equal(safe.filter(n=>n.competitorOnly).length,82);
for(const at of safe.filter(n=>n.competitorOnly))unresolved(at,'Blakli');
for(const at of board.nodes){
 const unknown=unresolved(at,'Unregistered detour');
 assert.equal(unknown.observations[0].latitude,at.lat);assert.equal(unknown.observations[0].longitude,at.lon);
 assert(at.stopIds.includes(at.quayId));assert.match(at.stationId,/^NSR:StopPlace:/);
 for(const route of at.routes){
  const profile=profiles.find(p=>p.id===route);if(profile.positioning?.strategy==='estimated-station-calls')continue;
  for(const destination of at.routeDirections[route]?.destinationMatches||[]){
   const result=pick(at,destination,{publicCode:profile.line.publicCode});checked++;
   for(const item of result.strongest.values()){
    const ranked=safe.map(n=>({n,d:distance(at,n)})).sort((a,b)=>a.d-b.d||a.n.led-b.n.led);
    assert.equal(item.quayId,ranked[0].n.quayId);assert.equal(item.stopPlaceId,at.stationId);
    assert(ranked[0].d<=60);assert(ranked[1].d-ranked[0].d>60);
    assert(strictDirection(at,profile,destination));assert.equal(item.state,'APPROACHING');accepted++;
   }
  }
 }
}
assert(accepted>100);
let seed=278;
for(let i=0;i<400;i++){
 seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const at={lat:node(135).lat+(seed%101-50)/111195,lon:node(135).lon};
 assert.equal(pick(at,'Blakli').strongest.size,0);
 const input=[vehicle(at,'Stavset')],a=interpret(input),b=interpret(input,{...board,nodes:[...board.nodes].reverse()});
 assert.deepEqual([...a.strongest.keys()],[...b.strongest.keys()]);
}
for(const nodes of [[node(134),{...node(135),lat:node(134).lat,lon:node(134).lon}],
 [{...node(134),routeDirections:{[line11.id]:{directionIds:['0','1'],destinationMatches:['Blakli']}}}]])
 assert.equal(interpret([good],{...board,nodes}).strongest.size,0);
for(const at of safe.filter(n=>n.quarantined))unresolved(at,at.routeDirections[at.routes[0]].destinationMatches[0],{publicCode:profiles.find(p=>p.id===at.routes[0]).line.publicCode});
const hardware={schemaVersion:1,boardProfile:board.id,leds:board.leds,assignments:board.nodes.map(n=>({logicalLed:n.led,physicalLed:n.led}))};
const raw=v=>({vehicleId:v.id,destinationName:v.destination,lastUpdated:v.timestamp,line:{publicCode:v.publicCode},location:{latitude:v.latitude,longitude:v.longitude}});
const frame=buildFrame({board,profiles,hardware,vehicles:[raw(good),raw({...bad,id:'unresolved'})],now});
assert.equal(frame.leds.length,1);assert.equal(frame.gpsObservations.length,2);
assert.equal(frame.leds[0].vehicle.quayId,node(134).quayId);assert.equal(frame.leds[0].vehicle.platformConfirmed,false);
assert.equal(frame.leds[0].vehicle.positionType,'gps-route-quay');
const empty={...frame,leds:[],gpsObservations:[]};
assert.deepEqual(applyMotionLifecycle(empty,{134:{led:frame.leds[0],state:'AT_STOP'}},now).frame.leds,[]);
assert.deepEqual(holdTransientEmptyFrame(empty,{frame},now,30000).frame.leds,[]);
const physical=read('config/boards/trondheim-bus-board.json'),physicalHardware=read('config/hardware/trondheim-bus-board-hardware.json');
physical.gpsMatchingNodes=board.nodes;const physicalProfiles=physical.routes.map(id=>profiles.find(p=>p.id===id));let physicalAccepted=0;
for(const at of physical.nodes){
 const profile=physicalProfiles.find(p=>p.id===at.routes[0]),dest=at.routeDirections[profile.id]?.destinationMatches?.[0];
 const r=buildFrame({board:physical,profiles:physicalProfiles,hardware:physicalHardware,vehicles:[raw(vehicle(at,dest,{publicCode:profile.line.publicCode}))],now});
 for(const led of r.leds){assert.equal(led.state,'APPROACHING');assert.equal(led.vehicle.quayId,at.quayId);physicalAccepted++;}
}
assert(physicalAccepted>10);assert.equal(physical.nodes.length,147);
console.log(JSON.stringify({quays:1282,destinationCases:checked,accepted,physicalAccepted,jitterCases:400,strictGps:'PASS'}));

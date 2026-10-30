import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const test=require('../web/linear/network/tonstad-live-test.js');
const board=JSON.parse(readFileSync(new URL('../config/boards/trondheim-city-lines-catalog.json',import.meta.url)));
const node=board.nodes.find(n=>n.quayId===test.QUAY);
assert(node&&Number.isInteger(node.led));
assert.equal(test.MAP_STOP,'original-075');
const now=Date.parse('2026-10-30T14:13:37Z');
const basic={board,now};
const frame={boardProfile:board.id,gpsMatchingPolicy:'strict-route-quay-v1',generatedAt:new Date(now-2000).toISOString(),ttlSeconds:30,leds:[]};
assert.equal(test.inspect({...basic}).state,'NO_FRAME');
assert.equal(test.inspect({...basic,frame}).state,'NOT_OBSERVED');
assert.equal(test.inspect({...basic,frame:{...frame,boardProfile:'wrong'}}).state,'OTHER_BOARD');
assert.equal(test.inspect({...basic,frame,now:now+36000}).state,'STALE');
const unresolved={...frame,gpsObservations:[
 {id:'PRIVATE',line:'1',nearestQuayId:test.QUAY,status:'unresolved',reason:'route-or-direction-unresolved',latitude:63.37},
 {id:'OTHER',line:'11',nearestQuayId:test.QUAY,status:'unresolved',reason:'irrelevant'}]};
const u=test.inspect({...basic,frame:unresolved});
assert.equal(u.state,'UNRESOLVED');
assert.deepEqual(u.unresolved,['route-or-direction-unresolved']);
assert(!JSON.stringify(u).includes('PRIVATE'));
const v={id:'PRIVATE-V',line:'1',destination:'Ranheim',
 quayId:test.QUAY,positionType:'gps-route-quay',
 state:'APPROACHING',providerReportedAtStop:false};
const gps={...frame,leds:[{id:node.led,state:'APPROACHING',occupants:[v]}]};
assert.equal(test.inspect({...basic,frame:gps}).state,'GPS_ONLY');
const source={...v,state:'AT_STOP',positionType:'entur-siri-provider-stop',
 providerReportedAtStop:true,sharedQuaySameLed:true,plannedSourceDirection:'inbound'};
const confirmed={...frame,leds:[{id:node.led,state:'AT_STOP',occupants:[source]}]};
const c=test.inspect({...basic,frame:confirmed});
assert.equal(c.state,'AT_STOP');
assert.equal(c.sourceConfirmed,1);
assert.deepEqual(c.sourceDirections,{inbound:1,outbound:0});
assert.deepEqual(c.destinations,['Ranheim']);
assert.equal(c.led,node.led);
assert(!JSON.stringify(c).includes('PRIVATE-V'));
const two={...confirmed,leds:[{...confirmed.leds[0],occupants:[
 source,{...source,destination:'Østre Lund',plannedSourceDirection:'outbound',id:'ANOTHER'}
]}]};
const both=test.inspect({...basic,frame:two});
assert.equal(both.sourceConfirmed,2);
assert.deepEqual(both.sourceDirections,{inbound:1,outbound:1});
const wrongQuay={...confirmed,leds:[{id:node.led,state:'AT_STOP',occupants:[{...source,quayId:'NSR:Quay:71209'}]}]};
assert.equal(test.inspect({...basic,frame:wrongQuay}).state,'NOT_OBSERVED');
const estimated={...confirmed,leds:[{id:node.led,state:'AT_STOP',occupants:[{...source,positionType:'estimated-station-call',providerReportedAtStop:false}]}]};
assert.equal(test.inspect({...basic,frame:estimated}).state,'GPS_ONLY');
const noMap=test.inspect({...basic,board:{...board,nodes:board.nodes.filter(n=>n.quayId!==test.QUAY)},frame:confirmed});
assert.equal(noMap.state,'NO_MAPPING');
const duplicate=test.inspect({...basic,board:{...board,nodes:[...board.nodes,{...node,led:node.led+1}]},frame:confirmed});
assert.equal(duplicate.state,'NO_MAPPING');
// Legacy GPS PixelFrames omit quayId: use measured nearestQuayLed only as
// proximity, without ever counting a source-confirmed physical stop.
const legacyNear={...frame,leds:[{id:node.led,state:'APPROACHING',
 occupants:[{id:'PRIVATE-LEGACY-GPS',line:'1',destination:'Ranheim',
  positionType:'gps-nearest-stop',nearestQuayLed:node.led,
  state:'APPROACHING',withinStopRadius:true}]}]};
const near=test.inspect({...basic,frame:legacyNear});
assert.equal(near.state,'GPS_ONLY');
assert.equal(near.gpsNearby,1);
assert.equal(near.sourceConfirmed,0);
assert.equal(near.observedVehicles,1);
assert(!JSON.stringify(near).includes('PRIVATE-LEGACY-GPS'));
assert.equal(test.inspect({...basic,frame:{...legacyNear,leds:[{...legacyNear.leds[0],
 occupants:[{...legacyNear.leds[0].occupants[0],nearestQuayLed:node.led+1}]}]}}).state,'NOT_OBSERVED');
const confirmedCount=test.inspect({...basic,frame:confirmed});
assert.equal(confirmedCount.gpsNearby,0,'Source report is not GPS-only');
const stored=new Map();
const storage={getItem:key=>stored.get(key)||null,setItem:(key,val)=>stored.set(key,val)};
const history=test.createHistory({storage,clock:()=>now});
assert.equal(history.observe({info:test.inspect({...basic,frame})}),null,'Do not fill history with initial idle frame');
const first=history.observe({info:near,source:'production',now});
assert.equal(first.state,'GPS_ONLY');
assert.equal(first.gpsNearby,1);
assert.equal(history.observe({info:near,source:'production',now:now+1000}),null,'No duplicate 10s poll rows');
const second=history.observe({info:confirmedCount,source:'production',now:now+2000});
assert.equal(second.state,'AT_STOP');
assert.equal(second.inbound,1);
const third=history.observe({info:test.inspect({...basic,frame}),source:'production',now:now+3000});
assert.equal(third.state,'NOT_OBSERVED','Record a disappearing confirmed bus, not invent a passage');
assert.equal(history.observe({info:test.inspect({...basic,frame,now:now+36000}),now:now+36000}),null,
 'Never log expired evidence as an observed bus');
assert.equal(history.entries(now+3000).length,3);
const recovered=test.createHistory({storage,clock:()=>now+4000});
assert.equal(recovered.entries().length,3,'History persists through page reload for up to one day');
const exported=recovered.exportJson();
assert(exported.includes('Browser-observed PixelFrame'));
assert(!exported.includes('PRIVATE-LEGACY-GPS'));
assert(!exported.includes('PRIVATE-V'));
assert(!exported.includes('latitude'));
assert(!exported.includes('longitude'));
recovered.clear();
assert.equal(recovered.entries().length,0);
assert.equal(test.createHistory({storage,clock:()=>now+5000}).entries().length,0);
const ttl=test.createHistory({storage,clock:()=>now,ttlMs:1000,limit:2});
ttl.observe({info:near,now});
ttl.observe({info:confirmedCount,now:now+500});
ttl.observe({info:near,now:now+2500});
assert.equal(ttl.entries(now+2500).length,1,'Remove older observations after TTL');

console.log('Linear Tonstadkrysset UI: one Quay/LED, SIRI north/south, GPS-only, stale/unknown, legacy GPS, 24h transition history and JSON export PASS');

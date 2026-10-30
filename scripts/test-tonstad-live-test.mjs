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
console.log('Linear Tonstadkrysset UI: one Quay/LED, SIRI north/south, GPS-only, stale/unknown, no false matches PASS');

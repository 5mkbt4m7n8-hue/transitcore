import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Debug=require('../web/linear/network/live-monitor.js');
const Map=require('../web/linear/network/model.js');
const data=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url)));
const layout=data('web/linear/network/trondheim-layout.json');
const board=data('config/boards/trondheim-bus-board.json');
const hardware=data('config/hardware/trondheim-bus-board-hardware.json');
const stop=layout.stops.find(x=>x.id==='original-014');
assert(stop,'Solsiden fixture available');
const quays=Debug.quayIds(stop);
assert.deepEqual(quays,['NSR:Quay:73975','NSR:Quay:73976']);
const resolved=Map.resolve(stop,board,hardware);
const first=resolved.find(x=>x.stopId===quays[0]);
const second=resolved.find(x=>x.stopId===quays[1]);
assert.notEqual(first.physicalLed,second.physicalLed,'Two physical LEDs are distinct');
const now=Date.parse('2026-10-28T07:00:10.000Z');
const frame={
 schemaVersion:1,boardProfile:board.id,sequence:73,
 generatedAt:'2026-10-28T07:00:00.000Z',ttlSeconds:30,
 leds:[
  {id:first.physicalLed,state:'AT_STOP',occupants:[{id:'bus-11a',line:'1',destination:'Kattem',state:'AT_STOP',source:'GPS',ageSeconds:8,distanceMeters:11}]},
  {id:second.physicalLed,state:'APPROACHING',occupants:[{id:'bus-11b',line:'2',destination:'Ranheim',state:'APPROACHING',source:'ETA'}]}
 ]
};
assert.equal(Debug.frameHealth(frame,now).code,'VALID');
assert.equal(Debug.frameHealth(frame,now+31000).code,'EXPIRED');
assert.equal(Debug.frameHealth({...frame,generatedAt:'2026-10-28T07:01:00.000Z'},now).code,'FUTURE_FRAME');
assert.equal(Debug.frameHealth({...frame,generatedAt:'not-a-time'},now).code,'INVALID_FRAME');
assert.equal(Debug.frameHealth(null,now,'ERROR','HTTP 503').code,'NO_FRAME');
assert.deepEqual(Debug.findVehicle(frame,'bus-11a').map(v=>v.physicalLed),[first.physicalLed]);
assert.deepEqual(Debug.findVehicle(frame,'absent'),[],'No invented vehicle location');
const base={stop,board,hardware,frame,line:'1',now};
let diag=Debug.inspect(base);
assert.equal(diag.code,'VISIBLE');
assert.equal(diag.frameSequence,73);
assert.equal(diag.health.ageSeconds,10);
assert.equal(diag.observations.length,1);
assert.equal(diag.observations[0].source,'GPS');
assert.equal(diag.observations[0].distanceMeters,11);
assert.equal(diag.displayed.length,1);
assert.equal(diag.quays.length,2);
assert.equal(diag.quays[1].sourceCount,1,'Show raw evidence for opposite quay');
diag=Debug.inspect({...base,quayId:quays[0]});
assert.equal(diag.code,'VISIBLE');
assert.deepEqual(diag.resolved.map(v=>v.physicalLed),[first.physicalLed]);
assert.deepEqual(diag.displayed.map(v=>v.id),['bus-11a']);
diag=Debug.inspect({...base,quayId:quays[1]});
assert.equal(diag.code,'OTHER_LINE');
assert.equal(diag.observations.length,0);
assert.equal(diag.quays[1].sourceCount,1);
diag=Debug.inspect({...base,quayId:quays[1],line:'2'});
assert.equal(diag.code,'VISIBLE');
assert.deepEqual(diag.displayed.map(v=>v.id),['bus-11b']);
diag=Debug.inspect({...base,quayId:'NSR:Quay:00000'});
assert.equal(diag.code,'UNKNOWN_QUAY');
diag=Debug.inspect({...base,frame:{...frame,leds:[]}});
assert.equal(diag.code,'NOT_OBSERVED');
assert.match(diag.reason,/beviser ikke/,'Missing bus does not assert absence');
diag=Debug.inspect({...base,frame:null,feedError:'HTTP 503'});
assert.equal(diag.code,'NO_FRAME');
assert.equal(diag.displayed.length,0);
diag=Debug.inspect({...base,now:now+31000});
assert.equal(diag.code,'EXPIRED');
assert.equal(diag.displayed.length,0);
diag=Debug.inspect({...base,stop:{...stop,verification:'unresolved'}});
assert.equal(diag.code,'UNVERIFIED_STOP');
const badHardware=structuredClone(hardware);
badHardware.assignments.find(x=>x.logicalLed===second.node.led).physicalLed=first.physicalLed;
diag=Debug.inspect({...base,hardware:badHardware,quayId:quays[0]});
assert.equal(diag.code,'AMBIGUOUS_LED');
assert.equal(diag.displayed.length,0);
assert.deepEqual(diag.sharedLedIds,[first.physicalLed]);
diag=Debug.inspect({...base,board:{...board,id:'other-board'}});
assert.equal(diag.code,'NOT_IN_BOARD');
const ui=readFileSync(new URL('../web/linear/network/map.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../web/linear/index.html',import.meta.url),'utf8');
for(const part of ['liveDebug','debugStop','debugQuay','debugVehicle','exportLiveDebug','Live.inspect','renderLiveDebug']){
 assert(ui.includes(part),'Missing UI integration: '+part);
}
assert(index.includes('network/live-monitor.js'));
assert(index.includes('feedStatus:testing?'));
console.log('Linear live monitor: fresh/stale/error frames, Quay/LED evidence, line filters, vehicle search and no invented GPS PASS');

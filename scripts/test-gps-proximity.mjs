import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {buildStopAccuracy} from '../worker/stop-accuracy.mjs';
import {SIGNAL_POLICY} from '../worker/led-feed-worker.mjs';
import {validatePixelFrame} from '../core/models/pixel-frame.mjs';
import {gpsEvidence,GPS_PROXIMITY_POLICY} from '../core/engines/stop-evidence.mjs';
import {reduceStop} from '../core/engines/stop-lifecycle-candidate.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const board=read('config/boards/trondheim-bus-1-visual-test.json'),hardware=read('config/hardware/trondheim-bus-1-visual-test-hardware.json'),profile=read('config/routes/atb-bus-1-live.json');
board.profileRevision=1;board.profileFingerprint='1234567890abcdef';
const context={board,hardware,profiles:[profile],signalPolicy:SIGNAL_POLICY},epoch=Date.parse('2026-10-19T10:00:00Z'),node=board.nodes[0];
const v=(t,m,id='bus')=>({id,lineId:profile.line.id,publicCode:'1',destination:'Kattem',latitude:node.lat+m/111195,longitude:node.lon,timestamp:new Date(epoch+t*1000).toISOString()});
const require=createRequire(import.meta.url),client=require('../web/shared/board-client-model.js'),esp=require('./fixtures/esp-visual-rc1-reference.cjs');
const strip=leds=>leds.map(({changedAt,...led})=>led);
let thresholdHistory;
const thresholds=[];
for(const [i,meters] of [70,90,90.001,69].entries()){
 const now=epoch+i*10000,observation={lat:node.lat+meters/111195,lon:node.lon,observedAt:now,distanceMeters:meters,directionMatched:true};
 thresholdHistory=reduceStop(thresholdHistory,gpsEvidence(observation,thresholdHistory?.observation,now,GPS_PROXIMITY_POLICY),now,{enabled:true,policy:GPS_PROXIMITY_POLICY});
 thresholds.push(thresholdHistory.state);
}
assert.deepEqual(thresholds,['AT_STOP','AT_STOP','OFF','OFF']);
function run(samples,ctx=context){let saved;const frames=[],states=[],web=client.create({boardProfile:board.id,ledCount:8});
 for(const [t,vehicles] of samples){const r=buildStopAccuracy({...ctx,now:epoch+t*1000,vehicles},saved);saved=r.saved;frames.push(r.frame);
  assert(validatePixelFrame(r.frame,{expectedBoardProfile:board.id,expectedLedCount:8,now:epoch+t*1000}).valid);
  assert(web.accept(r.frame,epoch+t*1000,t*1000));
  for(const offset of [0,450,900,1350])assert.deepEqual(strip(web.sample(epoch+t*1000+offset,t*1000+offset).leds),esp.decode(r.frame,t*1000+offset));
  states.push(r.frame.leds.find(l=>l.id===0)?.state||'OFF');
  assert(!r.frame.leds.some(l=>l.state==='PASSED'||l.lifecycle));
 }return {states,frames,saved};}
const seq=positions=>positions.map((m,i)=>[i*10,[v(i*10,m)]]);
assert.deepEqual(run(seq([240,160,69,20,-60,-91,-120,-100,-80])).states,['OFF','APPROACHING','AT_STOP','AT_STOP','AT_STOP','OFF','OFF','OFF','OFF']);
assert.deepEqual(run(seq([150,60,-40,-100])).states,['OFF','AT_STOP','AT_STOP','OFF']); // pass-through
assert.deepEqual(run(seq([140,50,50,50,80,91])).states,['OFF','AT_STOP','AT_STOP','AT_STOP','AT_STOP','OFF']);
assert.deepEqual(run(seq([69,71,89,75,69,91,89,69])).states,['AT_STOP','AT_STOP','AT_STOP','AT_STOP','AT_STOP','OFF','OFF','OFF']);
assert.deepEqual(run(seq([50,100,180,260,200,100,50])).states,['AT_STOP','OFF','OFF','OFF','APPROACHING','APPROACHING','AT_STOP']);
assert.deepEqual(run(seq([50,49,48,47,50,51])).states,Array(6).fill('AT_STOP')); // slow/standing
// The reported bug: headsign text is presentation, never a new physical visit.
const headsign=run([[0,[v(0,50)]],[10,[v(10,100)]],
 [20,[{...v(20,69),destination:'Kattem via Strindheim-sentrum'}]]]);
assert.deepEqual(headsign.states,['AT_STOP','OFF','OFF']);
assert.equal(headsign.saved.history.length,1);
assert(!headsign.saved.history[0][0].includes('Kattem'));
assert.deepEqual(run([[0,[v(0,50)]],[10,[{...v(10,50),destination:'Kattem via Strindheim-sentrum'}]]]).states,
 ['AT_STOP','AT_STOP'],'Intermediate headsign place must not switch to the opposite quay');
assert.deepEqual(run([[0,[{...v(0,50),provider:'entur'}]],[10,[{...v(10,100),provider:'entur'}]],
 [20,[v(20,69)]]]).states,['AT_STOP','OFF','OFF'],'Optional provider label cannot reset configured provider identity');
const journey=run([[0,[{...v(0,50),journeyId:'trip-a'}]],[10,[{...v(10,100),journeyId:'trip-a'}]],
 [20,[{...v(20,69),journeyId:'trip-b'}]],[30,[v(30,50)]]]);
assert.deepEqual(journey.states,['AT_STOP','OFF','OFF','OFF']);assert.equal(journey.saved.history.length,1);
// Latches survive missing data, object serialization and the normal idle-history
// retention period. Time alone, a new trip or a replay is never an observed exit.
assert.deepEqual(run([[0,[v(0,50)]],[10,[v(10,100)]],[700,[]],[710,[v(710,69)]]]).states,
 ['AT_STOP','OFF','OFF','OFF']);
assert.deepEqual(run([[0,[v(0,50)]],[10,[v(10,100)]],[20,[v(10,260)]],[30,[v(30,69)]]]).states,
 ['AT_STOP','OFF','OFF','OFF']);
assert.deepEqual(run([[0,[v(0,50)]],[10,[v(10,100)]],[20,[v(11,1000)]],[30,[v(30,69)]]]).states,
 ['AT_STOP','OFF','OFF','OFF']);
assert.deepEqual(run([[0,[v(0,50)]],[10,[v(10,100)]],[20,[v(20,260)]],[100,[v(100,69)]],
 [110,[v(110,50)]]]).states,['AT_STOP','OFF','OFF','OFF','AT_STOP']);
const returnTrip=run([[0,[v(0,50)]],[10,[v(10,100)]],[20,[v(20,260)]],
 [30,[{...v(30,200),journeyId:'new-trip',destination:'Tillerterminalen'}]],
 [40,[{...v(40,69),journeyId:'new-trip',destination:'Tillerterminalen'}]]]);
assert.deepEqual(returnTrip.states,['AT_STOP','OFF','OFF','APPROACHING','AT_STOP']);
assert.deepEqual(run([[0,[v(0,50)]],[10,[v(0,50)]],[20,[v(-1,50)]],[40,[v(0,50)]],[50,[]]]).states,['AT_STOP','AT_STOP','AT_STOP','OFF','OFF']);
assert.deepEqual(run([[0,[v(0,50)]],[10,[]],[20,[v(20,91)]]]).states,['AT_STOP','OFF','OFF']);
assert.equal(run([[0,[v(0,50)]],[10,[v(10,1000)]]]).states.at(-1),'OFF'); // >45m/s jump
assert.equal(run([[0,[{...v(0,50),lineId:'WRONG:Line:1'}]]]).states[0],'OFF');
assert.equal(run([[0,[{...v(0,50),destination:'Unknown'}]]]).states[0],'OFF');
const reverse={...v(0,0),latitude:board.nodes[1].lat,longitude:board.nodes[1].lon,destination:'Ranheim'};
const reverseFrame=run([[0,[reverse]]]).frames[0];assert.equal(reverseFrame.leds[0].id,1);
const directionSwitch=run([[0,[v(0,50)]],[10,[v(10,100)]],
 [20,[{...reverse,timestamp:new Date(epoch+20000).toISOString()}]],[30,[v(30,69)]]]);
assert.equal(directionSwitch.states.at(-1),'OFF','Opposite quay must not clear the original quay latch');
assert.equal(run([[0,[{...v(0,50),providerCodespace:'NBU'}]]]).states[0],'OFF');
assert.equal(run([[0,[v(1,50)]]]).states[0],'OFF');
const multi=run([[0,[v(0,40,'a'),v(0,50,'b'),v(0,50,'b')]]]);assert.equal(multi.frames[0].leds[0].occupants.length,2);
assert.equal(run([[0,[{...v(0,50),timestamp:'invalid'},v(0,50)]]]).states[0],'AT_STOP');
const mapped=structuredClone(hardware);[mapped.assignments[0].physicalLed,mapped.assignments[1].physicalLed]=[mapped.assignments[1].physicalLed,mapped.assignments[0].physicalLed];
assert.equal(run([[0,[v(0,50)]]],{...context,hardware:mapped}).frames[0].leds[0].id,mapped.assignments[0].physicalLed);
const d=multi.saved.diagnostics[0];assert.equal(d.observationAgeMs,0);assert.equal(d.stateChangedAt,epoch);assert.equal(d.physicalLed,0);
const start=buildStopAccuracy({...context,now:epoch,vehicles:[v(0,50)]});const cached=buildStopAccuracy({...context,now:epoch+5000,vehicles:[v(5,100)]},start.saved);assert(cached.reused);assert.deepEqual(cached.frame,start.frame);
const noGps=buildStopAccuracy({...context,now:epoch,vehicles:[],calls:[{expectedArrival:epoch}]});assert.equal(noGps.frame.leds.length,0);
const latched=run(seq([50,100]));
const restored=buildStopAccuracy({...context,now:epoch+20000,vehicles:[{...v(20,69),destination:'Tillerterminalen'}]},JSON.parse(JSON.stringify(latched.saved)));
assert.equal(restored.frame.leds.length,0,'Persisted visit must survive an object restart');
const rollback=buildStopAccuracy({...context,board:{...board,render:{...board.render,stopAccuracy:'motion-v1'}},now:epoch+20000,vehicles:[v(20,50)]},latched.saved);
assert.equal(rollback.frame.leds[0].state,'APPROACHING','Profile rollback resets incompatible proximity history');
assert.equal('mode' in restored.frame,false);assert.equal('diagnostics' in restored.frame,false);
// Identical synthetic samples: compare timing without claiming production precision.
const samples=seq([140,50,4,4,-100,-140,-180]);
function timing(mode){let saved;const states=[];for(const [t,vehicles] of samples){const r=buildStopAccuracy({...context,board:{...board,render:{...board.render,stopAccuracy:mode}},now:epoch+t*1000,vehicles},saved);saved=r.saved;states.push({t,state:r.frame.leds[0]?.lifecycle||r.frame.leds[0]?.state||'OFF'});}return states;}
assert.equal(timing('motion-v1').find(x=>x.state==='AT_STOP').t,30);
assert.equal(timing('gps-proximity-v1').find(x=>x.state==='AT_STOP').t,10);
assert.equal(timing('gps-proximity-v1').find(x=>x.t>10&&x.state==='OFF').t,40);
assert.equal(timing('motion-v1').find(x=>x.t>30&&x.state==='OFF').t,60);
for(const file of fs.readdirSync(new URL('../config/boards/',import.meta.url)).filter(f=>f.endsWith('.json')))assert.equal(read('config/boards/'+file).render?.stopAccuracy==='gps-proximity-v1',file===board.id+'.json');
console.log('GPS proximity: geographic sequences, hysteresis, no relight/afterglow, identities, freshness, cache, mapping and web/ESP reference parity PASS');

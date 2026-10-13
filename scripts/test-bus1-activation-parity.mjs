import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {buildStopAccuracy,usesStopAccuracy} from '../worker/stop-accuracy.mjs';
import {SIGNAL_POLICY,DeviceStatus} from '../worker/led-feed-worker.mjs';
const require=createRequire(import.meta.url),client=require('../web/shared/board-client-model.js'),reference=require('./fixtures/esp-visual-rc1-reference.cjs');
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const board=read('config/boards/trondheim-bus-1-visual-test.json'),hardware=read('config/hardware/trondheim-bus-1-visual-test-hardware.json'),profile=read('config/routes/atb-bus-1-live.json');
// Only the Bus1 test profile opts in; all other repository profiles stay legacy.
const base={board:{...board,render:{...board.render,stopAccuracy:'motion-v1'},profileRevision:1,profileFingerprint:'1234567890abcdef'},hardware,profiles:[profile],signalPolicy:SIGNAL_POLICY};
const epoch=Date.parse('2026-10-12T12:00:00Z'),node=board.nodes[0];
new vm.Script(fs.readFileSync(new URL('../web/board/client-diagnostics.js',import.meta.url),'utf8'));
assert(!fs.readFileSync(new URL('../web/board/client-diagnostics.js',import.meta.url),'utf8').includes('api.entur.io'));
const v=(t,m,id='bus-a')=>({id,publicCode:'1',destination:'Kattem',latitude:node.lat+m/111195,longitude:node.lon,timestamp:new Date(epoch+t*1000).toISOString()});
const simple=leds=>leds.map(({changedAt,...l})=>l);
function run(name,steps){let saved;const web=client.create({boardProfile:board.id,ledCount:8});const sequence=[];
  for(const [t,vehicles] of steps){const r=buildStopAccuracy({...base,now:epoch+t*1000,vehicles},saved);saved=r.saved;
    assert(web.accept(r.frame,epoch+t*1000,t*1000));
    // Entire LED vector, including identities and animation at multiple times.
    for(const offset of [0,450,900,1350])assert.deepEqual(simple(web.sample(epoch+t*1000+offset,t*1000+offset).leds),reference.decode(r.frame,t*1000+offset));
    sequence.push(web.sample(epoch+t*1000,t*1000).leds[0].state);
  }
  console.log(name+': '+sequence.join(' -> '));return {sequence,saved,web};
}
assert(usesStopAccuracy(board));
assert(usesStopAccuracy(base.board));
for(const file of fs.readdirSync(new URL('../config/boards/',import.meta.url)).filter(f=>f.endsWith('.json')))assert.equal(usesStopAccuracy(read('config/boards/'+file)),file===board.id+'.json',file);
assert.throws(()=>buildStopAccuracy({...base,board:{...board,render:{...board.render,stopAccuracy:'legacy'}},now:epoch,vehicles:[]}),/not enabled/);
const ab=run('A/B arrival/departure',[[0,[v(0,140)]],[10,[v(10,50)]],[20,[v(20,4)]],[30,[v(30,4)]],[40,[v(40,-22)]],[50,[v(50,-45)]],[60,[v(60,-70)]]]);
assert.deepEqual(ab.sequence,['APPROACHING','APPROACHING','APPROACHING','AT_STOP','AT_STOP','PASSED','OFF']);
assert(!run('C drive-through',[[0,[v(0,140)]],[10,[v(10,50)]],[20,[v(20,4)]],[30,[v(30,-60)]]]).sequence.includes('AT_STOP'));
assert(!run('D queue 50m',[[0,[v(0,50)]],[10,[v(10,50)]],[20,[v(20,50)]]]).sequence.includes('AT_STOP'));
assert(!run('E sub-poll stop',[[0,[v(0,50)]],[10,[v(10,4)]],[20,[v(20,-50)]]]).sequence.includes('AT_STOP'));
assert.deepEqual(run('F stale/missing',[[0,[v(0,4)]],[10,[v(10,4)]],[50,[v(10,4)]],[60,[]]]).sequence,['APPROACHING','AT_STOP','OFF','OFF']);
const g=buildStopAccuracy({...base,now:epoch,vehicles:[],calls:[{expectedArrival:epoch}]});assert.equal(g.frame.leds.length,0);console.log('G ETA without GPS: OFF, no synthetic GPS or fallback arrival');
run('H collision',[[0,[v(0,4),v(0,50,'bus-b')]],[10,[v(10,4),v(10,4,'bus-b')]],[20,[v(20,-22),v(20,4,'bus-b')]],[30,[v(30,-45),v(30,4,'bus-b')]]]);
const park=run('PARKED',Array.from({length:33},(_,i)=>[i*10,[v(i*10,4)]]));assert.equal(park.sequence.at(-1),'PARKED');
// Missing/invalid feed preserves last valid frame then expires, exactly >TTL.
const frame=park.saved.frame,web=client.create({boardProfile:board.id,ledCount:8});assert(web.accept(frame,epoch+320000,320000));
for(const bad of [{...frame,schemaVersion:2},{...frame,sequence:frame.sequence-1},{...frame,ledCount:9},{...frame,leds:[frame.leds[0],frame.leds[0]]}])assert.equal(web.accept(bad,epoch+321000,321000),false);
web.failed('HTTP 503');
assert.deepEqual(simple(web.sample(epoch+349000,349000).leds),reference.decode(frame,349000));
assert.deepEqual(simple(web.sample(epoch+350000,350000).leds),reference.decode(frame,350000));
assert.deepEqual(simple(web.sample(epoch+350001,350001).leds),reference.decode(frame,350001,true));
assert(web.accept({...frame,sequence:frame.sequence+40,generatedAt:new Date(epoch+360000).toISOString()},epoch+360000,360000));console.log('I missing/invalid feed: last valid -> expiry -> recovery PASS');
assert.deepEqual([0,450,900,1350,1800].map(t=>client.visualPulse(t)),[0,127,255,127,0]);
assert.equal(client.visualPulse(900,{pulseMinBrightness:32,pulseMaxBrightness:128}),128);
// Shared frame window independent of extra viewers; persistent history survives object recreation.
const data=new Map(),state={storage:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,structuredClone(v))},blockConcurrencyWhile:fn=>fn()};
const send=async(t,vs)=>{const object=new DeviceStatus(state,{});const r=await object.fetch(new Request('https://status.internal/stop-accuracy',{method:'POST',body:JSON.stringify({...base,now:epoch+t*1000,vehicles:vs})}));return r.json();};
const first=await send(0,[v(0,4)]);assert.deepEqual(await send(5,[v(5,-100)]),first);
const second=await send(10,[v(10,4)]);assert.equal(second.leds[0].state,'AT_STOP');assert(data.has('stopAccuracyV1'));assert(!data.has('motion'));
console.log('Persistent isolated history / shared frame / profile-only enable / rollback gate PASS');

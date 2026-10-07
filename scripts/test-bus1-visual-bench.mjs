import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeBoardConfig,validateBoardConfig} from '../core/models/board-config.mjs';
import {normalizeEnturVehicle} from '../core/providers/entur/entur-normalizer.mjs';
import {buildPixelFrame} from '../core/frame/build-frame.mjs';
import worker,{SIGNAL_POLICY} from '../worker/led-feed-worker.mjs';
import {validatePixelFrame} from '../core/models/pixel-frame.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const id='trondheim-bus-1-visual-test',route='atb-bus-1-live';
const raw=read('config/boards/'+id+'.json'),hardware=read('config/hardware/'+id+'-hardware.json');
const profile=read('config/routes/'+route+'.json'),production=read('config/boards/trondheim-bus-board.json');
const board=normalizeBoardConfig(raw,{hardware,routeProfiles:[profile]});
assert.ok(validateBoardConfig(board).valid);
assert.deepEqual(board.routes,[route]);
assert.equal(board.status,'test-only');assert.equal(board.ledCount,8);
assert.ok(board.name.startsWith('TEST / DEVELOPMENT ONLY'));
assert.ok(hardware.name.startsWith('TEST / DEVELOPMENT ONLY'));
assert.equal(hardware.leds.dataPin,14);assert.equal(hardware.leds.brightnessLimit,32);
// Profile contract only: this test must run before visual backend support exists.
assert.deepEqual(board.render.visual,{pulsePeriodMs:1800,pulseMinBrightness:0,pulseMaxBrightness:255,backgroundBrightness:9});
const now=Date.parse('2026-10-07T12:00:00Z');
const frame=vehicles=>buildPixelFrame({board,hardware,profiles:[profile],now,signalPolicy:SIGNAL_POLICY,vehicles:vehicles.map(normalizeEnturVehicle)},{validate:true});
let approach=0;
for(const node of board.nodes) {
  const original=production.nodes.find(n=>n.id===node.id);
  for(const field of ['lat','lon','quayId','stopIds'])assert.deepEqual(node[field],original[field]);
  assert.deepEqual(node.routeDirections,{[route]:original.routeDirections[route]});
  assert.equal(hardware.assignments[node.led].physicalLed,node.led);
  const v={vehicleId:'bench-one',lastUpdated:new Date(now-1000).toISOString(),line:{publicCode:'1'},destinationName:node.routeDirections[route].destinationMatches[0],location:{latitude:node.lat,longitude:node.lon}};
  const f=frame([v]);
  assert.equal(f.ledCount,8);assert.equal(f.leds.length,1);assert.equal(f.leds[0].id,node.led);assert.equal(f.leds[0].state,'AT_STOP');
  assert.equal(frame([{...v,line:{publicCode:'2'}}]).leds.length,0);
  assert.equal(frame([{...v,lastUpdated:new Date(now-3600000).toISOString()}]).leds.length,0);
  for(const delta of [.001,.0015,.002]) {
    const f=frame([{...v,location:{latitude:node.lat+delta,longitude:node.lon}}]);
    if(f.leds.some(l=>l.state==='APPROACHING')){approach++;break;}
  }
}
assert.ok(approach>0,'Real proximity samples must allow pulse testing');
assert.equal(frame([]).leds.length,0);
console.log(`Bus1 bench: 8 quay/direction mappings, line exclusion, stale/empty, PixelFrame and ${approach} APPROACHING cases PASS`);
// Exercise the real generic HTTP route and configuration loader with local
// upstream fixtures. No deployment, provider call or special test-feed engine.
const originalFetch=globalThis.fetch,originalNow=Date.now;
const requested=[];
try {
  Date.now=()=>now;
  globalThis.fetch=async(url,options)=>{
    const value=String(url);requested.push(value);
    const relative=value.split('/main/')[1];
    if(relative?.startsWith('config/'))return Response.json(read(relative));
    if(options?.method==='POST'&&value===profile.provider.vehicleEndpoint) {
      const node=board.nodes[0];
      return Response.json({data:{vehicles:[{vehicleId:'bench-http',lastUpdated:new Date(now-1000).toISOString(),line:{publicCode:'1'},destinationName:node.routeDirections[route].destinationMatches[0],location:{latitude:node.lat,longitude:node.lon}}]}});
    }
    throw Error('Unexpected upstream in isolated test');
  };
  const response=await worker.fetch(new Request('https://worker.test/api/v1/frame/'+id),{});
  assert.equal(response.status,200);
  const value=await response.json();
  assert.equal(value.schemaVersion,1);assert.equal(value.boardProfile,id);assert.equal(value.ledCount,8);
  assert.ok(value.leds.length>0);assert.ok(value.leds.every(l=>l.id>=0&&l.id<8));
  assert.ok(validatePixelFrame(value).valid);
  assert.ok(requested.some(p=>p.endsWith('/config/hardware/'+hardware.id+'.json')));
  assert.deepEqual(requested.filter(p=>p.includes('/config/routes/')).map(p=>p.split('/').at(-1)),[route+'.json']);
  const health=await worker.fetch(new Request('https://worker.test/health'),{});
  assert.ok(!(await health.json()).boardProfiles.includes(id),'Bench must not enter default/monitor board catalogue');
  console.log('Generic Worker HTTP route: profile loading, line1-only canonical PixelFrame v1, 8 LEDs PASS (mock upstream)');
} finally {globalThis.fetch=originalFetch;Date.now=originalNow;}

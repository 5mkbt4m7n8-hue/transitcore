// Node CPU/heap measurements are diagnostic, NOT Cloudflare billed CPU.
// No vehicle IDs, GPS coordinates or upstream payloads are printed/persisted.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {interpretStationVehicles} from '../core/engines/position-interpretation.mjs';
import {catalogIndex} from '../core/engines/catalog-index.mjs';
import {validateConfiguration} from '../core/frame/mapping-support.mjs';
import {mapLedStates} from '../core/frame/led-mapper.mjs';
import {renderStationFrame} from '../core/frame/frame-renderer.mjs';
import {normalizeEnturVehicle} from '../core/providers/entur/entur-normalizer.mjs';

const root = new URL('../', import.meta.url);
const initAt=performance.now(),initCpu=process.cpuUsage(),initHeap=process.memoryUsage().heapUsed;
const {attachProfileIdentity}=await import('../worker/led-feed-worker.mjs');
const initUsed=process.cpuUsage(initCpu);
const workerModuleImport={wallMs:performance.now()-initAt,cpuMs:(initUsed.user+initUsed.system)/1000,
  heapDeltaBytes:process.memoryUsage().heapUsed-initHeap,
  note:'Local Node module import with core modules already imported, not Cloudflare cold-start CPU'};
const read = path => JSON.parse(readFileSync(new URL(path, root)));
// Fixed pre-change implementation is the independent semantic/performance oracle.
const baselineRevision = 'aa5cfc73ef2738b4d618d63364126c3538bea51f';
async function baseline(path) {
  let source = execFileSync('git', ['show', `${baselineRevision}:${path}`], {encoding:'utf8'});
  source = source.replace(/from "(\.\.?\/[^\"]+)"/g,
    (_, relative) => `from "${new URL(relative, new URL(path, root)).href}"`);
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const old = await baseline('core/engines/position-interpretation.mjs');
const oldSupport = await baseline('core/frame/mapping-support.mjs');
const board = read('config/boards/trondheim-city-lines-catalog.json');
const profiles = board.routes.map(id => read(`config/routes/${id}.json`));
const hardware = {schemaVersion:1,boardProfile:board.id,leds:board.leds,
  assignments:board.nodes.map(node=>({logicalLed:node.led,physicalLed:node.led}))};
const now = Date.parse('2026-10-29T12:00:00Z');
function fleet(count) {
  return Array.from({length:count}, (_, i) => {
    const node = board.nodes[(i * 37) % board.nodes.length];
    const profile = profiles[i % (profiles.length - 1)];
    return {id:`synthetic-${i}`,publicCode:profile.line.publicCode,
      destination:i%3 ? profile.directions?.[i%2]?.destinationMatches?.[0] || '' : 'Unknown',
      latitude:node.lat+(i%5-2)*0.0001,longitude:node.lon+(i%7-3)*0.0001,
      timestamp:new Date(now-2000).toISOString()};
  });
}
const context = vehicles => ({board,profiles,hardware,vehicles,now,signalPolicy:{fullBrightness:32}});
// Every catalog Quay plus off-route/unknown headsigns, explicit directions,
// grid edges and radius boundaries use the unchanged full-scan oracle.
const all = board.nodes.flatMap((node,i) => ['', 'Unknown', 'Blakli', 'Stavset'].map((destination,j)=>({
  id:`quay-${i}-${j}`,publicCode:'11',destination,latitude:node.lat,longitude:node.lon,
  timestamp:new Date(now).toISOString()})));
const boundary = board.nodes.slice(0,100).flatMap((node,i)=>[-1,1].map(sign=>({
  id:`boundary-${i}-${sign}`,publicCode:'11',destination:'Unknown',
  latitude:node.lat+sign*board.render.approachRadiusMeters/110000,
  longitude:node.lon,timestamp:new Date(now).toISOString()})));
for (const vehicles of [all, boundary, fleet(250), fleet(1000)]) {
  assert.deepEqual(interpretStationVehicles(context(vehicles)),old.interpretStationVehicles(context(vehicles)));
}
const first = catalogIndex(board.nodes);
let examined=0;
for(const at of board.nodes){
  const radius=Math.max(Number(board.render.approachRadiusMeters)||250,1);
  examined+=first.candidates(at.lat,at.lon,radius/110000,
    radius/(111000*Math.max(.2,Math.cos(at.lat*Math.PI/180)))).length;
}
assert(examined<board.nodes.length**2*.1,'Index must eliminate at least 90% of catalog candidate visits');
assert.equal(catalogIndex(board.nodes),first,'Reuse across frames and GPS board views');
const changed = structuredClone(board.nodes);
changed[0].lat += 1;
assert.notEqual(catalogIndex(changed),first,'New configuration must invalidate index');
const reversed = {...board,nodes:[...board.nodes].reverse()};
assert.deepEqual(interpretStationVehicles({...context(all),board:reversed}),old.interpretStationVehicles({...context(all),board:reversed}));
const tie = {...board,nodes:[{...board.nodes[0],led:9999},{...board.nodes[0],led:3}]};
assert.equal([...interpretStationVehicles({...context([{...all[0],destination:'Unknown'}]),board:tie}).strongest.keys()][0],3);

function measure(name, operation, iterations=300) {
  for(let i=0;i<30;i++) operation();
  globalThis.gc?.();
  const before=process.memoryUsage(), cpu=process.cpuUsage(), values=[];
  let peak=before.heapUsed;
  for(let i=0;i<iterations;i++) {
    const at=performance.now(); operation(); values.push(performance.now()-at);
    peak=Math.max(peak,process.memoryUsage().heapUsed);
  }
  const used=process.cpuUsage(cpu);
  globalThis.gc?.();
  values.sort((a,b)=>a-b);
  return {name,iterations,p50Ms:values[Math.floor(values.length*.5)],p95Ms:values[Math.floor(values.length*.95)],
    cpuMsPerOp:(used.user+used.system)/1000/iterations,
    transientHeapBytes:peak-before.heapUsed,retainedHeapBytes:process.memoryUsage().heapUsed-before.heapUsed,
    rssBytes:process.memoryUsage().rss};
}
const input=context(fleet(250));
let liveInput;
if (process.argv.includes('--live')) {
  const response=await fetch(profiles[0].provider.vehicleEndpoint,{method:'POST',
    headers:{'content-type':'application/json','ET-Client-Name':'transitcore-performance-audit'},
    body:JSON.stringify({query:'{vehicles(codespaceId:"ATB"){vehicleId lastUpdated destinationName line{publicCode} location{latitude longitude}}}'}),
    signal:AbortSignal.timeout(15000)});
  assert(response.ok,`Live upstream HTTP ${response.status}`);
  const data=await response.json();assert(!data.errors?.length);assert(Array.isArray(data.data?.vehicles));
  liveInput={...context(data.data.vehicles.map(normalizeEnturVehicle)),now:Date.now()};
  assert.deepEqual(interpretStationVehicles(liveInput),old.interpretStationVehicles(liveInput));
}
const interpreted=interpretStationVehicles(input),mapped=mapLedStates(input,interpreted);
const raw=input.vehicles.map(v=>({vehicleId:v.id,lastUpdated:v.timestamp,destinationName:v.destination,
  line:{publicCode:v.publicCode},location:{latitude:v.latitude,longitude:v.longitude}}));
const results=[
  measure('validation-before',()=>oldSupport.validateConfiguration(board,profiles,hardware)),
  measure('validation-after',()=>validateConfiguration(board,profiles,hardware)),
  measure('configuration-fingerprint',()=>attachProfileIdentity(board,hardware)),
  measure('interpret-250-before',()=>old.interpretStationVehicles(input)),
  measure('interpret-250-after',()=>interpretStationVehicles(input)),
  measure('normalization-250',()=>raw.map(normalizeEnturVehicle)),
  measure('mapping-250',()=>mapLedStates(input,interpreted)),
  measure('render-250',()=>renderStationFrame(input,mapped)),
  measure('serialize-250',()=>JSON.stringify(renderStationFrame(input,mapped))),
  measure('index-cold',()=>catalogIndex([...board.nodes])),
  measure('interpret-1000-after',()=>interpretStationVehicles(context(fleet(1000))),100)
];
if(liveInput) results.push(measure('interpret-live-before',()=>old.interpretStationVehicles(liveInput)),
  measure('interpret-live-after',()=>interpretStationVehicles(liveInput)));
const memory=[];
if(globalThis.gc)for(const [name,operation] of [
  ['index',()=>catalogIndex([...board.nodes])],
  ['interpret-250-before',()=>old.interpretStationVehicles(input)],
  ['interpret-250-after',()=>interpretStationVehicles(input)]]) {
  const deltas=[];
  for(let i=0;i<20;i++){
    globalThis.gc();const before=process.memoryUsage().heapUsed;
    const value=operation();deltas.push(process.memoryUsage().heapUsed-before);
    assert(value);
  }
  deltas.sort((a,b)=>a-b);memory.push({name,p95SingleOperationHeapDeltaBytes:deltas[19]});
}
console.log(JSON.stringify({runtime:process.version,baselineRevision,semanticParity:true,
  nodes:board.nodes.length,profiles:profiles.length,candidateVisitRatio:examined/board.nodes.length**2,
  workerModuleImport,liveVehicleCount:liveInput?.vehicles.length,memory,results},null,2));

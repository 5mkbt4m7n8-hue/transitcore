import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {buildStopAccuracy,usesUnifiedBus,stopContextDigest} from '../worker/stop-accuracy.mjs';
import {SIGNAL_POLICY,DeviceStatus} from '../worker/led-feed-worker.mjs';
import {validatePixelFrame} from '../core/models/pixel-frame.mjs';
import {loadStopCalls} from '../core/providers/entur/stop-call-loader.mjs';
import {readBusHistory,writeBusHistory} from '../worker/bus-history.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const now=Date.parse('2026-10-13T12:00:00Z');
for(const id of ['trondheim-bus-1-visual-test','trondheim-bus-board','trondheim-shared-stops-board','trondheim-city-lines-catalog']){
 const board=read('config/boards/'+id+'.json');
 // Keep the established motion/PARKED regression in its original mode. The
 // configured GPS mode is exercised separately through the actual staging DO.
 if(id==='trondheim-bus-1-visual-test')board.render.stopAccuracy='motion-v1';
 const hardware=id==='trondheim-city-lines-catalog'
  ? {schemaVersion:1,boardProfile:id,leds:{count:board.leds.count,brightnessLimit:32},assignments:board.nodes.map(n=>({logicalLed:n.led,physicalLed:n.led}))}
  : read('config/hardware/'+id+'-hardware.json');
 const profiles=board.routes.map(id=>read('config/routes/'+id+'.json'));
 assert(!usesUnifiedBus(board,profiles));
 assert(usesUnifiedBus(board,profiles,{BUS_LIFECYCLE_BOARDS:board.id}));
 const seed=profiles.filter(p=>p.positioning?.strategy!=='estimated-station-calls').map(p=>({p,n:board.nodes.find(n=>n.routes.includes(p.id)&&n.routeDirections?.[p.id]?.destinationMatches?.length)})).filter(x=>x.n);
 if(id==='trondheim-city-lines-catalog')assert.equal(seed.length,47);
 const vehicles=t=>seed.flatMap(({p,n},i)=>Array.from({length:3},(_,j)=>({id:`${i}-${j}`,lineId:p.line.id,publicCode:p.line.publicCode,destination:n.routeDirections[p.id].destinationMatches[0],latitude:n.lat,longitude:n.lon,timestamp:new Date(t).toISOString()})));
 const context={board,hardware,profiles,signalPolicy:SIGNAL_POLICY,unifiedBus:true};
 context.bindingDigest=await stopContextDigest(context);
 const begin=performance.now();let state;
 for(let i=0;i<35;i++){
  const t=now+i*10000,r=buildStopAccuracy({...context,now:t,vehicles:vehicles(t)},state);
  assert(validatePixelFrame(r.frame).valid);state=JSON.parse(JSON.stringify(r.saved));
  assert.deepEqual(buildStopAccuracy({...context,now:t+5000,vehicles:[]},state).frame,r.frame);
 }
 assert(state.frame.leds.some(l=>l.lifecycle==='PARKED'));
 assert.equal(state.frame.ledCount,hardware.leds.count);
 console.log(`${id}: ${seed.length} routes / ${seed.length*3} vehicles; 35 builds ${(performance.now()-begin).toFixed(1)} ms; saved ${JSON.stringify(state).length} chars`);
 const empty=buildStopAccuracy({...context,now:now+1000000,vehicles:[]},state);assert.equal(empty.saved.history.length,0);
}
const tram=read('config/boards/grakallbanen-prototype-board.json');
assert(!usesUnifiedBus(tram,tram.routes.map(id=>read('config/routes/'+id+'.json')),{BUS_LIFECYCLE_BOARDS:tram.id}));
const bus=read('config/boards/trondheim-bus-1-visual-test.json'),hardware=read('config/hardware/trondheim-bus-1-visual-test-hardware.json');
bus.render.stopAccuracy='motion-v1'; // Existing ETA/reducer contract, not GPS proximity.
const route=read('config/routes/atb-bus-1-live.json'),n=bus.nodes[0];
const ctx={board:bus,hardware,profiles:[route],signalPolicy:SIGNAL_POLICY,unifiedBus:true,now,vehicles:[]};
ctx.bindingDigest=await stopContextDigest(ctx);
const call={id:'trip',lineId:route.line.id,quayId:n.stopIds[0],serviceDate:'2026-10-13',destination:n.routeDirections[route.id].destinationMatches[0],receivedAt:now,realtime:true,expectedArrival:now,expectedDeparture:now+10000};
const uncertain=buildStopAccuracy({...ctx,calls:[call]});assert.equal(uncertain.frame.leds.length,0);assert(uncertain.diagnostics.some(d=>d.confidence==='forecast'&&d.state==='OFF'));
assert.equal(buildStopAccuracy({...ctx,calls:[{...call,expectedArrival:now+10000}]}).frame.leds[0].state,'APPROACHING');
assert.equal(buildStopAccuracy({...ctx,calls:[{...call,actualArrival:now-1000}]}).frame.leds[0].state,'AT_STOP');
assert.equal(buildStopAccuracy({...ctx,calls:[{...call,actualDeparture:now-1000}]}).frame.leds[0].lifecycle,'PASSED');
assert.equal(buildStopAccuracy({...ctx,calls:[{...call,cancelled:true}]}).frame.leds.length,0);
let requests=0;
const eta={...route,positioning:{strategy:'estimated-station-calls',endpoint:'https://provider.test'}};
const calls=await loadStopCalls({board:bus,profiles:[eta],now,clientName:'test',fetchJson:async(url,options)=>{
 requests++;assert(JSON.parse(options.body).query.includes('actualDepartureTime'));
 return {data:{q0:{estimatedCalls:[{date:'2026-10-13',realtime:true,expectedArrivalTime:new Date(now+10000).toISOString(),destinationDisplay:{frontText:call.destination},serviceJourney:{id:'trip',journeyPattern:{line:{id:route.line.id,publicCode:'1'}}}},{serviceJourney:{journeyPattern:{line:{id:'OTHER:Line:1'}}}}]}}};
}});
assert.equal(requests,1);assert.equal(calls.length,1);assert.equal(calls[0].lineId,route.line.id);
console.log('Unified GPS/ETA reducer, uncertainty, operator identity, history, gate isolation PASS');
const data=new Map();let writes=0;
const store={get:async k=>data.get(k),delete:async k=>data.delete(k),put:async values=>{writes++;for(const [k,v] of Object.entries(values)){assert(Buffer.byteLength(JSON.stringify(v))<128000);data.set(k,v);}},transaction:async fn=>fn(store)};
const large={binding:'abc',history:Array.from({length:600},(_,i)=>[i,{label:'test'.repeat(150)}]),frame:{leds:[]}};
await writeBusHistory(store,large);assert.deepEqual(await readBusHistory(store),large);
await writeBusHistory(store,{history:[]});assert.deepEqual(await readBusHistory(store),{history:[]});assert.equal(data.size,2);assert.equal(writes,2);
console.log('Chunked transactional history: large payload, bounded values, restore and shrinking cleanup PASS');

// Exercise the actual DO request boundary, not just the pure reducer. A new
// object per request proves cache/history survives eviction, without live IO.
const fb=read('config/boards/trondheim-flybuss-live.json');
const fh=read('config/hardware/trondheim-flybuss-live-hardware.json');
const fp=read('config/routes/flybuss-trondheim-fb73-live.json');
const persistent=new Map();
const storage={get:async k=>structuredClone(persistent.get(k)),delete:async k=>persistent.delete(k),put:async values=>{for(const [k,v] of Object.entries(values))persistent.set(k,structuredClone(v));},transaction:async fn=>fn(storage)};
const state={storage,blockConcurrencyWhile:fn=>fn()};
const originalFetch=globalThis.fetch;let providerCalls=0;
globalThis.fetch=async()=>{providerCalls++;return new Response(JSON.stringify({data:{q0:{estimatedCalls:[{date:'2026-10-13',realtime:true,actualArrivalTime:new Date(now-1000).toISOString(),expectedDepartureTime:new Date(now+60000).toISOString(),destinationDisplay:{frontText:fb.nodes[0].routeDirections[fp.id].destinationMatches[0]},serviceJourney:{id:'FB73:trip',journeyPattern:{line:{id:fp.line.id,publicCode:'FB73'}}}}]}}}),{headers:{'content-type':'application/json'}});};
try {
 const send=async t=>new DeviceStatus(state).fetch(new Request('https://status.internal/stop-accuracy',{method:'POST',body:JSON.stringify({board:fb,hardware:fh,profiles:[fp],signalPolicy:SIGNAL_POLICY,unifiedBus:true,now:t})})).then(r=>r.json());
 const first=await send(now);assert.equal(first.ledCount,46);assert(first.leds.some(l=>l.state==='AT_STOP'));
 const callsAfterBuild=providerCalls;assert.equal(callsAfterBuild,2);
 assert.deepEqual(await send(now+5000),first);assert.equal(providerCalls,callsAfterBuild,'Cache hit must precede provider IO');
 await send(now+10000);assert.equal(providerCalls,callsAfterBuild*2);
 assert(!persistent.has('stopAccuracyV1'),'Existing Bus1 history must remain untouched');
 console.log('Actual unified DO: FB73 adapter, restart persistence and no provider calls on shared-frame cache hit PASS');
} finally {globalThis.fetch=originalFetch;}

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';

const root=new URL('../',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('config/boards/trondheim-city-lines-catalog.json',root)));
const originalFetch=globalThis.fetch, originalNow=Date.now;
let fleetSize=250,feedLine='11';
let clock=originalNow(), boardLoads=0, upstreamLoads=0, fail=false;
Date.now=()=>clock;
const {default:worker}=await import('../worker/led-feed-worker.mjs');
const stage={configuration:[],upstream:[],motion:[],monitor:[]};
const rawFleet=()=>Array.from({length:fleetSize},(_,i)=>{
  const node=catalog.nodes[i*37%catalog.nodes.length];
  return {vehicleId:`synthetic-${i}`,lastUpdated:new Date(clock-2000).toISOString(),
    destinationName:feedLine==='1'?'Kattem':i%2?'Blakli':'Stavset',line:{publicCode:feedLine},location:{latitude:node.lat,longitude:node.lon}};
});
globalThis.fetch=async(url,options)=>{
  const start=performance.now();
  const path=String(url).split('/main/')[1];
  if(path?.startsWith('config/')) {
    boardLoads++;
    await new Promise(resolve=>setTimeout(resolve,5));
    if(fail)return new Response('',{status:503});
    const result=new Response(await readFile(new URL(path,root)));
    stage.configuration.push(performance.now()-start); return result;
  }
  upstreamLoads++;
  const query=JSON.parse(options.body).query;
  const result=Response.json({data:query.includes('estimatedCalls(')?{}:{vehicles:rawFleet()}});
  stage.upstream.push(performance.now()-start);return result;
};
const env={DEVICE_STATUS:{idFromName:id=>id,get:()=>({fetch:async(url,options)=>{
  const start=performance.now(), body=JSON.parse(options.body);
  const type=url.endsWith('/motion')?'motion':'monitor';
  const result=Response.json(type==='motion'?body.frame:{ok:true});
  stage[type].push(performance.now()-start);return result;
}})}};
const request=()=>new Request('https://test/v1/boards/trondheim-city-lines-catalog/frame');
async function wave(count) {
  globalThis.gc?.();
  const cpu=process.cpuUsage(),heapBefore=process.memoryUsage().heapUsed;
  const times=[];
  await Promise.all(Array.from({length:count},async()=>{
    const start=performance.now(),response=await worker.fetch(request(),env),frame=await response.json();
    assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');
    assert.equal(frame.ledCount,1282);assert.equal(frame.gpsObservations.length,fleetSize);
    assert.equal(frame.gpsMatchingPolicy,'strict-route-quay-v1');assert.equal(frame.ttlSeconds,30);
    assert(frame.leds.length>0);assert(frame.leds.every(led=>led.state==='APPROACHING'));
    times.push(performance.now()-start);
  }));
  times.sort((a,b)=>a-b);
  const used=process.cpuUsage(cpu),heapAfter=process.memoryUsage().heapUsed;
  globalThis.gc?.();
  return {requests:count,p50WallMs:times[Math.floor(count*.5)],p95WallMs:times[Math.floor(count*.95)],
    batchCpuMs:(used.user+used.system)/1000,heapDeltaBytes:heapAfter-heapBefore,
    retainedHeapDeltaBytes:process.memoryUsage().heapUsed-heapBefore};
}
try {
  const cold=await wave(32);
  assert.equal(boardLoads,1,'Concurrent cold frames share configuration load');
  const warm=await wave(32);
  assert.equal(boardLoads,1);
  clock+=8001;fleetSize=1000;const thousand=await wave(8);
  clock+=5*60*1000+1;
  await wave(16);
  assert.equal(boardLoads,2,'TTL refresh shares exactly one new configuration/index');
  clock+=5*60*1000+1;fail=true;
  const errors=await Promise.all(Array.from({length:8},()=>worker.fetch(request(),env)));
  assert(errors.every(response=>response.status===503));
  assert.equal(boardLoads,3,'Failed configuration is also single-flight');
  fail=false;await wave(2);assert.equal(boardLoads,4,'Rejected load must be retryable');
  clock+=8001;feedLine='1';
  const physicalResponse=await worker.fetch(new Request('https://test/v1/boards/trondheim-bus-board/frame'),env);
  const physicalFrame=await physicalResponse.json();assert.equal(physicalResponse.status,200);
  assert.equal(physicalFrame.ledCount,147);assert.equal(physicalFrame.gpsMatchingPolicy,'strict-route-quay-v1');
  assert(physicalFrame.leds.length>0,'Physical Worker must load the complete competition catalog');
  assert(physicalFrame.leds.every(v=>v.state==='APPROACHING'&&v.vehicle.quayId));
  assert.equal(physicalFrame.gpsObservations,undefined,'Do not overflow the physical ESP JSON document with raw fleet data');
  const diagnosticResponse=await worker.fetch(new Request('https://test/api/v1/frame/trondheim-bus-board?gpsDiagnostics=1'),env);
  const diagnosticFrame=await diagnosticResponse.json();assert.equal(diagnosticResponse.status,200);
  assert.equal(diagnosticFrame.gpsObservations.length,fleetSize);
  assert.deepEqual(diagnosticFrame.leds,physicalFrame.leds,'Raw projection cannot change LED placement');
  console.log(JSON.stringify({mockedIO:true,vehiclesPerRequest:{cold:250,warm:250,thousand:1000},cold,warm,thousand,boardLoads,upstreamLoads,
    stages:Object.fromEntries(Object.entries(stage).map(([name,values])=>{
      values.sort((a,b)=>a-b);return [name,{samples:values.length,p95WallMs:values[Math.floor(values.length*.95)]}];
    }))},null,2));
} finally {globalThis.fetch=originalFetch;Date.now=originalNow;}

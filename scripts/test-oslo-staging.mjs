import assert from 'node:assert/strict';
import fs from 'node:fs';
import staging from '../deploy/oslo-staging/entry.mjs';
import {expected,validateConfig} from './oslo-staging-policy.mjs';
import {checkFrame,FRAME_PATH,smoke} from './oslo-staging-smoke.mjs';
import {metroQuayTargets} from '../core/engines/metro-arrival-estimates.mjs';
const board=JSON.parse(fs.readFileSync(new URL('../config/boards/oslo-metro-wizard-separate.json',import.meta.url)));
const index=metroQuayTargets(board).findIndex(q=>q.quayId==='NSR:Quay:6658');
const config=JSON.parse(fs.readFileSync(new URL('../deploy/oslo-staging/wrangler.json',import.meta.url)));
validateConfig(config);
for(const patch of [{name:'transitcore-led-feed'},{routes:['example.test/*']},{durable_objects:{bindings:[]}},{kv_namespaces:[]},{triggers:{crons:['* * * * *']}},{services:[]},{env:{production:{}}}])assert.throws(()=>validateConfig({...expected,...patch}));
const env={OSLO_STAGING_ACCESS_TOKEN:'test-only',OSLO_STAGING_COMMIT_SHA:'a'.repeat(40)};
const get=(path=FRAME_PATH,auth=true)=>staging.fetch(new Request('https://local.test'+path,{headers:auth?{authorization:'Bearer test-only'}:{}}),env);
assert.equal((await get(FRAME_PATH,false)).status,401);
for(const p of ['/api/v1/device/status','/api/v1/ota/test','/v1/publish','/api/v1/frame/trondheim-bus-board',FRAME_PATH+'?provider=evil'])assert.equal((await get(p)).status,404);
const savedFetch=globalThis.fetch,savedNow=Date.now,savedLog=console.log;
let time=Date.parse('2026-10-19T10:00:00Z'),mode='empty',requests=0;
try{
 Date.now=()=>time;console.log=()=>{};
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.entur.io/journey-planner/v3/graphql');requests++;
  const aliases=[...JSON.parse(options.body).query.matchAll(/(q\d+)\s*:\s*quay\(/g)];assert.equal(aliases.length,205);
  const data=Object.fromEntries(aliases.map(([,k])=>[k,{estimatedCalls:[]}]));
  if(mode==='invalid')data.q0=null;
  if(mode==='filtered')data.q0.estimatedCalls=[{realtime:false}];
  if(mode==='active')data['q'+index].estimatedCalls=[{realtime:true,expectedArrivalTime:new Date(time+20000).toISOString(),expectedDepartureTime:new Date(time+30000).toISOString(),destinationDisplay:{frontText:'Østerås'},serviceJourney:{id:'synthetic-metro-test',journeyPattern:{line:{id:'RUT:Line:2',publicCode:'2'}}}}];
  return Response.json({data});
 };
 let response=await get();assert.equal(response.status,200);checkFrame(await response.json(),response.headers.get('x-transitcore-source-outcome'),time);
 mode='invalid';time+=20000;response=await get();assert.equal(response.status,503);assert.equal(response.headers.get('x-transitcore-source-outcome'),'INVALID_SOURCE');
 time+=10000;assert.equal((await get()).status,503);assert.equal(requests,2);
 mode='filtered';time+=10000;response=await get();assert.equal(response.status,200);assert.equal(response.headers.get('x-transitcore-source-outcome'),'FILTERED_EMPTY');checkFrame(await response.json(),'FILTERED_EMPTY',time);
 mode='empty';time+=20000;response=await get();const frame=await response.json();checkFrame(frame,'VALID_EMPTY',time);
 assert.throws(()=>checkFrame({...frame,ledCount:8},'VALID_EMPTY',time));
 assert.throws(()=>checkFrame(frame,'INVALID_SOURCE',time));
 assert.throws(()=>checkFrame({...frame,generatedAt:new Date(time+60000).toISOString()},'VALID_EMPTY',time));
 // Exercise the full HTTP smoke contract without external IO.
 await smoke(env.OSLO_STAGING_COMMIT_SHA,'test-only',{fetchImpl:async(url,options)=>staging.fetch(new Request(url,options),env)});
 mode='active';time+=20000;response=await get();const active=await response.json();assert(active.leds.length>0);checkFrame(active,'ACTIVE',time);
 const falseDeparture=structuredClone(active);falseDeparture.leds[0].state='PASSED';assert.throws(()=>checkFrame(falseDeparture,'ACTIVE',time));
 await smoke(env.OSLO_STAGING_COMMIT_SHA,'test-only',{fetchImpl:async(url,options)=>staging.fetch(new Request(url,options),env)});
}finally{globalThis.fetch=savedFetch;Date.now=savedNow;console.log=savedLog;}
console.log('Oslo staging isolation, source outcomes, cache recovery and smoke PASS');

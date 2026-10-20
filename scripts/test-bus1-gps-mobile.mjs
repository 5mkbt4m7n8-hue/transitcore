import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createGateway,default as closedGateway} from '../deploy/linear-staging/entry.mjs';
import {expectedConfig} from './staging-deploy-guard.mjs';
import {normalizeBoardConfig,validateBoardConfig} from '../core/models/board-config.mjs';
import {readBusHistory} from '../worker/bus-history.mjs';

// Real server/reducer/mapper/storage/gateway/client path with synthetic provider
// data. The injected exact SHA is a test pin, not a claim of deployed new code.
const id='trondheim-bus-1-gps-staging',sha='9701d459d3e9ae8dd90c9356497f359321f7d3e7';
const token='synthetic-private-server-test-token',epoch=Date.parse('2026-10-20T12:00:00Z');
const originalNow=Date.now,originalFetch=globalThis.fetch;let now=epoch,raw=[],sourceSha=sha,alter=null,calls=0,limits=0;
Date.now=()=>now;
try {
 const {default:staging,stagingConfiguration,UnifiedBusStaging}=await import('../deploy/staging/entry.mjs');
 const config=await stagingConfiguration(id),base=JSON.parse(fs.readFileSync(new URL('../config/boards/trondheim-bus-board.json',import.meta.url)));
 const baseHardware=JSON.parse(fs.readFileSync(new URL('../config/hardware/trondheim-bus-board-hardware.json',import.meta.url)));
 assert.equal(config.board.leds.count,147);assert.equal(config.hardware.leds.count,147);
 assert.deepEqual(config.hardware.assignments,baseHardware.assignments);
 assert.deepEqual(config.profiles.map(p=>p.id),['atb-bus-1-live']);
 assert(validateBoardConfig(normalizeBoardConfig(config.board,{hardware:config.hardware,routeProfiles:config.profiles})).valid);
 for(const n of config.board.nodes){const old=base.nodes.find(x=>x.id===n.id);
  for(const k of ['led','lat','lon','stopIds','quayId'])assert.deepEqual(n[k],old[k]);
  assert.deepEqual(n.routes,old.routes.filter(r=>r==='atb-bus-1-live'));
 }
 assert(config.board.nodes.filter(n=>n.routes.length).length>8,'Entire Bus1 mapping, not the eight-LED bench');
 for(const other of ['trondheim-bus-board','trondheim-shared-stops-board','trondheim-city-lines-catalog','trondheim-flybuss-live'])
  assert.notEqual((await stagingConfiguration(other)).board.render?.stopAccuracy,'gps-proximity-v1');
 assert.equal((await stagingConfiguration('trondheim-bus-1-visual-test')).hardware.leds.count,8);
 const node=config.board.nodes.find(n=>n.routeDirections?.['atb-bus-1-live']?.destinationMatches?.includes('Kattem'));
 const physical=config.hardware.assignments.find(a=>a.logicalLed===node.led).physicalLed;
 const map=new Map(),storage={get:async k=>structuredClone(map.get(k)),delete:async k=>map.delete(k),
  put:async data=>{for(const [k,v] of Object.entries(data))map.set(k,structuredClone(v));},transaction:async fn=>fn(storage)};
 const state={storage,blockConcurrencyWhile:fn=>fn()};
 const stageEnv={STAGING_ACCESS_TOKEN:token,STAGING_COMMIT_SHA:sha,BUS_LIFECYCLE_BOARDS:expectedConfig.vars.BUS_LIFECYCLE_BOARDS,
  DEVICE_STATUS:{idFromName:n=>{assert.equal(n,id,'Separate GPS board history, not the existing board/device object');return n;},
   get:()=>({fetch:(url,options)=>new UnifiedBusStaging(state,stageEnv).fetch(new Request(url,options))})}};
 const gateway=createGateway({gpsCandidateSha:sha}),env={STAGING_ACCESS_TOKEN:token,PUBLIC_READ_LIMIT:{limit:async()=>{limits++;return {success:true};}}};
 const endpoint='/api/v1/frame/'+id;
 const req=(suffix='')=>new Request('https://gateway.test'+endpoint+suffix,{headers:{origin:'https://5mkbt4m7n8-hue.github.io'}});
 globalThis.fetch=async(url,options)=>{
  calls++;
  if(String(url).startsWith('https://transitcore-staging.lgb84.workers.dev')){
   assert.equal(options.headers.authorization,'Bearer '+token);
   const r=await staging.fetch(new Request(url,options),stageEnv),headers=new Headers(r.headers);
   headers.set('x-transitcore-source-sha',sourceSha);
   if(alter)return alter(await r.json(),headers,String(url));
   return new Response(r.body,{status:r.status,headers});
  }
  assert.equal(String(url),config.profiles[0].provider.vehicleEndpoint);return Response.json({data:{vehicles:raw}});
 };
 assert.equal((await closedGateway.fetch(req(),env)).status,503,'No unapproved new candidate is exposed by default');assert.equal(calls,0);
 const Frames=createRequire(import.meta.url)('../web/shared/canonical-frame-client.js');
 let tick=0;const client=Frames.create({boardId:id,ledCount:147,origin:'https://gateway.test',clock:()=>now,monotonic:()=>tick,
  fetchImpl:url=>gateway.fetch(new Request(url),env)});
 const sample=(t,m,destination='Kattem')=>{now=epoch+t*1000;tick=t*1000;
  raw=[{vehicleId:'bus1-mobile',lastUpdated:new Date(now).toISOString(),line:{publicCode:'1'},destinationName:destination,
   location:{latitude:node.lat+m/111195,longitude:node.lon}},
   {vehicleId:'wrong-line',lastUpdated:new Date(now).toISOString(),line:{publicCode:'2'},destinationName:destination,
   location:{latitude:node.lat,longitude:node.lon}}];};
 const states=[];
 for(const [t,m,d] of [[0,50,'Kattem'],[10,100,'Kattem'],[20,69,'Kattem via Strindheim-sentrum'],[30,260,'Kattem'],[40,200,'Kattem'],[50,69,'Kattem']]){
  sample(t,m,d);const result=await client.refresh();assert.equal(result.sample.status,'VALID');assert.equal(result.frame.ledCount,147);
  assert(result.frame.leds.every(l=>[l.vehicle,...(l.occupants||[])].filter(Boolean).every(v=>v.line==='1')));
  states.push(result.frame.leds.find(l=>l.id===physical)?.state||'OFF');
 }
 assert.deepEqual(states,['AT_STOP','OFF','OFF','OFF','APPROACHING','AT_STOP']);
 const diagnostic=await client.diagnostics();assert(diagnostic.matchesFrame);assert.equal(diagnostic.mode,'gps-proximity-v1');
 assert.equal(diagnostic.observations[0].physicalLed,physical);assert(diagnostic.observations[0].distanceMeters<70);
 assert(!JSON.stringify(diagnostic).includes(token));assert(!('key' in diagnostic.observations[0]));
 // A different valid SHA, malformed diagnostics and excess body are all rejected.
 sourceSha='a'.repeat(40);assert.equal((await gateway.fetch(req(),env)).status,502);sourceSha=sha;
 for(const mutate of [d=>({...d,tokenHash:'private'}),d=>({...d,mode:'motion-v1'}),
  d=>({...d,observations:[{...d.observations[0],raw:{secret:'private'}}]}),
  d=>({...d,observations:[{...d.observations[0],physicalLed:147}]})]){
  alter=(data,headers)=>Response.json(mutate(data),{headers});const r=await gateway.fetch(req('/diagnostics'),env);
  assert.equal(r.status,502);assert(!(await r.text()).includes('private'));
 }
 alter=(_,headers)=>new Response(new Uint8Array(262145),{headers});assert.equal((await gateway.fetch(req(),env)).status,502);
 alter=(_,headers)=>new Response('bad provider',{status:503,headers});
 let result=await client.refresh();assert.equal(result.sample.status,'LAST_VALID');assert(result.sample.error);
 now+=31000;tick+=31000;result=client.snapshot();assert.equal(result.sample.status,'EXPIRED');assert.equal(result.frame.leds.length,0);
 alter=null;sample(90,50);raw=[];result=await client.refresh();assert.equal(result.sample.status,'VALID');assert.equal(result.frame.leds.length,0);
 assert(limits>0);assert(map.size>0);assert.equal((await readBusHistory(storage)).mode,'gps-proximity-v1');
 console.log('Full Bus1 147: exact existing mapping, isolated configuration/DO, secure gateway and SHA, real GPS reducer, diagnostics, TTL/empty/error behavior and canonical web client PASS');
} finally {Date.now=originalNow;globalThis.fetch=originalFetch;}

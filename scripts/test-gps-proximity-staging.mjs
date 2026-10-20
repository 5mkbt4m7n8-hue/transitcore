import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readBusHistory} from '../worker/bus-history.mjs';
import {validatePixelFrame} from '../core/models/pixel-frame.mjs';
import {expectedConfig,validateTarget,ACCOUNT,TARGET} from './staging-deploy-guard.mjs';

// Actual staging wrapper -> actual DO -> mocked Entur HTTP -> persisted frame.
// No Cloudflare resources, device registry, real credentials or provider IO.
const epoch=Date.parse('2026-10-20T10:00:00Z'),originalNow=Date.now,originalFetch=globalThis.fetch;
let now=epoch,meters=50,destination='Kattem',providerCalls=0,storageCalls=0;
Date.now=()=>now;
try {
 const {default:staging,stagingConfiguration,UnifiedBusStaging}=await import('../deploy/staging/entry.mjs');
 const id='trondheim-bus-1-visual-test',config=await stagingConfiguration(id),node=config.board.nodes[0];
 const configs=await Promise.all(expectedConfig.vars.BUS_LIFECYCLE_BOARDS.split(',').map(stagingConfiguration));
 assert.deepEqual(configs.map(c=>c.hardware.leds.count),[8,147,147,1282,46,147]);
 for(const c of configs)assert.equal(c.board.render?.stopAccuracy==='gps-proximity-v1',[id,'trondheim-bus-1-gps-staging'].includes(c.board.id));
 validateTarget(JSON.parse(fs.readFileSync(new URL('../deploy/staging/wrangler.json',import.meta.url))),
   {sha:'a'.repeat(40),target:TARGET,account:ACCOUNT});
 const persistent=new Map();
 const storage={get:async k=>structuredClone(persistent.get(k)),delete:async k=>persistent.delete(k),
   put:async values=>{for(const [k,v] of Object.entries(values))persistent.set(k,structuredClone(v));},transaction:async fn=>fn(storage)};
 const state={storage,blockConcurrencyWhile:fn=>fn()};
 const token='synthetic-local-test-only';
 const env={STAGING_ACCESS_TOKEN:token,STAGING_COMMIT_SHA:'a'.repeat(40),BUS_LIFECYCLE_BOARDS:expectedConfig.vars.BUS_LIFECYCLE_BOARDS,
   DEVICE_STATUS:{idFromName:name=>{assert.equal(name,id);return name;},get:()=>({fetch:async(url,options)=>{
     storageCalls++;return new UnifiedBusStaging(state,env).fetch(new Request(url,options));
   }})}};
 globalThis.fetch=async(url,options)=>{
   assert.equal(String(url),config.profiles[0].provider.vehicleEndpoint);assert.equal(options.method,'POST');providerCalls++;
   return Response.json({data:{vehicles:[{vehicleId:'staging-bus',line:{publicCode:'1'},destinationName:destination,
     lastUpdated:new Date(now).toISOString(),location:{latitude:node.lat+meters/111195,longitude:node.lon}}]}});
 };
 const request=(suffix='',auth=token,method='GET')=>staging.fetch(new Request('https://isolated.test/api/v1/frame/'+id+suffix,
   {method,headers:auth?{authorization:'Bearer '+auth}:{}}),env);
 for(const auth of [null,'incorrect'])assert.equal((await request('',auth)).status,401);
 assert.equal(storageCalls,0);assert.equal(providerCalls,0);
 const sha=env.STAGING_COMMIT_SHA;
 const frameAt=async(t,m,headsign=destination)=>{
   now=epoch+t*1000;meters=m;destination=headsign;
   const response=await request();assert.equal(response.status,200);
   assert.equal(response.headers.get('x-transitcore-environment'),'isolated-staging');
   assert.equal(response.headers.get('x-transitcore-source-sha'),sha);
   // The immutable wrapper reports the engine family; diagnostics names the policy.
   assert.equal(response.headers.get('x-transitcore-stop-algorithm'),'unified-bus-v1');
   const frame=await response.json();assert(validatePixelFrame(frame,{expectedBoardProfile:id,expectedLedCount:8,now}).valid);
   assert(!('diagnostics' in frame));assert(!('mode' in frame));return frame;
 };
 const frames=[];
 frames.push(await frameAt(0,50));assert.equal(frames[0].leds[0].state,'AT_STOP');
 assert.deepEqual(await frameAt(5,100),frames[0]);assert.equal(providerCalls,1,'Extra clients must not fetch provider data');
 frames.push(await frameAt(10,100));
 frames.push(await frameAt(20,69,'Kattem via Strindheim-sentrum'));
 frames.push(await frameAt(30,260));frames.push(await frameAt(40,200));frames.push(await frameAt(50,69));
 assert.deepEqual(frames.map(f=>f.leds.find(l=>l.id===0)?.state||'OFF'),['AT_STOP','OFF','OFF','OFF','APPROACHING','AT_STOP']);
 assert.equal(providerCalls,6);assert(!persistent.has('stopAccuracyV1'),'motion-v1 rollback history is not overwritten');
 const saved=await readBusHistory(storage);assert.equal(saved.history.length,1);assert.equal(saved.mode,'gps-proximity-v1');
 assert.equal(saved.history[0][1].observedAt,now);
 const readsBefore=providerCalls;now+=5000;
 const response=await request('/diagnostics');assert.equal(response.status,200);
 const report=await response.json();assert.equal(report.mode,'gps-proximity-v1');assert.equal(report.algorithm,'unified-bus-v1');
 assert.equal(report.sequence,frames.at(-1).sequence);assert.equal(report.observations[0].observationAgeMs,5000);
 assert.equal(report.observations[0].physicalLed,0);assert(report.observations[0].distanceMeters<70);
 assert.equal(report.observations[0].stateChangedAt,epoch+50000);assert.equal(providerCalls,readsBefore);
 assert(!JSON.stringify(report).includes(token));assert(!('key' in report.observations[0]));
 for(const path of ['/api/v1/device/status','/api/v1/device/config/test','/api/v1/ota/test','/v1/publish','/status','/api/v1/frame/grakallbanen-prototype-board'])
   assert.equal((await staging.fetch(new Request('https://isolated.test'+path,{headers:{authorization:'Bearer '+token}}),env)).status,404);
 assert.equal((await request('',token,'POST')).status,404);
 console.log('GPS staging: exact isolated config, auth/endpoint isolation, actual DO/provider path, persisted identity, exit/rearm, cached frame and timing diagnostics PASS');
} finally {Date.now=originalNow;globalThis.fetch=originalFetch;}

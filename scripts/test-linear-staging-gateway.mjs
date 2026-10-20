import assert from 'node:assert/strict';
import fs from 'node:fs';
import gateway from '../deploy/linear-staging/entry.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const boardId='trondheim-bus-board',path='/api/v1/frame/'+boardId;
const token='synthetic-staging-test-not-a-credential';
const sha='eb43b06e26e38c558e3beabf033274172b0eecdc';
const headers={'x-transitcore-environment':'isolated-staging','x-transitcore-source-sha':sha};
const frame={schemaVersion:1,boardProfile:boardId,ledCount:147,sequence:1,generatedAt:new Date().toISOString(),ttlSeconds:30,leds:[]};
let calls=0,reply=()=>Response.json(frame,{headers:{...headers,'x-transitcore-stop-algorithm':'unified-bus-v1'}});
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{calls++;assert(String(url).startsWith('https://transitcore-staging.lgb84.workers.dev/api/v1/frame/'));assert.equal(options.headers.authorization,'Bearer '+token);assert.equal(options.redirect,'manual');return reply();};
const env={STAGING_ACCESS_TOKEN:token,PUBLIC_READ_LIMIT:{limit:async()=>({success:true})}};
const request=(suffix=path,options={})=>new Request('https://gateway.test'+suffix,options);
try{
 for(const suffix of ['/api/v1/device/status','/v1/publish','/api/v1/frame/grakallbanen-prototype-board',path+'?url=https://evil.test'])assert.equal((await gateway.fetch(request(suffix),env)).status,404);
 assert.equal((await gateway.fetch(request(path,{method:'POST'}),env)).status,405);
 assert.equal((await gateway.fetch(request(path,{headers:{origin:'https://evil.test'}}),env)).status,403);
 assert.equal((await gateway.fetch(request(path),{})).status,503);
 assert.equal((await gateway.fetch(request(path),{...env,PUBLIC_READ_LIMIT:{limit:async()=>({success:false})}})).status,429);
 assert.equal(calls,0);
 const response=await gateway.fetch(request(),env);assert.equal(response.status,200);assert.deepEqual(await response.json(),frame);assert.equal(response.headers.get('access-control-allow-origin'),'https://5mkbt4m7n8-hue.github.io');assert(![...response.headers.values()].join('').includes(token));
 for(const bad of [()=>new Response(token,{status:401}),()=>new Response(token,{status:302}),()=>Response.json(frame),()=>{throw Error(token);}]){reply=bad;const r=await gateway.fetch(request(),env);assert.equal(r.status,502);assert(!(await r.text()).includes(token));}
 reply=()=>Response.json({...frame,ledCount:8},{headers});assert.equal((await gateway.fetch(request(),env)).status,502);
 reply=()=>Response.json(frame,{headers:{...headers,'x-transitcore-source-sha':'a'.repeat(40)}});assert.equal((await gateway.fetch(request(),env)).status,502);
 let cancelled=false;
 reply=()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(131073));},cancel(){cancelled=true;}}),{headers});
 assert.equal((await gateway.fetch(request(),env)).status,502);assert(cancelled);
 const summary='Public evidence summary; not measured hardware state.';
 const observation={vehicleId:'95',lineId:'ATB:Line:1',logicalLed:0,source:'GPS',observationTime:Date.now(),state:'AT_STOP',confidence:'inferred',uncertain:false,reason:'private upstream details'};
 const diag={boardId,algorithm:'unified-bus-v1',observations:[observation],status:'CURRENT',sequence:1,generatedAt:frame.generatedAt,ageSeconds:0,uncertain:false,reason:'private upstream details',truncated:0};
 reply=()=>Response.json(diag,{headers});
 assert.deepEqual(await (await gateway.fetch(request(path+'/diagnostics'),env)).json(),{...diag,reason:summary,observations:[{...observation,reason:summary}]});
 for(const bad of [{...diag,tokenHash:'private'},{...diag,observations:[{...observation,raw:{secret:'private'}}]},{...diag,observations:[{...observation,logicalLed:147}]},{...diag,observations:[{...observation,vehicleId:{secret:'private'}}]},{...diag,algorithm:'legacy'},{...diag,generatedAt:'bad'}]){
  reply=()=>Response.json(bad,{headers});const r=await gateway.fetch(request(path+'/diagnostics'),env);assert.equal(r.status,502);assert(!(await r.text()).includes('private'));
 }
 for(const [id,count] of [['trondheim-bus-board',147],['trondheim-shared-stops-board',147],['trondheim-city-lines-catalog',1282],['trondheim-flybuss-live',46]]){
  const endpoint='/api/v1/frame/'+id,good={...frame,boardProfile:id,ledCount:count};
  reply=()=>Response.json(good,{headers});assert.deepEqual(await(await gateway.fetch(request(endpoint),env)).json(),good);
  for(const bad of [{...good,ledCount:count+1},{...good,boardProfile:'wrong-board'}]){
   reply=()=>Response.json(bad,{headers});assert.equal((await gateway.fetch(request(endpoint),env)).status,502);
  }
  const diagnostic={...diag,boardId:id,observations:[{...observation,logicalLed:count-1}]};
  reply=()=>Response.json(diagnostic,{headers});assert.equal((await gateway.fetch(request(endpoint+'/diagnostics'),env)).status,200);
  reply=()=>Response.json({...diagnostic,observations:[{...observation,logicalLed:count}]},{headers});assert.equal((await gateway.fetch(request(endpoint+'/diagnostics'),env)).status,502);
  reply=()=>new Response('unavailable',{status:503});assert.equal((await gateway.fetch(request(endpoint),env)).status,502);
 }

// The GPS-only Bus1 route reuses all 147 LED positions and requires the exact approved SHA.
const gps='trondheim-bus-1-gps-staging',gpsPath='/api/v1/frame/'+gps;
const gpsFrame={...frame,boardProfile:gps,ledCount:147};
reply=()=>Response.json(gpsFrame,{headers});
assert.equal((await gateway.fetch(request(gpsPath),env)).status,200);
const gpsObservation={...observation,physicalLed:0,distanceMeters:55,observationAgeMs:2500,stateChangedAt:Date.now()};
const gpsDiagnostics={...diag,boardId:gps,mode:'gps-proximity-v1',observations:[gpsObservation]};
reply=()=>Response.json(gpsDiagnostics,{headers});
const publicGPS=await (await gateway.fetch(request(gpsPath+'/diagnostics'),env)).json();
assert.equal(publicGPS.mode,'gps-proximity-v1');assert.equal(publicGPS.observations[0].physicalLed,0);
assert.equal(publicGPS.observations[0].distanceMeters,55);
reply=()=>Response.json({...gpsDiagnostics,mode:'motion-v1'},{headers});
assert.equal((await gateway.fetch(request(gpsPath+'/diagnostics'),env)).status,502);
reply=()=>Response.json(gpsFrame,{headers:{...headers,'x-transitcore-source-sha':'a'.repeat(40)}});
assert.equal((await gateway.fetch(request(gpsPath),env)).status,502);
 assert.equal((await gateway.fetch(request('/api/v1/frame/trondheim-bus-1-visual-test'),env)).status,404);
}finally{globalThis.fetch=original;}
const config=JSON.parse(read('deploy/linear-staging/wrangler.json'));assert.equal(config.name,'transitcore-linear-staging');for(const key of ['durable_objects','services','triggers','routes','vars'])assert(!(key in config));assert.equal(config.ratelimits[0].simple.limit,60);

console.log('Gateway isolation, all five profiles, pinned SHA, bounded responses and diagnostics PASS');

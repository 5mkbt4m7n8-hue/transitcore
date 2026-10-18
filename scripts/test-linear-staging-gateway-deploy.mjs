import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guard,checkUpdate,requireUnusedName,boundedBody,validateLive,smoke,BOARDS,SHA,ACCOUNT} from './linear-staging-gateway-deploy.mjs';
const config=JSON.parse(readFileSync(new URL('../deploy/linear-staging/wrangler.json',import.meta.url),'utf8'));
const env={GITHUB_REPOSITORY:'5mkbt4m7n8-hue/transitcore',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:'TEST_API_SECRET',STAGING_ACCESS_TOKEN:'TEST_STAGING_SECRET'};
guard(config,env);
const version='12345678-1234-1234-1234-123456789abc';
guard(config,{...env,GATEWAY_DEPLOY_MODE:'update',GATEWAY_EXPECTED_VERSION:version});
for(const patch of [{GATEWAY_DEPLOY_MODE:'other'},{GATEWAY_DEPLOY_MODE:'update'},{GATEWAY_EXPECTED_VERSION:version}])assert.throws(()=>guard(config,{...env,...patch}));
assert.throws(()=>guard({...config,compatibility_flags:[]},env));
const bindings=[{name:'STAGING_ACCESS_TOKEN',type:'secret_text'},{name:'PUBLIC_READ_LIMIT',type:'ratelimit',namespace_id:'110008',simple:{limit:60,period:60}}];
const settings={bindings,compatibility_date:'2026-08-11',compatibility_flags:[]};
const scripts=[{id:'transitcore-linear-staging'}],deployments={deployments:[{versions:[{version_id:version,percentage:100}]}]};
checkUpdate(scripts,settings,deployments,version);
assert.throws(()=>checkUpdate([],settings,deployments,version));
assert.throws(()=>checkUpdate(scripts,{...settings,bindings:[...bindings,{name:'PROD',type:'service'}]},deployments,version));
assert.throws(()=>checkUpdate(scripts,{...settings,bindings:bindings.slice(1)},deployments,version));
assert.throws(()=>checkUpdate(scripts,settings,deployments,'87654321-1234-1234-1234-123456789abc'));
assert.throws(()=>checkUpdate(scripts,settings,{deployments:[{versions:[{version_id:version,percentage:50}]}]},version));
assert.throws(()=>checkUpdate(scripts,{...settings,compatibility_flags:['unexpected']},deployments,version));
for(const patch of [{name:'transitcore-led-feed'},{name:'transitcore-staging'},{account_id:'wrong'},{durable_objects:{}},{routes:['*']},{ratelimits:[]},{triggers:{crons:['* * * * *']}}])assert.throws(()=>guard({...config,...patch},env));
for(const patch of [{GITHUB_REF:'refs/heads/feature'},{GITHUB_EVENT_NAME:'push'},{GITHUB_REPOSITORY:'other/repo'},{CLOUDFLARE_ACCOUNT_ID:'wrong'},{STAGING_ACCESS_TOKEN:''}])assert.throws(()=>guard(config,{...env,...patch}));
requireUnusedName([{id:'transitcore-led-feed'},{id:'transitcore-staging'}]);
assert.throws(()=>requireUnusedName([{id:'transitcore-linear-staging'}]));assert.throws(()=>requireUnusedName({}));
const headers={'x-transitcore-environment':'isolated-staging','x-transitcore-source-sha':SHA,'x-transitcore-stop-algorithm':'unified-bus-v1'};
const frame=(board,count)=>({schemaVersion:1,boardProfile:board,generatedAt:new Date().toISOString(),sequence:1,ttlSeconds:30,ledCount:count,leds:[]});
for(const [board,count] of BOARDS){
 const body=JSON.stringify(frame(board,count));validateLive(new Response(body,{headers}),body,board,count);
 const passed={...frame(board,count),leds:[{id:0,rgb:[0,80,255],brightness:8,state:'PASSED',lifecycle:'PASSED'}]};
 validateLive(new Response(JSON.stringify(passed),{headers}),JSON.stringify(passed),board,count);
 assert.throws(()=>validateLive(new Response(body,{headers:{...headers,'x-transitcore-source-sha':'a'.repeat(40)}}),body,board,count));
 assert.throws(()=>validateLive(new Response(body,{headers}),body,board,count+1));
 const diagnostic=JSON.stringify({boardId:board,algorithm:'unified-bus-v1',status:'CURRENT',observations:[]});
 validateLive(new Response(diagnostic,{headers:{'x-transitcore-environment':'isolated-staging','x-transitcore-source-sha':SHA}}),diagnostic,board,count,true);
 assert.throws(()=>validateLive(new Response(diagnostic,{headers}),diagnostic,'wrong-board',count,true));
}
assert.equal((await boundedBody(new Response('x'.repeat(262144)))).bytes,262144);
await assert.rejects(boundedBody(new Response('x'.repeat(262145))));
const [board,count]=BOARDS[0],path=`/api/v1/frame/${board}`,body=JSON.stringify(frame(board,count));
let tries=0,time=0;const logs=[];
const options={now:()=>time,sleep:async ms=>{time+=ms;},log:text=>logs.push(text)};
await smoke(path,board,count,false,{...options,fetcher:async()=>++tries<3?new Response('TEST_STAGING_SECRET',{status:503}):new Response(body,{headers})});assert.equal(tries,3);
for(const status of [401,503]){tries=0;time=0;await assert.rejects(smoke(path,board,count,false,{...options,fetcher:async()=>{tries++;return new Response('TEST_STAGING_SECRET',{status});}}));assert.equal(tries,8);}
tries=0;time=0;await assert.rejects(smoke(path,board,count,false,{...options,fetcher:async()=>{tries++;time+=15000;throw new Error('TEST_API_SECRET');}}));assert.ok(tries<=8);assert.ok(time<=120000);
for(const response of [()=>new Response('{}',{headers}),()=>new Response(body,{headers:{...headers,'x-transitcore-source-sha':'a'.repeat(40)}}),()=>new Response('x'.repeat(262145),{headers})]){
 tries=0;time=0;await assert.rejects(smoke(path,board,count,false,{...options,fetcher:async()=>{tries++;return response();}}));assert.equal(tries,1);
}
assert.ok(!logs.join('\n').includes('TEST_STAGING_SECRET'));assert.ok(!logs.join('\n').includes('TEST_API_SECRET'));
const workflow=readFileSync(new URL('../.github/workflows/linear-staging-gateway-deploy.yml',import.meta.url),'utf8');
assert.match(workflow,/workflow_dispatch:/);assert.doesNotMatch(workflow,/^  (push|pull_request|schedule|workflow_call):/m);
assert.equal((workflow.match(/github.ref == 'refs\/heads\/main'/g)||[]).length,2);
assert.match(workflow,/name: staging/);assert.match(workflow,/ref: \$\{\{ github.workflow_sha \}\}/);assert.match(workflow,/wrangler@4\.43\.0/);
assert.match(workflow,/secrets.STAGING_CLOUDFLARE_API_TOKEN/);assert.match(workflow,/secrets.STAGING_ACCESS_TOKEN/);
assert.doesNotMatch(workflow,/pull_request_target|secrets: inherit|wrangler deploy|worker\/wrangler/);
assert.match(workflow,/options: \[create, update\]/);assert.match(workflow,/GATEWAY_EXPECTED_VERSION: \$\{\{ inputs.expected_version \}\}/);
const runner=readFileSync(new URL('./linear-staging-gateway-deploy.mjs',import.meta.url),'utf8');
assert.match(runner,/if\(!update\)\{[\s\S]*run\(\['secret','put','STAGING_ACCESS_TOKEN'\]/);
assert.match(runner,/update\?\['deploy','--keep-vars'\]/);
console.log('Gateway deployment guard, four-profile smoke, size limits, retries, fail-closed validation and secret-safe logging PASS');

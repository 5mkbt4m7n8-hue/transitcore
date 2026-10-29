import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const Frames=createRequire(import.meta.url)('../web/shared/canonical-frame-client.js');
const boardId='trondheim-city-lines-catalog';
let now=Date.now(),tick=0;
const frame=(overrides={})=>({schemaVersion:1,boardProfile:boardId,ledCount:1282,sequence:1,generatedAt:new Date(now).toISOString(),ttlSeconds:10,leds:[{id:855,rgb:[0,255,0],brightness:32,state:'AT_STOP',vehicle:{id:'test-bus',line:'1'}}],...overrides});
const create=fetchImpl=>Frames.create({boardId,ledCount:1282,origin:'https://production.test',fetchImpl,clock:()=>now,monotonic:()=>tick,sleep:async()=>{},timeoutMs:15});
// A blocked transport can recover within the same poll; concurrent refreshes coalesce.
let calls=0;const urls=[];
const client=create(async(url,options)=>{calls++;urls.push(url);assert.equal(options.mode,'cors');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert(options.signal);if(calls<3)throw TypeError('Failed to fetch');return Response.json(frame());});
const [a,b]=await Promise.all([client.refresh(),client.refresh()]);
assert.equal(calls,3);assert.equal(a.sample.status,'VALID');assert.deepEqual(a,b);assert.equal(a.transport.attempts,3);assert.equal(a.transport.kind,'ok');
assert(urls.every(url=>url==='https://production.test/api/v1/frame/'+boardId));
// Exhaustion is explicit, bounded, and the next poll can recover.
let offline=true,count=0;const recovery=create(async()=>{count++;if(offline)throw TypeError('Failed to fetch');return Response.json(frame());});
let result=await recovery.refresh();assert.equal(count,3);assert.equal(result.sample.status,'NO_FRAME');assert.equal(result.transport.kind,'network');assert.match(result.sample.error,/Nettverk\/CORS/);
offline=false;result=await recovery.refresh();assert.equal(result.sample.status,'VALID');assert.equal(result.sample.error,null);
offline=true;result=await recovery.refresh();assert.equal(result.sample.status,'LAST_VALID');
now+=10000;tick+=10000;result=recovery.snapshot();assert.equal(result.sample.status,'EXPIRED');assert.deepEqual(result.frame.leds,[]);assert(result.sample.leds.every(l=>l.state==='OFF'));
offline=false;result=await recovery.refresh();assert.equal(result.sample.status,'VALID');
// Wall clock expiry also protects resumed/suspended tabs with an unchanged monotonic clock.
now+=10000;assert.equal(recovery.snapshot().sample.status,'EXPIRED');
// Retry only transient HTTP errors, never a permanent 404 or a malformed/stale frame.
for(const status of [404,429,503]){let attempts=0;const c=create(async()=>{attempts++;return new Response('',{status});});const r=await c.refresh();assert.equal(attempts,status===404?1:3);assert.equal(r.transport.kind,'http');assert.match(r.sample.error,new RegExp('HTTP '+status));}
for(const payload of [frame({generatedAt:new Date(now-20000).toISOString()}),frame({ledCount:147}),frame({leds:[{id:1282,rgb:[1,2,3],brightness:32,state:'AT_STOP'}]})]){let attempts=0;const c=create(async()=>{attempts++;return Response.json(payload);});const r=await c.refresh();assert.equal(attempts,1);assert.equal(r.transport.kind,'rejected-frame');assert.equal(r.sample.status,'NO_FRAME');assert(r.sample.error);assert.equal(r.frame,null);}
// Timeout includes a stalled body, and releases pending so subsequent polling works.
for(const stallBody of [false,true]){let attempts=0,stalled=true;const c=create(async()=>{attempts++;if(!stalled)return Response.json(frame());if(!stallBody)return new Promise(()=>{});return {ok:true,headers:new Headers(),json:()=>new Promise(()=>{})};});const r=await c.refresh();assert.equal(attempts,3);assert.equal(r.transport.kind,'timeout');stalled=false;assert.equal((await c.refresh()).sample.status,'VALID');}
let malformedCalls=0;const malformed=create(async()=>{malformedCalls++;return new Response('{');});assert.equal((await malformed.refresh()).transport.kind,'payload');assert.equal(malformedCalls,1);
console.log('Canonical frame retry, timeout, validation, expiry and recovery tests passed');
let bodyCalls=0;const bodyRecovery=create(async()=>{bodyCalls++;return bodyCalls===1?{ok:true,headers:new Headers(),json:async()=>{throw TypeError('terminated');}}:Response.json(frame());});assert.equal((await bodyRecovery.refresh()).sample.status,'VALID');assert.equal(bodyCalls,2);

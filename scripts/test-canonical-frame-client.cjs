const assert=require('node:assert/strict'),Frames=require('../web/shared/canonical-frame-client.js'),reference=require('./fixtures/esp-visual-rc1-reference.cjs');
(async()=>{
 let now=Date.parse('2026-10-13T12:00:00Z'),ms=0,requests=0;
 const base={schemaVersion:1,boardProfile:'test-board',generatedAt:new Date(now).toISOString(),sequence:1,ttlSeconds:30,ledCount:8,leds:[]};
 const client=Frames.create({boardId:base.boardProfile,ledCount:8,clock:()=>now,monotonic:()=>ms,fetchImpl:async url=>{requests++;assert(url.endsWith('/api/v1/frame/test-board'));return Response.json(base);}});
 await Promise.all([client.refresh(),client.refresh()]);assert.equal(requests,1);
 for(const state of ['APPROACHING','AT_STOP','PASSED','PARKED']){
  const frame={...base,sequence:++base.sequence,leds:[{id:2,rgb:[0,255,0],brightness:state==='PASSED'?8:32,state:['PASSED','PARKED'].includes(state)?'AT_STOP':state,...(['PASSED','PARKED'].includes(state)?{lifecycle:state}:{}),vehicle:{id:'bus-a'}}]};
  assert(client.accept(frame,'unified-bus-v1'));const result=client.snapshot();
  assert.deepEqual(result.frame,frame);assert.equal(result.algorithm,'unified-bus-v1');
  assert.deepEqual(result.sample.leds.map(({changedAt,...l})=>l),reference.decode(frame,ms));
 }
 const before=client.snapshot();assert(!client.accept({...base,ledCount:147}));client.failed('HTTP 503');assert.deepEqual(client.snapshot().frame,before.frame);
 now+=30001;ms+=30001;assert.equal(client.snapshot().frame.leds.length,0);assert.equal(client.snapshot().sample.status,'EXPIRED');
 console.log('Canonical transport: one request, exact wire identity/state, reference parity, invalid retention and expiry PASS');
 for(const count of [8,147]){
  const clients=['Linear','Board','Feed','Map','Diagnostics'].map(()=>Frames.create({boardId:'contract-board',ledCount:count,clock:()=>now,monotonic:()=>ms}));
  for(const [index,state] of ['APPROACHING','AT_STOP','PASSED','PARKED'].entries()){
   const frame={...base,boardProfile:'contract-board',ledCount:count,sequence:index+100,generatedAt:new Date(now).toISOString(),leds:[{id:count-1,rgb:[1,2,3],brightness:32,state:['PASSED','PARKED'].includes(state)?'AT_STOP':state,...(['PASSED','PARKED'].includes(state)?{lifecycle:state}:{}),vehicle:{id:'a'},occupants:[{id:'a',state,rgb:[1,2,3]},{id:'b',state,rgb:[3,2,1]}]}]};
   for(const c of clients){assert(c.accept(frame));assert.deepEqual(c.snapshot().frame,frame);assert.deepEqual(c.snapshot().sample.leds.map(({changedAt,...l})=>l),reference.decode(frame,ms));}
  }
 }
 console.log('8/147-LED shared model contract/reference PASS (does not prove each page integration)');
})().catch(e=>{console.error(e);process.exitCode=1});

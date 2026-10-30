import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DeviceStatus} from '../worker/led-feed-worker.mjs';
const profile=JSON.parse(readFileSync(new URL('../config/routes/atb-bus-11-live.json',import.meta.url)));
const epoch=Date.parse('2026-10-29T12:00:00Z');
const storage=new Map();
const state={storage:{get:async key=>storage.get(key),put:async(key,value)=>storage.set(key,value)},
 blockConcurrencyWhile:async operation=>operation()};
const owner=new DeviceStatus(state);
async function step(index,seconds){
 const at=epoch+seconds*1000,stop=profile.stops[index];
 const v={id:'synthetic-bus',publicCode:'11',latitude:stop.lat,longitude:stop.lon,
  timestamp:new Date(at).toISOString()};
 const response=await owner.fetch(new Request('https://status.internal/route-progress-shadow',{
   method:'POST',body:JSON.stringify({profiles:[profile],vehicles:[v],now:at+1000})
 }));
 assert.equal(response.status,200);
 return (await response.json()).results[0];
}
assert.equal((await step(0,0)).status,'unresolved');
assert.equal((await step(1,20)).status,'unresolved');
const accepted=await step(2,40);
assert.equal(accepted.status,'direction-tracked');
assert.equal(accepted.directionLabel,'mot Stavset');
assert.equal((await step(2,40)).status,'direction-tracked','DO must not reset on repeated provider timestamp');
assert.equal((await step(1,60)).status,'unresolved','Reverse travel drops confidence');
assert(storage.get('routeProgressShadowV1'),'History must be owned by Durable Object storage');
console.log('Central DO GPS A-B-C route shadow persists, idempotent on duplicates and fail-closed on reversal PASS');

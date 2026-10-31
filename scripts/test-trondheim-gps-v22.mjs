import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createVolatileState,evaluateV22,validateV22,recordV22Storage,
 reportV22Storage,v22Storage,observeV22Internal} from '../worker/trondheim-gps-v22.mjs';
const require=createRequire(import.meta.url);
const patterns=JSON.parse(readFileSync(new URL('../config/gps/atb-journey-patterns-1-11.json',import.meta.url),'utf8'));
const line1=patterns.lines['1'].patterns.find(x=>x.quays.length>=5).quays;
const line11=patterns.lines['11'].patterns.find(x=>x.quays.length>=5).quays;
const node=(quayId,led,lat,lon,code)=>({
 quayId,led,lat,lon,stationId:'NSR:StopPlace:'+led,
 stopIds:[quayId],routes:['atb-bus-'+code+'-live']
});
const n1=node(line1[2],1,63.4,10.4,'1');
const n2=node(line1[3],2,63.402,10.4,'1');
const n11=node(line11[2],11,63.44,10.4,'11');
const n12=node(line11[3],12,63.442,10.4,'11');
const focus1=node('NSR:Quay:102720',20,63.405,10.4,'1');
const focus11=node('NSR:Quay:73421',21,63.446,10.4,'11');
const focusTonstad=node('NSR:Quay:102733',22,63.410,10.4,'1');
const board={id:'trondheim-city-lines-catalog',nodes:[
 n1,n2,n11,n12,focus1,focus11,focusTonstad]};
const now=Date.now(),today=new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'
}).format(now);
const t0=Date.parse(today+'T12:00:00Z');
const secret='PRIVATE-VEHICLE-NO-DURABLE-STORAGE';
const mk=(stamp,entries)=>({schemaVersion:1,boardProfile:board.id,
 generatedAt:new Date(stamp).toISOString(),ttlSeconds:30,profileFingerprint:'gps-v22-test-v1',
 ledCount:1282,leds:entries.map(([node,code,id],index)=>({
  id:node.led,state:'APPROACHING',brightness:32,rgb:[100,120,200],
  vehicle:{id:id||secret,line:code,positionType:'gps-nearest-stop',
   ageSeconds:2,latitude:node.lat,longitude:node.lon,
   destination:'PRIVATE-DESTINATION'},
  occupants:[{id:id||secret,line:code,positionType:'gps-nearest-stop'},
   {id:'OTHER-SECONDARY-SECRET-'+index,line:code,positionType:'gps-nearest-stop'}]
 }))});
const frame=mk(t0,[[n1,'1',secret],[n11,'11','LINE11-SECRET']]);
const frameText=JSON.stringify(frame),model=createVolatileState(board);
const result=evaluateV22(frame,board,model,{lane:'catalog'});
assert.equal(JSON.stringify(frame),frameText,'Shadow may not write to active frame');
assert.equal(result.lane,'catalog');
assert.equal(result.lines['1'].gpsPrimary,1);
assert.equal(result.lines['11'].gpsPrimary,1);
assert.equal(result.lines['1'].gpsSecondaryUnlocated,1);
assert.equal(result.lines['11'].v20Compared,1);
assert.equal(result.lines['11'].v21Compared,1);
assert.equal(result.lines['11'].v21Supported,0,'Single GPS observation does not prove movement');
assert(!JSON.stringify(result).includes(secret));
assert(!JSON.stringify(result).includes('latitude'));
assert(!JSON.stringify(result).includes('NSR:Quay:'),
 'Anonymous counters may name overlap categories, but cannot contain Quay IDs');
const safe=validateV22(result);
assert(safe&&safe.scope==='scheduled-v22-shadow');
assert.equal(safe.lines['1'].gpsPrimary,1);
const raw={...result,lines:{...result.lines,'1':{...result.lines['1'],
 vehicleRef:secret,latitude:63.4}}};
assert(!JSON.stringify(validateV22(raw)).includes(secret),
 'Validator must reconstruct a strict anonymous field allow-list');
const t2=t0+120000,fast=mk(t2,[[n2,'1',secret]]);
const fastResult=evaluateV22(fast,board,model,{lane:'line1-fast'});
assert.equal(fastResult.lines['11'],undefined,
 'Fast lane must not fabricate line 11 coverage');
assert.equal(fastResult.lines['1'].gpsPrimary,1);
assert(!JSON.stringify(fastResult).includes(secret));
assert.throws(()=>evaluateV22(fast,board,model,{lane:'line1-fast'}),/duplicate_or_reordered/);
const stored=new Map();
const storage={async get(k){return stored.get(k)},async put(k,v){stored.set(k,structuredClone(v))},
 async delete(k){stored.delete(k)},async list({prefix='',limit=1000,startAfter=''}){return new Map(
  [...stored].filter(([k])=>k.startsWith(prefix)&&k>startAfter)
  .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))}};
const write1=await recordV22Storage(storage,{at:new Date(t0).toISOString(),
 lane:'catalog',metrics:raw},now);
assert.equal(write1.status,'OK');
assert.equal((await recordV22Storage(storage,{at:new Date(t0).toISOString(),
 lane:'catalog',metrics:raw},now)).status,'ALREADY_OK');
await recordV22Storage(storage,{at:new Date(t2).toISOString(),
 lane:'line1-fast',metrics:fastResult},now);
const t5=t0+300000;
await recordV22Storage(storage,{at:new Date(t5).toISOString(),
 lane:'catalog',error:true},now);
let dayReport=await reportV22Storage(storage,{now,day:today});
assert.equal(dayReport.lanes.catalog.samples,1);
assert.equal(dayReport.lanes.catalog.errors,1);
assert.equal(dayReport.lanes['line1-fast'].samples,1);
assert.equal(dayReport.lines['1'].frames,2);
assert.equal(dayReport.lines['11'].frames,1);
assert.equal(dayReport.lines['11'].v21Compared,1);
assert.equal(dayReport.lines['1'].gpsPrimary,2);
assert(!JSON.stringify([...stored]).includes(secret));
assert(!JSON.stringify([...stored]).includes('latitude'));
assert(!JSON.stringify([...stored]).includes(focus1.quayId));
assert(!JSON.stringify(dayReport).includes(secret));
assert(dayReport.limitations.some(x=>x.includes('too sparse')));
assert.equal((await reportV22Storage(storage,{now,day:'1900-01-01'})).error,'day_unavailable');
const response=await v22Storage(storage,new Request('https://internal/gps-v22'));
assert.equal(response.status,200);
assert.equal((await response.json()).lines['11'].frames,1);
const api=await v22Storage(storage,new Request('https://internal/gps-v22',{method:'POST'}));
assert.equal(api.status,405,'Public storage endpoint must be read-only');
const isolated=new Map();
const mem={};
const state={...storage,
 async get(k){return isolated.get(k)},
 async put(k,v){isolated.set(k,structuredClone(v))},
 async delete(k){isolated.delete(k)},
 async list({prefix='',limit=1000,startAfter=''}){return new Map([...isolated].filter(([k])=>k.startsWith(prefix)&&k>startAfter).slice(0,limit))}
};
const request=new Request('https://internal/gps-v22/observe',{
 method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({at:new Date(t0).toISOString(),lane:'catalog',frame,board})
});
const obs=await observeV22Internal(state,request,mem,now);
assert.equal(obs.status,200);
assert.equal((await obs.json()).status,'OK');
assert(!JSON.stringify([...isolated]).includes(secret));
assert(!JSON.stringify([...isolated]).includes('latitude'));
assert(!JSON.stringify([...isolated]).includes('longitude'));
const duplicate=await observeV22Internal(state,request,mem,now);
assert.equal((await duplicate.json()).status,'ALREADY_OK');
assert.equal((await v22Storage(state,new Request('https://internal/gps-v22')).then(r=>r.json())).lines['1'].gpsPrimary,1);
const worker=readFileSync(new URL('../worker/led-feed-worker.mjs',import.meta.url),'utf8');
assert(worker.includes("recordScheduledV22("));
assert(worker.includes("handleV22Public(request,env)"));
assert(worker.includes("runFastLine1Sample(env,controller.scheduledTime)"));
const wrangler=readFileSync(new URL('../worker/wrangler.toml',import.meta.url),'utf8');
assert(wrangler.includes('crons = ["*/5 * * * *", "1-59/5 * * * *", "2-59/5 * * * *"]'));
const html=readFileSync(new URL('../web/linear/gps-v22-quality.html',import.meta.url),'utf8');
assert(html.includes('/v1/trondheim/gps-v22'));
assert(html.includes('Lerkendal')&&html.includes('Tonstadkrysset'));
console.log('V2.2 Cloudflare scheduled GPS proof: same-frame V2.0/V2.1, real source patterns, line 1 fast vs line 11 coverage, duplicate/retry, error slots, anonymous storage and public read-only report PASS');
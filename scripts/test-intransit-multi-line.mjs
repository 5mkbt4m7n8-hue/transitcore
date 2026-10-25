import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const model=require('../web/linear/live/model.js');
const client=require('../web/linear/live/gps.js');
const {selectAtbLinePositions,fetchAtbLineGps,validAtbLineCode}=await import('../worker/atb-line1-gps.mjs');
const {apiV1}=await import('../worker/api/v1.mjs');
assert.deepEqual(model.CODES,['1','2','3']);
for(const code of model.CODES){
 const profile=JSON.parse(file('config/routes/atb-bus-'+code+'-live.json'));
 const source=structuredClone(profile);
 const data=model.normalize(profile,code);
 assert.equal(data.line,code);
 assert.equal(data.stops.length,profile.stops.length);
 assert.equal(data.route.length,profile.shape.length);
 assert(data.route.length>=40);
 assert(data.stops.length>=20);
 assert.equal(data.stops[0].id,profile.stops[0].id);
 assert.deepEqual(profile,source,'Viewing a route must not change source');
 assert.match(model.routeUrl(code),new RegExp('atb-bus-'+code+'-live\\.json$'));
 assert.match(model.gpsUrl(code),new RegExp('atb-line-'+code+'$'));
 assert.throws(()=>model.normalize(profile,code==='1'?'2':'1'),/Ukjent/);
 assert.equal(validAtbLineCode(code),true);
}
assert.equal(model.supports('9'),false);
assert.equal(validAtbLineCode('01'),false);
assert.throws(()=>model.routeUrl('../2'),/Ukjent/);
assert.throws(()=>model.gpsUrl('99'),/Ukjent/);
const now=Date.parse('2026-10-25T16:00:00Z');
const raw=(code,id,delta=5000)=>({
 vehicleId:id,line:{publicCode:code},destinationName:'Retning '+code,
 lastUpdated:new Date(now-delta).toISOString(),
 location:{latitude:63.42,longitude:10.4}
});
const mixed=[raw('1','bus-1'),raw('2','bus-2'),raw('3','bus-3'),
 raw('2','bus-2',1000),raw('2','old',220000),raw('3','outside',1000)];
mixed.at(-1).location.latitude=0;
for(const code of model.CODES){
 const result=selectAtbLinePositions(mixed,code,now);
 assert(result.vehicles.every(v=>v.line===code));
 assert.equal(result.counters.line1,code==='1'?1:code==='2'?3:2);
 assert.deepEqual(result.vehicles.map(v=>v.id),['bus-'+code]);
}
assert.throws(()=>selectAtbLinePositions(mixed,'4',now),/unsupported/);
let attempts=0;
const fetcher=async(url,opts)=>{
 attempts++;
 assert.equal(opts.headers['ET-Client-Name'],'transitcore-live-atb-test');
 assert.match(JSON.parse(opts.body).query,/codespaceId:"ATB"/);
 return {ok:true,json:async()=>({data:{vehicles:mixed}})};
};
for(const code of ['2','3']){
 const response=await fetchAtbLineGps(code,{fetcher,now,clientName:'transitcore-live-atb-test'});
 assert.equal(response.lineId,'ATB:Line:2_'+code);
 assert.equal(response.publicCode,code);
 assert.equal(response.quality.selectedLineFresh,1);
 assert.equal(response.quality.line1Fresh,undefined);
 assert.deepEqual(response.vehicles.map(v=>v.id),['bus-'+code]);
 const parsed=client.parse(response,code,now);
 assert.equal(parsed.vehicles.length,1);
 assert.equal(parsed.vehicles[0].line,code);
 assert.equal(client.parse(response,code,now+99000).vehicles.length,0,'Stale vehicles disappear');
 assert.throws(()=>client.parse(response,'1',now),/uventet/,'Cannot mix line 2 and line 1');
 assert.throws(()=>client.parse(response,code==='2'?'3':'2',now),/feil linje/,'Cannot mix 2 and 3');
 assert.equal(client.parse({...response,vehicles:[{...response.vehicles[0],source:'ETA'}]},code,now).vehicles.length,0);
 assert.equal(client.parse({...response,vehicles:[{...response.vehicles[0],latitude:0}]},code,now).vehicles.length,0);
 assert.throws(()=>client.parse({...response,observationType:'eta'},code,now),/uventet format/);
}
assert.equal(attempts,2);
await assert.rejects(fetchAtbLineGps('4',{fetcher}),/unsupported/);
const saved=globalThis.fetch,origin='https://transitcore-led-feed.lgb84.workers.dev/api/v1/vehicles/';
try{
 globalThis.fetch=async()=>({ok:true,json:async()=>({data:{vehicles:mixed}})});
 for(const code of ['1','2','3']){
  const reply=await apiV1(new Request(origin+'atb-line-'+code),{},{});
  assert.equal(reply.status,200);
  const data=await reply.json();
  assert.equal(data.publicCode,code);
  assert.equal(data.lineId,'ATB:Line:2_'+code);
  assert.equal(reply.headers.get('access-control-allow-origin'),'*');
  assert.equal((await apiV1(new Request(origin+'atb-line-'+code,{method:'POST'}),{},{})).status,405);
 }
 for(const code of ['9','01','999']){
  const bad=await apiV1(new Request(origin+'atb-line-'+code),{},{});
  assert.equal(bad.status,404,'Reject unapproved GPS routes');
 }
}finally{globalThis.fetch=saved;}
console.log('Multi-line AtB: three real route profiles, exact GPS filter, stale/cross-line safety, allowlisted Worker routes PASS');

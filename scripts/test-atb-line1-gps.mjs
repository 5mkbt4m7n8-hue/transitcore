import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const client=require('../web/linear/geo/line1-gps.js');
const {fetchLine1Gps,selectLine1Positions,LINE1_QUERY}=await import('../worker/atb-line1-gps.mjs');
const {apiV1}=await import('../worker/api/v1.mjs');
const now=Date.parse('2026-10-25T15:45:00.000Z');
const vehicle=(id,opts={})=>({
 vehicleId:id,lastUpdated:new Date(now-18000).toISOString(),
 line:{publicCode:'1'},destinationName:'Ranheim',
 location:{latitude:63.4301,longitude:10.405},...opts
});
const sample=[
 vehicle('bus-1'),
 vehicle('bus-1',{lastUpdated:new Date(now-5000).toISOString()}),
 vehicle('bus-2',{line:{publicCode:'2'}}),
 vehicle('bus-3',{lastUpdated:new Date(now-200000).toISOString()}),
 vehicle('bus-4',{location:{latitude:0,longitude:0}}),
 vehicle('bus-5',{location:{latitude:63.41,longitude:null}}),
 vehicle('bus-6',{lastUpdated:new Date(now+20000).toISOString()}),
 vehicle('bus-7',{vehicleId:null}),
 vehicle('bus-8',{location:{latitude:63.42,longitude:10.39}})
];
const snapshot=selectLine1Positions(sample,now);
assert.deepEqual(snapshot.vehicles.map(v=>v.id),['bus-1','bus-8']);
assert.equal(snapshot.counters.line1,8);
assert.equal(snapshot.counters.stale,2);
assert.equal(snapshot.counters.missingPosition,2);
assert.equal(snapshot.counters.invalid,1);
assert.equal(snapshot.vehicles[0].lastUpdated,new Date(now-5000).toISOString());
assert(snapshot.vehicles.every(x=>x.source==='GPS'&&x.line==='1'));
assert.equal(snapshot.vehicles[0].destination,'Ranheim');
assert.throws(()=>selectLine1Positions({vehicles:[]},now),/missing_vehicles_array/);
let calls=0,seenHeader='',seenQuery='';
const fetcher=async(url,args)=>{
 calls++;assert.equal(url,'https://api.entur.io/realtime/v2/vehicles/graphql');
 assert.equal(args.method,'POST');seenHeader=args.headers['ET-Client-Name'];
 seenQuery=JSON.parse(args.body).query;
 return {ok:true,json:async()=>({data:{vehicles:sample}})};
};
const payload=await fetchLine1Gps({fetcher,now,clientName:'transitcore-gps-test'});
assert.equal(calls,1);
assert.equal(seenHeader,'transitcore-gps-test');
assert.equal(seenQuery,LINE1_QUERY);
assert.equal(payload.lineId,'ATB:Line:2_1');
assert.equal(payload.observationType,'measured-vehicle-position');
assert.equal(payload.vehicles.length,2);
assert.equal(payload.quality.totalProviderVehicles,sample.length);
const displayed=client.parse(payload,now);
assert.deepEqual(displayed.vehicles.map(v=>v.id),['bus-1','bus-8']);
assert.equal(displayed.vehicles[0].ageSeconds,5);
assert.equal(client.parse(payload,now+100000).vehicles.length,0,'Old positions disappear, not snapped/extrapolated');
assert.throws(()=>client.parse({...payload,lineId:'ATB:Line:2_2'},now),/uventet/);
assert.throws(()=>client.parse({...payload,observationType:'eta'},now),/uventet/);
assert.equal(client.parse({...payload,vehicles:[{...payload.vehicles[0],source:'ETA'}]},now).vehicles.length,0);
assert.equal(client.parse({...payload,vehicles:[{...payload.vehicles[0],latitude:0}]},now).vehicles.length,0);
assert.equal(client.parse({...payload,vehicles:[{...payload.vehicles[0],lastUpdated:'yesterday'}]},now).vehicles.length,0);
assert.equal((await fetchLine1Gps({fetcher:async()=>({ok:true,json:async()=>({data:{vehicles:[]}})}),now})).vehicles.length,0);
await assert.rejects(fetchLine1Gps({fetcher:async()=>({ok:false,status:429}),now}),/source_http_429/);
await assert.rejects(fetchLine1Gps({fetcher:async()=>({ok:true,json:async()=>({errors:[{message:'oops'}]})}),now}),/source_graphql_error/);
await assert.rejects(fetchLine1Gps({fetcher:async()=>{throw Error('network');},now}),/source_unavailable/);
// Prove endpoint isolation: GET only, CORS, no feed/frame changes and failure is explicit.
const base='https://transitcore-led-feed.lgb84.workers.dev/api/v1/vehicles/atb-line-1';
const originalFetch=globalThis.fetch;
try{
 globalThis.fetch=fetcher;
 const response=await apiV1(new Request(base),{},{});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('access-control-allow-origin'),'*');
 assert.equal(response.headers.get('cache-control'),'no-store');
 const live=await response.json();
 assert.equal(live.lineId,'ATB:Line:2_1');
 assert.equal(live.vehicles.length,0,'Static test fixture observations are stale relative to wall clock; no fake points');
 assert.equal((await apiV1(new Request(base,{method:'POST'}),{},{})).status,405);
 assert.equal((await apiV1(new Request(base,{method:'OPTIONS'}),{},{})).status,204);
 globalThis.fetch=async()=>({ok:false,status:503});
 const bad=await apiV1(new Request(base),{},{});
 assert.equal(bad.status,503);
 assert.equal((await bad.json()).error,'gps_source_invalid');
}finally{globalThis.fetch=originalFetch;}
console.log('AtB line 1 measured GPS: exact line filter, duplicates, freshness, bounded coordinates, Worker API, CORS, failures PASS');

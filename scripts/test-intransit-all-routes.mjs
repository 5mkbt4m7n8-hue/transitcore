import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Catalog=require('../web/linear/live/catalog.js');
const Fleet=require('../web/linear/live/fleet-gps.js');
const {ALL_ATB_CODES,selectAtbFleetPositions,fetchAtbFleetGps}=await import('../worker/atb-fleet-gps.mjs');
const {apiV1}=await import('../worker/api/v1.mjs');
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
assert.equal(Catalog.CODES.length,47);
assert.deepEqual(Catalog.CODES,ALL_ATB_CODES,'Worker coverage and 47 frontend route profiles must match');
let totalPoints=0,totalStops=0;
for(const code of Catalog.CODES){
 const route=read('config/routes/atb-bus-'+code+'-live.json');
 const original=structuredClone(route);
 const view=Catalog.normalize(route,code);
 assert.equal(view.line,code);
 assert(view.route.length>1&&view.stops.length>1);
 assert(view.stops.every(s=>s.id.startsWith('NSR:Quay:')));
 assert.equal(Catalog.supports(code),true);
 assert.equal(Catalog.color(code).length,7);
 assert.match(Catalog.routeUrl(code),new RegExp('atb-bus-'+code+'-live\\.json$'));
 assert.deepEqual(route,original,'Map viewer must not mutate route profiles');
 totalPoints+=view.route.length;totalStops+=view.stops.length;
}
assert(totalPoints>3500&&totalStops>900);
assert.equal(Catalog.supports('FB73'),false,'Flybuss not an AtB source profile');
assert.equal(Catalog.supports('9'),false,'Uncatalogued tram line is separate');
assert.throws(()=>Catalog.normalize(read('config/routes/atb-bus-1-live.json'),'2'),/profil/);
assert.throws(()=>Catalog.routeUrl('../../wrong'),/Linje/);
const now=Date.parse('2026-10-25T20:00:00Z');
const item=(id,code,delta=5000,location={latitude:63.428,longitude:10.411})=>({
 vehicleId:id,line:{publicCode:code},location,
 lastUpdated:new Date(now-delta).toISOString(),destinationName:'Test '+code
});
const rows=[item('unit-1','1'),item('unit-2','2'),item('unit-2','2',1500),
 item('unit-3','3'),item('unit-70','70',1000,{latitude:63.45,longitude:10.90}),
 item('unit-76','76',1000,{latitude:63.4,longitude:10.07}),
 item('unit-83','83',1000,{latitude:63.25,longitude:10.5}),
 item('unit-91','91',1000,{latitude:63.48,longitude:10.98}),
 item('old','1',180000),item('no-coord','2',5000,{latitude:null,longitude:10.40}),
 item('unknown','99'),item('wrong','1',5000,{latitude:0,longitude:0})
];
const chosen=selectAtbFleetPositions(rows,now);
assert.equal(chosen.vehicles.length,7,'One fresh result per line:vehicle ID');
assert.equal(chosen.quality.freshVehicles,7);
assert.equal(chosen.quality.stale,1);
assert.equal(chosen.quality.withoutCoordinates,2);
assert.equal(chosen.quality.outsideProfile,1);
assert.equal(chosen.vehicles.find(v=>v.id==='unit-2').lastUpdated,new Date(now-1500).toISOString());
assert(chosen.vehicles.some(v=>v.line==='76'&&v.longitude===10.07),'Wider geography included');
assert(chosen.vehicles.every(v=>v.source==='GPS'));
const apiResponse={schemaVersion:1,codespace:'ATB',scope:'catalogued-bus-lines',
 source:'Entur Vehicle Positions v2',observationType:'measured-vehicle-position',
 requestedAt:new Date(now).toISOString(),includedLines:ALL_ATB_CODES,vehicles:chosen.vehicles,
 quality:chosen.quality};
assert.equal(Fleet.parse(apiResponse,Catalog.CODES,now).vehicles.length,7);
assert.deepEqual(Fleet.parse(apiResponse,['1'],now).vehicles.map(v=>v.line),['1']);
assert.deepEqual(Fleet.parse(apiResponse,['2'],now).vehicles.map(v=>v.id),['2:unit-2']);
assert.equal(Fleet.parse(apiResponse,['1'],now+100000).vehicles.length,0,'GPS expires without interpolation');
assert.equal(Fleet.parse(apiResponse,[],now).vehicles.length,0);
assert.throws(()=>Fleet.parse({...apiResponse,observationType:'ETA'},Catalog.CODES,now),/GPS-svaret/);
assert.throws(()=>Fleet.parse({...apiResponse,includedLines:['1']},Catalog.CODES,now),/GPS-svaret/);
assert.throws(()=>Fleet.parse(apiResponse,['99'],now),/Ukjent linjevalg/);
assert.equal(Fleet.parse({...apiResponse,vehicles:[{...chosen.vehicles[0],source:'ETA'}]},Catalog.CODES,now).vehicles.length,0);
assert.equal(Fleet.parse({...apiResponse,vehicles:[{...chosen.vehicles[0],lastUpdated:'not-a-date'}]},Catalog.CODES,now).vehicles.length,0);
assert.throws(()=>selectAtbFleetPositions({},now),/missing_vehicles_array/);
let calls=0;
const fetcher=async(url,options)=>{
 calls++;
 assert.equal(url,'https://api.entur.io/realtime/v2/vehicles/graphql');
 assert.match(JSON.parse(options.body).query,/codespaceId:"ATB"/);
 return {ok:true,json:async()=>({data:{vehicles:rows}})};
};
const actual=await fetchAtbFleetGps({fetcher,now,clientName:'test-fleet'});
assert.equal(calls,1,'Fleet feed is ONE provider call, not 47 requests');
assert.equal(actual.vehicles.length,7);
assert.deepEqual(actual.includedLines,Catalog.CODES);
await assert.rejects(fetchAtbFleetGps({fetcher:async()=>({ok:false,status:429}),now}),/source_http_429/);
await assert.rejects(fetchAtbFleetGps({fetcher:async()=>({ok:true,json:async()=>({errors:[{}]})}),now}),/source_graphql_error/);
const sourceFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>({ok:true,json:async()=>({data:{vehicles:rows}})});
 const base='https://transitcore-led-feed.lgb84.workers.dev/api/v1/vehicles/atb-live-all';
 const response=await apiV1(new Request(base),{},{});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('access-control-allow-origin'),'*');
 const payload=await response.json();
 assert.equal(payload.vehicles.length,0,'Static fixture from the past cannot appear as current live GPS');
 assert.equal(payload.scope,'catalogued-bus-lines');
 assert.equal((await apiV1(new Request(base,{method:'POST'}),{},{})).status,405);
 globalThis.fetch=async()=>({ok:false,status:503});
 assert.equal((await apiV1(new Request(base),{},{})).status,503);
}finally{globalThis.fetch=sourceFetch;}
console.log('All AtB: 47 valid source routes, profile coverage, one-call GPS, fleet TTL and CORS/API separation PASS');

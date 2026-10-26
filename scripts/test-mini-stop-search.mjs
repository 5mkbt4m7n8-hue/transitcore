import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const M=require('../web/mini/model.js');
const {GEOCODER_URL,validQuery,normalizeStops,searchMiniStops}=await import('../worker/mini-stop-search.mjs');
const {apiV1}=await import('../worker/api/v1.mjs');
assert.equal(GEOCODER_URL,'https://api.entur.io/geocoder/v3/autocomplete');
for(const q of ['Prinsens gate','Trondheim S','sø'])assert(validQuery(q));
for(const q of ['','a',' '.repeat(3),'a'.repeat(81),'<script>','hello\nworld',null])assert.equal(validQuery(q),false);
const sample={type:'FeatureCollection',features:[
 {properties:{id:'NSR:StopPlace:41613',layer:'stopPlace',source:'nsr',
  names:{default:'Prinsens gate',display:'Prinsens gate, Trondheim'}}},
 {properties:{id:'NSR:StopPlace:41742',layer:'stopPlace',source:'nsr',
  names:{default:'Trondheim S',display:'Trondheim S, Trondheim'}}},
 {properties:{id:'NSR:StopPlace:41613',layer:'stopPlace',
  names:{default:'Duplikat',display:'Skal fjernes'}}},
 {properties:{id:'NSR:Quay:71181',layer:'stopPlace',names:{default:'Feil stopp-ID'}}},
 {properties:{id:'NSR:StopPlace:111',layer:'address',names:{default:'Ikke et stopp'}}}
]};
assert.deepEqual(normalizeStops(sample),[
 {id:'NSR:StopPlace:41613',name:'Prinsens gate',label:'Prinsens gate, Trondheim'},
 {id:'NSR:StopPlace:41742',name:'Trondheim S',label:'Trondheim S, Trondheim'}
]);
assert.throws(()=>normalizeStops({features:[]}),/invalid_geocoder_response/);
assert.throws(()=>normalizeStops({type:'FeatureCollection',features:new Array(101).fill(null)}),/invalid_geocoder_response/);
let calls=0;
const provider=async(url,opts)=>{
 calls++;
 const u=new URL(url);
 assert.equal(u.origin,'https://api.entur.io');
 assert.equal(u.pathname,'/geocoder/v3/autocomplete');
 assert.equal(u.searchParams.get('q'),'Prinsens gate');
 assert.equal(u.searchParams.get('layers'),'stopPlace');
 assert.equal(u.searchParams.get('sources'),'nsr');
 assert.equal(u.searchParams.get('multimodal'),'all');
 assert.equal(u.searchParams.get('limit'),'12');
 assert.equal(opts.method,'GET');
 assert.equal(opts.headers['ET-Client-Name'],'transitcore-mini-stops');
 return {ok:true,json:async()=>sample};
};
const stops=await searchMiniStops('Prinsens gate',{fetcher:provider});
assert.equal(calls,1);
assert.equal(stops.source,'Entur Geocoder v3');
assert.equal(stops.stops.length,2);
await assert.rejects(searchMiniStops('?',{fetcher:async()=>{throw Error('unavailable');}}),/invalid_query/);
await assert.rejects(searchMiniStops('Prinsens gate',{fetcher:async()=>({ok:false,status:503})}),/geocoder_http_503/);
const originalFetch=globalThis.fetch;
try{
 globalThis.fetch=provider;
 const base='https://transitcore-led-feed.lgb84.workers.dev/api/v1/mini/stop-search';
 assert.equal((await apiV1(new Request(base),{},{})).status,400);
 assert.equal((await apiV1(new Request(base+'?q=a'),{},{})).status,400);
 assert.equal((await apiV1(new Request(base+'?q=Prinsens%20gate',{method:'POST'}),{},{})).status,405);
 const response=await apiV1(new Request(base+'?q=Prinsens%20gate'),{},{});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('access-control-allow-origin'),'*');
 assert.equal((await response.json()).stops.length,2);
}finally{globalThis.fetch=originalFetch;}
const now=Date.parse('2026-10-26T10:00:00Z');
const input=M.demo(now);
const before=JSON.stringify(input);
assert.deepEqual(M.filterChoices(input).lines,['1','2','3','10','12','20','22','75']);
assert(M.filterChoices(input).destinations.includes('Ranheim'));
assert.equal(M.filterBoard(input).departures.length,10);
assert.equal(M.filterBoard(input,{lines:new Set(['1'])}).departures.length,2);
assert.equal(M.filterBoard(input,{lines:['1','2']}).departures.length,4);
assert.deepEqual(M.filterBoard(input,{lines:['1'],destination:'Ranheim'}).departures.map(x=>x.destination),['Ranheim']);
assert.deepEqual(M.filterBoard(input,{lines:new Set()}).departures,[]);
assert.deepEqual(M.filterBoard(input,{lines:['1'],destination:'Lund'}).departures,[]);
assert.equal(JSON.stringify(input),before,'Filter must never mutate fetched real/demo departures');
console.log('InTransit Mini 2.0: Geocoder v3 valid NSR stops and safe API, multi-line/destination filters, exact and zero matches PASS');

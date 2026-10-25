import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const M=require('../web/mini/model.js'),R=require('../web/mini/renderer.js');
const {QUERY,validStopId,normalizeCalls,fetchMiniDepartures}=await import('../worker/mini-departures.mjs');
const {apiV1}=await import('../worker/api/v1.mjs');
assert.equal(M.PROFILES.length,8);
for(const source of M.PROFILES){
 const p=M.profile(source.id),g=M.geometry(p);
 assert.equal(p.width,source.width);assert.equal(p.height,source.height);
 assert(g.rows>=1&&g.rows<=10);
 assert(g.rowHeight>=8);
 assert(p.width*p.height>0);
}
for(const size of [[16,16],[96,48],[64,64],[240,240],[512,256]]){
 const p=M.profile('custom',...size);assert.deepEqual([p.width,p.height],size);
 assert(M.geometry(p).rows>=1);
}
for(const bad of [[15,64],[513,64],[512,320],[64.5,32],[NaN,64],[320,0]]){
 assert.throws(()=>M.profile('custom',...bad),/Egendefinert/);
}
assert.equal(M.validStopId('NSR:StopPlace:41613'),true);
assert.equal(M.validStopId('NSR:Quay:71181'),false);
assert.equal(validStopId('NSR:StopPlace:41613'),true);
assert.equal(validStopId('NSR:StopPlace:0'),false);
assert.equal(M.PRESETS[0].id,'NSR:StopPlace:41613');
assert.match(QUERY,/estimatedCalls/);
assert.match(QUERY,/realtime/);
assert.match(QUERY,/expectedDepartureTime/);
assert.match(QUERY,/serviceJourney/);
assert.match(QUERY,/includeCancelledTrips/);
const now=Date.parse('2026-10-25T20:00:00.000Z');
const example=M.demo(now);
assert.equal(example.source,'DEMO');
assert.equal(example.departures.length,10);
assert.equal(M.normalize(example,now).departures.length,10);
assert.equal(M.labelTime(example.departures[0],now),'2m');
assert.equal(M.labelTime({...example.departures[0],cancelled:true},now),'INNST.');
assert.equal(M.formatClock(example.departures[0].at).length,5);
assert.throws(()=>M.normalize({...example,stopId:'NSR:Quay:123'},now),/Ugyldig/);
const raw={name:'Prinsens gate',estimatedCalls:[
 {realtime:true,cancellation:false,expectedDepartureTime:new Date(now+300000).toISOString(),
  destinationDisplay:{frontText:'Ranheim'},serviceJourney:{line:{publicCode:'1'}}},
 {realtime:false,cancellation:true,aimedDepartureTime:new Date(now+600000).toISOString(),
  destinationDisplay:{frontText:'Lund'},serviceJourney:{line:{publicCode:'2'}}},
 {realtime:false,cancellation:false,expectedDepartureTime:new Date(now-300000).toISOString(),
  destinationDisplay:{frontText:'old'},serviceJourney:{line:{publicCode:'3'}}},
 {realtime:true,expectedDepartureTime:'not-a-date',
  destinationDisplay:{frontText:'invalid'},serviceJourney:{line:{publicCode:'4'}}}
]};
const board=normalizeCalls(raw,'NSR:StopPlace:41613',now);
assert.equal(board.departures.length,2);
assert.equal(board.departures[0].realtime,true);
assert.equal(board.departures[1].cancelled,true);
assert.equal(board.departures[1].realtime,false);
assert.equal(M.normalize(board,now).departures.length,2);
assert.throws(()=>normalizeCalls(null,'NSR:StopPlace:41613',now),/invalid_departures/);
let networkCalls=0;
const fetcher=async(url,options)=>{
 networkCalls++;
 assert.equal(url,'https://api.entur.io/journey-planner/v3/graphql');
 assert.equal(options.method,'POST');
 assert.equal(options.headers['ET-Client-Name'],'transitcore-mini-test');
 const body=JSON.parse(options.body);
 assert.equal(body.variables.stopId,'NSR:StopPlace:41613');
 assert.equal(body.query,QUERY);
 return {ok:true,json:async()=>({data:{stopPlace:raw}})};
};
assert.equal((await fetchMiniDepartures('NSR:StopPlace:41613',{fetcher,now,clientName:'transitcore-mini-test'})).departures.length,2);
assert.equal(networkCalls,1);
await assert.rejects(fetchMiniDepartures('NSR:Quay:71181',{fetcher}),/invalid_stop_id/);
assert.equal(networkCalls,1);
await assert.rejects(fetchMiniDepartures('NSR:StopPlace:41613',{fetcher:async()=>({ok:false,status:429})}),/source_http_429/);
await assert.rejects(fetchMiniDepartures('NSR:StopPlace:41613',{fetcher:async()=>({ok:true,json:async()=>({errors:[{message:'bad'}]})})}),/source_graphql_error/);
const original=globalThis.fetch;
try{
 globalThis.fetch=async()=>({ok:true,json:async()=>({data:{stopPlace:raw}})});
 const base='https://transitcore-led-feed.lgb84.workers.dev/api/v1/mini/departures';
 assert.equal((await apiV1(new Request(base),{},{})).status,400);
 assert.equal((await apiV1(new Request(base+'?stop=NSR%3AQuay%3A71181'),{},{})).status,400);
 assert.equal((await apiV1(new Request(base+'?stop=NSR%3AStopPlace%3A41613',{method:'POST'}),{},{})).status,405);
 const res=await apiV1(new Request(base+'?stop=NSR%3AStopPlace%3A41613'),{},{});
 assert.equal(res.status,200);
 assert.equal(res.headers.get('access-control-allow-origin'),'*');
 const body=await res.json();assert.equal(body.stopId,'NSR:StopPlace:41613');
 assert.equal(body.source,'Entur Journey Planner v3');
}finally{globalThis.fetch=original;}
assert.equal(typeof R.draw,'function');
assert.equal(typeof R.preview,'function');
assert.equal(typeof R.shorten,'function');
console.log('InTransit Mini: 8 profiles, custom resolution, responsive geometry, demo/actual departure separation, Entur GraphQL & Worker endpoint PASS');

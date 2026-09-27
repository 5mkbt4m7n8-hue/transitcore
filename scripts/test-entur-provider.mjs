import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createEnturProvider} from '../core/providers/entur/entur-provider.mjs';
import {normalizeEnturVehicle,toLegacyEnturVehicles} from '../core/providers/entur/entur-normalizer.mjs';
import {validateTransitVehicle} from '../core/models/transit-vehicle.mjs';
import {ProviderError} from '../core/providers/provider-contract.mjs';
import {buildFrame,buildLinearRouteFrame,applyMotionLifecycle} from '../worker/led-feed-worker.mjs';

const time=Date.parse('2026-09-26T12:00:00Z');
const raw={vehicleId:'test-1',lastUpdated:new Date(time-5000).toISOString(),destinationName:'Lian',line:{publicCode:'9'},location:{latitude:63.4,longitude:10.3},extra:{preserved:true}};
const value=normalizeEnturVehicle(raw);
assert.equal(value.provider,'entur');assert.equal(value.observationType,'vehicle-position');
assert.equal(value.timestamp,raw.lastUpdated);assert.equal(value.raw,raw);
assert.equal(value.latitude,63.4);assert.equal(value.publicCode,'9');
assert.equal(value.destination,'Lian');assert.ok(validateTransitVehicle(value).valid);
for(const field of ['mode','lineId','heading','speed','state'])assert.equal(value[field],null);
assert.equal(normalizeEnturVehicle({...raw,mode:'unrecognized'}).mode,null);
assert.equal(normalizeEnturVehicle({...raw,destinationName:undefined}).destination,null);
assert.equal(normalizeEnturVehicle({...raw,location:null}).latitude,null);
assert.equal(normalizeEnturVehicle({...raw,location:{latitude:63}}).longitude,null);
assert.equal(normalizeEnturVehicle({...raw,lastUpdated:'bad'}).timestamp,null);
assert.equal(normalizeEnturVehicle({...raw,lastUpdated:undefined}).timestamp,null);
assert.equal(normalizeEnturVehicle({...raw,vehicleId:undefined}).id,null); // quarantining is NOT silently introduced here
assert.throws(()=>toLegacyEnturVehicles([{...value,observationType:'estimated-call'}]));
assert.deepEqual(toLegacyEnturVehicles([value]),[raw]);

let now=time,calls=0,release;
const responses=[raw,{...raw,lastUpdated:new Date(time-600000).toISOString()}];
const transport=async(endpoint,options)=>{
  calls++;assert.equal(endpoint,'https://source.test');
  assert.deepEqual(JSON.parse(options.body),{query:'{vehicles(codespaceId:"ATB"){vehicleId lastUpdated destinationName line{publicCode} location{latitude longitude}}}'});
  assert.deepEqual(options.headers,{'Content-Type':'application/json','ET-Client-Name':'test'});
  await new Promise(resolve=>{release=resolve;});return {data:{vehicles:responses}};
};
const provider=createEnturProvider({fetchJson:transport,clientName:'test',clock:()=>now});
const context={endpoint:'https://source.test',codespaceId:'ATB'};
const a=provider.loadVehicles(context),b=provider.loadVehicles(context);
assert.equal(calls,1);release();const [av,bv]=await Promise.all([a,b]);assert.equal(av,bv);
assert.equal(av.length,2,'duplicates and stale observations stay available to existing engine');
now+=7999;await provider.loadVehicles(context);assert.equal(calls,1);
now++;const expired=provider.loadVehicles(context);assert.equal(calls,2);release();await expired;
let isolatedCalls=0;
const isolated=createEnturProvider({fetchJson:async()=>{isolatedCalls++;return {data:{vehicles:[]}};},clientName:'test',clock:()=>time});
await isolated.loadVehicles(context);await isolated.loadVehicles(context);assert.equal(isolatedCalls,1,'empty array is cached');
await isolated.loadVehicles({...context,codespaceId:'UNI'});await isolated.loadVehicles({...context,endpoint:'https://other.test'});assert.equal(isolatedCalls,3);
let failures=0;
const failed=createEnturProvider({fetchJson:async()=>{failures++;throw Object.assign(Error('timeout'),{code:'FEED_TIMEOUT'});},clientName:'test'});
for(let i=0;i<2;i++)await assert.rejects(failed.loadVehicles(context),e=>e instanceof ProviderError&&e.code==='FEED_TIMEOUT'&&e.provider==='entur');
assert.equal(failures,2,'failed promises evicted; next request can recover, no hidden retry');
for(const payload of [{errors:[{message:'upstream error'}]}, {data:{}},null]){
 const p=createEnturProvider({fetchJson:async()=>payload,clientName:'test'});
 await assert.rejects(p.loadVehicles(context),ProviderError);
}

// Representative real board/profile/hardware configurations, fixed clock.
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
for(const id of ['grakallbanen-board','grakallbanen-prototype-board','trondheim-bus-board']){
 const board=read('config/boards/'+id+'.json'),hardware=read('config/hardware/'+id+'-hardware.json');
 const profiles=board.routes.map(r=>read('config/routes/'+r+'.json'));
 const profile=profiles[0],stop=profile.stops[0];
 // Mirror Worker coordinate enrichment for station-network boards.
 if(board.layout!=='linear-route-vled')for(const node of board.nodes){
   if(node.lat!=null)continue;
   const s=profiles.flatMap(p=>p.stops).find(s=>(node.stopIds||[]).includes(s.id));
   if(s){node.lat=s.lat;node.lon=s.lon;}
 }
 const vehicle={...raw,destinationName:profile.directions[0].destinationMatches[0],line:{publicCode:profile.line.publicCode},location:{latitude:stop.lat,longitude:stop.lon}};
 const build=board.layout==='linear-route-vled'?buildLinearRouteFrame:buildFrame;
 const fresh=build({board,profiles,hardware,vehicles:[vehicle],now:time});
 assert.ok(fresh.leds.length>0,`${id}: regression must contain active LEDs`);
 for(const input of [[vehicle],[vehicle,{...vehicle,lastUpdated:new Date(time-10000).toISOString()}],[{...vehicle,lastUpdated:new Date(time-600000).toISOString()}],[{...vehicle,destinationName:undefined}],[{...vehicle,location:{}}],[]]){
   const before=build({board,profiles,hardware,vehicles:input,now:time});
   const p=createEnturProvider({fetchJson:async()=>({data:{vehicles:input}}),clientName:'test'});
   const after=build({board,profiles,hardware,vehicles:toLegacyEnturVehicles(await p.loadVehicles(context)),now:time});
   assert.equal(JSON.stringify(after),JSON.stringify(before),id+' serialized frame equality');
   assert.deepEqual(applyMotionLifecycle(after,{},time),applyMotionLifecycle(before,{},time));
 }
 console.log('Provider frame equivalence:',id);
}
console.log('Entur normalization, cache/concurrency/error semantics and frame regression passed');

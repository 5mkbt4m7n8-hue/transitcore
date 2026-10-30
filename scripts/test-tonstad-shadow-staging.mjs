import assert from 'node:assert/strict';
import {patternInventory} from '../core/engines/entur-trip-pattern-link.mjs';
import {runTonstadStagingProbe} from '../worker/tonstad-shadow-probe.mjs';
import worker,{TonstadStagingGate} from '../worker/tonstad-shadow-staging-worker.mjs';

const ref='ATB:Vehicle:TEST-STAGING';
const sjId='ATB:ServiceJourney:TEST-STAGING';
const now=Date.parse('2026-10-30T14:13:37Z');
const timestamp=new Date(now-2000).toISOString();
const recorded=new Date(now-1000).toISOString();
const patterns=patternInventory().get('1').patterns;
const north=patterns.find(p=>p.directionType==='inbound'&&p.quays.length===32);
const south=patterns.find(p=>p.directionType==='outbound'&&p.quays.length===32);
assert(north&&south);
const siriAtStop=(quay='NSR:Quay:102733',atStop=true)=>[
 '<?xml version="1.0"?><Siri><ServiceDelivery><VehicleMonitoringDelivery>',
 '<VehicleActivity><RecordedAtTime>',recorded,'</RecordedAtTime>',
 '<MonitoredVehicleJourney><LineRef>ATB:Line:2_1</LineRef>',
 '<VehicleRef>',ref,'</VehicleRef>',
 '<DatedVehicleJourneyRef>',sjId,'</DatedVehicleJourneyRef>',
 '<MonitoredCall><StopPointRef>',quay,'</StopPointRef>',
 '<VehicleAtStop>',String(atStop),'</VehicleAtStop></MonitoredCall>',
 '</MonitoredVehicleJourney></VehicleActivity>',
 '</VehicleMonitoringDelivery></ServiceDelivery></Siri>'
].join('');
function mock({
 atStop=true,quay='NSR:Quay:102733',gpsId=ref,lat=63.370705,
 destination='Ranheim',pattern=north,siriStatus=200,mcpStatus=200
}={}){
 const calls=[];
 const fetcher=async(url,init)=>{
  calls.push({url:String(url),method:init?.method||'GET'});
  if(String(url).includes('/realtime/v1/rest/vm'))
   return new Response(siriAtStop(quay,atStop),{status:siriStatus});
  if(String(url).includes('/realtime/v2/vehicles/graphql'))
   return new Response(JSON.stringify({data:{vehicles:[{
    vehicleId:gpsId,lastUpdated:timestamp,destinationName:destination,
    line:{publicCode:'1'},location:{latitude:lat,longitude:10.382118}
   }]}}),{status:200,headers:{'content-type':'application/json'}});
  if(String(url).includes('/transit-data/v1beta/mcp'))
   return new Response(JSON.stringify({result:{content:[{type:'text',
    text:JSON.stringify({data:{serviceJourney:{id:sjId,
     line:{id:'ATB:Line:2_1'},journeyPattern:{id:pattern.id,
      directionType:pattern.directionType}}}})}]}}),
    {status:mcpStatus,headers:{'content-type':'application/json'}});
  throw Error('Unexpected external endpoint');
 };
 return {fetcher,calls};
}
const request=()=>new Request('https://example.test/v1/probe',{
 method:'POST',headers:{'x-probe-token':'staging-token-123456789012345678901234567890'}});
const first=mock(),accepted=await runTonstadStagingProbe({fetcher:first.fetcher,now});
assert.equal(accepted.sourceReports,1);
assert.equal(accepted.provenAtStopOccupants,1,'Exact provider report and trip produce one simulated LED');
assert.equal(accepted.simulatedLedOn,true);
assert.equal(accepted.events[0].sourceDirection,'inbound');
assert.equal(accepted.events[0].sourceQuayRole,'intermediate');
assert.equal(accepted.events[0].currentStopGate,'accepted');
assert.equal(accepted.events[0].destination,'Ranheim');
assert.equal(accepted.status,'NO_GO');
assert.equal(accepted.eligibleForProduction,false);
assert.equal(accepted.physicalStopIndependentlyVerified,false);
assert.equal(first.calls.length,3,'One SIRI, one GPS, one ServiceJourney lookup');
const log=JSON.stringify(accepted);
for(const hidden of [ref,sjId,'latitude','longitude','gpsObservations'])
 assert(!log.includes(hidden),'Public summary must not leak raw IDs/coordinates: '+hidden);
for(const data of [
 {atStop:false},
 {quay:'NSR:Quay:102721'},
 {gpsId:'ATB:Vehicle:WRONG'},
 {lat:63.375705},
 {destination:'Østre Lund'},
 {pattern:south}
]){
 const m=mock(data);
 const r=await runTonstadStagingProbe({fetcher:m.fetcher,now});
 assert.equal(r.simulatedLedOn,false,'Never show AT_STOP on failed source identity/position/direction');
 assert.equal(r.provenAtStopOccupants,0);
}
const ratelimited=mock({siriStatus:429});
const limited=await runTonstadStagingProbe({fetcher:ratelimited.fetcher,now});
assert.equal(limited.reason,'entur-siri-rate-limited');
assert.equal(limited.simulatedLedOn,false);
assert.equal(limited.events.length,0);
assert.equal(ratelimited.calls.length,2,'Never retry a provider HTTP 429');
const mcp=mock({mcpStatus:429});
const failedMcp=await runTonstadStagingProbe({fetcher:mcp.fetcher,now});
assert.equal(failedMcp.reason,'entur-mcp-rate-limited');
assert.equal(failedMcp.simulatedLedOn,false);
assert.equal(mcp.calls.length,3);
const secret='staging-token-123456789012345678901234567890';
const storage={
 data:new Map(),
 async transaction(fn){return fn(this);},
 async get(k){return this.data.get(k);},
 async put(k,v){this.data.set(k,v);}
};
const gate=new TonstadStagingGate({storage},{});
const observation=mock();gate.fetcher=observation.fetcher;
const env={
 STAGING_PROBE_TOKEN:secret,
 TONSTAD_GATE:{idFromName:n=>n,get:()=>({fetch:r=>gate.fetch(r)})}
};
const originalNow=Date.now;Date.now=()=>now;
try{
 const unauthorized=await worker.fetch(new Request('https://x.test/v1/probe',{
  method:'POST',headers:{'x-probe-token':'wrong'}}),env);
 assert.equal(unauthorized.status,403);
 assert.equal(observation.calls.length,0);
 const noEnv=await worker.fetch(request(),{STAGING_PROBE_TOKEN:secret});
 assert.equal(noEnv.status,503);
 const health=await worker.fetch(new Request('https://x.test/health'),env);
 assert.equal(health.status,200);
 assert.equal(observation.calls.length,0);
 const correct=await worker.fetch(request(),env);
 assert.equal(correct.status,200);
 const one=await correct.json();
 assert.equal(one.provenAtStopOccupants,1);
 const count=observation.calls.length;
 const second=await worker.fetch(request(),env);
 assert.equal(second.status,429);
 assert.equal((await second.json()).reason,'cooldown-120s');
 assert.equal(observation.calls.length,count,'Durable cooldown blocks network calls');
 Date.now=()=>now+120001;
 const next=await worker.fetch(request(),env);
 assert.equal(next.status,200);
 assert.equal(observation.calls.length,count+2,
  'Fresh probe fetches SIRI/GPS, but a stale SIRI/GPS pair must skip the ServiceJourney lookup');
 assert.equal((await next.json()).simulatedLedOn,false,
  'A stale source event must NEVER show a simulated LED');
}finally{Date.now=originalNow;}
console.log('Isolated staging Worker: authorized manual only, DO cooldown, one-shot source, one shared LED, negative cases, 429 fail-closed PASS');

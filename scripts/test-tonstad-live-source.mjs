import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patternInventory} from '../core/engines/entur-trip-pattern-link.mjs';
import {createTonstadSourceProbe,addTonstadSourceToFrame,TONSTAD} from '../worker/tonstad-live-source.mjs';
import {evaluateEnturStopEvidence} from '../core/engines/entur-stop-evidence.mjs';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const board=read('config/boards/trondheim-city-lines-catalog.json');
const profile=read('config/routes/atb-bus-1-live.json');
const node=board.nodes.find(n=>n.quayId===TONSTAD);
assert(node&&Number.isInteger(node.led));
assert.equal(board.nodes.filter(n=>n.quayId===TONSTAD).length,1);
const now=Date.parse('2026-10-30T14:13:37Z');
const id='ATB:Vehicle:tonstad-source-test',sjId='ATB:ServiceJourney:tonstad-source-test';
const recorded=new Date(now-1000).toISOString();
const gpsAt=new Date(now-2000).toISOString();
const inventory=patternInventory().get('1').patterns;
const inbound=inventory.find(p=>p.directionType==='inbound'&&p.quays.length===32&&p.quays.includes(TONSTAD));
const outbound=inventory.find(p=>p.directionType==='outbound'&&p.quays.length===32&&p.quays.includes(TONSTAD));
assert(inbound&&outbound);
function xml({stop=TONSTAD,atStop=true,conflict=false}={}){
 const activity=(q)=>'<VehicleActivity><RecordedAtTime>'+recorded+'</RecordedAtTime>'+
  '<MonitoredVehicleJourney><LineRef>ATB:Line:2_1</LineRef><VehicleRef>'+id+'</VehicleRef>'+
  '<DatedVehicleJourneyRef>'+sjId+'</DatedVehicleJourneyRef>'+
  '<MonitoredCall><StopPointRef>'+q+'</StopPointRef><VehicleAtStop>'+atStop+
  '</VehicleAtStop></MonitoredCall></MonitoredVehicleJourney></VehicleActivity>';
 return '<Siri><VehicleMonitoringDelivery>'+activity(stop)+
  (conflict?activity('NSR:Quay:71209'):'')+'</VehicleMonitoringDelivery></Siri>';
}
function fixture({headsign='Ranheim',pattern=inbound,stop=TONSTAD,
 atStop=true,conflict=false,gpsId=id,lat=node.lat,siriStatus=200,mcpStatus=200}={}){
 const calls=[];
 const fetcher=async (url,options)=>{
  calls.push(String(url));
  if(String(url).includes('/realtime/v1/rest/vm'))
   return new Response(xml({stop,atStop,conflict}),{status:siriStatus});
  if(String(url).includes('/transit-data/v1beta/mcp')){
   return new Response(JSON.stringify({result:{content:[{type:'text',
    text:JSON.stringify({data:{serviceJourney:{
     id:sjId,line:{id:profile.line.id},
     journeyPattern:{id:pattern.id,directionType:pattern.directionType}
    }}})}]}}),{status:mcpStatus});
  }
  throw Error('Unexpected source '+url);
 };
 const vehicles=[{id:gpsId,publicCode:'1',destination:headsign,latitude:lat,
  longitude:node.lon,timestamp:gpsAt}];
 return {fetcher,calls,vehicles};
}
async function probe(options={},probeTime=now){
 const f=fixture(options);
 const source=createTonstadSourceProbe({fetcher:f.fetcher,clock:()=>probeTime});
 const result=await source({board,profiles:[profile],vehicles:f.vehicles,now:probeTime});
 return {...f,result};
}
const full=await probe();
assert.equal(full.result.accepted.length,1,'Exact report and source pattern accepted');
assert.equal(full.result.accepted[0].proof.plannedSourceDirection,'inbound');
assert.equal(full.calls.length,2,'One SIRI+one exact ServiceJourney request');
const south=await probe({headsign:'Østre Lund',pattern:outbound});
assert.equal(south.result.accepted.length,1);
assert.equal(south.result.accepted[0].proof.plannedSourceDirection,'outbound');
for(const altered of [
 {stop:'NSR:Quay:71209'}, {atStop:false},{conflict:true},
 {gpsId:'ATB:Vehicle:other'}, {headsign:'Østre Lund'},
 {pattern:outbound},{lat:node.lat+0.005}
]){
 const f=await probe(altered);
 assert.equal(f.result.accepted.length,0,'Ambiguous or incompatible stop can never become AT_STOP');
}
const other=await probe({headsign:'Ranheim',pattern:inbound},now+80000);
assert.equal(other.result.accepted.length,0,'Stale SIRI/GPS report cannot show a stop');
const rate=await probe({siriStatus:429});
assert.equal(rate.result.accepted.length,0);
assert.equal(rate.calls.length,1,'429 produces no retry and no trip lookup');
const near=fixture(),clock={now};
const source=createTonstadSourceProbe({fetcher:near.fetcher,clock:()=>clock.now});
await source({board,profiles:[profile],vehicles:near.vehicles,now:clock.now});
await source({board,profiles:[profile],vehicles:near.vehicles,now:clock.now+1000});
assert.equal(near.calls.length,2,'Cache avoids multiple source hits within 12 seconds');
const emptyFrame={schemaVersion:1,boardProfile:board.id,sequence:1,
 generatedAt:new Date(now).toISOString(),ttlSeconds:30,ledCount:board.leds.count,leds:[]};
const matched=addTonstadSourceToFrame(emptyFrame,full.result,now);
assert.equal(matched.leds.length,1);
assert.equal(matched.leds[0].id,node.led);
assert.equal(matched.leds[0].state,'AT_STOP');
assert.equal(matched.leds[0].vehicle.positionType,'entur-siri-provider-stop');
assert.equal(matched.leds[0].vehicle.providerReportedAtStop,true);
assert.equal(matched.leds[0].occupants[0].quayId,TONSTAD);
assert.equal(matched.leds[0].occupants[0].plannedSourceDirection,'inbound');
assert.equal(matched.tonstadEvidence.accepted,1);
assert.deepEqual(addTonstadSourceToFrame(emptyFrame,{accepted:[]}),emptyFrame,
 'No source leaves ordinary GPS frame intact');
const legacy={...emptyFrame,leds:[
 {id:2,state:'APPROACHING',rgb:[2,2,2],vehicle:{id,line:'1',destination:'Ranheim'},
  occupants:[{id,line:'1',state:'APPROACHING'}]},
 {id:3,state:'APPROACHING',rgb:[3,3,3],vehicle:{id:'LINE11',line:'11',destination:'Heimdal'},
  occupants:[{id:'LINE11',line:'11',state:'APPROACHING'}]}
]};
const enhanced=addTonstadSourceToFrame(legacy,full.result,now);
assert.equal(enhanced.leds.some(v=>v.id===2),false,'Never duplicate one bus across LEDs');
assert.equal(enhanced.leds.some(v=>v.id===3),true,'Other lines unchanged');
assert.equal(enhanced.leds.find(v=>v.id===node.led).state,'AT_STOP');
const rendered=JSON.stringify(enhanced);
assert(!rendered.includes(sjId),'A trip source reference must not leak to the UI');
assert(!JSON.stringify(matched.tonstadEvidence).includes(id),'No IDs in aggregate source status');
console.log('Tonstad live SIRI feed: exact north/south, false/ambiguous/stale blocked, 429 no retry, same LED, legacy GPS preserved PASS');

// Read-only pilot: SIRI DatedVehicleJourneyRef can contain an exact
// ATB:ServiceJourney ID. Verify it *as that type*, never by rewriting prefixes.
// The resulting route pattern does NOT establish a dated operating trip, GPS
// identity, provider-reported stop, or eligibility for a physical LED.
// No raw VehicleRef, trip ID, coordinates or SIRI XML are printed.
import {parsePilotSiriJourneyRefs} from '../core/providers/entur/siri-vm-journey-parser.mjs';
import {patternInventory} from '../core/engines/entur-trip-pattern-link.mjs';

const base='https://api.entur.io/transit-data/v1beta/mcp';
const client='transitcore-journey-ref-audit';
const headers={'ET-Client-Name':client};
const patterns=patternInventory();
async function call(name,args,id){
 const response=await fetch(base,{method:'POST',headers:{...headers,
  'Content-Type':'application/json','Accept':'application/json, text/event-stream'},
  body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}}),
  signal:AbortSignal.timeout(16000)});
 if(response.status===429)throw Error('Transit Data rate limited; stop, no retry');
 if(!response.ok)throw Error('Transit Data HTTP '+response.status+'; stop, no retry');
 const body=await response.json();
 if(body.error||body.result?.isError)throw Error('Transit Data '+name+' rejected query; no retry');
 return JSON.parse(body.result?.content?.find(c=>c.type==='text')?.text||'{}').data;
}

const response=await fetch('https://api.entur.io/realtime/v1/rest/vm?datasetId=ATB&maxSize=1500',{
 headers:{...headers,Accept:'application/xml'},signal:AbortSignal.timeout(18000)});
if(response.status===429)throw Error('SIRI VM rate limited; stop, no retry');
if(!response.ok)throw Error('SIRI VM HTTP '+response.status+'; stop, no retry');
const xml=await response.text();
const moreData=/MoreData\s*=\s*["']true["']/i.test(xml);
const refs=parsePilotSiriJourneyRefs(xml);
const totalActivities=(xml.match(/<(?:[\w.-]+:)?VehicleActivity(?:\s[^>]*)?>/gi)||[]).length;
const byLine={'1':new Map(),'11':new Map()};
const unusual={'1':0,'11':0};
const recent={'1':0,'11':0};
const sampledAt=Date.now();
for(const row of refs){
 const code=row.lineRef==='ATB:Line:2_1'?'1':row.lineRef==='ATB:Line:2_11'?'11':null;
 if(!code)continue;
 const age=sampledAt-Date.parse(row.recordedAt);
 if(Number.isFinite(age)&&age>=0&&age<=120000)recent[code]++;
 if(!/^ATB:ServiceJourney:[A-Za-z0-9_.+-]+$/.test(row.datedVehicleJourneyRef)){
  unusual[code]++; continue;
 }
 const found=byLine[code];
 if(!found.has(row.datedVehicleJourneyRef))found.set(row.datedVehicleJourneyRef,{
  recent:Number.isFinite(age)&&age>=0&&age<=120000
 });
 else if(Number.isFinite(age)&&age>=0&&age<=120000)found.get(row.datedVehicleJourneyRef).recent=true;
}
console.log('SIRI_REFERENCE_SAMPLE '+JSON.stringify({
 datasetId:'ATB',activities:totalActivities,parsedPilotObservations:refs.length,
 moreData,byLine:Object.fromEntries(['1','11'].map(code=>[code,{
  distinctServiceJourneyRefs:byLine[code].size,unrecognizedReferenceObservations:unusual[code],
  observationsRecordedWithin120s:recent[code]}]))
}));
let requestId=10;
for(const code of ['1','11']){
 const sampled=[...byLine[code].entries()].sort((a,b)=>Number(b[1].recent)-Number(a[1].recent)).slice(0,3);
 const stats={line:code,sampled:sampled.length,exactServiceJourneyMatches:0,
   routePatternsVerified:0,sourceQuaySequencesVerified:0,freshReferenceMatches:0,
   unresolved:{},operatingDayVerified:false,gpsVehicleJoinVerified:false,physicalStopVerified:false};
 const reject=reason=>stats.unresolved[reason]=(stats.unresolved[reason]||0)+1;
 for(const [id,metadata] of sampled){
  const data=await call('serviceJourney',{id,
   fields:'id line{id} journeyPattern{id directionType}'},requestId++);
  const service=data?.serviceJourney;
  if(!service||service.id!==id){reject('service-journey-id-not-exact');continue;}
  stats.exactServiceJourneyMatches++;
  if(service.line?.id!==patterns.get(code)?.lineId){reject('line-not-exact');continue;}
  const p=patterns.get(code).patterns.find(x=>x.id===service.journeyPattern?.id);
  if(!p){reject('pattern-not-in-snapshot');continue;}
  if(service.journeyPattern?.directionType!==p.directionType){reject('pattern-direction-conflict');continue;}
  stats.routePatternsVerified++;
  if(p.quays.length>=2){
   stats.sourceQuaySequencesVerified++;
   if(metadata.recent)stats.freshReferenceMatches++;
  }
 }
 console.log('SERVICE_JOURNEY_PATTERN_PILOT '+JSON.stringify(stats));
}
console.log('PILOT_RELEASE_GATE '+JSON.stringify({
 status:'NO_GO',sourceReferenceType:'ATB:ServiceJourney',
 note:'Exact service-journey and pattern joins are NOT dated-operation verification. No GPS-to-vehicle join, stop evidence, or LED writes. Keep PR as draft.'
}));

// Experimental, best-effort SIRI source enrichment for one catalog Quay.
// On failure the ordinary Trondheim GPS PixelFrame remains unchanged.
import {distance} from '../core/frame/mapping-support.mjs';
import {parseAtbReportedStops} from '../core/providers/entur/siri-vm-stop-parser.mjs';
import {parsePilotSiriJourneyRefs} from '../core/providers/entur/siri-vm-journey-parser.mjs';
import {evaluateEnturStopEvidence} from '../core/engines/entur-stop-evidence.mjs';

export const TONSTAD='NSR:Quay:102733';
const VM='https://api.entur.io/realtime/v1/rest/vm?datasetId=ATB&maxSize=1500';
const MCP='https://api.entur.io/transit-data/v1beta/mcp';
const CLIENT='transitcore-tonstad-live-experiment';
const validId=value=>/^ATB:ServiceJourney:[A-Za-z0-9_.+-]+$/.test(value||'');
const matchesProfile=(p)=>p?.id==='atb-bus-1-live'&&p.line?.id==='ATB:Line:2_1';

export function createTonstadSourceProbe({fetcher=fetch,clock=Date.now}={}){
 let siriCache=null,sourceCooldown=0;
 const journeys=new Map();
 const readVm=async()=>{
  const now=clock();
  if(now<sourceCooldown) return null;
  if(siriCache&&now-siriCache.at<12000) return siriCache.promise;
  const promise=(async()=>{
   const response=await fetcher(VM,{headers:{'ET-Client-Name':CLIENT,Accept:'application/xml'},
    signal:AbortSignal.timeout(1600)});
   if(response.status===429){sourceCooldown=clock()+120000;return null;}
   if(!response.ok) return null;
   if(Number(response.headers?.get?.('content-length')||0)>8000000)return null;
   const xml=await response.text();
   if(xml.length>8000000)return null;
   return {reports:parseAtbReportedStops(xml),refs:parsePilotSiriJourneyRefs(xml)};
  })().catch(()=>null);
  siriCache={at:now,promise};
  return promise;
 };
 const journey=async id=>{
  const cached=journeys.get(id);
  if(cached&&clock()-cached.at<3600000)return cached.value;
  if(clock()<sourceCooldown)return null;
  const response=await fetcher(MCP,{
   method:'POST',headers:{'Content-Type':'application/json',
    Accept:'application/json, text/event-stream','ET-Client-Name':CLIENT},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',
    params:{name:'serviceJourney',arguments:{id,fields:'id line{id} journeyPattern{id directionType}'}}}),
   signal:AbortSignal.timeout(1700)
  });
  if(response.status===429){sourceCooldown=clock()+120000;return null;}
  if(!response.ok)return null;
  const payload=await response.json();
  if(payload.error||payload.result?.isError)return null;
  const text=payload.result?.content?.find(v=>v.type==='text')?.text;
  if(typeof text!=='string'||text.length>50000)return null;
  const value=JSON.parse(text)?.data?.serviceJourney||null;
  if(!value||value.id!==id)return null;
  if(journeys.size>=32)journeys.delete(journeys.keys().next().value);
  journeys.set(id,{at:clock(),value});
  return value;
 };
 return async function inspect({board,profiles,vehicles,now=clock()}={}){
  const empty={accepted:[],status:'no-source-evidence'};
  const node=board?.nodes?.find(n=>n.quayId===TONSTAD);
  const profile=profiles?.find(matchesProfile);
  if(board?.id!=='trondheim-city-lines-catalog'||!node||!profile)return empty;
  const nearby=(vehicles||[]).filter(v=>String(v.publicCode)==='1'&&
    typeof v.latitude==='number'&&typeof v.longitude==='number'&&
    Number.isFinite(Date.parse(v.timestamp))&&now-Date.parse(v.timestamp)<=30000&&
    now-Date.parse(v.timestamp)>=-5000&&
    distance({lat:v.latitude,lon:v.longitude},node)<=115);
  if(!nearby.length)return empty;
  const snapshot=await readVm();
  if(!snapshot)return {...empty,status:'source-unavailable'};
  const allReports=snapshot.reports.filter(r=>r.lineRef===profile.line.id);
  const reports=allReports.filter(r=>r.quayId===TONSTAD);
  if(!reports.length)return empty;
  const candidates=nearby.filter(v=>reports.some(r=>r.vehicleRef===v.id));
  const accepted=[];let sourceLookups=0;
  for(const vehicle of candidates.slice(0,3)){
   const byVehicle=allReports.filter(r=>r.vehicleRef===vehicle.id);
   if(new Set(byVehicle.map(r=>r.quayId)).size!==1)continue;
   const matching=reports.filter(r=>r.vehicleRef===vehicle.id);
   if(matching.length!==1)continue; // don't arbitrarily pick a source event
   const report=matching[0];
   const refs=[...new Set(snapshot.refs.filter(r=>r.vehicleRef===vehicle.id&&
    r.lineRef===report.lineRef&&r.recordedAt===report.recordedAt)
    .map(r=>r.datedVehicleJourneyRef))];
   if(refs.length!==1||!validId(refs[0]))continue;
   if(sourceLookups>=2)break;
   sourceLookups++;
   let serviceJourney;
   try{serviceJourney=await journey(refs[0]);}catch{continue;}
   if(!serviceJourney)continue;
   const siri=snapshot.refs.find(r=>r.vehicleRef===vehicle.id&&
     r.recordedAt===report.recordedAt&&r.datedVehicleJourneyRef===refs[0]);
   const proof=evaluateEnturStopEvidence({report,vehicle,profile,node,now,
     sharedQuayJourney:{siri,serviceJourney}});
   if(proof.accepted===true&&proof.sharedQuaySameLed===true)
     accepted.push({vehicle,profile,node,proof});
  }
  return {accepted,status:accepted.length?'confirmed':'unresolved'};
 };
}

// Only source-confirmed, exact-Quay vehicles may become AT_STOP in the
// *existing* frame. Preserve all other bus/line occupants and LEDs.
export function addTonstadSourceToFrame(frame,evidence,now=Date.now()){
 if(frame?.boardProfile!=='trondheim-city-lines-catalog'||!evidence?.accepted?.length)
  return frame;
 const confirmed=new Set(evidence.accepted.map(e=>e.vehicle.id));
 const base=[];
 for(const original of frame.leds||[]){
  const occupants=original.occupants?.length?original.occupants:
    original.vehicle?[{...original.vehicle,state:original.state,rgb:original.rgb}]:[];
  const remaining=occupants.filter(v=>!(String(v.line)==='1'&&confirmed.has(v.id)));
  if(remaining.length===occupants.length){base.push(original);continue;}
  if(!remaining.length)continue;
  const first=remaining[0];
  base.push({...original,occupants:remaining,vehicle:{...original.vehicle,...first},
    rgb:first.rgb||original.rgb,state:first.state||original.state,
    lifecycle:undefined});
 }
 const entries=new Map(base.map(item=>[item.id,item]));
 for(const {vehicle,profile,node,proof} of evidence.accepted){
  const rawColor=profile.line.color;
  const rgb=Array.isArray(rawColor)?rawColor:
    /^#[a-f\d]{6}$/i.test(rawColor||'')?[0,2,4].map(i=>parseInt(rawColor.slice(i+1+i, i+3+i),16)):[237,83,80];
  const occupant={
   id:vehicle.id,line:'1',destination:vehicle.destination,rgb,
   state:'AT_STOP',quayId:TONSTAD,stopPlaceId:node.stationId,
   positionType:'entur-siri-provider-stop',providerReportedAtStop:true,
   platformConfirmed:true,sharedQuaySameLed:true,
   plannedSourceDirection:proof.plannedSourceDirection,
   ageSeconds:Math.max(0,Math.floor((now-Date.parse(vehicle.timestamp))/1000)),
   distanceMeters:Math.round(distance({lat:vehicle.latitude,lon:vehicle.longitude},node))
  };
  const previous=entries.get(node.led);
  const others=previous?.occupants?.length?previous.occupants:
    previous?.vehicle?[{...previous.vehicle,state:previous.state,rgb:previous.rgb}]:[];
  const occupants=[occupant,...others.filter(x=>x.id!==vehicle.id)];
  entries.set(node.led,{
   ...(previous||{id:node.led,brightness:32}),
   state:'AT_STOP',lifecycle:undefined,rgb,
   vehicle:{...occupant,latitude:vehicle.latitude,longitude:vehicle.longitude},
   occupants
  });
 }
 return {...frame,leds:[...entries.values()].sort((a,b)=>a.id-b.id),
   tonstadEvidence:{quayId:TONSTAD,status:'source-confirmed',
    accepted:evidence.accepted.length}};
}

// Read-only historical evidence for Trondheim bus GPS and LED frames.
// No guessed stop arrivals: proximity is a candidate, not a registered stop.
// Raw vehicle IDs and coordinates are never persisted to audit artifacts.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const DATE='2026-10-27';
export const ROUTES=Object.freeze(["1","2","3","10","11","12","13","14","15","16","18","20","21","22","23","25","28","40","41","42","43","44","45","46","50","51","52","53","54","70","71","72","73","74","75","76","77","78","79","80","81","82","83","85","86","91","92"]);
const known=new Set(ROUTES),maxAge=90_000;
export const osloDate=(date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const isAuditDay=(date)=>osloDate(date)===DATE;
export const shortId=(line,id)=>createHash('sha256').update('tc-trondheim-20261027:'+line+':'+id).digest('hex').slice(0,16);
export function haversine(lat,lon,stopLat,stopLon){
 const rad=Math.PI/180,dlat=(stopLat-lat)*rad,dlon=(stopLon-lon)*rad;
 const a=Math.sin(dlat/2)**2+Math.cos(lat*rad)*Math.cos(stopLat*rad)*Math.sin(dlon/2)**2;
 return 6371000*2*Math.asin(Math.min(1,Math.sqrt(a)));
}
export async function loadCatalog(path='config/boards/trondheim-city-lines-catalog.json'){
 const board=JSON.parse(await readFile(path,'utf8'));
 if(board.id!=='trondheim-city-lines-catalog'||!Array.isArray(board.nodes)||board.nodes.length<1000)
  throw Error('Unexpected 1282-point catalog');
 const byLine=Object.fromEntries(ROUTES.map(n=>[n,[]]));
 for(const node of board.nodes){
  if(!Number.isFinite(node.lat)||!Number.isFinite(node.lon)||!Number.isInteger(node.led))continue;
  for(const [code,list] of Object.entries(byLine)){
   if(node.routes?.includes('atb-bus-'+code+'-live'))
    list.push({id:node.quayId||node.id,name:node.name,lat:node.lat,lon:node.lon,led:node.led});
  }
 }
 if(ROUTES.some(code=>!byLine[code].length))throw Error('Missing profiled route');
 return {byLine,boardId:board.id,ledCount:board.leds.count};
}
function timestamp(s){const value=typeof s==='string'?Date.parse(s):NaN;return Number.isFinite(value)?value:NaN;}
export function summarizeGps(reply,catalog,at=new Date()){
 const now=at.getTime(),vehicles=[],quality={};
 if(reply?.schemaVersion!==1||reply?.scope!=='catalogued-bus-lines'||
    reply.observationType!=='measured-vehicle-position'||reply.source!=='Entur Vehicle Positions v2'||
    !Array.isArray(reply.vehicles)||!Array.isArray(reply.includedLines))
  throw Error('invalid_gps_contract');
 if(ROUTES.some(code=>!reply.includedLines.includes(code)))throw Error('not_all_47_lines');
 for(const v of reply.vehicles){
  if(!known.has(String(v.line))||typeof v.id!=='string'||!v.id||v.id.length>120)continue;
  if(v.source!=='GPS'||v.provider!=='Entur/ATB')continue;
  if(typeof v.latitude!=='number'||typeof v.longitude!=='number'||
    !Number.isFinite(v.latitude)||!Number.isFinite(v.longitude)||
    v.latitude<63||v.latitude>63.75||v.longitude<9.9||v.longitude>11.3)continue;
  const t=timestamp(v.lastUpdated);
  if(!Number.isFinite(t)||now-t>maxAge||now-t< -10000)continue;
  const options=catalog.byLine[String(v.line)]||[];
  let best=null,second=null;
  for(const p of options){
   const dist=haversine(v.latitude,v.longitude,p.lat,p.lon);
   if(best===null||dist<best.distance){
    second=best;best={stopId:p.id,stopName:p.name,led:p.led,distance:dist};
   }else if(second===null||dist<second.distance){
    second={stopId:p.id,stopName:p.name,led:p.led,distance:dist};
   }
  }
  // A geographic candidate ONLY, never evidence of AT_STOP or passenger boarding.
  const nearby=best&&best.distance<=85?{
   stopId:best.stopId,stopName:best.stopName,led:best.led,
   distanceMeters:Math.round(best.distance),
   ambiguous:!!(second&&second.distance<=85&&second.distance-best.distance<=25)
  }:null;
  vehicles.push({line:String(v.line),vehicle:shortId(v.line,v.id),
   observedAt:new Date(t).toISOString(),nearby});
 }
 const byLine={};for(const v of vehicles)byLine[v.line]=(byLine[v.line]||0)+1;
 return {vehicles,byLine,quality:{...reply.quality},fresh:vehicles.length};
}
export function summarizeFrame(frame,expected){
 if(!frame||frame.schemaVersion!==1||frame.boardProfile!==expected||!Array.isArray(frame.leds))
  throw Error('invalid_frame_contract');
 const states={},leds=[];
 for(const v of frame.leds){
  if(v.state==='OFF')continue;
  states[v.state]=(states[v.state]||0)+1;
  // No raw vehicle identities or locations in archive.
  if(Number.isInteger(v.id)&&v.id>=0&&Number.isInteger(v.id)<2000)
   leds.push({led:v.id,state:v.state});
 }
 return {status:'ok',boardProfile:expected,generatedAt:frame.generatedAt,
  sequence:frame.sequence,ttlSeconds:frame.ttlSeconds,ledCount:frame.ledCount,
  active:leds.length,states,leds};
}
export function auditStats(snapshots,catalog){
 const grouped=Object.fromEntries(ROUTES.map(line=>[line,{
  line,routeStopCount:catalog.byLine[line].length,uniqueVehicles:new Set(),
  candidates:new Map(),samples:0}]));
 let gpsGood=0,gpsErrors=0,seenSamples=0;const frameErrors={};
 const seen=new Set();
 for(const s of snapshots){
  seenSamples++;
  if(s.gps?.status==='ok'){gpsGood++;}
  else{gpsErrors++;continue;}
  for(const v of s.gps.vehicles||[]){
   if(!grouped[v.line])continue;
   const k=v.line+':'+v.vehicle+':'+v.observedAt;
   if(seen.has(k))continue;seen.add(k);
   grouped[v.line].uniqueVehicles.add(v.vehicle);
   grouped[v.line].samples++;
   if(v.nearby){
    const stop=v.nearby.stopId;
    const previous=grouped[v.line].candidates.get(stop)||{
     name:v.nearby.stopName,led:v.nearby.led,observations:0,
     vehicles:new Set(),ambiguous:0,frameCompared:0,frameActive:0,frameInactive:0};
    previous.observations++;
    previous.vehicles.add(v.vehicle);
    if(v.nearby.ambiguous)previous.ambiguous++;
    // A valid frame comparison is only an indicator for further inspection:
    // it may reflect another vehicle or a slightly different timestamp.
    const frame=s.frames?.['trondheim-city-lines-catalog'];
    const frameTime=Date.parse(frame?.generatedAt||'');
    const gpsTime=Date.parse(v.observedAt);
    if(!v.nearby.ambiguous&&frame?.status==='ok'&&
       Number.isFinite(frameTime)&&Number.isFinite(gpsTime)&&
       Math.abs(frameTime-gpsTime)<=90000&&Array.isArray(frame.leds)){
      previous.frameCompared++;
      if(frame.leds.some(x=>x.led===v.nearby.led&&x.state!=='OFF'))
       previous.frameActive++;
      else previous.frameInactive++;
    }
    grouped[v.line].candidates.set(stop,previous);
   }
  }
  for(const [board,frame] of Object.entries(s.frames||{})){
   if(frame.status!=='ok')frameErrors[board]=(frameErrors[board]||0)+1;
  }
 }
 const routes=ROUTES.map(code=>{
  const item=grouped[code];
  return {line:code,routeStops:item.routeStopCount,
   uniqueVehicles:item.uniqueVehicles.size,gpsObservations:item.samples,
   nearStopCandidates:item.candidates.size,
   stopCandidates:[...item.candidates.entries()].map(([stopId,s])=>({
    stopId,name:s.name,led:s.led,observations:s.observations,
    vehicles:s.vehicles.size,ambiguous:s.ambiguous,
    frameCompared:s.frameCompared||0,frameActive:s.frameActive||0,
    frameInactive:s.frameInactive||0
   })).sort((a,b)=>a.name.localeCompare(b.name,'nb'))};
 });
 return {auditDate:DATE,snapshots:seenSamples,gpsGood,gpsErrors,
  frameErrors,routes};
}

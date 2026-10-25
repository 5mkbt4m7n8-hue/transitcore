// One read-only Entur Vehicle Positions request for the checked-in 47 AtB bus profiles.
// No ETA inference, extrapolation, path snapping or state mutation.
import {LINE1_QUERY,MAX_GPS_AGE_MS} from './atb-line1-gps.mjs';
export const ALL_ATB_CODES=Object.freeze(["1","2","3","10","11","12","13","14","15","16","18","20","21","22","23","25","28","40","41","42","43","44","45","46","50","51","52","53","54","70","71","72","73","74","75","76","77","78","79","80","81","82","83","85","86","91","92"]);
const allowed=new Set(ALL_ATB_CODES);
const within=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
function timeOf(value){
 if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value))return null;
 const valueMs=Date.parse(value);return Number.isFinite(valueMs)?valueMs:null;
}
export function selectAtbFleetPositions(raw,now=Date.now()){
 if(!Array.isArray(raw))throw Error('missing_vehicles_array');
 const results=new Map(),byLine={},quality={
  totalProviderVehicles:raw.length,eligibleLineObservations:0,
  withoutCoordinates:0,stale:0,invalid:0,outsideProfile:0
 };
 for(const item of raw){
  const code=String(item?.line?.publicCode||'').trim();
  if(!allowed.has(code)){quality.outsideProfile++;continue;}
  quality.eligibleLineObservations++;
  const id=typeof item?.vehicleId==='string'?item.vehicleId.trim():'';
  const lat=item?.location?.latitude,lon=item?.location?.longitude,time=timeOf(item?.lastUpdated);
  if(!id||id.length>120||!time){quality.invalid++;continue;}
  // Wider than the centre-city bounding box: includes profiled routes
  // towards Byneset, Klæbu and Malvik.
  if(!within(lat,63.0,63.75)||!within(lon,9.9,11.3)){quality.withoutCoordinates++;continue;}
  if(now-time>MAX_GPS_AGE_MS||now-time< -10000){quality.stale++;continue;}
  const key=code+':'+id,previous=results.get(key);
  const obs={id,line:code,latitude:lat,longitude:lon,
   destination:typeof item.destinationName==='string'?item.destinationName.trim().slice(0,90):'',
   lastUpdated:new Date(time).toISOString(),source:'GPS',provider:'Entur/ATB'};
  if(!previous||Date.parse(previous.lastUpdated)<time)results.set(key,obs);
 }
 const vehicles=[...results.values()].sort((a,b)=>Number(a.line)-Number(b.line)||a.id.localeCompare(b.id));
 for(const v of vehicles)byLine[v.line]=(byLine[v.line]||0)+1;
 return {vehicles,byLine,quality:{...quality,freshVehicles:vehicles.length}};
}
export async function fetchAtbFleetGps({fetcher=fetch,now=Date.now(),
 clientName='transitcore-all-atb-live'}={}){
 let response;
 try{
  response=await fetcher('https://api.entur.io/realtime/v2/vehicles/graphql',{
   method:'POST',
   headers:{'Content-Type':'application/json','ET-Client-Name':clientName},
   body:JSON.stringify({query:LINE1_QUERY}),signal:AbortSignal.timeout(10000)
  });
 }catch{throw Error('source_unavailable');}
 if(!response.ok)throw Error('source_http_'+response.status);
 let payload;
 try{payload=await response.json();}catch{throw Error('invalid_source_json');}
 if(payload?.errors?.length)throw Error('source_graphql_error');
 const result=selectAtbFleetPositions(payload?.data?.vehicles,now);
 return {schemaVersion:1,codespace:'ATB',scope:'catalogued-bus-lines',
  source:'Entur Vehicle Positions v2',observationType:'measured-vehicle-position',
  requestedAt:new Date(now).toISOString(),freshnessLimitSeconds:MAX_GPS_AGE_MS/1000,
  includedLines:ALL_ATB_CODES,vehicles:result.vehicles,byLine:result.byLine,quality:result.quality};
}

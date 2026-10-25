// Read-only AtB line 1 observations from Entur Vehicle Positions v2.
// This never uses ETA, never interpolates locations, and does not touch LED frames.
export const LINE1_PROVIDER='ATB',LINE1_PUBLIC_CODE='1';
export const LINE1_QUERY='{vehicles(codespaceId:"ATB"){vehicleId lastUpdated destinationName line{publicCode} location{latitude longitude}}}';
export const MAX_GPS_AGE_MS=90000;
const ALLOWED_LINE_CODES=new Set(['1','2','3']);
export const validAtbLineCode=code=>ALLOWED_LINE_CODES.has(code);
const MIN_LAT=63.30,MAX_LAT=63.51,MIN_LON=10.19,MAX_LON=10.62;
const goodNumber=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
function asTime(value){
 if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value))return null;
 const timestamp=Date.parse(value);
 return Number.isFinite(timestamp)?timestamp:null;
}
export function selectAtbLinePositions(raw,publicCode,now=Date.now()){
 if(!validAtbLineCode(publicCode))throw Error('unsupported_atb_line');
 if(!Array.isArray(raw))throw Error('missing_vehicles_array');
 const byId=new Map();
 const counters={reported:raw.length,line1:0,missingPosition:0,stale:0,invalid:0};
 for(const item of raw){
  // ATB scope comes from the server-side query; never infer route from the map.
  if(String(item?.line?.publicCode||'').trim()!==publicCode)continue;
  counters.line1++;
  const id=typeof item?.vehicleId==='string'?item.vehicleId.trim():'';
  const latitude=item?.location?.latitude,longitude=item?.location?.longitude;
  const timestamp=asTime(item?.lastUpdated);
  if(!id||id.length>120||!timestamp){counters.invalid++;continue;}
  if(!goodNumber(latitude,MIN_LAT,MAX_LAT)||!goodNumber(longitude,MIN_LON,MAX_LON)){
   counters.missingPosition++;continue;
  }
  const ageMs=now-timestamp;
  if(ageMs< -10000||ageMs>MAX_GPS_AGE_MS){counters.stale++;continue;}
  const lastUpdated=new Date(timestamp).toISOString();
  const destination=typeof item.destinationName==='string'?item.destinationName.trim().slice(0,90):'';
  const vehicle={id,line:publicCode,latitude,longitude,lastUpdated,destination,source:'GPS',provider:'Entur/ATB'};
  const existing=byId.get(id);
  if(!existing||Date.parse(existing.lastUpdated)<timestamp)byId.set(id,vehicle);
 }
 return {vehicles:[...byId.values()].sort((a,b)=>a.id.localeCompare(b.id)),counters};
}
export const selectLine1Positions=(raw,now=Date.now())=>selectAtbLinePositions(raw,'1',now);
export async function fetchAtbLineGps(publicCode,{fetcher=fetch,now=Date.now(),clientName='transitcore-live-atb'}={}){
 if(!validAtbLineCode(publicCode))throw Error('unsupported_atb_line');
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
 const {vehicles,counters}=selectAtbLinePositions(payload?.data?.vehicles,publicCode,now);
 return {schemaVersion:1,lineId:'ATB:Line:2_'+publicCode,publicCode,
  codespace:'ATB',source:'Entur Vehicle Positions v2',observationType:'measured-vehicle-position',
  requestedAt:new Date(now).toISOString(),freshnessLimitSeconds:MAX_GPS_AGE_MS/1000,
  vehicles,quality:{
   totalProviderVehicles:counters.reported,
   line1Reported:counters.line1,
   line1Fresh:vehicles.length,
   withoutCoordinates:counters.missingPosition,
   stale:counters.stale,
   invalid:counters.invalid
  }};
}

// Preserve the original, already tested line 1 API and endpoint exactly.
export const fetchLine1Gps=(options={})=>
 fetchAtbLineGps('1',{clientName:'transitcore-line1-geo',...options});

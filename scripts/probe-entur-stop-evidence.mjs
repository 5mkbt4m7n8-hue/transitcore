// Read-only, aggregate-only discovery. NEVER log raw feed bodies, vehicle
// IDs, GPS locations, line-specific identities or personal information.
const headers={'ET-Client-Name':'transitcore-stop-evidence-audit','Content-Type':'application/json'};
async function gql(query){
 const response=await fetch('https://api.entur.io/realtime/v2/vehicles/graphql',{
  method:'POST',headers,body:JSON.stringify({query}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('graphql_http_'+response.status);
 const payload=await response.json();
 if(payload.errors?.length)throw Error('graphql_api_error');
 return payload.data;
}
try {
 const schema=await gql('{__type(name:"Vehicle"){name fields{name}}}');
 console.log('VEHICLE_GQL_SCHEMA '+JSON.stringify({type: schema?.__type?.name||null,
  fields:(schema?.__type?.fields||[]).map(v=>v.name),note:'Field names only, not provider coverage.'}));
} catch(e){console.log('VEHICLE_GQL_SCHEMA_ERROR '+String(e.message||'unavailable').slice(0,80));}
let atbIds=new Set();
try {
 const data=await gql('{vehicles(codespaceId:"ATB"){vehicleId lastUpdated destinationName line{publicCode} location{latitude longitude}}}');
 atbIds=new Set((data?.vehicles||[]).map(v=>v.vehicleId).filter(x=>typeof x==='string'));
 console.log('ATB_GRAPHQL_SAMPLE '+JSON.stringify({vehicleCount:atbIds.size}));
}catch(e){console.log('ATB_GRAPHQL_ERROR '+String(e.message||'unavailable').slice(0,80));}
try {
 const r=await fetch('https://api.entur.io/realtime/v1/rest/vm?maxSize=1500',{
  headers:{'ET-Client-Name':'transitcore-stop-evidence-audit','Accept':'application/xml'},
  signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('siri_http_'+r.status);
 const body=await r.text();
 const count=(s,tag)=>(s.match(new RegExp('<(?:[\\w-]+:)?'+tag+'(?:\\s|>)','g'))||[]).length;
 const value=(s,tag)=>{const m=s.match(new RegExp('<(?:[\\w-]+:)?'+tag+'[^>]*>([^<]+)<\\/(?:[\\w-]+:)?'+tag+'>','i'));return m?.[1]?.trim()||null};
 const activities=body.match(/<(?:[\w-]+:)?VehicleActivity(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w-]+:)?VehicleActivity>/gi)||[];
 const atb=activities.filter(s=>/^ATB(?:$|:)/i.test(value(s,'DataSource')||'')||/^ATB:/i.test(value(s,'LineRef')||''));
 const assess=entries=>({
  activities:entries.length,hasCall:entries.filter(s=>count(s,'MonitoredCall')>0).length,
  hasStopId:entries.filter(s=>count(s,'StopPointRef')>0).length,
  hasAtStopTrue:entries.filter(s=>/<(?:[\w-]+:)?VehicleAtStop>\s*true\s*<\/(?:[\w-]+:)?VehicleAtStop>/i.test(s)).length,
  hasAtStopFalse:entries.filter(s=>/<(?:[\w-]+:)?VehicleAtStop>\s*false\s*<\/(?:[\w-]+:)?VehicleAtStop>/i.test(s)).length,
  withJourneyRef:entries.filter(s=>count(s,'DatedVehicleJourneyRef')>0).length,
  withVehicleRef:entries.filter(s=>count(s,'VehicleRef')>0).length,
  exactGraphqlIdMatches:entries.filter(s=>atbIds.has(value(s,'VehicleRef'))).length
 });
 console.log('SIRI_VM_AGGREGATES '+JSON.stringify({
  httpStatus:r.status,mediaType:r.headers.get('content-type')?.split(';')[0]||null,
  total:assess(activities),atb:assess(atb),
  note:'Unfiltered first 1500 SIRI activities. ATB matching via DataSource/LineRef, count only; exact ID join may differ across feeds. VehicleAtStop means provider-reported, not independently sensor-confirmed.'
 }));
} catch(e){console.log('SIRI_VM_ERROR '+String(e.message||'unavailable').slice(0,80));}

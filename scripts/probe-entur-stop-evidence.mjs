// Read-only discovery of Entur AtB stop evidence. Output schema names and
// aggregate counts ONLY; never log IDs, GPS positions, raw bodies or credentials.
const headers={'ET-Client-Name':'transitcore-stop-evidence-audit','Content-Type':'application/json'};
const compact=e=>({kind:e?.kind||null,name:e?.name||null,ofType:e?.ofType?.name||null});
const gql='query StopEvidenceSchema { __schema { queryType { fields { name type { kind name ofType {kind name} } } } types { name kind fields { name type { kind name ofType { kind name } } } } } }';
try {
  const r=await fetch('https://api.entur.io/realtime/v2/vehicles/graphql',{
    method:'POST',headers,body:JSON.stringify({query:gql}),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('graphql_http_'+r.status);
  const data=await r.json();
  if(data.errors?.length)throw Error('graphql_schema_not_accessible');
  const types=data.data?.__schema?.types||[];
  const roots=(data.data?.__schema?.queryType?.fields||[]).filter(f=>f.name==='vehicles');
  const candidates=types.filter(t=>/vehicle|journey|call|stop|location|trip/i.test(t.name||'')&&t.fields?.length);
  console.log('VEHICLE_GQL_SCHEMA '+JSON.stringify({
    vehicleRoot:roots.map(f=>({name:f.name,type:compact(f.type)})),
    types:candidates.map(t=>({name:t.name,fields:t.fields.map(x=>x.name)})).slice(0,30),
    note:'Names only. Schema availability does not mean AtB populates fields.'
  }));
} catch(e){console.log('VEHICLE_GQL_SCHEMA_ERROR '+String(e.message||'unavailable').slice(0,80));}
try {
  const r=await fetch('https://api.entur.io/realtime/v1/rest/vm?maxSize=250',{
    headers:{'ET-Client-Name':'transitcore-stop-evidence-audit','Accept':'application/xml'},
    signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw Error('siri_http_'+r.status);
  const body=await r.text();
  const count=tag=>(body.match(new RegExp('<(?:[\\w-]+:)?'+tag+'(?:\\s|>)','g'))||[]).length;
  const atStopTrue=(body.match(/<(?:[\w-]+:)?VehicleAtStop>\s*true\s*<\/(?:[\w-]+:)?VehicleAtStop>/gi)||[]).length;
  const atStopFalse=(body.match(/<(?:[\w-]+:)?VehicleAtStop>\s*false\s*<\/(?:[\w-]+:)?VehicleAtStop>/gi)||[]).length;
  console.log('SIRI_VM_FIELDS '+JSON.stringify({httpStatus:r.status,mediaType:r.headers.get('content-type')?.split(';')[0]||null,
    vehicleActivity:count('VehicleActivity'),monitoredCall:count('MonitoredCall'),
    stopPointRef:count('StopPointRef'),vehicleAtStopTrue:atStopTrue,vehicleAtStopFalse:atStopFalse,
    vehicleRef:count('VehicleRef'),journeyRef:count('DatedVehicleJourneyRef'),
    note:'Unfiltered sample; does not prove these fields exist for AtB.'
  }));
} catch(e){console.log('SIRI_VM_ERROR '+String(e.message||'unavailable').slice(0,80));}

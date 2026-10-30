// One credential-free, read-only Transit Data introspection. Only schema
// metadata is emitted; never vehicle IDs, locations or raw response bodies.
// Deliberately no retries: respect Entur HTTP 429 and Retry-After.
const endpoint='https://api.entur.io/transit-data/v1beta/graphql';
const types=['Line','JourneyPattern','ServiceJourney','DatedServiceJourney','PointInJourneyPattern','ScheduledStopPoint','StopPointInJourneyPattern','TimetabledPassingTime','Quay','Query'];
const sub='name kind ofType{name kind ofType{name kind}}';
const field='name type{'+sub+'} args{name type{'+sub+'}}';
const selection=types.map((name,i)=>'t'+i+':__type(name:"'+name+'"){name kind fields{'+field+'}}').join(' ');
const query='{'+selection+'}';
const response=await fetch(endpoint,{method:'POST',headers:{
 'Content-Type':'application/json','ET-Client-Name':'transitcore-route-sequence-audit'
},body:JSON.stringify({query}),signal:AbortSignal.timeout(18000)});
if(!response.ok)throw Error('Transit Data HTTP '+response.status+'; no retry');
const json=await response.json();
if(json.errors?.length)throw Error('Transit Data introspection rejected: '+json.errors.map(e=>e.message).join('|').slice(0,400));
const fields=Object.fromEntries(types.map((name,i)=>[name,(json.data?.['t'+i]?.fields||[]).map(f=>({
 name:f.name,type:f.type?.name||f.type?.ofType?.name||f.type?.ofType?.ofType?.name||'unknown',
 args:(f.args||[]).map(a=>a.name+':'+(a.type?.name||a.type?.ofType?.name||'?'))
}))]));
console.log('ENTUR_TRANSIT_DATA_SCHEMA '+JSON.stringify({endpoint,types:fields}));
if(!fields.Query?.some(f=>f.name==='line'))throw Error('Transit Data missing expected line query');

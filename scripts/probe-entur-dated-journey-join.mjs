// Read-only join feasibility: SIRI VM DatedVehicleJourneyRef vs Transit Data
// datedServiceJourney ID, plus a date-filtered service sample. No vehicle IDs,
// coordinates, GPS or source XML leave the process. Never infer a join from
// matching suffixes or time alone.
const mcp='https://api.entur.io/transit-data/v1beta/mcp';
const headers={'ET-Client-Name':'transitcore-journey-ref-audit'};
async function call(name,args,id){
 const r=await fetch(mcp,{method:'POST',headers:{...headers,'Content-Type':'application/json','Accept':'application/json, text/event-stream'},
  body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}}),
  signal:AbortSignal.timeout(16000)});
 if(!r.ok)throw Error('Transit MCP HTTP '+r.status);
 const j=await r.json();
 if(j.error||j.result?.isError)throw Error('Transit MCP invalid '+name);
 return JSON.parse(j.result.content?.find(c=>c.type==='text')?.text||'{}').data;
}
const pick=(s,tag)=>{
 const regex=new RegExp('<(?:[\\w.-]+:)?'+tag+'(?:\\s[^<>]*?)?>([^<>]+)<\\/(?:[\\w.-]+:)?'+tag+'\\s*>','i');
 return s.match(regex)?.[1]?.trim()||null;
};
const observed={'1':new Map(),'11':new Map()};
// Scope the bounded sample to AtB, not the first 1500 vehicle activities nationwide.
const s=await fetch('https://api.entur.io/realtime/v1/rest/vm?datasetId=ATB&maxSize=1500',{
 headers:{...headers,Accept:'application/xml'},signal:AbortSignal.timeout(18000)});
if(s.status===429){
 console.log('SIRI_JOURNEY_JOIN_BLOCKED '+JSON.stringify({httpStatus:429,note:'Stop, respect Retry-After; not a negative matching result.'}));
 process.exit(2);
}
else if(!s.ok)throw Error('SIRI VM HTTP '+s.status);
else{
 const xml=await s.text();
 const activities=xml.match(/<(?:[\w.-]+:)?VehicleActivity(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w.-]+:)?VehicleActivity>/gi)||[];
 for(const row of activities){
  const line=pick(row,'LineRef');
  const code=line==='ATB:Line:2_1'?'1':line==='ATB:Line:2_11'?'11':null;
  if(!code)continue;
  const id=pick(row,'DatedVehicleJourneyRef');
  if(id&&/^[A-Za-z0-9_:.+-]{6,180}$/.test(id))observed[code].set(id,(observed[code].get(id)||0)+1);
 }
 console.log('SIRI_JOURNEY_REF_SAMPLE '+JSON.stringify({
  datasetId:'ATB',activities:activities.length,moreData:/MoreData\s*=\s*["']true["']/i.test(xml),byLine:Object.fromEntries(Object.entries(observed).map(([line,m])=>[line,{
   distinctRefs:m.size,refPrefixes:[...new Set([...m.keys()].map(id=>id.split(':').slice(0,2).join(':')))].slice(0,5)
  }]))
 }));
}
let req=10;
const field='id operatingDay tripAlteration serviceJourney {id line{id} journeyPattern{id directionType}} journeyPattern{id directionType}';
for(const line of ['1','11']){
 const lineId='ATB:Line:2_'+line;
 const refs=[...observed[line].keys()].slice(0,3);
 for(const ref of refs){
  const data=await call('datedServiceJourney',{id:ref,fields:field},req++);
  const row=data?.datedServiceJourney||null;
  console.log('EXACT_SIRI_DATED_JOURNEY '+JSON.stringify({
   line,journeyRef:ref,exactFound:!!row,
   returnedId:row?.id||null,returnedLine:row?.serviceJourney?.line?.id||null,
   patternId:row?.journeyPattern?.id||row?.serviceJourney?.journeyPattern?.id||null,
   operatingDay:row?.operatingDay||null
  }));
 }
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const sample=await call('datedServiceJourneys',{lines:[lineId],operatingDays:[date],first:8,
  fields:field},req++);
 const rows=(sample?.datedServiceJourneys?.edges||[]).map(e=>e.node);
 console.log('DATE_SCOPED_DATED_JOURNEYS '+JSON.stringify({line,date,
  count:rows.length,hasMore:sample?.datedServiceJourneys?.pageInfo?.hasNextPage===true,
  sample:rows.map(r=>({id:r.id,operatingDay:r.operatingDay,
   serviceJourneyId:r.serviceJourney?.id||null,lineId:r.serviceJourney?.line?.id||null,
   patternId:r.journeyPattern?.id||r.serviceJourney?.journeyPattern?.id||null}))}));
}

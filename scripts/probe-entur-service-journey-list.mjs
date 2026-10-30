// Read-only reference data availability check. No vehicle/GPS access.
// This deliberately makes one page request per pilot line and does not
// assume that a dated journey in a timetable ran or was physically observed.
const url='https://api.entur.io/transit-data/v1beta/mcp';
async function query(name,args,id){
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',
  'Accept':'application/json, text/event-stream','ET-Client-Name':'transitcore-journey-ref-audit'},
  body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}}),
  signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw Error('Transit Data HTTP '+r.status);
 const response=await r.json();
 if(response.result?.isError||response.error)
   throw Error('Transit Data invalid '+name);
 return JSON.parse(response.result.content?.find(c=>c.type==='text')?.text||'{}').data;
}
let id=1;
for(const line of ['1','11']){
 const lineId='ATB:Line:2_'+line;
 const s=await query('serviceJourneys',{first:5,lines:[lineId],
  fields:'id line{id} journeyPattern{id directionType} directionType'},id++);
 const sj=s?.serviceJourneys?.nodes||[];
 console.log('SERVICE_JOURNEY_PILOT '+JSON.stringify({line,lineId,
  returned:sj.length,hasNext:s?.serviceJourneys?.pageInfo?.hasNextPage===true,
  samples:sj.map(x=>({id:x.id,line:x.line?.id||null,pattern:x.journeyPattern?.id||null,direction:x.directionType||null}))}));
 const d=await query('datedServiceJourneys',{first:5,lines:[lineId],
  fields:'id operatingDay tripAlteration serviceJourney{id line{id} journeyPattern{id directionType}} journeyPattern{id directionType}'},id++);
 const dated=(d?.datedServiceJourneys?.edges||[]).map(x=>x.node);
 console.log('DATED_JOURNEY_PILOT '+JSON.stringify({line,returned:dated.length,
  hasNext:d?.datedServiceJourneys?.pageInfo?.hasNextPage===true,
  samples:dated.map(x=>({id:x.id,operatingDay:x.operatingDay,alteration:x.tripAlteration,
   sj:x.serviceJourney?.id||null,line:x.serviceJourney?.line?.id||null,
   pattern:x.journeyPattern?.id||x.serviceJourney?.journeyPattern?.id||null}))}));
}

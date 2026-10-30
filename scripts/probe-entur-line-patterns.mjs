// Read-only comparison of source-defined directional JourneyPatterns for
// AtB 1 and 11. No vehicle GPS, no secrets, no writes.
const endpoint='https://api.entur.io/transit-data/v1beta/mcp';
async function call(name,args,requestId){
 const r=await fetch(endpoint,{method:'POST',headers:{
  'Content-Type':'application/json','Accept':'application/json, text/event-stream',
  'ET-Client-Name':'transitcore-route-sequence-audit'},
  body:JSON.stringify({jsonrpc:'2.0',id:requestId,method:'tools/call',params:{name,arguments:args}}),
  signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Transit Data HTTP '+r.status+'; no retries');
 const data=await r.json();
 const answer=data.result;
 if(data.error||answer?.isError)throw Error('Transit Data tool '+name+' invalid response '+JSON.stringify(answer?.content?.[0]?.text||data.error?.message).slice(0,200));
 return JSON.parse(answer.content?.find(x=>x.type==='text')?.text||'{}').data;
}
for(const [code,id] of [['1','ATB:Line:2_1'],['11','ATB:Line:2_11']]){
 const fields='id name publicCode journeyPatterns { id name directionType quays(first:200){nodes{id name} pageInfo{hasNextPage endCursor}} }';
 const data=await call('line',{id,fields},code);
 const line=data?.line;
 if(!line)throw Error('Missing line '+code+' in Transit Data');
 const patterns=(line.journeyPatterns||[]).map(p=>({
  id:p.id,direction:p.directionType,name:p.name||null,
  quays:(p.quays?.nodes||[]).map(q=>q.id),
  firstName:p.quays?.nodes?.[0]?.name||null,
  lastName:p.quays?.nodes?.at(-1)?.name||null,
  incomplete:p.quays?.pageInfo?.hasNextPage===true
 }));
 const incomplete=patterns.filter(p=>p.incomplete);
 console.log('ENTUR_LINE_PATTERNS '+JSON.stringify({
  line:code,lineId:line.id,patternCount:patterns.length,
  incomplete:incomplete.length,patterns
 }));
 if(patterns.length===0||incomplete.length)throw Error('No complete patterns for line '+code);
}

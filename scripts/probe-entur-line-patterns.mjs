// Read-only catalogue audit from authoritative Entur Transit Data GraphQL.
// Run as an explicit PR audit; never deploy or overwrite source snapshots.
// Every accepted pattern contains a complete, ordered QuayConnection.
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const board=read('config/boards/trondheim-city-lines-catalog.json');
const profiles=board.routes.filter(x=>/^atb-bus-\d+-live$/.test(x));
const codes=[...new Set(profiles.map(x=>x.match(/^atb-bus-(\d+)-live$/)[1]))];
const QUAY=/^NSR:Quay:\d+$/;
const PATTERN=/^ATB:JourneyPattern:[A-Za-z0-9_.+-]+$/;
const mapped=new Map();
for(const n of board.nodes)for(const q of [n.quayId,...(Array.isArray(n.stopIds)?n.stopIds:[])])
 if(QUAY.test(q)&&Number.isInteger(n.led)){
  const leds=mapped.get(q)||new Set();leds.add(n.led);mapped.set(q,leds);
 }
const endpoint='https://api.entur.io/transit-data/v1beta/graphql';
const selection='id journeyPatterns { id name directionType quays(first:200) { nodes { id } pageInfo { hasNextPage } } }';
const approved=[],excluded=[],errorLines=[];
function validate(code,line){
 if(line?.id!=='ATB:Line:2_'+code||!Array.isArray(line.journeyPatterns))
  throw Error('line-reference-or-patterns-missing');
 const ids=new Set(),patterns=[];
 for(const p of line.journeyPatterns){
  const q=p.quays;
  if(!PATTERN.test(p.id||'')||ids.has(p.id)||
     !['inbound','outbound'].includes(p.directionType)||!Array.isArray(q?.nodes)||
     q.pageInfo?.hasNextPage!==false||q.nodes.length<2||q.nodes.length>200||
     q.nodes.some(n=>!QUAY.test(n?.id)))throw Error('invalid-or-partial-source-pattern');
  ids.add(p.id);
  patterns.push({id:p.id,name:String(p.name||'').slice(0,120),
   directionType:p.directionType,quays:q.nodes.map(n=>n.id)});
 }
 const paths=patterns.map(p=>p.quays);
 const unique=new Set(paths.flat()),mappedQuays=[...unique].filter(q=>mapped.has(q));
 const contiguousPairs=new Set(),uniqueGpsPairs=new Set();
 for(const quays of paths)for(let i=1;i<quays.length;i++){
  const a=quays[i-1],b=quays[i];
  if(mapped.has(a)&&mapped.has(b)){
   contiguousPairs.add(a+'>'+b);
   if(mapped.get(a).size===1&&mapped.get(b).size===1&&
      [...mapped.get(a)][0]!==[...mapped.get(b)][0])uniqueGpsPairs.add(a+'>'+b);
  }
 }
 const dirs=[...new Set(patterns.map(p=>p.directionType))];
 const coverage={patterns:patterns.length,directions:dirs,
  sourceQuays:unique.size,mappedQuays:mappedQuays.length,
  adjacentPairs:contiguousPairs.size,uniqueGpsPairs:uniqueGpsPairs.size};
 if(patterns.length<2||dirs.length<2||uniqueGpsPairs.size<2)
  return {approved:false,reason:'insufficient-pattern-direction-or-unique-GPS-pairs',coverage};
 return {approved:true,coverage,
  data:{lineId:line.id,patterns}};
}
for(let start=0;start<codes.length;start+=5){
 const part=codes.slice(start,start+5);
 const query='query Batch { '+part.map((code,i)=>
   'p'+i+':line(id:"ATB:Line:2_'+code+'"){'+selection+'}').join(' ')+' }';
 try{
  const response=await fetch(endpoint,{method:'POST',
   headers:{'content-type':'application/json','ET-Client-Name':'intransit-pattern-audit'},
   body:JSON.stringify({query}),signal:AbortSignal.timeout(25000)});
  const data=await response.json();
  if(!response.ok||data.errors?.length){
   console.log('ENTUR_BATCH_ERROR '+JSON.stringify({lines:part,
    http:response.status,errors:data.errors?.map(e=>e.message).slice(0,2)}));
   errorLines.push(...part);continue;
  }
  for(let i=0;i<part.length;i++){
   const code=part[i];
   try{
    const result=validate(code,data.data?.['p'+i]);
    const info={code,coverage:result.coverage,
      ...(result.approved?{data:result.data}:{reason:result.reason})};
    if(result.approved){
     approved.push(code);console.log('ENTUR_LINE_APPROVED '+JSON.stringify(info));
    }else{
     excluded.push(code);console.log('ENTUR_LINE_EXCLUDED '+JSON.stringify(info));
    }
   }catch(e){
    excluded.push(code);
    console.log('ENTUR_LINE_EXCLUDED '+JSON.stringify({code,reason:e.message}));
   }
  }
 }catch(e){
  errorLines.push(...part);
  console.log('ENTUR_BATCH_ERROR '+JSON.stringify({lines:part,error:String(e.message).slice(0,200)}));
 }
 // Small pause avoids unnecessary load on public beta endpoint.
 await new Promise(resolve=>setTimeout(resolve,300));
}
console.log('ENTUR_AUDIT_SUMMARY '+JSON.stringify({total:codes.length,approved,excluded,errorLines}));

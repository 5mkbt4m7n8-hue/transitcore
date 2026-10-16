import {normalizeStopCall} from './stop-call-evidence.mjs';

// IO adapter only: no LED selection, radius or lifecycle decisions.
export async function loadStopCalls({board,profiles,now,fetchJson,clientName}) {
  const groups=new Map();
  for(const profile of profiles){
    const endpoint=profile.positioning?.endpoint;
    if(!endpoint)throw Error('Missing estimated-call endpoint');
    if(!groups.has(endpoint))groups.set(endpoint,[]);
    groups.get(endpoint).push(profile);
  }
  const calls=[];
  for(const [endpoint,group] of groups){
    const routeIds=new Set(group.map(p=>p.id)),lineIds=new Set(group.map(p=>p.line.id));
    const quays=[...new Set(board.nodes.filter(n=>n.routes.some(id=>routeIds.has(id))).flatMap(n=>n.stopIds||[]))];
    const start=new Date(now-75000).toISOString();
    // Bounded query size; no request for unrelated board quays/providers.
    for(let offset=0;offset<quays.length;offset+=32){
      const batch=quays.slice(offset,offset+32);
      const fields='date realtime cancellation predictionInaccurate actualArrivalTime actualDepartureTime aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime destinationDisplay{frontText} serviceJourney{id journeyPattern{line{id publicCode}}}';
      const query='{'+batch.map((q,i)=>`q${i}:quay(id:${JSON.stringify(q)}){estimatedCalls(startTime:${JSON.stringify(start)},timeRange:675,numberOfDepartures:6){${fields}}}`).join('\n')+'}';
      const data=await fetchJson(endpoint,{method:'POST',headers:{'Content-Type':'application/json','ET-Client-Name':clientName},body:JSON.stringify({query})});
      if(data.errors?.length)throw Error('Estimated-call provider error');
      batch.forEach((q,i)=>{for(const raw of data.data?.['q'+i]?.estimatedCalls||[]){
        const call=normalizeStopCall(raw,q,now);
        if(lineIds.has(call.lineId))calls.push(call);
      }});
    }
  }
  return calls;
}

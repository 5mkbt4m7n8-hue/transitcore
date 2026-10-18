// Permanent Oslo ETA interpreter. A forecast is not a measured train position.
export function metroQuayTargets(board) {
  const map=new Map();
  for(const node of board.nodes||[])for(const quayId of node.stopIds||[]){
    if(!map.has(quayId))map.set(quayId,[]);
    if(!map.get(quayId).includes(node))map.get(quayId).push(node);
  }
  return [...map].map(([quayId,nodes])=>({quayId,nodes}));
}
const epoch=value=>typeof value==='string'&&value?Date.parse(value):NaN;
function directionScore(node,profile,destination){
  const rule=node.routeDirections?.[profile.id];
  if(!rule)return 1;
  const text=String(destination||'').trim().toLocaleLowerCase('nb-NO');
  if(!text)return 0;
  if((rule.headsigns||[]).some(x=>text===String(x).toLocaleLowerCase('nb-NO')))return 1000;
  if((rule.destinationMatches||[]).some(x=>text===String(x).toLocaleLowerCase('nb-NO')))return 900;
  const parts=(rule.destinationMatches||[]).map(x=>String(x).trim().toLocaleLowerCase('nb-NO'))
    .filter(x=>x&&(text.startsWith(x+' ')||text.endsWith(' '+x)||text.includes(' '+x+' ')));
  return parts.length?100+Math.max(...parts.map(x=>x.length)):0;
}
function preferred(a,b){
  if(!a)return b;
  if(a.state!==b.state)return b.state==='AT_STOP'?b:a;
  return Math.abs(b.deltaSeconds)<Math.abs(a.deltaSeconds)?b:a;
}
/** Resolve every quay to its direction nodes; never invent evidence of actual departure. */
export function selectMetroEstimatedCalls(board,profiles,payload,now,{stationWindowSeconds=45,approachWindowSeconds=120}={}){
  if(!payload?.data||typeof payload.data!=='object')throw Error('Missing estimated-call data');
  const targets=metroQuayTargets(board);
  const byId=new Map(profiles.map(p=>[String(p.line.id),p]));
  const byCode=new Map(profiles.map(p=>[String(p.line.publicCode),p]));
  const physical=new Map(board.hardware.assignments.map(a=>[a.logicalLed,a.physicalLed]));
  const journeyMap=new Map();
  targets.forEach(({nodes},index)=>{
    const calls=payload.data['q'+index]?.estimatedCalls;
    if(calls!=null&&!Array.isArray(calls))throw Error('Invalid estimated-call list');
    for(const call of calls||[]){
      if(call?.realtime!==true||call.cancellation===true||call.predictionInaccurate===true)continue;
      const line=call.serviceJourney?.journeyPattern?.line;
      const profile=byId.get(String(line?.id||''))||byCode.get(String(line?.publicCode||''));
      const journeyId=call.serviceJourney?.id;
      if(!profile||typeof journeyId!=='string'||!journeyId)continue;
      const destination=call.destinationDisplay?.frontText||'';
      const matches=nodes.filter(n=>n.routes.includes(profile.id))
        .map(node=>({node,score:directionScore(node,profile,destination)}))
        .filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
      if(!matches.length||(matches[1]&&matches[0].score===matches[1].score))continue;
      const ledId=physical.get(matches[0].node.led);
      if(!Number.isInteger(ledId))continue;
      const arrival=epoch(call.expectedArrivalTime||call.aimedArrivalTime);
      const departure=epoch(call.expectedDepartureTime||call.aimedDepartureTime);
      const eta=Number.isFinite(arrival)?arrival:departure;
      if(!Number.isFinite(eta))continue;
      const deltaSeconds=(eta-now)/1000;
      if(deltaSeconds>approachWindowSeconds||deltaSeconds< -stationWindowSeconds)continue;
      if(Number.isFinite(departure)&&departure<now)continue;
      const predictedDwell=Number.isFinite(arrival)&&Number.isFinite(departure)&&arrival<=now&&departure>=now&&departure>=arrival;
      if(deltaSeconds<0&&!predictedDwell)continue;
      const aimed=epoch(call.aimedArrivalTime||call.aimedDepartureTime);
      const candidate={id:ledId,profile,vehicleId:journeyId,destination,
        state:predictedDwell?'AT_STOP':'APPROACHING',deltaSeconds,
        positionType:'realtime-stop-forecast',
        delaySeconds:Number.isFinite(aimed)?Math.round((eta-aimed)/1000):null};
      const key=profile.id+'|'+journeyId;
      journeyMap.set(key,preferred(journeyMap.get(key),candidate));
    }
  });
  const ledMap=new Map();
  for(const candidate of journeyMap.values()){
    if(!ledMap.has(candidate.id))ledMap.set(candidate.id,[]);
    ledMap.get(candidate.id).push(candidate);
  }
  const rank=value=>value.state==='AT_STOP'?2:1;
  return [...ledMap].map(([id,occupants])=>{
    occupants.sort((a,b)=>rank(b)-rank(a)||Math.abs(a.deltaSeconds)-Math.abs(b.deltaSeconds)||a.vehicleId.localeCompare(b.vehicleId));
    return {...occupants[0],id,occupants};
  }).sort((a,b)=>a.id-b.id);
}

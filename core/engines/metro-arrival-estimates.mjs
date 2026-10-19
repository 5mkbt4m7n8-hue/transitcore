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
function rank(value){return value.state==='AT_STOP'?3:value.state==='APPROACHING'?2:1;}
function evidenceRank(value){return value.positionType?.startsWith('reported-actual')?1:0;}
function preferred(a,b){
  if(!a)return b;
  // Same service journey / same LED: a provider-reported departure takes
  // precedence over an overlapping (possibly stale) predicted dwell.
  // For different stops, a subsequent APPROACHING train can still advance.
  if(a.id===b.id){
    const aDeparted=a.positionType==='reported-actual-departure';
    const bDeparted=b.positionType==='reported-actual-departure';
    if(aDeparted!==bDeparted)return bDeparted?b:a;
  }
  if(rank(a)!==rank(b))return rank(b)>rank(a)?b:a;
  if(evidenceRank(a)!==evidenceRank(b))return evidenceRank(b)>evidenceRank(a)?b:a;
  return Math.abs(b.deltaSeconds)<Math.abs(a.deltaSeconds)?b:a;
}
/** Resolve every quay to its direction nodes; never invent evidence of actual departure. */
export function selectMetroEstimatedCalls(board,profiles,payload,now,{stationWindowSeconds=45,approachWindowSeconds=120,diagnostics={}}={}){
  const targets=metroQuayTargets(board);
  const d=Object.assign(diagnostics,{outcome:'INVALID_SOURCE',quaysRequested:targets.length,quaysReturned:0,quaysAccepted:0,
    missingQuays:0,nullQuays:0,invalidQuays:0,invalidCallLists:0,invalidCalls:0,graphqlErrors:0,callsReceived:0,
    rejected:{cancellation:0,noRealtime:0,inaccurate:0,identity:0,directionUnknown:0,directionAmbiguous:0,mapping:0,
      actualDepartureFuture:0,actualDepartureExpired:0,actualArrivalExpired:0,missingTime:0,outsideWindow:0,departureExpired:0,pastWithoutDwell:0},
    actualWithoutRealtime:0,acceptedCalls:0,uniqueJourneys:0,mergedCalls:0,activeLeds:0,states:{AT_STOP:0,APPROACHING:0,PASSED:0}});
  delete d.sourceError;
  const invalid=code=>{d.sourceError=code;const error=new Error(code);error.code=code;throw error;};
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  if(!Number.isFinite(now))invalid('METRO_INVALID_CLOCK');
  if(!object(payload)||!object(payload.data))invalid('METRO_MISSING_DATA');
  if(payload.errors!==undefined&&(!Array.isArray(payload.errors)||payload.errors.length)){
    d.graphqlErrors=Array.isArray(payload.errors)?payload.errors.length:1;invalid('METRO_GRAPHQL_ERROR');
  }
  // Validate the entire requested source before interpreting any partial results.
  targets.forEach((_,index)=>{
    const key='q'+index;
    if(!Object.hasOwn(payload.data,key)){d.missingQuays++;return;}
    const quay=payload.data[key];
    if(quay===null){d.nullQuays++;return;}
    d.quaysReturned++;
    if(!object(quay)){d.invalidQuays++;return;}
    if(!Array.isArray(quay.estimatedCalls)){d.invalidCallLists++;return;}
    d.callsReceived+=quay.estimatedCalls.length;
    const malformed=quay.estimatedCalls.filter(call=>!object(call)).length;
    d.invalidCalls+=malformed;if(!malformed)d.quaysAccepted++;
  });
  if(d.quaysAccepted!==targets.length)invalid('METRO_INCOMPLETE_SOURCE');
  const reject=reason=>{d.rejected[reason]++;};
  const byId=new Map(profiles.map(p=>[String(p.line.id),p]));
  const byCode=new Map(profiles.map(p=>[String(p.line.publicCode),p]));
  const physical=new Map(board.hardware.assignments.map(a=>[a.logicalLed,a.physicalLed]));
  const journeyMap=new Map();
  targets.forEach(({nodes},index)=>{
    const calls=payload.data['q'+index]?.estimatedCalls;
    if(calls!=null&&!Array.isArray(calls))throw Error('Invalid estimated-call list');
    for(const call of calls||[]){
      const actualArrival=epoch(call?.actualArrivalTime);
      const actualDeparture=epoch(call?.actualDepartureTime);
      const hasActual=Number.isFinite(actualArrival)||Number.isFinite(actualDeparture);
      if(call.cancellation===true){reject('cancellation');continue;}
      if(call.realtime!==true&&!hasActual){reject('noRealtime');continue;}
      if(call.predictionInaccurate===true&&!hasActual){reject('inaccurate');continue;}
      if(call.realtime!==true&&hasActual)d.actualWithoutRealtime++;
      const line=call.serviceJourney?.journeyPattern?.line;
      const profile=byId.get(String(line?.id||''))||byCode.get(String(line?.publicCode||''));
      const journeyId=call.serviceJourney?.id;
      if(!profile||typeof journeyId!=='string'||!journeyId){reject('identity');continue;}
      const destination=call.destinationDisplay?.frontText||'';
      const matches=nodes.filter(n=>n.routes.includes(profile.id))
        .map(node=>({node,score:directionScore(node,profile,destination)}))
        .filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
      if(!matches.length){reject('directionUnknown');continue;}
      if(matches[1]&&matches[0].score===matches[1].score){reject('directionAmbiguous');continue;}
      const ledId=physical.get(matches[0].node.led);
      if(!Number.isInteger(ledId)){reject('mapping');continue;}
      const arrival=epoch(call.expectedArrivalTime||call.aimedArrivalTime);
      const departure=epoch(call.expectedDepartureTime||call.aimedDepartureTime);
      const aimedArrival=epoch(call.aimedArrivalTime);
      const aimedDeparture=epoch(call.aimedDepartureTime);
      let state,positionType,eventTime,aimed;
      // "Actual" means the provider reports the event; it is never inferred
      // from a vanished ETA. Reported departure is visible for at most 10s.
      if(Number.isFinite(actualDeparture)){
        if(actualDeparture>now){reject('actualDepartureFuture');continue;}
        if(now-actualDeparture>=10000){reject('actualDepartureExpired');continue;}
        state='PASSED';positionType='reported-actual-departure';
        eventTime=actualDeparture;aimed=aimedDeparture;
      }else if(Number.isFinite(actualArrival)&&actualArrival<=now){
        // A reported arrival alone cannot prove the train is still stopped.
        if(now-actualArrival>90000||(Number.isFinite(departure)&&now-departure>15000)){reject('actualArrivalExpired');continue;}
        state='AT_STOP';positionType='reported-actual-arrival';
        eventTime=actualArrival;aimed=aimedArrival;
      }else{
        const eta=Number.isFinite(arrival)?arrival:departure;
        if(!Number.isFinite(eta)){reject('missingTime');continue;}
        const delta=(eta-now)/1000;
        if(delta>approachWindowSeconds||delta< -stationWindowSeconds){reject('outsideWindow');continue;}
        if(Number.isFinite(departure)&&departure<now){reject('departureExpired');continue;}
        const dwell=Number.isFinite(arrival)&&Number.isFinite(departure)&&
          arrival<=now&&departure>=now&&departure>=arrival;
        if(delta<0&&!dwell){reject('pastWithoutDwell');continue;}
        state=dwell?'AT_STOP':'APPROACHING';positionType='realtime-stop-forecast';
        eventTime=eta;aimed=Number.isFinite(aimedArrival)?aimedArrival:aimedDeparture;
      }
      const deltaSeconds=(eventTime-now)/1000;
      const datedId=journeyId+(typeof call.date==='string'?'|'+call.date:'');
      const candidate={id:ledId,profile,vehicleId:datedId,destination,state,deltaSeconds,
        positionType,delaySeconds:Number.isFinite(aimed)?Math.round((eventTime-aimed)/1000):null};
      const key=profile.id+'|'+datedId;
      d.acceptedCalls++;
      journeyMap.set(key,preferred(journeyMap.get(key),candidate));
    }
  });
  const ledMap=new Map();
  for(const candidate of journeyMap.values()){
    if(!ledMap.has(candidate.id))ledMap.set(candidate.id,[]);
    ledMap.get(candidate.id).push(candidate);
  }
  const selected=[...ledMap].map(([id,occupants])=>{
    occupants.sort((a,b)=>rank(b)-rank(a)||evidenceRank(b)-evidenceRank(a)||Math.abs(a.deltaSeconds)-Math.abs(b.deltaSeconds)||a.vehicleId.localeCompare(b.vehicleId));
    return {...occupants[0],id,occupants};
  }).sort((a,b)=>a.id-b.id);
  d.uniqueJourneys=journeyMap.size;d.mergedCalls=d.acceptedCalls-d.uniqueJourneys;
  d.activeLeds=selected.length;for(const item of selected)d.states[item.state]++;
  d.outcome=selected.length?'ACTIVE':d.callsReceived?'FILTERED_EMPTY':'VALID_EMPTY';
  return selected;
}

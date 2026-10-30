// Pure, shadow-only ordered Quay evidence. A GPS proximity is never AT_STOP.
// Input indices must come from one *exact* source JourneyPattern.
// No cross-trip continuity, reverse fallback, or LED projection.
const valid=(i,n)=>Number.isInteger(i)&&i>=0&&i<n;
const goodTime=t=>typeof t==='string'&&Number.isFinite(Date.parse(t));
export function observeSourceQuaySequence(previous={},{
 patternLength,gpsCandidateIndex=null,gpsAt=null,providerStopIndex=null,providerAt=null
}={}){
 const state={
  gps:[...(previous.gps||[])],provider:[...(previous.provider||[])],
  gpsAt:previous.gpsAt||null,providerAt:previous.providerAt||null,
  invalidated:previous.invalidated===true
 };
 const delta={gpsVisits:0,gpsForward:0,gpsAdjacentTriplets:0,
  providerStops:0,providerForward:0,providerAdjacentTriplets:0,
  duplicateOrOld:0,reverseOrConflict:0};
 if(state.invalidated)return {state,delta};
 function add(type,index,time,visits,forward,triplets){
  if(index===null||index===undefined)return;
  if(!valid(index,patternLength)||!goodTime(time)){
   delta.reverseOrConflict++;state.invalidated=true;return;
  }
  const at=Date.parse(time),lastAt=Date.parse(state[type+'At']||'');
  if(Number.isFinite(lastAt)&&at<=lastAt){delta.duplicateOrOld++;return;}
  state[type+'At']=time;
  const list=state[type],last=list.at(-1);
  if(last===index)return;
  if(last!==undefined&&index<last){
   delta.reverseOrConflict++;state.invalidated=true;return;
  }
  if(last!==undefined&&index>last)delta[forward]++;
  list.push(index);delta[visits]++;
  if(list.length>=3&&list.at(-1)===list.at(-2)+1&&
    list.at(-2)===list.at(-3)+1)delta[triplets]++;
 }
 add('gps',gpsCandidateIndex,gpsAt,'gpsVisits','gpsForward','gpsAdjacentTriplets');
 if(!state.invalidated)add('provider',providerStopIndex,providerAt,'providerStops','providerForward','providerAdjacentTriplets');
 return {state,delta};
}

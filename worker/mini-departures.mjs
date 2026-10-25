// Read-only Entur stop-place departure board for InTransit Mini.
// No ETA-to-location conversions and no effect on device or LED frame routes.
export const JOURNEY_URL='https://api.entur.io/journey-planner/v3/graphql';
export const QUERY=`query MiniDepartures($stopId: String!) {
  stopPlace(id: $stopId) {
    id name
    estimatedCalls(numberOfDepartures: 24, includeCancelledTrips: true) {
      realtime aimedDepartureTime expectedDepartureTime cancellation
      destinationDisplay { frontText }
      serviceJourney { line { publicCode } }
    }
  }
}`;
export const validStopId=value=>typeof value==='string'&&/^NSR:StopPlace:[1-9]\d{0,8}$/.test(value);
export function normalizeCalls(place,stopId,now=Date.now()){
 if(!place||typeof place.name!=='string'||!Array.isArray(place.estimatedCalls))
  throw Error('invalid_departures');
 const result=[];
 for(const call of place.estimatedCalls){
  const line=call?.serviceJourney?.line?.publicCode;
  const dest=call?.destinationDisplay?.frontText;
  const iso=call?.expectedDepartureTime||call?.aimedDepartureTime;
  if(typeof line!=='string'||!line.trim()||line.length>10||
     typeof dest!=='string'||!dest.trim()||dest.length>120||
     typeof iso!=='string'||!Number.isFinite(Date.parse(iso)))continue;
  const when=Date.parse(iso);
  if(when<now-120000||when>now+86400000)continue;
  result.push({line:line.trim(),destination:dest.trim(),
   at:new Date(when).toISOString(),realtime:call.realtime===true,
   cancelled:call.cancellation===true});
 }
 return {schemaVersion:1,source:'Entur Journey Planner v3',stopId,
  stopName:place.name.slice(0,150),checkedAt:new Date(now).toISOString(),
  departures:result.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(0,32)};
}
export async function fetchMiniDepartures(stopId,{fetcher=fetch,now=Date.now(),
 clientName='transitcore-mini-departures'}={}){
 if(!validStopId(stopId))throw Error('invalid_stop_id');
 let response;
 try{
  response=await fetcher(JOURNEY_URL,{method:'POST',
   headers:{'Content-Type':'application/json','ET-Client-Name':clientName},
   body:JSON.stringify({query:QUERY,variables:{stopId}}),
   signal:AbortSignal.timeout(10000)
  });
 }catch{throw Error('source_unavailable');}
 if(!response.ok)throw Error('source_http_'+response.status);
 let payload;
 try{payload=await response.json();}catch{throw Error('invalid_source_json');}
 if(payload?.errors?.length)throw Error('source_graphql_error');
 return normalizeCalls(payload?.data?.stopPlace,stopId,now);
}

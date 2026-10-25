// Live source smoke probe. Never prints vehicle IDs, coordinates or raw GraphQL.
import {fetchLine1Gps} from '../worker/atb-line1-gps.mjs';
try{
 const snapshot=await fetchLine1Gps({clientName:'transitcore-line1-gps-probe'});
 console.log(JSON.stringify({provider:snapshot.codespace,line:snapshot.lineId,
  source:snapshot.source,checkedAt:snapshot.requestedAt,
  providerVehicleCount:snapshot.quality.totalProviderVehicles,
  line1Reported:snapshot.quality.line1Reported,
  line1WithFreshMeasuredPositions:snapshot.quality.line1Fresh,
  missingPosition:snapshot.quality.withoutCoordinates,
  stale:snapshot.quality.stale,
  note:'A single observation does not establish sustained GPS coverage, or absence of buses.'}));
}catch(e){
 console.log(JSON.stringify({source:'Entur Vehicle Positions v2',status:'unavailable',
  error:e.message,note:'Do not fall back to ETA or invent GPS coordinates.'}));
}

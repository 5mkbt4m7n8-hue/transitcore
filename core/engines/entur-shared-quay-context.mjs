// Read-only context for a shared source Quay. It proves neither occupancy,
// GPS physical position, lane direction, nor permission to illuminate an LED.
// The calling observer must first join SIRI VehicleRef + GPS timestamp +
// exact Entur ServiceJourney into journeyEvidence, fail-closed.
import {patternInventory} from './entur-trip-pattern-link.mjs';

const validQuay=id=>/^NSR:Quay:[0-9]+$/.test(id||'');
export function inspectSharedQuayContext({lineCode,journeyEvidence,quayId}={}){
 const reject=reason=>({status:'unresolved',reason,
  physicalSideConfirmed:false,providerStopConfirmed:false,eligibleForLed:false});
 const line=patternInventory().get(String(lineCode));
 if(!line||!validQuay(quayId))return reject('unknown-line-or-quay');
 const ev=journeyEvidence;
 if(ev?.status!=='route-pattern-supported'||
  ev.source!=='entur-transit-data-v1beta'||
  ev.lineId!==line.lineId||ev.vehicleIdentityConfirmed!==true)
  return reject('unlinked-source-vehicle');
 const pattern=line.patterns.find(p=>p.id===ev.patternId);
 if(!pattern||pattern.directionType!==ev.directionType||
  !Array.isArray(ev.quays)||ev.quays.length!==pattern.quays.length||
  ev.quays.some((id,i)=>id!==pattern.quays[i]))
  return reject('journey-pattern-conflict');
 const matches=pattern.quays.flatMap((id,i)=>id===quayId?[i]:[]);
 if(matches.length!==1)return reject(matches.length?'repeated-quay':'quay-not-in-actual-trip');
 const index=matches[0];
 const directions=[...new Set(line.patterns.filter(p=>p.quays.includes(quayId))
  .map(p=>p.directionType))].sort();
 return {status:'source-pattern-context-only',lineId:line.lineId,
  quayId,sourceDirection:pattern.directionType,
  patternIndex:index,patternLength:pattern.quays.length,
  role:index===0?'origin':index===pattern.quays.length-1?'terminus':'intermediate',
  sharedBetweenSourceDirections:directions.length>1,
  sourceDirectionsUsingQuay:directions,
  nextPlannedQuayId:pattern.quays[index+1]||null,
  previousPlannedQuayId:pattern.quays[index-1]||null,
  // Source planned route and vehicle identity do not solve physical side.
  physicalSideConfirmed:false,providerStopConfirmed:false,
  operatingDayVerified:false,eligibleForLed:false};
}

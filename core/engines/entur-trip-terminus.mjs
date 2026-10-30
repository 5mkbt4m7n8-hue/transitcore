// Shadow-only terminal identification from a SOURCE-VERIFIED trip pattern.
// Do not infer a physical terminal from GPS destination/headsign or a line's
// marketing name. A terminal Quay here is planned, not observed AT_STOP.
// No LED projection or automatic GTFS/Entur direction-ID conversion.
import {patternInventory} from './entur-trip-pattern-link.mjs';

const normal=value=>typeof value==='string'?value.normalize('NFC').trim().toLowerCase():null;
function quayName(knownQuays,id) {
 const nodes=Array.isArray(knownQuays)?knownQuays:
  Array.isArray(knownQuays?.nodes)?knownQuays.nodes:[];
 const names=new Set(nodes.filter(n=>n?.quayId===id||n?.id===id)
  .map(n=>typeof n?.name==='string'?n.name.trim():'').filter(Boolean));
 return names.size===1?[...names][0]:null;
}

export function describeVerifiedTripTerminus({
 lineCode,journeyEvidence,quayCatalog=null,vehicleHeadsign=null
}={}) {
 const reject=reason=>({
  status:'unresolved',reason,originQuayId:null,terminalQuayId:null,
  terminalName:null,eligibleForLed:false
 });
 const line=patternInventory().get(String(lineCode));
 if(!line)return reject('line-not-in-source-catalogue');
 const ev=journeyEvidence;
 if(!ev||!['route-pattern-supported','linked'].includes(ev.status)||
  ev.source!=='entur-transit-data-v1beta'||ev.lineId!==line.lineId)
  return reject('route-evidence-not-source-verified');
 const pattern=line.patterns.find(p=>p.id===ev.patternId);
 if(!pattern||pattern.directionType!==ev.directionType||
  !Array.isArray(ev.quays)||ev.quays.length!==pattern.quays.length||
  ev.quays.some((id,i)=>id!==pattern.quays[i]))
  return reject('source-journey-pattern-conflict');
 const originQuayId=pattern.quays[0],terminalQuayId=pattern.quays.at(-1);
 const originName=quayName(quayCatalog,originQuayId);
 const terminalName=quayName(quayCatalog,terminalQuayId);
 const longest=Math.max(...line.patterns.filter(p=>p.directionType===pattern.directionType)
  .map(p=>p.quays.length));
 const headsign=normal(vehicleHeadsign),terminal=normal(terminalName);
 // Headsgins are useful anomaly signals, never terminal/Quay evidence.
 const headsignAgreement=!headsign?'not-provided':!terminal?'terminal-name-unknown':
  headsign===terminal?'exact-name-match':'name-differs';
 return {
  status:'planned-terminus-supported',
  source:'entur-transit-data-v1beta',
  lineId:line.lineId,patternId:pattern.id,directionType:pattern.directionType,
  originQuayId,originName,terminalQuayId,terminalName,
  patternStopCount:pattern.quays.length,
  shorterThanLongestKnownPattern:pattern.quays.length<longest,
  headsignAgreement,
  // These flags are NOT inferred from a source journey's final Quay.
  operatingDayVerified:ev.operatingDayVerified===true,
  vehicleIdentityConfirmed:ev.vehicleIdentityConfirmed===true,
  providerStopConfirmed:false,physicalStopVerified:false,eligibleForLed:false
 };
}

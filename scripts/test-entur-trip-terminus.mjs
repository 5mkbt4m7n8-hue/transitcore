import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patternInventory,resolveExactServiceJourneyPattern} from '../core/engines/entur-trip-pattern-link.mjs';
import {describeVerifiedTripTerminus} from '../core/engines/entur-trip-terminus.mjs';

const board=JSON.parse(readFileSync(new URL('../config/boards/trondheim-city-lines-catalog.json',import.meta.url)));
const all=patternInventory().get('1').patterns;
const expected={
 'outbound:32':{origin:'NSR:Quay:74983',end:'NSR:Quay:102721',label:'Østre Lund',short:false},
 'inbound:32':{origin:'NSR:Quay:102721',end:'NSR:Quay:74982',label:'Ranheim',short:false},
 'outbound:19':{origin:'NSR:Quay:73034',end:'NSR:Quay:75607',label:'Tillerterminalen',short:true},
 'inbound:19':{origin:'NSR:Quay:75606',end:'NSR:Quay:73033',label:'Strindheim',short:true}
};
for(const pattern of all){
 const expectedRoute=expected[pattern.directionType+':'+pattern.quays.length];
 assert(expectedRoute,'Every source pattern must belong to a known pilot variation');
 const ref='ATB:ServiceJourney:synthetic-pilot-test';
 const service={id:ref,line:{id:'ATB:Line:2_1'},
  journeyPattern:{id:pattern.id,directionType:pattern.directionType}};
 const joined=resolveExactServiceJourneyPattern({
  lineCode:'1',datedVehicleJourneyRef:ref,vehicleLineRef:'ATB:Line:2_1',
  serviceJourney:service
 });
 assert.equal(joined.status,'route-pattern-supported');
 const described=describeVerifiedTripTerminus({
  lineCode:'1',journeyEvidence:joined,quayCatalog:board,vehicleHeadsign:'Kattem'
 });
 assert.equal(described.status,'planned-terminus-supported');
 assert.equal(described.originQuayId,expectedRoute.origin);
 assert.equal(described.terminalQuayId,expectedRoute.end);
 assert.equal(described.terminalName,expectedRoute.label,
  'Use Quay label, not marketing route name or GPS headsign');
 assert.equal(described.shorterThanLongestKnownPattern,expectedRoute.short);
 assert.equal(described.operatingDayVerified,false);
 assert.equal(described.vehicleIdentityConfirmed,false);
 assert.equal(described.providerStopConfirmed,false);
 assert.equal(described.eligibleForLed,false);
 if(expectedRoute.label==='Østre Lund')assert.equal(described.headsignAgreement,'name-differs',
  'Kattem cannot replace the source-confirmed terminal Quay');
 const exact=describeVerifiedTripTerminus({
  lineCode:'1',journeyEvidence:joined,quayCatalog:board,
  vehicleHeadsign:expectedRoute.label
 });
 assert.equal(exact.headsignAgreement,'exact-name-match');
 const noName=describeVerifiedTripTerminus({
  lineCode:'1',journeyEvidence:joined,vehicleHeadsign:'Kattem'
 });
 assert.equal(noName.terminalName,null,'Never guess a terminal name if no Quay catalogue');
 assert.equal(noName.terminalQuayId,expectedRoute.end);
 assert.equal(noName.headsignAgreement,'terminal-name-unknown');
 const conflicting=describeVerifiedTripTerminus({
  lineCode:'1',journeyEvidence:{...joined,quays:[...joined.quays].reverse()},
  quayCatalog:board,vehicleHeadsign:expectedRoute.label
 });
 assert.equal(conflicting.status,'unresolved');
 assert.equal(conflicting.terminalQuayId,null);
 assert.equal(conflicting.eligibleForLed,false);
}
assert.equal(describeVerifiedTripTerminus({
 lineCode:'1',journeyEvidence:{status:'route-pattern-supported',
  source:'entur-transit-data-v1beta',lineId:'ATB:Line:2_1',
  patternId:all[0].id,directionType:all[0].directionType,quays:['NSR:Quay:1']}
}).status,'unresolved');
assert.equal(describeVerifiedTripTerminus({
 lineCode:'1',journeyEvidence:{status:'unresolved',reason:'unknown-trip',quays:[]}
}).status,'unresolved');
assert.equal(describeVerifiedTripTerminus({
 lineCode:'11',journeyEvidence:{status:'route-pattern-supported',
  source:'entur-transit-data-v1beta',lineId:'ATB:Line:2_1',quays:[]}
}).status,'unresolved');
console.log('8 source JourneyPatterns: Ranheim/Østre Lund main termini, shorter Strindheim/Tillerterminalen, exact Quay labels and headsign-only checks, fail-closed PASS');

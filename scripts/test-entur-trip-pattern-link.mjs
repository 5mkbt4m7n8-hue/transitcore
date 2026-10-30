import assert from 'node:assert/strict';
import {validatePatternCatalogue,patternInventory,resolveExactDatedJourney,inferSharedQuaySequence}
 from '../core/engines/entur-trip-pattern-link.mjs';

const all=validatePatternCatalogue();
assert.equal(all.get('1').patterns.length,8,'Live Entur line 1 has 8 source patterns');
assert.equal(all.get('11').patterns.length,7,'Live Entur line 11 has 7 source patterns');
assert.equal(patternInventory().get('11').lineId,'ATB:Line:2_11');
const l11=all.get('11');
const outbound=l11.patterns.find(x=>x.id.includes('_Outbound_')&&x.quays.includes('NSR:Quay:73565'));
const inbound=l11.patterns.find(x=>x.id.includes('_Inbound_')&&x.quays.includes('NSR:Quay:75463'));
assert(outbound&&inbound);
assert(!inbound.quays.includes('NSR:Quay:73565'),'Søndre Risvolltun Quay cannot be cloned to reverse trip');
assert(outbound.quays.includes('NSR:Quay:75464'),'Bukkvollan Stavset direction');
assert(inbound.quays.includes('NSR:Quay:75463'),'Bukkvollan Blakli direction');
assert(outbound.quays.includes('NSR:Quay:74393'),'Norrkøpingveien 769 not Nyborg 770');
assert(inbound.quays.includes('NSR:Quay:74213'),'Nyborg is a different Quay');
const l1=all.get('1');
assert(l1.patterns.some(p=>p.quays.length===19),'Line 1 short turn must be preserved');
assert(l1.patterns.some(p=>p.quays.length===32),'Line 1 full routes must be preserved');
const unique=(code)=>new Set(all.get(code).patterns.map(x=>x.quays.join('|'))).size;
assert.equal(unique('1'),4);assert.equal(unique('11'),3);
const first=outbound.quays.slice(1,3);
const seq=inferSharedQuaySequence({lineCode:'11',visitedQuays:first});
assert.equal(seq.status,'sequence-supported','Same physical sequence repeated with variants must not create false contradiction');
assert.equal(seq.tripIdentityConfirmed,false);
assert.equal(seq.providerStopConfirmed,false);
assert.equal(inferSharedQuaySequence({lineCode:'11',visitedQuays:[outbound.quays[2],outbound.quays[1]]}).status,'unresolved');
assert.equal(inferSharedQuaySequence({lineCode:'11',visitedQuays:['NSR:Quay:99999','NSR:Quay:99998']}).status,'unresolved');
assert.equal(inferSharedQuaySequence({lineCode:'11',visitedQuays:[outbound.quays[1]]}).status,'unresolved');
const date='2026-10-30',ref='ATB:DatedServiceJourney:pilot-verified-example';
const serviceId='ATB:ServiceJourney:pilot-verified-example';
const dated={id:ref,operatingDay:date,tripAlteration:'planned',
 journeyPattern:{id:outbound.id},
 serviceJourney:{id:serviceId,line:{id:'ATB:Line:2_11'},journeyPattern:{id:outbound.id}}};
const base={lineCode:'11',datedVehicleJourneyRef:ref,datedJourney:dated,serviceDate:date,
 vehicleLineRef:'ATB:Line:2_11'};
const ok=resolveExactDatedJourney(base);
assert.equal(ok.status,'linked');assert.equal(ok.providerStopConfirmed,false);
assert.deepEqual(ok.quays,outbound.quays);
const reject=(changes,reason)=>{
 const v=structuredClone(base);changes(v);
 const result=resolveExactDatedJourney(v);
 assert.equal(result.status,'unresolved');assert.equal(result.reason,reason);
};
reject(v=>{v.vehicleLineRef='ATB:Line:2_1'},'vehicle-line-mismatch');
reject(v=>{v.datedVehicleJourneyRef='ATB:DatedVehicleJourney:pilot-verified-example'},'unverified-siri-trip-id-type');
reject(v=>{v.datedJourney=null},'dated-id-unverified');
reject(v=>{v.datedJourney.id='ATB:DatedServiceJourney:other'},'dated-id-unverified');
reject(v=>{v.serviceDate='2026-10-29'},'operating-day-mismatch');
reject(v=>{v.datedJourney.tripAlteration='cancellation'},'trip-cancelled-or-replaced');
reject(v=>{v.datedJourney.serviceJourney.line.id='ATB:Line:2_1'},'service-journey-line-unverified');
reject(v=>{v.datedJourney.serviceJourney.journeyPattern.id=inbound.id},'journey-pattern-conflict');
reject(v=>{v.datedJourney.journeyPattern.id='ATB:JourneyPattern:unknown';v.datedJourney.serviceJourney.journeyPattern.id='ATB:JourneyPattern:unknown'},'pattern-not-in-verified-snapshot');
reject(v=>{v.expectedServiceJourneyId='ATB:ServiceJourney:other'},'service-journey-conflict');
assert.throws(()=>validatePatternCatalogue({schemaVersion:1,lines:{11:{lineId:'ATB:Line:2_11',patterns:[
 {id:'ATB:JourneyPattern:x',directionType:'inbound',quays:['NSR:Quay:1','other']}
]}}}),/Unsafe JourneyPattern/);
console.log('Entur 15 source JourneyPatterns: exact ordered Quay IDs, short turns, Bukkvollan, Norrkøpingveien, strict dated-journey identity fail-closed PASS');

import assert from 'node:assert/strict';
import {patternInventory} from '../core/engines/entur-trip-pattern-link.mjs';
import {inspectSharedQuayContext as check} from '../core/engines/entur-shared-quay-context.mjs';

const catalog=patternInventory().get('1');
const shared={
 'NSR:Quay:102733':{outbound:4,inbound:4,role:{outbound:'intermediate',inbound:'intermediate'}},
 'NSR:Quay:102721':{outbound:3,inbound:3,role:{outbound:'terminus',inbound:'origin'}}
};
for(const [id,spec] of Object.entries(shared)){
 for(const direction of ['outbound','inbound']){
  const patterns=catalog.patterns.filter(p=>p.directionType===direction&&p.quays.includes(id));
  assert.equal(patterns.length,spec[direction]);
  for(const p of patterns){
   const ev={status:'route-pattern-supported',source:'entur-transit-data-v1beta',
    lineId:catalog.lineId,patternId:p.id,directionType:p.directionType,
    quays:[...p.quays],vehicleIdentityConfirmed:true};
   const got=check({lineCode:'1',journeyEvidence:ev,quayId:id});
   assert.equal(got.status,'source-pattern-context-only');
   assert.equal(got.sourceDirection,direction);
   assert.equal(got.role,spec.role[direction]);
   assert.equal(got.sharedBetweenSourceDirections,true);
   assert.deepEqual(got.sourceDirectionsUsingQuay,['inbound','outbound']);
   assert.equal(got.physicalSideConfirmed,false);
   assert.equal(got.providerStopConfirmed,false);
   assert.equal(got.eligibleForLed,false);
   assert.equal(got.operatingDayVerified,false);
   if(got.role==='origin')assert.equal(got.previousPlannedQuayId,null);
   if(got.role==='terminus')assert.equal(got.nextPlannedQuayId,null);
  }
 }
}
const p=catalog.patterns.find(p=>p.directionType==='outbound'&&p.quays.includes('NSR:Quay:102733'));
const base={lineCode:'1',quayId:'NSR:Quay:102733',journeyEvidence:{
 status:'route-pattern-supported',source:'entur-transit-data-v1beta',
 lineId:catalog.lineId,patternId:p.id,directionType:p.directionType,
 quays:[...p.quays],vehicleIdentityConfirmed:true}};
const fail=(mutate,reason)=>{
 const copy=structuredClone(base);
 mutate(copy);
 const r=check(copy);
 assert.equal(r.status,'unresolved');
 assert.equal(r.reason,reason);
 assert.equal(r.eligibleForLed,false);
 assert.equal(r.physicalSideConfirmed,false);
};
fail(x=>x.journeyEvidence.vehicleIdentityConfirmed=false,'unlinked-source-vehicle');
fail(x=>x.journeyEvidence.status='unresolved','unlinked-source-vehicle');
fail(x=>x.journeyEvidence.lineId='ATB:Line:2_11','unlinked-source-vehicle');
fail(x=>x.journeyEvidence.quays.reverse(),'journey-pattern-conflict');
fail(x=>x.journeyEvidence.patternId='ATB:JourneyPattern:unverified','journey-pattern-conflict');
fail(x=>x.journeyEvidence.directionType='inbound','journey-pattern-conflict');
fail(x=>x.quayId='NSR:Quay:99999999','quay-not-in-actual-trip');
fail(x=>x.quayId='NSR:StopPlace:123','unknown-line-or-quay');
const other=catalog.patterns.find(p=>p.directionType==='outbound'&&p.quays.length===19);
const ref={...base,journeyEvidence:{...base.journeyEvidence,
 patternId:other.id,directionType:other.directionType,quays:[...other.quays]}};
assert.equal(check({...ref,quayId:'NSR:Quay:102721'}).reason,'quay-not-in-actual-trip',
 'Short turn cannot claim Østre Lund as its actual terminal');
console.log('Shared Quays: 8/8 Tonstadkrysset + 6/6 Østre Lund source patterns, exact trip direction/role, short turns and fail-closed LED PASS');

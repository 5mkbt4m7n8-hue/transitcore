import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzePublicIndex} from './probe-trondheim-source-priorities-live.mjs';
const now=Date.parse('2026-10-31T15:02:00Z');
const last='2026-10-31T15:00:10Z';
const reasons=['rendered','missingPosition','invalidTimestamp','stalePosition',
 'outsideCatalogRadius','unrenderedNearCatalog','unverifiableIdentity'];
const counts=(near=0,shown=10)=>Object.fromEntries(reasons.map(k=>[k,
 k==='unrenderedNearCatalog'?near:k==='rendered'?shown:0]));
const quality={
 version:1,sourceSamples:10,diagnosticSamples:8,issueCoverageSamples:8,
 lines:Object.fromEntries(['1','11','22'].map(code=>[code,{
  gps:2,siri:0,unresolved:0,gpsFrames:1,siriFrames:0,observedFrames:1,unresolvedFrames:0
 }])),
 sourceReconciliation:{
  version:1,samples:8,sourceRows:43,uniqueKnownVehicles:43,unlistedCode:0,
  lines:{'1':counts(8,10),'11':counts(0,10),'22':counts(4,11)},
  reasonFrames:{'1':{...counts(3,8)},'11':counts(0,8),
   '22':counts(2,8)}
 }
};
const index={version:1,boardProfile:'trondheim-city-lines-catalog',
 currentDay:'2026-10-31',days:[
 {day:'2026-10-31',count:180,last,multiLineQuality:quality}
]};
let result=analyzePublicIndex(index,{now});
assert.equal(result.state,'REPEATED_CANDIDATES');
assert.equal(result.day,'2026-10-31');
assert.equal(result.receivedSourceRows,43);
assert.equal(result.gpsSourceFrames,8);
assert.equal(result.reasons.unrenderedNearCatalog,12);
assert.equal(result.focus.length,2);
assert.deepEqual(result.focus.map(x=>x.code),['1','11']);
assert.equal(result.focus[0].nearNotRendered,8);
assert.equal(result.focus[0].separateFrames,3);
assert.equal(result.focus[1].status,'UNCONFIRMED');
assert.equal(result.topOtherCandidates.length,1);
assert.equal(result.topOtherCandidates[0].code,'22');
assert.equal(result.topOtherCandidates[0].separateFrames,2);
assert(!JSON.stringify(result).includes('NSR:Quay'));
result=analyzePublicIndex({...index,days:[{...index.days[0],
 multiLineQuality:{...quality,sourceReconciliation:{...quality.sourceReconciliation,
 samples:5,reasonFrames:{...quality.sourceReconciliation.reasonFrames}}}}]},{now});
assert.equal(result.state,'INSUFFICIENT_COVERAGE');
assert.equal(result.topOtherCandidates.length,0);
result=analyzePublicIndex({...index,days:[{...index.days[0],
 multiLineQuality:{...quality,sourceReconciliation:{...quality.sourceReconciliation,
 reasonFrames:undefined}}}]},{now});
assert.equal(result.state,'NO_REPEAT_CONFIRMED');
assert.equal(result.focus[0].separateFrames,null,'Legacy aggregate must not be guessed');
assert.equal(result.topOtherCandidates.length,0);
result=analyzePublicIndex({...index,days:[{...index.days[0],
 last:'2026-10-31T13:00:00Z'}]},{now});
assert.equal(result.state,'NO_VERIFIED_LIVE_HISTORY','Stale data cannot be live evidence');
assert.equal(result.reason,'STALE');
result=analyzePublicIndex({...index,days:[]},{now});
assert.equal(result.state,'NO_VERIFIED_LIVE_HISTORY');
const script=readFileSync(new URL('./probe-trondheim-source-priorities-live.mjs',import.meta.url),'utf8');
assert(script.includes("method:'GET'"));
assert(!script.includes('POST'));
assert(!script.includes('entur.io'));
assert(script.includes('GITHUB_STEP_SUMMARY'));
const wf=readFileSync(new URL('../.github/workflows/trondheim-quality-proof.yml',import.meta.url),'utf8');
assert(wf.includes('node scripts/test-trondheim-source-priority-live.mjs'));
assert(wf.includes('node scripts/probe-trondheim-source-priorities-live.mjs'));
console.log('Trondheim all-line live triage: 47-line anonymity, strict repeat/coverage gates, stale and old-frame guard PASS');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectIndex,inspectLatest,lastSlotQuery,API}
 from './probe-trondheim-quality-live.mjs';

const now=Date.parse('2026-10-31T15:15:00.000Z');
const last='2026-10-31T15:13:20.000Z';
const older='2026-10-31T12:00:00.000Z';
const goodLine={gps:4,siri:0,unresolved:2,gpsFrames:3,siriFrames:0,
 observedFrames:3,unresolvedFrames:2};
const quality={version:1,sourceSamples:20,diagnosticSamples:17,
 issueCoverageSamples:17,lines:{'1':goodLine,'11':goodLine},
 quayIssues:{'11|NSR:Quay:73414':{hits:2,frames:2}}};
const day={day:'2026-10-31',count:22,errors:2,last,
 multiLineQuality:quality};
const index={version:1,boardProfile:'trondheim-city-lines-catalog',
 currentDay:'2026-10-31',days:[day]};
const summary=inspectIndex(index,{now});
assert.equal(summary.state,'AGGREGATE_PRESENT');
assert.equal(summary.lineCount,2);
assert.equal(summary.daySamples,22);
assert.equal(summary.enrichedFrames,20);
assert.equal(summary.diagnosticFrames,17);
assert.equal(summary.quayCoverageFrames,17);
assert.equal(summary.latestAgeMinutes,1);
assert.equal(summary.lastCapturedAt,last);
const query=new URL(lastSlotQuery(summary));
assert.equal(query.origin,new URL(API).origin);
assert.equal(query.pathname,new URL(API).pathname);
assert.equal(query.searchParams.get('day'),'2026-10-31');
assert.equal(query.searchParams.get('limit'),'2');
assert.equal(query.searchParams.get('cursor'),
 String(Math.floor(Date.parse(last)/300000)*300000-300000));

const rawPage={version:1,day:'2026-10-31',records:[{
 status:'OK',capturedAt:last,
 lineQuality:{version:1,kind:'trondheim-multiline-quality-v1',
  diagnosticAvailable:true,issuesComplete:true,issues:[['11','NSR:Quay:73414',2]],
  lines:{'1':goodLine,'11':goodLine}}
}]};
assert.equal(inspectLatest(summary,rawPage).state,'ACTIVE');
assert.equal(inspectLatest(summary,rawPage).recentQuayCoverage,true);
assert.equal(inspectLatest(summary,{...rawPage,records:[{status:'ERROR'}]}).state,'LATEST_SOURCE_ERROR');
assert.equal(inspectLatest(summary,{...rawPage,records:[{status:'OK',capturedAt:last}]}).state,
 'RECENT_SLOT_UNENRICHED');
assert.equal(inspectLatest(summary,{...rawPage,day:'2026-10-30'}).state,
 'LATEST_SAMPLE_UNVERIFIED');
assert.equal(inspectLatest(summary,{...rawPage,records:[{
 ...rawPage.records[0],capturedAt:older}]}).state,'LATEST_SAMPLE_UNVERIFIED');
assert.equal(inspectIndex({...index,days:[{...day,multiLineQuality:undefined}]},{now}).state,
 'OLD_WORKER_OR_NOT_YET_ENRICHED');
assert.equal(inspectIndex({...index,days:[{...day,last:older}]},{now}).state,
 'STALE');
assert.equal(inspectIndex({...index,days:[]},{now}).state,'NO_SAMPLES');
assert.equal(inspectIndex({boardProfile:'wrong',version:1,days:[]},{now}).state,
 'INVALID_INDEX');
assert.equal(inspectIndex({...index,days:[{...day,multiLineQuality:{
 ...quality,diagnosticSamples:25}}]},{now}).state,'INVALID_AGGREGATE');
assert.equal(inspectIndex({...index,days:[{...day,multiLineQuality:{
 ...quality,sourceSamples:0,diagnosticSamples:0,issueCoverageSamples:0}}]},{now}).state,
 'NO_ENRICHED_FRAMES');
const script=readFileSync(new URL('./probe-trondheim-quality-live.mjs',import.meta.url),'utf8');
assert(script.includes("method:'GET'"));
assert(script.includes('GITHUB_STEP_SUMMARY'));
assert(!/process\.env\.(?:TOKEN|SECRET|PASSWORD|KEY)/.test(script));
const workflow=readFileSync(new URL('../.github/workflows/trondheim-quality-proof.yml',import.meta.url),'utf8');
assert(workflow.includes("probe-trondheim-quality-live.mjs"));
assert(workflow.includes("workflow_dispatch:"));
assert(workflow.includes("schedule:"));
assert(!workflow.includes('secrets.'));
console.log('Trondheim live quality proof: active/latest, legacy, stale, failures, partial coverage, bounded read-only fetch and workflow PASS');

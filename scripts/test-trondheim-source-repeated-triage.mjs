import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {rollupMultiLineQuality} from '../worker/trondheim-multiline-quality.mjs';
import {REASONS,SCOPE} from '../worker/trondheim-gps-source-reconciliation.mjs';
const require=createRequire(import.meta.url);
const {analyze}=require('../web/linear/network/source-reconciliation-triage.js');
const reasons=Object.fromEntries(REASONS.map(k=>[k,0]));
const source=(near=0)=>({version:1,scope:SCOPE,sourceRows:near+1,
 unlistedCode:0,uniqueKnownVehicles:near+1,lines:{
 '1':{...reasons,unrenderedNearCatalog:near,rendered:1},
 '11':{...reasons}
 }});
const quality=(near=0)=>({version:1,kind:'trondheim-multiline-quality-v1',
 diagnosticAvailable:false,issuesComplete:false,issues:[],
 lines:{'1':{siri:0,gps:0,estimated:0,ledOnly:0,unresolved:0,ambiguous:0},
 '11':{siri:0,gps:0,estimated:0,ledOnly:0,unresolved:0,ambiguous:0}},
 sourceDisposition:source(near)});
const sample=(near=0)=>({status:'OK',lineQuality:quality(near)});
let day=rollupMultiLineQuality(null,null,sample(7));
assert.equal(day.sourceReconciliation.samples,1);
assert.equal(day.sourceReconciliation.reasonFrames['1'].unrenderedNearCatalog,1,
 'Seven source observations in one slot are ONE frame, not seven');
assert.equal(day.sourceReconciliation.lines['1'].unrenderedNearCatalog,7);
assert.equal(day.sourceReconciliation.reasonFrames['11'].unrenderedNearCatalog,0);
day=rollupMultiLineQuality(day,sample(7),sample(7));
assert.equal(day.sourceReconciliation.samples,1,'Replay must never invent a second frame');
assert.equal(day.sourceReconciliation.reasonFrames['1'].unrenderedNearCatalog,1);
day=rollupMultiLineQuality(day,null,sample(2));
assert.equal(day.sourceReconciliation.samples,2);
assert.equal(day.sourceReconciliation.reasonFrames['1'].unrenderedNearCatalog,2);
assert.equal(day.sourceReconciliation.lines['1'].unrenderedNearCatalog,9);
day=rollupMultiLineQuality(day,sample(7),sample(0));
assert.equal(day.sourceReconciliation.samples,2);
assert.equal(day.sourceReconciliation.reasonFrames['1'].unrenderedNearCatalog,1,
 'Correction must subtract old source evidence');
assert.equal(day.sourceReconciliation.lines['1'].unrenderedNearCatalog,2);
day=rollupMultiLineQuality(day,sample(2),null);
assert.equal(day.sourceReconciliation.samples,1);
assert.equal(day.sourceReconciliation.reasonFrames['1'].unrenderedNearCatalog,0);
assert.equal(day.sourceReconciliation.lines['1'].unrenderedNearCatalog,0);
assert.equal(day.sourceReconciliation.reasonFrames['1'].rendered,1);
// Previously stored aggregate without per-reason frame counters is still
// valid but cannot be used to reconstruct frame-level recurrence.
const legacy={...day,sourceReconciliation:{...day.sourceReconciliation,reasonFrames:undefined}};
const upgraded=rollupMultiLineQuality(legacy,null,sample(2));
assert.equal(upgraded.sourceReconciliation.reasonFrames['1'].unrenderedNearCatalog,1);
assert.equal(upgraded.sourceReconciliation.samples,2);
assert.equal(upgraded.sourceReconciliation.lines['1'].unrenderedNearCatalog,2);
const legacyCorrection=rollupMultiLineQuality(
 {...day,sourceReconciliation:{...day.sourceReconciliation,reasonFrames:undefined}},
 sample(0),sample(0));
assert.equal(legacyCorrection.sourceReconciliation.reasonFrames['1'].unrenderedNearCatalog,0,
 'Replacing a pre-provenance sample must not create negative frame counts');

function dateEntry(date,samples=8,near=4,nearFrames=3,previousPossible=true){
 const s={...reasons,rendered:20,unrenderedNearCatalog:near,
  stalePosition:4,outsideCatalogRadius:3};
 const f={...reasons,rendered:8,unrenderedNearCatalog:nearFrames,
  stalePosition:4,outsideCatalogRadius:2};
 return {day:date,multiLineQuality:{version:1,
  sourceReconciliation:{version:1,samples,sourceRows:50,uniqueKnownVehicles:40,
   unlistedCode:10,lines:{'1':s,'11':{...reasons,rendered:15,unrenderedNearCatalog:0}},
   ...(previousPossible?{reasonFrames:{'1':f,'11':{...reasons,rendered:7}}}: {})}}};
}
const current=dateEntry('2026-10-31');
const yesterday=dateEntry('2026-10-30',8,6,2);
const distant=dateEntry('2026-10-28',8,6,2);
const report=analyze([current,yesterday],{day:'2026-10-31'});
assert.equal(report.status,'REPEATED_CANDIDATES');
assert.equal(report.sourceFrames,8);
assert.equal(report.candidates[0].code,'1');
assert.equal(report.candidates[0].status,'TWO_DAYS');
assert.equal(report.previousDay,'2026-10-30');
assert.equal(report.focus.length,2);
assert.equal(report.focus[1].code,'11');
assert.equal(report.focus[1].status,'UNCONFIRMED',
 'No issue is invented for line 11');
assert.equal(report.candidates.length,1);
assert.equal(analyze([current,distant]).candidates[0].status,'REPEATED');
assert.equal(analyze([current,distant]).previousDay,null);
assert.equal(analyze([dateEntry('2026-10-31',5,8,4)]).candidates.length,0,
 'Few sampled frames cannot prove recurrence');
assert.equal(analyze([dateEntry('2026-10-31',8,9,1)]).candidates.length,0,
 'Nine source rows in one frame cannot prove recurrence');
const old=dateEntry('2026-10-31',8,9,3,false);
assert.equal(analyze([old]).candidates.length,0);
assert(analyze([old]).sourceNotes.some(x=>x.includes('ikke antall forskjellige frames')));
assert.equal(analyze([{day:'2026-10-31'}]).status,'NO_SOURCE_DATA');
assert.equal(analyze([]).status,'NO_DAYS');
assert.equal(analyze([current],{day:'2026-10-29'}).status,'NO_DAYS',
 'Never silently substitute a different day');
const ui=readFileSync(new URL('../web/linear/quality-lines.html',import.meta.url),'utf8');
for(const anchor of ['sourceTriage','sourceTriageFocus','sourceTriageCandidates',
 'source-reconciliation-triage.js','renderSourceTriage()'])
 assert(ui.includes(anchor),'Missing UI hook: '+anchor);
const wf=readFileSync(new URL('../.github/workflows/linear-mobile.yml',import.meta.url),'utf8');
assert(wf.includes('node scripts/test-trondheim-source-repeated-triage.mjs'));
console.log('Source triage: distinct frames, no spurious errors, lines 1/11, direct prior day only, corrections, legacy samples, browser hooks PASS');

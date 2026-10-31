import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create}=require('../web/linear/network/line1-corridor-quality.js');
const A='NSR:Quay:102733',B='NSR:Quay:102720',C='NSR:Quay:102721',D='NSR:Quay:72955';
const patterns={lines:{'1':{patterns:[
 {directionType:'outbound',quays:[A,B,C]},
 {directionType:'outbound',quays:[A,B,C]},
 {directionType:'outbound',quays:[B,C]},
 {directionType:'inbound',quays:[C,D,A]}
]}}};
const profile={stops:[{id:A,name:'Tonstadkrysset'},
 {id:B,name:'Lerkendal'},{id:C,name:'Østre Lund'},{id:D,name:'Teststopp'}]};
const tracker=create({patterns,profile});
assert.equal(tracker.sections.length,5,'Deduplicate overlapping scheduled patterns, preserve both directions');
assert.equal(tracker.sections.find(x=>x.id==='outbound|'+A+'|'+B).patternCount,2);
assert.equal(tracker.analyze(null).status,'NO_DATA');
const missing={mode:'history',samples:9,diagnosticSamples:0,
 rows:[{quay:A,name:'Tonstadkrysset',gps:12,ledOnly:2,unresolved:0}]};
assert.equal(tracker.analyze(missing).status,'NO_SOURCE_DIAGNOSTICS',
 'GPS counts alone must not rank alleged bad route stretches');
assert.deepEqual(tracker.analyze(missing).sections,[]);
const clean={...missing,diagnosticSamples:4,rows:[{...missing.rows[0],unresolved:0}]};
assert.equal(tracker.analyze(clean).status,'NO_OBSERVED_ALERTS',
 'Zero actually confirmed unresolved GPS is not a manufactured incident');
const dayA={mode:'history',day:'2026-10-30',samples:70,diagnosticSamples:31,
 rows:[
 {quay:A,name:'Tonstadkrysset',unresolved:3,gps:10,siri:1,ledOnly:0},
 {quay:B,name:'Lerkendal',unresolved:1,gps:8,siri:3,ledOnly:0},
 {quay:C,name:'Østre Lund',unresolved:0,gps:7,siri:0,ledOnly:0},
 {quay:D,name:'Teststopp',unresolved:0,gps:2,siri:0,ledOnly:0}
 ]};
const before={mode:'history',day:'2026-10-29',samples:60,diagnosticSamples:10,
 rows:[{quay:A,unresolved:9,gps:1},{quay:B,unresolved:0,gps:3}]};
let report=tracker.analyze(dayA,{previous:before});
assert.equal(report.status,'OBSERVED_ALERTS');
assert.equal(report.totalSections,5);
assert.equal(report.sections[0].from,A);
assert.equal(report.sections[0].to,B);
assert.equal(report.sections[0].direction,'outbound');
assert.equal(report.sections[0].evidence.unresolved,4);
assert.equal(report.sections[0].observed.gps,18);
assert.equal(report.sections[0].previous.unresolved,9);
assert.equal(report.sections[0].previous.diagnosticSamples,10);
assert.equal(report.sections[0].diagnosticSamples,31);
assert.equal(report.sections[0].fromName,'Tonstadkrysset');
assert.equal(report.sections[0].toName,'Lerkendal');
assert(!JSON.stringify(report).includes('rate'),'Never claim an error rate for unequal samples');
assert.equal(tracker.analyze(dayA,{previous:{...before,diagnosticSamples:0}}).previousDay,null);
const limited=tracker.analyze(dayA,{limit:1});
assert.equal(limited.sections.length,1);
const live={mode:'live',samples:4,diagnosticSamples:0,rows:[
 {quay:A,lost:1,conflict:1,gap:0,gps:1,unresolved:9},
 {quay:B,lost:0,conflict:0,gap:0,gps:0,unresolved:0}
 ]};
report=tracker.analyze(live);
assert.equal(report.status,'OBSERVED_ALERTS');
assert.equal(report.sections[0].evidence.unresolved,0,'Unavailable GPS diagnostics cannot count as verified');
assert.equal(report.sections[0].evidence.conflict,1);
assert.equal(report.sections[0].evidence.lost,1);
const names=JSON.stringify(report);
assert(!names.includes('vehicleRef'));
assert.throws(()=>create({patterns:{}}),/patterns-required/);
console.log('Line 1 corridors: source-pattern direction only, dedup, endpoint GPS incidents, historical day comparison with unequal coverage and no invented segments PASS');

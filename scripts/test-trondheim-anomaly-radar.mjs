import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {summarizeMultiLineFrame,validatedMultiLineQuality,rollupMultiLineQuality}
 from '../worker/trondheim-multiline-quality.mjs';
import {recordDaySample,dayHistoryStorage} from '../worker/trondheim-history.mjs';
const require=createRequire(import.meta.url);
const radar=require('../web/linear/network/anomaly-radar.js');
const original=JSON.parse(readFileSync(new URL('../config/gps/atb-journey-patterns-1-11.json',import.meta.url),'utf8'));
const line11=original.lines['11'];
const a=line11.patterns.find(p=>p.quays.length>=3);
assert(a);
const q=a.quays[1],other=a.quays[2],code='11';
const board={id:'trondheim-city-lines-catalog',
 routes:['atb-bus-11-live','atb-bus-2-live'],nodes:[
  {led:1,quayId:q,stopIds:[q],routes:['atb-bus-11-live']},
  {led:2,quayId:other,stopIds:[other],routes:['atb-bus-11-live']},
  {led:3,quayId:'NSR:Quay:123',stopIds:['NSR:Quay:123'],routes:['atb-bus-2-live']}
 ]};
const time=Date.now(),stamp=new Date(time-1500).toISOString(),dayOf=at=>
 new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Oslo',year:'numeric',
 month:'2-digit',day:'2-digit'}).format(new Date(at));
function frame(at,quay=q){
 return {schemaVersion:1,boardProfile:board.id,generatedAt:at,
  sequence:Math.floor(Date.parse(at)/1000),ttlSeconds:30,ledCount:30,
  leds:[],gpsObservations:[
   {line:'11',status:'unresolved',nearestQuayId:quay,
    id:'PRIVATE-ONE',latitude:64,longitude:11},
   {line:'11',status:'unresolved',nearestQuayId:quay,
    id:'PRIVATE-ONE',latitude:64},
   {line:'11',status:'unresolved',nearestQuayId:quay,
    id:'PRIVATE-TWO'},
   {line:'2',status:'unresolved',nearestQuayId:q,id:'WRONG-LINE'},
   {line:'11',status:'unresolved',nearestQuayId:'NSR:Quay:999999',id:'NOT-ON-ROUTE'}
  ]};
}
const first=summarizeMultiLineFrame(frame(stamp),board);
assert(first.issuesComplete);
assert.deepEqual(first.issues,[['11',q,2]]);
assert.equal(first.lines['11'].unresolved,2);
assert.equal(first.lines['2'].unresolved,0);
assert(!JSON.stringify(first).includes('PRIVATE-ONE'));
assert(!JSON.stringify(first).includes('latitude'));
const safe=validatedMultiLineQuality(first);
assert.deepEqual(safe.issues,[['11',q,2]]);
assert.equal(validatedMultiLineQuality({...first,issues:[['11','NSR:Quay:wrong',2]]}),null);
assert.equal(validatedMultiLineQuality({...first,issues:[['11',q,-1]]}),null);
assert.equal(validatedMultiLineQuality({...first,issues:[['11',q,1],['11',q,1]]}),null);
assert.equal(validatedMultiLineQuality({...first,issues:[['900',q,1]]}),null);
const unavailable=summarizeMultiLineFrame({...frame(stamp),gpsObservations:undefined},board);
assert(!unavailable.issuesComplete);
assert.equal(unavailable.issues.length,0);
const tooMany=frame(stamp);
tooMany.gpsObservations=Array.from({length:201},(_,i)=>({
 line:'11',status:'unresolved',nearestQuayId:q,id:'BUS-'+i
}));
assert.equal(summarizeMultiLineFrame(tooMany,board).issues.length,1,
 '201 different vehicles at one known Quay is one Quay evidence key');
// Coverage is withheld if more than 200 *distinct* Quays have issues.
const manyBoard={...board,nodes:Array.from({length:201},(_,i)=>({
 led:i,quayId:'NSR:Quay:'+(10000+i),routes:['atb-bus-11-live']
}))};
const crowded=frame(stamp);
crowded.gpsObservations=Array.from({length:201},(_,i)=>({
 line:'11',status:'unresolved',nearestQuayId:'NSR:Quay:'+(10000+i),id:'X'+i
}));
const bounded=summarizeMultiLineFrame(crowded,manyBoard);
assert(!bounded.issuesComplete);
assert.equal(bounded.issues.length,0);
assert.equal(bounded.lines['11'].unresolved,201);

const mk=(d,sourceSamples,diagnosticSamples,unresolvedFrames,unresolved,
 quayFrames,issueCoverageSamples=diagnosticSamples)=>({
 day:d,multiLineQuality:{version:1,sourceSamples,diagnosticSamples,
 issueCoverageSamples,lines:{'11':{
  unresolvedFrames,unresolved,gps:1,siri:0,ledOnly:0,estimated:0,
  ambiguous:0,gpsFrames:1,observedFrames:1}},
 quayIssues:quayFrames?{['11|'+q]:{frames:quayFrames,hits:quayFrames*2}}:{}}});
const d1='2026-10-30',d2='2026-10-31';
const d0='2026-10-29';
const yesterday=mk(d1,30,20,3,8,3);
const today=mk(d2,18,8,2,5,2);
const result=radar.analyze([yesterday,today],{day:d2});
assert.equal(result.status,'OBSERVED_ISSUES');
assert.equal(result.previousDay,d1);
assert.equal(result.lineAlerts[0].status,'TWO_DAYS');
assert.equal(result.quayAlerts[0].status,'TWO_DAYS');
assert.equal(result.quayAlerts[0].previousFrames,3);
const segments=radar.adjacentSections(result.quayAlerts,{lines:{'11':line11}});
assert(segments.length>=1,'A real verified JourneyPattern must give a candidate adjacent Quay');
assert(segments.some(section=>section.issues.includes(q)));
assert(segments.every(section=>section.from===q||section.to===q));
assert(segments.every(section=>['inbound','outbound'].includes(section.direction)));
assert(!radar.adjacentSections([{...result.quayAlerts[0],code:'53'}],
 {lines:{'11':line11}}).length,'Never fabricate sections for excluded patterns');
const one=radar.analyze([mk(d2,15,10,1,8,1)]);
assert.equal(one.lineAlerts.length,0,'Many rejections in a single frame are not repeated');
assert.equal(one.quayAlerts.length,0);
assert(one.watch.length>0);
const noGps=radar.analyze([mk(d2,10,1,4,10,4)]);
assert.equal(noGps.status,'INSUFFICIENT_COVERAGE');
assert.equal(noGps.lineAlerts.length,0);
assert.equal(noGps.quayAlerts.length,0);
const noQuayCoverage=radar.analyze([mk(d2,20,12,3,7,3,1)]);
assert.equal(noQuayCoverage.lineAlerts.length,1);
assert.equal(noQuayCoverage.quayAlerts.length,0);
const nonconsecutive=radar.analyze([mk(d0,30,20,5,9,5),today],{day:d2});
assert.equal(nonconsecutive.lineAlerts[0].status,'REPEATED');
assert.equal(nonconsecutive.previousDay,null,'Pinned demo or distant day cannot confirm consecutive recurrence');
assert.equal(radar.analyze([mk(d2,20,8,0,0,0)]).status,'NO_REPEATED_ISSUES');
assert.equal(radar.analyze([{day:d2}]).status,'NO_SOURCE_DATA');
assert.equal(radar.analyze([]).status,'NO_DAYS');

const counted=rollupMultiLineQuality(null,null,{status:'OK',lineQuality:first});
assert.equal(counted.issueCoverageSamples,1);
assert.deepEqual(counted.quayIssues['11|'+q],{hits:2,frames:1});
const twice=rollupMultiLineQuality(counted,null,{status:'OK',lineQuality:first});
assert.deepEqual(twice.quayIssues['11|'+q],{hits:4,frames:2});
const corrected=rollupMultiLineQuality(twice,{status:'OK',lineQuality:first},
 {status:'OK',lineQuality:unavailable});
assert.equal(corrected.issueCoverageSamples,1);
assert.deepEqual(corrected.quayIssues['11|'+q],{hits:2,frames:1});
const erased=rollupMultiLineQuality(corrected,{status:'OK',lineQuality:first},null);
assert.equal(erased.issueCoverageSamples,0);
assert.deepEqual(erased.quayIssues,{});
class Storage{
 data=new Map();
 async get(k){return this.data.get(k)}
 async put(k,v){this.data.set(k,structuredClone(v))}
 async delete(k){this.data.delete(k)}
 async list({prefix='',limit=1000,startAfter=''}){return new Map([...this.data]
  .filter(([k])=>k.startsWith(prefix)&&k>startAfter)
  .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))}
}
const store=new Storage(),raw=frame(stamp);
await recordDaySample(store,{capturedAt:stamp,frame:raw,lineQuality:first});
let index=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
const available=index.days[0].multiLineQuality;
assert.equal(available.issueCoverageSamples,1);
assert.equal(available.quayIssues['11|'+q].hits,2);
assert.equal(available.quayIssues['11|'+q].frames,1);
await recordDaySample(store,{capturedAt:stamp,frame:raw,lineQuality:first});
index=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
assert.equal(index.days[0].multiLineQuality.quayIssues['11|'+q].frames,1);
await recordDaySample(store,{capturedAt:stamp,frame:raw,lineQuality:unavailable});
index=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
assert.equal(index.days[0].multiLineQuality.issueCoverageSamples,0);
assert(!index.days[0].multiLineQuality.quayIssues['11|'+q]);

const html=readFileSync(new URL('../web/linear/quality-lines.html',import.meta.url),'utf8');
for(const id of ['radarStatus','radarLines','radarQuays','radarSections','onlyRecurring',
 './network/anomaly-radar.js'])assert(html.includes(id),'UI hook missing '+id);
assert(html.includes('getPatterns()'));
const workflow=readFileSync(new URL('../.github/workflows/linear-mobile.yml',import.meta.url),'utf8');
assert(workflow.includes('node scripts/test-trondheim-anomaly-radar.mjs'));
console.log('Trondheim anomaly radar: repeat threshold, Quay evidence, true consecutive days, no false gaps, planned adjacency, source isolation, DO correction and UI hooks PASS');

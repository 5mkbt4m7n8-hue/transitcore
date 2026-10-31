import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateStrictShadow,validateStrictShadow,LIVE_REJECT_REASONS}
 from '../worker/trondheim-strict-shadow.mjs';
import {rollupMultiLineQuality} from '../worker/trondheim-multiline-quality.mjs';
import {inspectNamedQuays,interpretDailyStrictReasons}
 from './probe-trondheim-strict-root-causes-live.mjs';
const now=Date.parse('2026-10-31T14:00:00Z');
const t=new Date(now-1000).toISOString();
const route='atb-bus-11-live',r=(id,name)=>({[route]:{
 directionIds:[id],destinationMatches:[name]}});
const station={
 led:1,lat:63.42,lon:10.38,quayId:'NSR:Quay:123456',
 stationId:'NSR:StopPlace:123',stopIds:['NSR:Quay:123456'],
 routes:[route],routeDirections:r('1','Blakli')
};
const rival={...station,led:2,lon:10.3801,quayId:'NSR:Quay:123457',
 stopIds:['NSR:Quay:123457'],routeDirections:r('0','Stavset')};
const isolated={...station,led:3,lon:10.52,quayId:'NSR:Quay:123458',
 stopIds:['NSR:Quay:123458']};
const board={id:'trondheim-city-lines-catalog',routes:[route],
 nodes:[station,rival,isolated],render:{arrivalRadiusMeters:85,freshnessSeconds:60}};
const profiles=[{id:route,line:{publicCode:'11'},
 directions:[{destinationMatches:['Blakli']},{destinationMatches:['Stavset']}]}];
const mk=(id,node=station,x={})=>({
 id,latitude:node.lat,longitude:node.lon,
 publicCode:'11',destination:'Blakli',timestamp:t,...x
});
const vehicles=[
 mk('a'), // within competitor gap, live and rejected
 mk('b',rival,{destination:'Blakli'}), // nearest Quay serves opposite direction
 mk('c',isolated), // matched live
 mk('d',isolated,{timestamp:new Date(now-90000).toISOString()}), // old live
 mk('e',isolated,{latitude:isolated.lat+.00063}), // radius 60 reject / 85 match
 mk('f',isolated,{destination:'X'}), // unknown heading live
];
const frame={boardProfile:board.id,leds:[
 {id:1,occupants:[{id:'a',line:'11',positionType:'gps-nearest-stop'},
  {id:'d',line:'11',positionType:'gps-nearest-stop'}]},
 {id:2,occupants:[{id:'b',line:'11',positionType:'gps-nearest-stop'}]},
 {id:3,occupants:[{id:'c',line:'11',positionType:'gps-nearest-stop'},
  {id:'f',line:'11',positionType:'gps-nearest-stop'}]}
]};
const prior=JSON.stringify(frame);
const sample=evaluateStrictShadow({board,profiles,vehicles,frame,now});
assert.equal(JSON.stringify(frame),prior);
const c=sample.lines['11'];
assert.equal(c.liveRendered,5);
assert.equal(c.liveRejectedByStrict60,4);
assert.equal(c.liveRejectReasons60.competingQuay,1);
assert.equal(c.liveRejectReasons60.routeOrDirectionUnresolved,2);
assert.equal(c.liveRejectReasons60.invalidOrStaleTime,1);
assert.equal(c.liveRejectReasons60.outsideRadius,0,
 'Non-rendered positions must NOT inflate live rejection reasons');
assert.equal(c.liveRejectReasons60.matched,undefined);
assert.equal(LIVE_REJECT_REASONS.reduce((s,k)=>s+c.liveRejectReasons60[k],0),
 c.liveRejectedByStrict60);
assert.equal(c.radiusOnlyGain85,1);
assert.deepEqual({...validateStrictShadow(sample).lines},sample.lines);
assert.equal(validateStrictShadow({...sample,lines:{'11':{...c,
 liveRejectReasons60:{...c.liveRejectReasons60,competingQuay:2}}}}),null,
 'Cannot report reason breakdown with mismatch to actual rejected count');
assert.equal(validateStrictShadow({...sample,lines:{'11':{...c,
 liveRejectReasons60:{...c.liveRejectReasons60,competingQuay:-1}}}}),null);
const raw={status:'OK',lineQuality:{
 version:1,kind:'trondheim-multiline-quality-v1',diagnosticAvailable:false,
 issuesComplete:false,issues:[],
 lines:{'11':{siri:0,gps:0,estimated:0,ledOnly:0,unresolved:0,ambiguous:0}},
 sourceDisposition:{version:1,scope:'provider-input-render-reconciliation-v1',
 sourceRows:6,unlistedCode:0,uniqueKnownVehicles:6,
 lines:{'11':{rendered:5,missingPosition:0,invalidTimestamp:0,stalePosition:1,
 outsideCatalogRadius:0,unrenderedNearCatalog:0,unverifiableIdentity:0}},
 strictShadow:sample}
}};
let agg=rollupMultiLineQuality(null,null,raw);
assert.equal(agg.sourceReconciliation.strictShadow.liveReasonSamples,1);
assert.equal(agg.sourceReconciliation.strictShadow.lines['11']
 .liveRejectReasons60.competingQuay,1);
agg=rollupMultiLineQuality(agg,raw,raw);
assert.equal(agg.sourceReconciliation.strictShadow.liveReasonSamples,1);
agg=rollupMultiLineQuality(agg,raw,null);
assert.equal(agg.sourceReconciliation.strictShadow.liveReasonSamples,0);
assert.equal(agg.sourceReconciliation.strictShadow.lines['11']
 .liveRejectReasons60.competingQuay,0);
const legacy={...sample,lines:{'11':{...c}}};
delete legacy.lines['11'].liveRejectReasons60;
assert.equal(validateStrictShadow(legacy).lines['11'].liveRejectReasons60,undefined);
const historic={...raw,lineQuality:{...raw.lineQuality,
 sourceDisposition:{...raw.lineQuality.sourceDisposition,strictShadow:legacy}}};
agg=rollupMultiLineQuality(null,null,historic);
assert.equal(agg.sourceReconciliation.strictShadow.liveReasonSamples,0,
 'Historical samples cannot invent missing live reason provenance');
agg=rollupMultiLineQuality(agg,null,raw);
assert.equal(agg.sourceReconciliation.strictShadow.liveReasonSamples,1);
agg=rollupMultiLineQuality(agg,historic,raw);
assert.equal(agg.sourceReconciliation.strictShadow.liveReasonSamples,2,
 'One old slot replaced with covered slot increases coverage; new frame remains');
const line={...c,liveRendered:5,liveRejectedByStrict60:4,liveRejectReasons60:{
 ...c.liveRejectReasons60}};
const index={version:1,boardProfile:'trondheim-city-lines-catalog',
 currentDay:'2026-10-31',days:[{day:'2026-10-31',count:10,errors:0,
 last:'2026-10-31T13:59:00Z',
 multiLineQuality:{version:1,sourceSamples:10,diagnosticSamples:2,
 issueCoverageSamples:2,lines:{'11':{
 gps:0,siri:0,unresolved:0,gpsFrames:0,siriFrames:0,observedFrames:0,unresolvedFrames:0}},
 sourceReconciliation:{strictShadow:{scope:'trondheim-strict-route-gps-shadow-v1',
 samples:3,liveReasonSamples:1,lines:{'11':line}}}}}]};
const evidence=interpretDailyStrictReasons(index,{now});
assert.equal(evidence.status,'LIVE_REJECTION_CAUSES_ACTIVE');
assert.equal(evidence.framesWithLiveReasons,1);
assert.equal(evidence.focus[1].line,'11');
assert.equal(evidence.focus[1].knownReasons60.competingQuay,1);
assert.equal(interpretDailyStrictReasons(index,{now:now+3600000}).status,'NO_CURRENT_EVIDENCE');
const config={
 board:{nodes:[{...station,name:'Lerkendal'}]},
 profiles:[{line:{publicCode:'11'},stops:[
 {id:'NSR:Quay:123456',name:'Lerkendal'},
 {id:'NSR:Quay:123999',name:'Lerkendal gård'}]}],
 competitors:{quays:[['NSR:Quay:123499','NSR:StopPlace:123',63.42,10.3801]}
};
const focus=inspectNamedQuays(config);
assert.equal(focus[0].place,'Lerkendal');
assert.equal(focus[0].quaysWithin60,1);
assert.equal(focus[1].state,'PLANNED_QUAY_NOT_IN_LED_CATALOG');
const wf=readFileSync(new URL('../.github/workflows/trondheim-quality-proof.yml',import.meta.url),'utf8');
assert(wf.includes('node scripts/test-trondheim-strict-root-causes.mjs'));
assert(wf.includes('node scripts/probe-trondheim-strict-root-causes-live.mjs'));
const html=readFileSync(new URL('../web/linear/quality-lines.html',import.meta.url),'utf8');
assert(html.includes('strictRejectReasonRows'));
console.log('Trondheim strict rejection: exact live source cause split, historical coverage, slot corrections, static Lerkendal Quay distances and no GPS/ID retention PASS');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateStrictShadow,validateStrictShadow,SCOPE,REASONS,EXTRA}
 from '../worker/trondheim-strict-shadow.mjs';
import {validatedGpsReconciliation}
 from '../worker/trondheim-gps-source-reconciliation.mjs';
import {rollupMultiLineQuality}
 from '../worker/trondheim-multiline-quality.mjs';
import {recordScheduledTrondheimFrame,dayHistoryStorage}
 from '../worker/trondheim-history.mjs';
const now=Date.now(),stamp=new Date(now-1000).toISOString();
const line='atb-bus-1-live';
const rule=(directionId,name)=>({[line]:{
 directionIds:[directionId],destinationMatches:[name]}});
const isolated={led:1,quayId:'NSR:Quay:900001',stationId:'NSR:StopPlace:9001',
 lat:63.43,lon:10.35,routes:[line],stopIds:['NSR:Quay:900001'],
 routeDirections:rule('1','Ranheim')};
const sideA={led:2,quayId:'NSR:Quay:900002',stationId:'NSR:StopPlace:9002',
 lat:63.42,lon:10.38,routes:[line],stopIds:['NSR:Quay:900002'],
 routeDirections:rule('1','Ranheim')};
const sideB={led:3,quayId:'NSR:Quay:900003',stationId:'NSR:StopPlace:9002',
 lat:63.42003,lon:10.3802,routes:[line],stopIds:['NSR:Quay:900003'],
 routeDirections:rule('0','Kattem')};
const board={id:'trondheim-city-lines-catalog',nodes:[isolated,sideA,sideB],
 routes:[line],render:{arrivalRadiusMeters:85,freshnessSeconds:60}};
const profiles=[{id:line,line:{publicCode:'1'},
 directions:[{destinationMatches:['Ranheim']}]}];
const vehicle=(id,n=isolated,more={})=>({id,publicCode:'1',
 latitude:n.lat,longitude:n.lon,destination:'Ranheim',timestamp:stamp,...more});
const secret='PRIVATE-ID-NOT-FOR-STORAGE';
const vehicles=[
 vehicle(secret),
 vehicle('70m',isolated,{latitude:isolated.lat+.00063}),
 vehicle('same-station-ambiguous',sideA),
 vehicle('wrong-direction-quay',sideB),
 vehicle('wrong-led',isolated),
 vehicle('not-visible',isolated),
 vehicle('old-gps',isolated,{timestamp:new Date(now-90000).toISOString()})
];
const frame={schemaVersion:1,boardProfile:board.id,generatedAt:stamp,
 sequence:Math.floor(now/1000),ttlSeconds:30,ledCount:4,
 leds:[{id:1,state:'APPROACHING',occupants:[
  {id:secret,line:'1',positionType:'gps-nearest-stop'}
 ]},{id:2,state:'APPROACHING',occupants:[
  {id:'same-station-ambiguous',line:'1',positionType:'gps-nearest-stop'},
  {id:'wrong-direction-quay',line:'1',positionType:'gps-nearest-stop'},
  {id:'wrong-led',line:'1',positionType:'gps-nearest-stop'}
 ]}]};
const before=JSON.stringify(frame);
const summary=evaluateStrictShadow({board,profiles,vehicles,frame,now});
assert.equal(JSON.stringify(frame),before,'Shadow must not change the live PixelFrame');
assert.equal(summary.scope,SCOPE);
assert.equal(summary.identified,7);
const c=summary.lines['1'];
assert.equal(c.matched,3,'Isolated, 70m source radius, and wrong-led are strictly matchable');
assert.equal(c.outsideRadius,1);
assert.equal(c.strict85Match,4);
assert.equal(c.radiusOnlyGain85,1);
assert.equal(c.routeOrDirectionUnresolved,1);
assert.equal(c.competingQuay,1);
assert.equal(c.invalidOrStaleTime,1);
assert.equal(c.liveRendered,4);
assert.equal(c.liveRejectedByStrict60,2);
assert.equal(c.liveDifferentLedStrict60,1);
assert.equal(c.liveSideUnresolved,2);
assert.equal(c.strict60NotLive,1);
assert(!JSON.stringify(summary).includes(secret));
assert(!JSON.stringify(summary).includes('latitude'));
assert.deepEqual({...validateStrictShadow(summary).lines},summary.lines);
assert.equal(validateStrictShadow({...summary,identified:5}),null);
assert.equal(validateStrictShadow({...summary,lines:{'1':{...c,competingQuay:-1}}}),null);
assert.equal(validateStrictShadow({...summary,lines:{'1':{...c,liveDifferentLedStrict60:50}}}),null);
assert.equal(evaluateStrictShadow({...{board,profiles,vehicles,frame,now},
 board:{...board,id:'not-catalog'}}),null);
// Invariant: strict rules do not "prove" a physical side, a bus visit, or
// travel on any planned A/B/C segment.
for(const key of [...REASONS,...EXTRA])
 assert(!/physical|passed|confirmedAtStop|stoppedAt/i.test(key));
const base={
 version:1,scope:'provider-input-render-reconciliation-v1',sourceRows:vehicles.length,
 unlistedCode:0,uniqueKnownVehicles:vehicles.length,strictShadow:summary,
 lines:{'1':{rendered:0,missingPosition:0,invalidTimestamp:0,stalePosition:0,
 outsideCatalogRadius:0,unrenderedNearCatalog:vehicles.length,unverifiableIdentity:0}}
};
assert.equal(validatedGpsReconciliation(base).strictShadow.lines['1'].strict85Match,4);
assert.equal(validatedGpsReconciliation({...base,strictShadow:{...summary,identified:1}})
 .strictShadow,undefined,'Invalid optional shadow must not break source diagnostics');
const counts={siri:0,gps:0,estimated:0,ledOnly:0,unresolved:0,ambiguous:0};
const quality={version:1,kind:'trondheim-multiline-quality-v1',
 diagnosticAvailable:false,lines:{'1':counts},issuesComplete:false,issues:[],
 sourceDisposition:base};
const one={status:'OK',lineQuality:quality};
let aggregate=rollupMultiLineQuality(null,null,one);
assert.equal(aggregate.sourceReconciliation.strictShadow.samples,1);
assert.equal(aggregate.sourceReconciliation.strictShadow.lines['1'].matched,3);
aggregate=rollupMultiLineQuality(aggregate,one,one);
assert.equal(aggregate.sourceReconciliation.strictShadow.samples,1);
aggregate=rollupMultiLineQuality(aggregate,one,null);
assert.equal(aggregate.sourceReconciliation.strictShadow.samples,0);
assert.equal(aggregate.sourceReconciliation.strictShadow.lines['1'].matched,0);

class Storage{
 data=new Map();
 async get(k){return this.data.get(k)}
 async put(k,v){this.data.set(k,structuredClone(v))}
 async delete(k){this.data.delete(k)}
 async list({prefix='',limit=1000,startAfter=''}){return new Map([...this.data]
  .filter(([k])=>k.startsWith(prefix)&&k>startAfter)
  .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))}
}
const store=new Storage(),env={DEVICE_STATUS:{idFromName:x=>x,get:()=>({
 fetch:(url,opts)=>dayHistoryStorage(store,new Request(url,opts))
})}};
await recordScheduledTrondheimFrame(env,frame,'',stamp,board,base);
const index=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history'))
 .then(r=>r.json());
assert.equal(index.days[0].multiLineQuality.sourceReconciliation.strictShadow.samples,1);
const day=index.days[0].day;
const rows=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history?day='+day))
 .then(r=>r.json());
assert.equal(rows.records[0].lineQuality.sourceDisposition.strictShadow.lines['1'].strict85Match,4);
assert(!JSON.stringify(rows.records[0].lineQuality).includes(secret));
const main=readFileSync(new URL('../worker/led-feed-worker.mjs',import.meta.url),'utf8');
assert(main.includes('evaluateStrictShadow('));
assert(main.includes('reportGpsQuality&&board.id'));
const workflow=readFileSync(new URL('../.github/workflows/linear-mobile.yml',import.meta.url),'utf8');
assert(workflow.includes('node scripts/test-trondheim-strict-gps-shadow.mjs'));
console.log('Shadow PR279 GPS subset: 60/85m, side competition, direction gate, unchanged LED, anonymized DO rollup and safe replay PASS');

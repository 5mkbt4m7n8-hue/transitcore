import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileTrondheimGpsSource,validatedGpsReconciliation,SCOPE,REASONS}
 from '../worker/trondheim-gps-source-reconciliation.mjs';
import {recordScheduledTrondheimFrame,dayHistoryStorage}
 from '../worker/trondheim-history.mjs';
import {rollupMultiLineQuality} from '../worker/trondheim-multiline-quality.mjs';
const at=Date.now(),timestamp=new Date(at).toISOString();
const board={
 id:'trondheim-city-lines-catalog',routes:['atb-bus-1-live','atb-bus-11-live'],
 render:{approachRadiusMeters:250,freshnessSeconds:60},
 nodes:[
 {led:1,lat:63.416,lon:10.400,quayId:'NSR:Quay:73420',routes:['atb-bus-1-live']},
 {led:2,lat:63.418,lon:10.405,quayId:'NSR:Quay:73421',routes:['atb-bus-11-live']}
 ]};
const profiles=[
 {id:'atb-bus-1-live',line:{publicCode:'1'}},
 {id:'atb-bus-11-live',line:{publicCode:'11'}}
];
const fake=(id,code,extra={})=>({id,publicCode:code,latitude:63.416,longitude:10.400,
 timestamp,...extra});
const privateId='PRIVATE-BUS-1001';
const vehicles=[
 fake(privateId,'1'),
 fake(privateId,'1',{timestamp:new Date(at-1000).toISOString()}),
 fake('no-coordinates','1',{latitude:null,longitude:null}),
 fake('invalid-time','1',{timestamp:null}),
 fake('stale','1',{timestamp:new Date(at-120000).toISOString()}),
 fake('outside','1',{latitude:60.0,longitude:10.4}),
 fake('near-but-not-rendered','1'),
 fake('correct-11','11',{latitude:63.418,longitude:10.405}),
 fake('missing-id','11',{id:null}),
 fake('not-catalog','999'),
 fake('provider-shape','1',{frameCompatibility:{
  id:'OTHER',publicCode:'1',latitude:63.416,longitude:10.400,
  timestamp:timestamp}})
];
const frame={schemaVersion:1,boardProfile:board.id,generatedAt:timestamp,
 sequence:Math.floor(at/1000),ttlSeconds:30,ledCount:3,
 leds:[
 {id:1,state:'APPROACHING',occupants:[{id:privateId,line:'1'}]},
 {id:2,state:'APPROACHING',occupants:[{id:'correct-11',line:'11'}]}
 ]};
const before=JSON.stringify(frame);
const source=reconcileTrondheimGpsSource({board,profiles,vehicles,frame,now:at});
assert.equal(source.scope,SCOPE);
assert.equal(source.sourceRows,vehicles.length);
assert.equal(source.unlistedCode,1);
assert.equal(source.uniqueKnownVehicles,9);
assert.equal(source.lines['1'].rendered,1);
assert.equal(source.lines['1'].missingPosition,1);
assert.equal(source.lines['1'].invalidTimestamp,1);
assert.equal(source.lines['1'].stalePosition,1);
assert.equal(source.lines['1'].outsideCatalogRadius,1);
assert.equal(source.lines['1'].unrenderedNearCatalog,2);
assert.equal(source.lines['11'].rendered,1);
assert.equal(source.lines['11'].unverifiableIdentity,1);
assert.equal(JSON.stringify(frame),before,'Public PixelFrame is unaffected');
assert(!JSON.stringify(source).includes(privateId));
assert(!JSON.stringify(source).includes('latitude'));
assert.deepEqual({...validatedGpsReconciliation(source).lines},source.lines);
assert.equal(validatedGpsReconciliation({...source,sourceRows:0}),null);
assert.equal(validatedGpsReconciliation({...source,lines:{...source.lines,'bogus-id':{}}}),null);
assert.equal(validatedGpsReconciliation({...source,lines:{'1':{...source.lines['1'],
 stalePosition:-1}}}),null);
assert.equal(reconcileTrondheimGpsSource({...{board,profiles,vehicles,frame,now:at},
 board:{...board,id:'other'}}),null);
assert.equal(reconcileTrondheimGpsSource({board,profiles,vehicles:[],frame,now:at}).uniqueKnownVehicles,0);
// Nothing in this analysis claims a missing bus physically skipped a stop.
assert(!REASONS.includes('skippedStop'));
assert(!REASONS.includes('wrongQuay'));
assert(!REASONS.includes('gpsError'));

class Storage{
 data=new Map();
 async get(k){return this.data.get(k)}
 async put(k,v){this.data.set(k,structuredClone(v))}
 async delete(k){this.data.delete(k)}
 async list({prefix='',limit=1000,startAfter=''}){return new Map([...this.data]
  .filter(([k])=>k.startsWith(prefix)&&k>startAfter)
  .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))}
}
const store=new Storage(),env={DEVICE_STATUS:{idFromName:k=>k,get:()=>({
 fetch:(url,opts)=>dayHistoryStorage(store,new Request(url,opts))
})}};
const write=await recordScheduledTrondheimFrame(env,frame,'',timestamp,board,source);
assert.equal(write.status,'OK');
const index=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
const meta=index.days[0].multiLineQuality;
assert.equal(meta.sourceReconciliation.samples,1);
assert.equal(meta.sourceReconciliation.lines['1'].outsideCatalogRadius,1);
assert.equal(meta.sourceReconciliation.uniqueKnownVehicles,9);
assert(!JSON.stringify(meta.sourceReconciliation).includes(privateId));
const day=index.days[0].day;
const rows=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history?day='+day))
 .then(r=>r.json());
assert.equal(rows.records[0].lineQuality.sourceDisposition.lines['1'].stalePosition,1);
assert(!JSON.stringify(rows.records[0].lineQuality).includes(privateId));
assert.equal(rows.records[0].frame.leds.length,frame.leds.length);

const correction={...source,sourceRows:0,unlistedCode:0,uniqueKnownVehicles:0,
 lines:Object.fromEntries(Object.entries(source.lines).map(([k])=>[k,
  Object.fromEntries(REASONS.map(x=>[x,0]))]))};
await recordScheduledTrondheimFrame(env,frame,'',timestamp,board,correction);
const after=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
assert.equal(after.days[0].multiLineQuality.sourceReconciliation.samples,1,
 'Retry replaces a slot rather than incrementing the sample count');
assert.equal(after.days[0].multiLineQuality.sourceReconciliation.lines['1'].outsideCatalogRadius,0);
assert.equal(after.days[0].multiLineQuality.sourceReconciliation.uniqueKnownVehicles,0);
assert.equal(rollupMultiLineQuality(null,null,{status:'OK',
 lineQuality:rows.records[0].lineQuality}).sourceReconciliation.samples,1);
const html=readFileSync(new URL('../web/linear/quality-lines.html',import.meta.url),'utf8');
assert(html.includes('gpsSourceSection')&&html.includes('renderSourceDisposition('));
const wf=readFileSync(new URL('../.github/workflows/linear-mobile.yml',import.meta.url),'utf8');
assert(wf.includes('node scripts/test-trondheim-gps-source-reconciliation.mjs'));
const worker=readFileSync(new URL('../worker/led-feed-worker.mjs',import.meta.url),'utf8');
assert(worker.includes('reportGpsQuality(reconcileTrondheimGpsSource'));
assert(worker.includes('source==="history"&&boardId==="trondheim-city-lines-catalog"'));
console.log('Trondheim GPS source-to-render: 7 reasons, no extra calls, no raw ID storage, idempotent DO history, unchanged frame PASS');

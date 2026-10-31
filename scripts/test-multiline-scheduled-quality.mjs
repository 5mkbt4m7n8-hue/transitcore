import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeMultiLineFrame,validatedMultiLineQuality,rollupMultiLineQuality}
 from '../worker/trondheim-multiline-quality.mjs';
import {recordDaySample,dayHistoryStorage,recordScheduledTrondheimFrame}
 from '../worker/trondheim-history.mjs';

const actual=JSON.parse(readFileSync(new URL('../config/boards/trondheim-city-lines-catalog.json',import.meta.url)));
const emptyCatalog=summarizeMultiLineFrame({boardProfile:actual.id,leds:[]},actual);
assert.equal(Object.keys(emptyCatalog.lines).length,47,'All actual catalog lines receive source-quality counters');
for(const code of ['1','2','11','53','54','91','92'])
 assert(emptyCatalog.lines[code],'Source counts do not imply route-sequence approval');
const board={id:'trondheim-city-lines-catalog',leds:{count:1282},
 routes:['atb-bus-1-live','atb-bus-2-live','atb-bus-11-live'],
 nodes:[
  {led:8,quayId:'NSR:Quay:101',stopIds:['NSR:Quay:101'],routes:['atb-bus-1-live']},
  {led:9,quayId:'NSR:Quay:102',stopIds:['NSR:Quay:102'],routes:['atb-bus-1-live']},
  {led:10,quayId:'NSR:Quay:111',stopIds:['NSR:Quay:111'],routes:['atb-bus-11-live']},
  {led:11,quayId:'NSR:Quay:201',stopIds:['NSR:Quay:201'],routes:['atb-bus-2-live']},
  {led:12,quayId:'NSR:Quay:202',stopIds:['NSR:Quay:202','NSR:Quay:203'],routes:['atb-bus-2-live']}
 ]};
// Keep the synthetic 10-minute series on one Oslo calendar day. Using
// Date.now() made this test fail around local midnight when the final
// error sample crossed into the next day's separate history record.
const osloDay=new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
const now=Date.parse(osloDay+'T12:00:00Z'),at=new Date(now-1000).toISOString();
const V='PRIVATE-VEHICLE-NO-STORAGE';
const make=(timestamp,leds=[],gpsObservations=[])=>({
 schemaVersion:1,boardProfile:board.id,ledCount:1282,
 sequence:Math.floor(Date.parse(timestamp)/1000),ttlSeconds:30,
 generatedAt:timestamp,leds,gpsObservations
});
const v=(id,line,extra={})=>({id,line,ageSeconds:1,state:'APPROACHING',...extra});
const main=make(at,[
 {id:8,state:'APPROACHING',occupants:[v(V,'1',{positionType:'gps-nearest-stop',
  nearestQuayLed:8,withinStopRadius:true})]},
 {id:10,state:'AT_STOP',occupants:[v('SIRI-SECRET','11',{quayId:'NSR:Quay:111',
  positionType:'entur-siri-provider-stop',providerReportedAtStop:true,state:'AT_STOP'})]},
 {id:11,state:'APPROACHING',occupants:[v('ETA','2',{quayId:'NSR:Quay:201',
  positionType:'estimated-station-call'})]},
 {id:12,state:'APPROACHING',occupants:[v('SOME-GPS','2',{positionType:'gps-nearest-stop',
  nearestQuayLed:12,withinStopRadius:true})]},
 {id:9,state:'APPROACHING',occupants:[v('INVALID-GPS','1',{positionType:'gps-nearest-stop',
  nearestQuayLed:9,withinStopRadius:false})]},
 ],[
 {line:'1',status:'unresolved',nearestQuayId:'NSR:Quay:102',id:'REJECT-1',latitude:65},
 {line:'1',status:'unresolved',nearestQuayId:'NSR:Quay:102',id:'REJECT-1'},
 {line:'11',status:'unresolved',nearestQuayId:'NSR:Quay:111',id:'REJECT-2'},
 {line:'2',status:'unresolved',nearestQuayId:'NSR:Quay:999',id:'UNMAPPED'},
 ]);
const q=summarizeMultiLineFrame(main,board);
assert.equal(q.version,1);
assert.equal(q.diagnosticAvailable,true);
assert.equal(q.lines['1'].gps,1);
assert.equal(q.lines['1'].unresolved,1);
assert.equal(q.lines['11'].siri,1);
assert.equal(q.lines['11'].unresolved,1);
assert.equal(q.lines['2'].estimated,1);
assert.equal(q.lines['2'].gps,0,'Ambiguous multi-Quay GPS LED is not a match');
assert.equal(q.lines['2'].unresolved,0,'Unmapped Quay is never inferred');
assert(!JSON.stringify(q).includes(V));
assert(!JSON.stringify(q).includes('latitude'));
assert.deepEqual({...validatedMultiLineQuality(q).lines},q.lines);
assert.equal(validatedMultiLineQuality({...q,lines:{...q.lines,'invalid-code':{gps:9}}}),null);
assert.equal(validatedMultiLineQuality({...q,lines:{'1':{...q.lines['1'],gps:-1}}}),null);
assert.equal(summarizeMultiLineFrame({...main,boardProfile:'wrong'},board),null);

const duplicate=make(new Date(now+10000).toISOString(),[
 {id:8,state:'APPROACHING',occupants:[v(V,'1',{positionType:'gps-nearest-stop',nearestQuayLed:8})]},
 {id:9,state:'APPROACHING',occupants:[v(V,'1',{positionType:'gps-nearest-stop',nearestQuayLed:9})]},
 {id:11,state:'APPROACHING',occupants:[v('UNKNOWN','2',{quayId:'NSR:Quay:201',positionType:'unknown'})]},
 {id:10,state:'APPROACHING',occupants:[v('FAKE','11',{
  quayId:'NSR:Quay:111',positionType:'entur-siri-provider-stop',providerReportedAtStop:false})]}
]);
const dq=summarizeMultiLineFrame(duplicate,board);
assert.equal(dq.lines['1'].gps,0);
assert.equal(dq.lines['1'].ambiguous,1);
assert.equal(dq.lines['2'].ledOnly,1);
assert.equal(dq.lines['11'].siri,0);
assert.equal(dq.diagnosticAvailable,true);
const noDiag=summarizeMultiLineFrame({...duplicate,gpsObservations:undefined},board);
assert.equal(noDiag.diagnosticAvailable,false);

class Storage{
 data=new Map();
 async get(k){return this.data.get(k)}
 async put(k,v){this.data.set(k,structuredClone(v))}
 async delete(k){this.data.delete(k)}
 async list({prefix='',limit=1000,startAfter=''}){return new Map([...this.data]
  .filter(([k])=>k.startsWith(prefix)&&k>startAfter).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))}
}
const store=new Storage();
const stored=await recordDaySample(store,{capturedAt:at,frame:main,lineQuality:q});
assert.equal(stored.status,'OK');
const index=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
assert.equal(index.days.length,1);
let quality=index.days[0].multiLineQuality;
assert.equal(quality.sourceSamples,1);
assert.equal(quality.diagnosticSamples,1);
assert.equal(quality.lines['1'].gps,1);
assert.equal(quality.lines['1'].gpsFrames,1);
assert.equal(quality.lines['1'].observedFrames,1);
assert.equal(quality.lines['11'].siriFrames,1);
assert.equal(quality.lines['2'].observedFrames,0);
assert(!JSON.stringify(quality).includes(V));
const day=index.days[0].day;
const api='https://status.internal/trondheim-history?day='+day;
let page=await dayHistoryStorage(store,new Request(api)).then(r=>r.json());
assert.deepEqual(page.records[0].lineQuality,q);
assert(!JSON.stringify(page.meta).includes('SIRI-SECRET'));
// Idempotent scheduled retry in the same five-minute slot.
await recordDaySample(store,{capturedAt:at,frame:main,lineQuality:q});
quality=(await dayHistoryStorage(store,new Request(api)).then(r=>r.json())).meta.multiLineQuality;
assert.equal(quality.sourceSamples,1);
assert.equal(quality.lines['1'].gps,1);
// Replace the slot: subtract old counters and add the corrected observation.
await recordDaySample(store,{capturedAt:at,frame:duplicate,lineQuality:dq});
quality=(await dayHistoryStorage(store,new Request(api)).then(r=>r.json())).meta.multiLineQuality;
assert.equal(quality.sourceSamples,1);
assert.equal(quality.lines['1'].gps,0);
assert.equal(quality.lines['1'].ambiguous,1);
assert.equal(quality.lines['11'].siri,0);
assert.equal(quality.lines['2'].ledOnly,1);
// Historical records without additional quality must not be treated as
// GPS-negative samples. Likewise explicit upstream failures aren't empty frames.
const second=new Date(now+301000).toISOString();
await recordDaySample(store,{capturedAt:second,frame:make(second,[]),lineQuality:null});
await recordDaySample(store,{capturedAt:new Date(now+601000).toISOString(),frame:null,error:'fetch_down'});
quality=(await dayHistoryStorage(store,new Request(api)).then(r=>r.json())).meta.multiLineQuality;
assert.equal(quality.sourceSamples,1);
assert.equal(quality.lines['2'].observedFrames,0);
assert.equal((await dayHistoryStorage(store,new Request(api)).then(r=>r.json())).meta.errors,1);
// Existing five-minute server path computes quality without depending on the UI.
const another=new Storage(),env={DEVICE_STATUS:{idFromName:x=>x,get:()=>({
 fetch:(url,opts)=>dayHistoryStorage(another,new Request(url,opts))
})}};
const write=await recordScheduledTrondheimFrame(env,main,'',at,board);
assert.equal(write.status,'OK');
const after=await dayHistoryStorage(another,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
assert.equal(after.days[0].multiLineQuality.lines['11'].siri,1);
// Missing diagnostic property must be reported as unavailable, not zero hits.
const count=rollupMultiLineQuality(null,null,{status:'OK',lineQuality:noDiag});
assert.equal(count.diagnosticSamples,0);
assert.equal(count.sourceSamples,1);
const worker=readFileSync(new URL('../worker/led-feed-worker.mjs',import.meta.url),'utf8');
assert(worker.includes('recordScheduledTrondheimFrame('));
assert(worker.includes('boardFrameResponse("trondheim-city-lines-catalog",env,"history")'));
console.log('Multi-line scheduled quality: sources, 3 lines, GPS/SIRI/ETA/unknown, diagnostics, ambiguous Quays, idempotent rollups, legacy frames and no extra polling PASS');

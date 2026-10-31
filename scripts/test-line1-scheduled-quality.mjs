import assert from 'node:assert/strict';
import {summarizeLine1ScheduledFrame,validatedLine1ScheduledQuality}
 from '../worker/trondheim-line1-quality.mjs';
import {recordDaySample,dayHistoryStorage}
 from '../worker/trondheim-history.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create}=require('../web/linear/network/line1-quality-report.js');
const A='NSR:Quay:102733',B='NSR:Quay:102721';
const board={id:'trondheim-city-lines-catalog',nodes:[
 {quayId:A,led:8,stationId:'stopA'},
 {quayId:B,led:9,stationId:'stopB'},
 {quayId:'NSR:Quay:74983',led:10,stationId:'stopC'}],
 leds:{count:1282}};
const patterns={lines:{'1':{patterns:[
 {quays:[A,B,'NSR:Quay:74983'],directionType:'inbound'}]}}};
const profile={stops:[{id:A,name:'Tonstadkrysset'},{id:B,name:'Østre Lund'}]};
const now=Date.now(),at=new Date(now-2000).toISOString();
const privateId='PRIVATE-VEHICLE-123';
const source={id:privateId,line:'1',destination:'Ranheim',
 quayId:A,state:'AT_STOP',providerReportedAtStop:true,
 positionType:'entur-siri-provider-stop'};
const gps={id:'PRIVATE-VEHICLE-456',line:'1',
 destination:'Østre Lund',positionType:'gps-nearest-stop',nearestQuayLed:9,
 state:'APPROACHING'};
const frame={schemaVersion:1,boardProfile:board.id,ledCount:1282,
 sequence:Math.floor(now/1000),ttlSeconds:30,generatedAt:at,
 leds:[
 {id:8,state:'AT_STOP',occupants:[source]},
 {id:9,state:'APPROACHING',occupants:[gps]},
 {id:10,state:'APPROACHING',occupants:[{id:'PRIVATE-11',line:'11',state:'APPROACHING'}]}
 ],gpsObservations:[
 {line:'1',nearestQuayId:B,status:'unresolved',vehicleRef:privateId,
  latitude:63.4,longitude:10.5},
 {line:'11',nearestQuayId:A,status:'unresolved'},
 {line:'1',nearestQuayId:'NSR:Quay:999999',status:'unresolved'}
 ]};
const q=summarizeLine1ScheduledFrame(frame,board);
assert.equal(q.kind,'scheduled-line1-quay-snapshot');
assert.equal(q.diagnosticsAvailable,true);
assert.equal(q.items.find(([id])=>id===A)[1].siri,1);
assert.equal(q.items.find(([id])=>id===B)[1].gps,1);
assert.equal(q.items.find(([id])=>id===B)[1].unresolved,1);
assert(!JSON.stringify(q).includes(privateId),'Never persist private vehicle IDs');
assert(!JSON.stringify(q).includes('latitude'),'Never persist raw positions');
const bad={...q,items:[[A,{siri:1,gps:0,ledOnly:0,unresolved:0}],[
 A,{siri:1,gps:0,ledOnly:0,unresolved:0}]]};
assert.equal(validatedLine1ScheduledQuality(bad),null);
assert.equal(validatedLine1ScheduledQuality({...q,items:[[
 'NSR:Quay:999999',{siri:1,gps:0,ledOnly:0,unresolved:0}]]}),null);
assert.equal(validatedLine1ScheduledQuality({...q,items:[[A,{
 siri:1,gps:0,ledOnly:-1,unresolved:0}]]}),null);
class Storage{
 data=new Map();
 async get(k){return this.data.get(k)}
 async put(k,v){this.data.set(k,structuredClone(v))}
 async delete(k){this.data.delete(k)}
 async list({prefix='',limit=1000,startAfter=''}){return new Map([...this.data]
  .filter(([k])=>k.startsWith(prefix)&&k>startAfter)
  .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))}
}
const store=new Storage();
const result=await recordDaySample(store,{capturedAt:at,frame,quality:q});
assert.equal(result.status,'OK');
const days=await dayHistoryStorage(store,
 new Request('https://status.internal/trondheim-history')).then(r=>r.json());
assert.equal(days.days[0].count,1);
const day=days.days[0].day;
const page=await dayHistoryStorage(store,new Request(
 'https://status.internal/trondheim-history?day='+day)).then(r=>r.json());
assert.equal(page.records.length,1);
const persisted=page.records[0];
assert.deepEqual(persisted.quality,q);
assert(!JSON.stringify(persisted.quality).includes(privateId));
const quality=create({board,patterns,profile,clock:()=>now});
const report=quality.historyReport(page.records,{day});
assert.equal(report.sourceQualitySamples,1);
assert.equal(report.diagnosticSamples,1);
assert.equal(report.rows.find(r=>r.quay===A).siri,1);
assert.equal(report.rows.find(r=>r.quay===B).gps,1);
assert.equal(report.rows.find(r=>r.quay===B).unresolved,1);
assert.equal(report.rows.find(r=>r.quay===A).ledOnly,0,
 'Source-classified observations must not be double-counted as LED-only');
const priorities=quality.priorities(report);
assert.equal(priorities.status,'OBSERVED_ISSUES');
assert.deepEqual(priorities.rows.map(r=>r.quay),[B]);
assert(!JSON.stringify(priorities).includes('PRIVATE-VEHICLE'));
const older={...persisted,quality:undefined};
const old=quality.historyReport([older],{day});
assert.equal(old.sourceQualitySamples,0);
assert.equal(old.rows.find(r=>r.quay===A).ledOnly,1);
assert.equal(old.rows.find(r=>r.quay===B).ledOnly,1);
assert.equal(quality.priorities(old).status,'INSUFFICIENT_DETAIL');
const noDiag=quality.historyReport([{...persisted,quality:{
 ...q,diagnosticsAvailable:false,items:q.items.map(([id,c])=>[
  id,{...c,unresolved:0}])}}],{day});
assert.equal(noDiag.sourceQualitySamples,1);
assert.equal(noDiag.diagnosticSamples,0);
assert.equal(quality.priorities(noDiag).status,'INSUFFICIENT_DETAIL');
const storedError=await recordDaySample(store,{capturedAt:at,frame:null,
 error:'network-down',quality:q});
assert.equal(storedError.status,'ALREADY_OK');
assert.equal(summarizeLine1ScheduledFrame({...frame,boardProfile:'wrong'},board),null);
console.log('Unattended Trondheim quality: scheduled source counts, persisted DO slots, day report, priority list, older records, no data/leaks PASS');

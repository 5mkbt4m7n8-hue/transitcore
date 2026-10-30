import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create}=require('../web/linear/network/line1-quality-report.js');
const A='NSR:Quay:102733',B='NSR:Quay:102720',C='NSR:Quay:102721';
const board={id:'trondheim-city-lines-catalog',nodes:[
 {quayId:A,led:1,stationId:'S1'}, {quayId:B,led:2,stationId:'S2'},
 {quayId:C,led:3,stationId:'S3'}]};
const profile={stops:[{id:A,name:'Tonstadkrysset'},{id:B,name:'Holdeplass B'},
 {id:C,name:'Holdeplass C'}]};
const patterns={lines:{'1':{patterns:[{quays:[A,B,C],directionType:'outbound'}]}}};
const now=Date.parse('2026-10-30T14:30:00Z');
const kv=new Map(),storage={getItem:k=>kv.get(k)||null,setItem:(k,v)=>kv.set(k,v)};
const quality=create({board,profile,patterns,storage,clock:()=>now});
const frame=(at,leds=[],observations=[])=>({
 boardProfile:board.id,generatedAt:new Date(at).toISOString(),
 ttlSeconds:30,leds,gpsObservations:observations});
const mk=(quay,id,type)=>{
 const led=board.nodes.find(n=>n.quayId===quay).led;
 const vehicle={id,line:'1',destination:'Ranheim',state:type==='siri'?'AT_STOP':'APPROACHING',
 ...(type==='siri'?{quayId:quay,positionType:'entur-siri-provider-stop',
    providerReportedAtStop:true}:type==='gps'?{
    positionType:'gps-nearest-stop',nearestQuayLed:led}:{})};
 return {id:led,state:vehicle.state,occupants:[vehicle]};
};
const first=frame(now-1000,[mk(A,'PRIVATE-ID-1','siri'),mk(B,'PRIVATE-ID-2','gps')],[
 {line:'1',nearestQuayId:C,status:'unresolved',reason:'competing-quay',
  latitude:63.4,vehicleId:'PRIVATE-ID-3'}]);
assert.equal(quality.ingest(first,{now}),true);
assert.equal(quality.ingest(first,{now}),false,'Repeated same frame cannot inflate counts');
let report=quality.liveReport({now});
assert.equal(report.samples,1);
const row=q=>report.rows.find(r=>r.quay===q);
assert.equal(row(A).siri,1);
assert.equal(row(B).gps,1);
assert.equal(row(C).unresolved,1);
assert.equal(row(C).status,'review');
assert.equal(row(A).status,'source');
assert(!JSON.stringify(report).includes('PRIVATE-ID'));
assert(!JSON.stringify(report).includes('latitude'));
assert.equal(quality.ingest(frame(now-1000,[mk(A,'PRIVATE','siri')]),{now,source:'staging'}),true);
assert.equal(quality.liveReport({source:'staging',now}).samples,1);
assert.equal(quality.liveReport({now}).samples,1,'Staging isolated from production');
const stale=quality.ingest(first,{now:now+50000});
assert.equal(stale,false,'Expired source cannot inflate good data');
assert.equal(quality.liveReport({now:now+50000}).samples,1);
assert.equal(quality.ingest({boardProfile:'wrong',generatedAt:new Date(now).toISOString(),
 ttlSeconds:30,leds:[]},{now}),false);
const event={at:new Date(now).toISOString(),bus:'Buss 1',type:'NOT_VISIBLE',
 quay:B,source:'production',detail:'Not visible'};
assert.equal(quality.ingestEvents([event,event],{now}),1,'Deduplicates loss events');
assert.equal(quality.ingestEvents([{...event,type:'GAP'},{...event,type:'CONFLICT'}],{now}),2);
assert.equal(quality.ingestEvents([{...event,source:'staging'}],{source:'production',now}),0);
report=quality.liveReport({now});
assert.equal(report.rows.find(r=>r.quay===B).lost,1);
assert.equal(report.rows.find(r=>r.quay===B).gap,1);
assert.equal(report.rows.find(r=>r.quay===B).conflict,1);
assert.equal(report.rows.find(r=>r.quay===B).status,'review');
assert.equal(quality.liveReport({source:'staging',now}).rows.find(r=>r.quay===B).lost,0);
const copied=create({board,profile,patterns,storage,clock:()=>now});
assert.equal(copied.liveReport({now}).samples,1,'Restores local aggregate samples');
assert.equal(copied.liveReport({now}).rows.find(r=>r.quay===B).lost,1);
const day='2026-10-30';
const histFrame={boardProfile:board.id,leds:[{id:1,state:'APPROACHING',
 vehicle:{id:'PRIVATE-HISTORY-ID',line:'1',destination:'Ranheim'}}]};
const records=[
 {day,slot:now-600000,capturedAt:new Date(now-600000).toISOString(),
  status:'OK',frame:histFrame},
 {day,slot:now-300000,capturedAt:new Date(now-300000).toISOString(),
  status:'ERROR',error:'upstream failure'},
 {day,slot:now+300000,capturedAt:new Date(now+300000).toISOString(),
  status:'OK',frame:histFrame}
];
const history=quality.historyReport(records,{day});
assert.equal(history.samples,2);
assert.equal(history.errors,1);
assert.equal(history.gaps,1,'Detects missing 5-minute interval');
assert.equal(history.rows.find(r=>r.quay===A).ledOnly,2);
assert.equal(history.rows.find(r=>r.quay===A).siri,0,'Compact recordings cannot prove SIRI');
assert.equal(history.rows.find(r=>r.quay===A).gps,0,'Compact recordings cannot prove GPS');
assert.equal(history.rows.find(r=>r.quay===C).evidence,0,
 'Zero observations do not prove faulty stop');
assert(!JSON.stringify(history).includes('PRIVATE-HISTORY-ID'));
assert.throws(()=>quality.historyReport([records[0],records[0]]),/invalid-history-order/);
const exported=quality.exportJson(history);
assert(exported.includes('5-minute recordings omit detailed SIRI/GPS proof'));
assert(!exported.includes('PRIVATE'));
copied.clear();
assert.equal(copied.liveReport({now}).samples,0);
assert.equal(create({board,profile,patterns,storage,clock:()=>now}).liveReport({now}).samples,0);
assert.throws(()=>create({board:{...board,id:'wrong'},profile,patterns}),/board-required/);
console.log('Line 1 quality: exact per-Quay SIRI/GPS/unresolved counts, source isolation, loss, 5-min recording gaps, safe exports and empty-state PASS');

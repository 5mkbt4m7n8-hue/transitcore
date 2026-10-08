import assert from 'node:assert/strict';
import {storeTelemetry} from '../worker/devices/telemetry.mjs';
import {soakView, updateSoak} from '../worker/devices/soak.mjs';
import {healthPolicy} from '../core/models/device-record.mjs';
import {normalizeHealthStatus} from '../core/models/health-status.mjs';
import {DeviceStatus} from '../worker/led-feed-worker.mjs';
import {duration,details,listRows} from '../web/fleet/model.mjs';
const start=Date.parse('2026-10-08T00:00:00Z'), policy=healthPolicy();
const registration={deviceId:'soak-test',boardProfile:'test-board'};
const health=(seconds,patch={})=>normalizeHealthStatus({schemaVersion:1,...registration,
 firmwareVersion:'1.3.0',bootId:'boot-a',bootCount:1,resetReason:'POWER_ON',
 uptimeSeconds:seconds+500000,successfulPolls:seconds+1,failedPolls:0,wifiOutages:0,wifiRecoveries:0,
 freeHeap:220000,minimumFreeHeap:210000,frameValid:true,lastFrameAgeSeconds:2,
 lastFrameSequence:seconds,errors:[],...patch},registration,start+seconds*1000);
let state=null;
for(let s=0;s<=72*3600;s+=300){
 const h=health(s,{failedPolls:s>=600?1:0});
 state=updateSoak(state,h,start+s*1000,policy);
 if([0,24*3600,48*3600,72*3600].includes(s)) {
   const view=soakView(state,h,start+s*1000,policy);
   assert.equal(view.status,s===0?'RUNNING':`PASS ${s/3600}H`);
 }
}
assert.equal(state.history.length,0,'Transient recovered feed error does not restart');
assert.equal(state.current.firstSeenAt,new Date(start).toISOString(),'No backdated coverage');
assert.equal(Object.keys(state.current.milestones).length,3);
const end=start+72*3600000;
assert.equal(soakView(state,health(72*3600),end+421000,policy).status,'NOT STARTED','Offline cannot keep current PASS');
assert.equal(soakView(state,health(72*3600,{frameValid:false}),end,policy).status,'RUNNING');
assert.equal(soakView(state,health(72*3600),end,policy,false).status,'NOT STARTED');
state=updateSoak(state,health(72*3600+300,{bootId:'boot-b',bootCount:2,uptimeSeconds:20}),end+300000,policy,true);
assert.equal(state.current.observedSeconds,0);
assert.equal(state.restartCount,1);assert.equal(state.bootChangedSincePrevious,true);
assert.equal(state.history[0].outcome,'COMPLETED');assert.equal(state.history[0].endReason,'REBOOT');
state=updateSoak(state,health(72*3600+900,{bootId:'boot-b',bootCount:2,uptimeSeconds:620}),end+900000,policy);
assert.equal(state.history.at(-1).endReason,'REPORT_GAP');assert.equal(state.current.observedSeconds,0);
state=updateSoak(state,health(72*3600+1200,{bootId:'boot-b',uptimeSeconds:920,minimumFreeHeap:200000}),end+1200000,policy);
assert.equal(state.current.heapDropCount,1);assert.equal(state.current.minObservedHeap,200000);
assert.equal(soakView(null,health(0,{bootId:null}),start,policy).status,'NOT STARTED');
let frozen=null;
for(let s=0;s<=86400;s+=300)frozen=updateSoak(frozen,health(s,{lastFrameSequence:1,successfulPolls:1}),start+s*1000,policy);
assert.deepEqual(frozen.current.milestones,{},'Frozen feed cannot pass');
assert.equal(soakView(frozen,health(86400),start+86400000,policy).status,'RUNNING');
// Persistence uses the real telemetry transaction and survives a new DO instance.
const values=new Map(); let writes=0;
const storage={get:async k=>structuredClone(values.get(k)),put:async obj=>{writes++;for(const [k,v] of Object.entries(obj))values.set(k,structuredClone(v));}};
storage.transaction=async fn=>fn(storage);
const post=async seconds=>{const h=health(seconds);return storeTelemetry(storage,{receivedAt:h.receivedAt,health:h});};
await post(0);await post(300);
const before=writes;await post(300);assert.equal(writes,before,'Duplicate has no storage write');
await post(100);assert.equal(writes,before,'Delayed sample has no storage write');
const object=new DeviceStatus({storage});
const response=await object.fetch(new Request('https://status.internal/telemetry?detail=1'));
const data=await response.json();assert.equal(data.soak.current.observedSeconds,300);
assert.equal(data.soak.current.bootId,'boot-a');assert.equal(writes,before,'Read is read-only');
assert.equal((await (new DeviceStatus({storage})).fetch(new Request('https://status.internal/telemetry')).then(r=>r.json())).soak.history,undefined);
// No Fleet/Serial client running: device reports into persistent storage, then a new reader opens later.
const nextBoot=health(600,{bootId:'boot-b',bootCount:2,uptimeSeconds:10});
await storeTelemetry(storage,{receivedAt:nextBoot.receivedAt,health:nextBoot});
const reopened=await (new DeviceStatus({storage})).fetch(new Request('https://status.internal/telemetry?detail=1')).then(r=>r.json());
assert.equal(reopened.soak.current.bootId,'boot-b');
assert.equal(reopened.soak.history[0].bootId,'boot-a');
assert.equal(reopened.soak.history[0].endReason,'REBOOT');
assert.equal(reopened.soak.restartCount,1);
assert.equal(reopened.soak.current.observedSeconds,0);
assert.equal(duration(183660),'2d 3h 1m');assert.equal(duration(null),'Ikke rapportert');
const record={...registration,health:health(300),soak:soakView(state,health(300),end+1200000,policy,true,true)};
assert.match(details(record),/Serverlagret soak/);assert.match(listRows([record]),/SOAK:/);
assert.doesNotMatch(details({...record,soak:{history:[{bootId:'<script>',milestones:{}}]}}),/<script>/);
for(const patch of [{wifiConnected:'yes'},{profileRevision:-1},{profileFingerprint:'secret'}])assert.throws(()=>health(0,patch));
assert.equal(health(0,{wifiConnected:true,profileRevision:1,profileFingerprint:'0123456789abcdef'}).wifiConnected,true);
console.log('Fleet soak: 24/48/72h, reboot, gaps, transient recovery, frozen feed, heap trend, persistence, dedupe, delayed reports, UI and validation passed');

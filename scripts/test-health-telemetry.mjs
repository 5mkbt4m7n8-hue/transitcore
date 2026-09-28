import assert from "node:assert/strict";
import worker,{DeviceStatus} from "../worker/led-feed-worker.mjs";
import {normalizeHealthStatus} from "../core/models/health-status.mjs";
import {deviceRecord,evaluateHealth,healthPolicy} from "../core/models/device-record.mjs";
import {storeTelemetry} from "../worker/devices/telemetry.mjs";

let now=Date.parse("2026-09-27T12:00:00Z");
const policy=healthPolicy();
const identity={deviceId:"health-test",boardProfile:"grakallbanen-prototype-board",
  hardwareProfile:"grakallbanen-prototype-board-hardware",enabled:true,createdAt:new Date(now).toISOString()};
const full={schemaVersion:1,deviceId:identity.deviceId,boardProfile:identity.boardProfile,
  hardwareProfile:identity.hardwareProfile,firmwareVersion:"1.3.0",timestamp:new Date(now).toISOString(),
  uptimeSeconds:1000,wifiRssi:-55,freeHeap:200000,minimumFreeHeap:190000,bootCount:1,bootId:"boot-one",
  resetReason:"POWERON",lastFrameAgeSeconds:1,lastFrameSequence:123,successfulPolls:100,
  failedPolls:0,wifiOutages:0,lastOtaResult:"success",frameValid:true,errors:[]};
const h=normalizeHealthStatus(full,identity,now);
assert.equal(deviceRecord(identity,null,now,policy).otaEnabled,null);
assert.equal(deviceRecord({...identity,deviceConfig:{otaEnabled:false}},null,now,policy).otaEnabled,false);
assert.equal(deviceRecord({...identity,deviceConfig:{otaEnabled:true}},null,now,policy).otaEnabled,true);
assert.equal(h.firmwareVersion,"1.3.0");assert.equal(h.wifiRssi,-55);
const legacy={schemaVersion:1,deviceId:identity.deviceId,boardProfile:identity.boardProfile,firmware:"1.2.13",
  uptimeSeconds:100,freeHeap:200000,minimumFreeHeap:190000,feedSuccesses:10,feedFailures:0,
  wifiOutages:0,wifiRecoveries:0,frameAgeSeconds:0,frameValid:true};
const old=normalizeHealthStatus(legacy,identity,now);
assert.equal(old.wifiRssi,null);assert.equal(old.bootCount,null);assert.equal(old.lastFrameSequence,null);
assert.equal(old.lastOtaResult,null);assert.equal(old.capabilities.legacy,true);
assert.equal(old.successfulPolls,10);assert.equal(old.resetReason,null);
for(const patch of [{wifiRssi:10},{freeHeap:-1},{bootCount:"2"},{frameValid:"false"},
  {errors:[{code:"BAD",severity:"fatal"}]},{hardwareProfile:"other-hardware"},{timestamp:"nonsense"}])
  assert.throws(()=>normalizeHealthStatus({...full,...patch},identity,now));
const latest={health:h,receivedAt:h.receivedAt};
assert.equal(evaluateHealth(identity,latest,now,policy).status,"ONLINE");
assert.equal(evaluateHealth({...identity,enabled:false},latest,now,policy).status,"DISABLED");
assert.equal(evaluateHealth(identity,latest,now+1021000,policy).status,"OFFLINE");
assert.equal(evaluateHealth(identity,null,now,policy).status,"OFFLINE");
assert.equal(evaluateHealth(identity,latest,now+421000,policy).status,"DEGRADED");
for(const patch of [{lastFrameAgeSeconds:301},{wifiRssi:-90},{freeHeap:1000},{lastOtaResult:"failed"}])
  assert.equal(evaluateHealth(identity,{health:{...h,...patch}},now,policy).status,"DEGRADED");
assert.equal(evaluateHealth(identity,{...latest,_telemetry:{deltas:{failedPolls:10,successfulPolls:2,wifiOutages:0}}},now,policy).status,"DEGRADED");
assert.equal(evaluateHealth(identity,{...latest,_telemetry:{deltas:{failedPolls:0,successfulPolls:10,wifiOutages:4}}},now,policy).status,"DEGRADED");
assert.equal(evaluateHealth(identity,{health:{...h,errors:[{active:true,severity:"error",normalizedCode:"INVALID_FRAME"}]}},now,policy).status,"ERROR");
assert.equal(evaluateHealth(identity,{health:{...h,errors:[{active:false,severity:"error"}]}},now,policy).status,"ONLINE");
assert.equal(evaluateHealth(identity,latest,now+1000000,healthPolicy({offlineMultiplier:5})).status,"DEGRADED");
assert.throws(()=>healthPolicy({historyLimit:100000}));
assert.throws(()=>healthPolicy({notAnOption:1}));

const maps=new Map(),objects=new Map();let writes=0,reads=0,lists=0;
function memory(){
  const values=new Map();let chain=Promise.resolve();
  const storage={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>{
    writes++;if(typeof k==="string")values.set(k,structuredClone(v));
    else Object.entries(k).forEach(([key,value])=>values.set(key,structuredClone(value)));
  },list:async options=>{
    lists++;
    return new Map([...values].filter(([k])=>k.startsWith(options.prefix)&&(!options.startAfter||k>options.startAfter))
      .sort(([a],[b])=>a.localeCompare(b)).slice(0,options.limit||Infinity));
  }};
  storage.transaction=fn=>{const run=chain.then(()=>fn(storage));chain=run.catch(()=>{});return run;};
  return {values,storage};
}
const namespace={idFromName:x=>x,get:id=>{
  if(!objects.has(id)){const mem=memory();maps.set(id,mem.values);const object=new DeviceStatus({storage:mem.storage});
    objects.set(id,{fetch:(url,options)=>{reads++;return object.fetch(new Request(url,options));}});}
  return objects.get(id);
}};
namespace.get("__device-registry__");
const registry=maps.get("__device-registry__"),token="test-device-token-with-at-least-32-characters";
const tokenHash=Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))).toString("hex");
registry.set("device:"+identity.deviceId,{...identity,tokenHash,token:"DO-NOT-EXPOSE",adminToken:"DO-NOT-EXPOSE",wifiPassword:"DO-NOT-EXPOSE"});
const env={DEVICE_STATUS:namespace,PUBLISH_ADMIN_TOKEN:"admin-test"};
const req=(path,method="GET",body,auth="admin-test")=>new Request("https://worker.test"+path,{method,headers:{authorization:"Bearer "+auth},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
const post=body=>worker.fetch(req("/api/v1/device/status","POST",body,token),env);
const detail=()=>worker.fetch(req("/api/v1/devices/"+identity.deviceId),env).then(r=>r.json());
const originalNow=Date.now,originalFetch=globalThis.fetch;
try{
  Date.now=()=>now;globalThis.fetch=()=>{throw Error("No upstream allowed for telemetry/fleet");};
  assert.equal((await post(full)).status,200);
  let record=await detail();assert.equal(record.status,"ONLINE");assert.equal(record.lastSeen,new Date(now).toISOString());
  const initialWrites=writes;
  now+=1000;assert.equal((await post(full)).status,200);assert.equal(writes,initialWrites);
  assert.equal((await detail()).lastSeen,record.lastSeen,"Retries don't revive heartbeat");
  assert.equal((await post({...full,uptimeSeconds:1001})).status,429);
  assert.equal((await worker.fetch(req("/api/v1/device/status","POST",full,"wrong"),env)).status,401);
  assert.equal((await post({...full,deviceId:"unknown-device"})).status,404);
  registry.get("device:"+identity.deviceId).enabled=false;
  assert.equal((await post(full)).status,404);assert.equal((await detail()).status,"DISABLED");
  registry.get("device:"+identity.deviceId).enabled=true;
  now+=300000;
  assert.equal((await post({...full,uptimeSeconds:1300,timestamp:new Date(now).toISOString(),failedPolls:10})).status,200);
  record=await detail();assert.equal(record.status,"DEGRADED");assert.ok(record.reasons.includes("FRAME_FETCH_FAILED"));

  const send=async patch=>{
    now+=300000;
    const value={...full,uptimeSeconds:Math.floor((now-Date.parse(full.timestamp))/1000)+1000,
      timestamp:new Date(now).toISOString(),...patch};
    assert.equal((await post(value)).status,200);
    return value;
  };
  for(const [patch,reason] of [[{wifiRssi:-95},"WEAK_WIFI"],[{freeHeap:200},"LOW_HEAP"],
    [{lastOtaResult:"failed"},"OTA_FAILED"],[{frameValid:false},"FRAME_STALE"]]){
    await send(patch);assert.ok((await detail()).reasons.includes(reason));
  }
  const event={code:"INVALID_FRAME",severity:"error",count:1,message:"Bearer DO-NOT-EXPOSE"};
  const sent=await send({errors:[event]});
  record=await detail();assert.equal(record.status,"ERROR");assert.equal(record.errors.at(-1).count,1);
  now+=1000;assert.equal((await post(sent)).status,200);
  assert.equal((await detail()).errors.at(-1).count,1);
  await send({errors:[{...event,count:4}]});assert.equal((await detail()).errors.at(-1).count,4);
  await send({errors:[]});record=await detail();assert.equal(record.status,"ONLINE");
  assert.equal(record.errors.at(-1).active,false);assert.ok(record.errors.at(-1).resolvedAt);
  await send({errors:[event]});assert.equal((await detail()).errors.at(-1).count,5);
  await send({errors:[]});
  for(let i=0;i<3;i++)await send({bootId:"restart-"+i,bootCount:i+2,uptimeSeconds:10+i});
  assert.ok((await detail()).reasons.includes("REBOOT_LOOP"));
  // Out-of-order report with same boot identity cannot create a false restart.
  const beforeSeen=(await detail()).lastSeen;
  now+=30000;assert.equal((await post({...full,bootId:"restart-2",uptimeSeconds:1})).status,200);
  assert.equal((await detail()).lastSeen,beforeSeen);

  now+=2000000;assert.equal((await detail()).status,"OFFLINE");
  // Partial legacy client continues on the existing status path.
  now+=300000;
  assert.equal((await worker.fetch(req("/v1/devices/"+identity.deviceId+"/status","POST",legacy,token),env)).status,200);
  assert.equal((await detail()).health.wifiRssi,null);

  for(let i=0;i<5;i++)registry.set("device:fleet-"+i,{...identity,deviceId:"fleet-"+i,tokenHash,token:"DO-NOT-EXPOSE"});
  const listBefore=lists;
  assert.equal((await worker.fetch(req("/api/v1/devices","GET",undefined,token),env)).status,401);
  assert.equal(lists,listBefore,"Unauthorized request never scans registry");
  const listResponse=await worker.fetch(req("/api/v1/devices?limit=2"),env);
  assert.equal(listResponse.headers.get("access-control-allow-origin"),"*");
  assert.equal(listResponse.headers.get("cache-control"),"no-store");
  const page=await listResponse.json();
  assert.equal(page.devices.length,2);assert.ok(page.nextCursor);
  const next=await worker.fetch(req("/api/v1/devices?limit=2&cursor="+page.nextCursor),env).then(r=>r.json());
  assert.equal(next.devices.length,2);assert.notEqual(page.devices[1].deviceId,next.devices[0].deviceId);
  assert.equal(JSON.stringify([page,next,await detail()]).includes("DO-NOT-EXPOSE"),false);
  assert.equal((await worker.fetch(req("/api/v1/devices?limit=500"),env)).status,400);
  assert.equal((await worker.fetch(req("/api/v1/devices/unknown-device"),env)).status,404);
  assert.equal((await worker.fetch(req("/api/v1/devices","POST",{}),env)).status,405);
  const detailWrites=writes;await detail();assert.equal(writes,detailWrites,"Fleet reads don't generate writes");

  const isolated=memory();
  const ingest=async(i,errors=[])=>{
    const clock=Date.parse("2026-09-01T00:00:00Z")+i*300000;
    const health=normalizeHealthStatus({...full,uptimeSeconds:i*300,timestamp:new Date(clock).toISOString(),errors},identity,clock);
    return storeTelemetry(isolated.storage,{...legacy,receivedAt:health.receivedAt,health});
  };
  for(let i=0;i<310;i++)await ingest(i);
  assert.equal(isolated.values.get("history").length,288);
  await ingest(311,[event]);await ingest(312,[]);
  await ingest(3000,[]);
  assert.equal(isolated.values.get("history").length,1);assert.equal(isolated.values.get("errors").length,0);
  // Error IDs reused after reboot are distinct events.
  const oldEvent={...legacy,lastError:{code:"FEED_RECEIVE",detail:"safe",occurredAtUptimeSeconds:1,occurrences:1},
    errorQueue:[{id:1,code:"FEED_RECEIVE",detail:"safe",occurredAtUptimeSeconds:1,occurrences:1}]};
  const mem=memory();
  for(const [i,uptime] of [[0,100],[1,1]]){
    const clock=now+i*300000;
    await storeTelemetry(mem.storage,{...oldEvent,uptimeSeconds:uptime,receivedAt:new Date(clock).toISOString()});
  }
  assert.equal(mem.values.get("errors").length,2);
  assert.ok(mem.values.get("errors").every(e=>e.count===1));
  // Concurrent identical arrivals commit once under the same object's transaction.
  const concurrent=memory();
  const sample={...legacy,receivedAt:new Date(now).toISOString()};
  const result=await Promise.all([storeTelemetry(concurrent.storage,sample),storeTelemetry(concurrent.storage,sample)]);
  assert.ok(result.every(r=>r.status===200));
  assert.equal(concurrent.values.get("history").length,1);
  // Old lastError is historical; after retention it must not be recreated forever.
  const retained=memory();
  await storeTelemetry(retained.storage,{...oldEvent,receivedAt:new Date(now).toISOString()});
  await storeTelemetry(retained.storage,{...oldEvent,uptimeSeconds:1000000,
    receivedAt:new Date(now+8*86400000).toISOString()});
  assert.equal(retained.values.get("errors").length,0);
  // A modern partial payload cannot silently clear an explicitly active error.
  await send({errors:[event]});
  now+=300000;
  assert.equal((await post({schemaVersion:1,deviceId:identity.deviceId,boardProfile:identity.boardProfile,
    firmwareVersion:"1.3.0",uptimeSeconds:200000,timestamp:new Date(now).toISOString()})).status,200);
  assert.equal((await detail()).status,"ERROR");
  // Distinct device credentials remain bound to their own registration.
  registry.set("device:other-device",{...identity,deviceId:"other-device",tokenHash:"a".repeat(64)});
  assert.equal((await post({...full,deviceId:"other-device"})).status,401);
  const publicStatus=await worker.fetch(req("/v1/devices/"+identity.deviceId+"/status"),env).then(r=>r.json());
  assert.equal(publicStatus.latest.health,undefined);
  assert.equal(publicStatus.latest._telemetry,undefined);
}finally{Date.now=originalNow;globalThis.fetch=originalFetch;}
console.log("Health/Fleet: full/legacy, auth, status states, deltas, reboot scope, idempotency, errors, retention and pagination passed");

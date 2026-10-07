import assert from "node:assert/strict";
import fs from "node:fs/promises";
import worker,{DeviceStatus} from "../worker/led-feed-worker.mjs";
import {buildDeviceConfig,validateDeviceConfig,validateDeviceSettings} from "../core/models/device-config.mjs";

const deviceId="prototype-test",boardProfile="grakallbanen-prototype-board";
const hardwareProfile=boardProfile+"-hardware",token="device-token-012345678901234567890";
const tokenHash=Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))).toString("hex");
const settings={pollIntervalSeconds:10,statusIntervalSeconds:300,brightnessLimit:32,otaEnabled:true,featureFlags:{warmWhite:false}};
const entry={deviceId,boardProfile,hardwareProfile,enabled:true,tokenHash,deviceConfig:settings,
  token:"never-return",adminToken:"never-return",wifiPassword:"never-return"};
const model=buildDeviceConfig(entry,"https://worker.test");
assert.ok(validateDeviceConfig(model).valid);
assert.equal(JSON.stringify(model).includes("never-return"),false);
for(const patch of [{schemaVersion:2},{deviceId:"../bad"},{boardProfile:"../bad"},{hardwareProfile:""},
  {pollIntervalSeconds:0},{pollIntervalSeconds:301},{statusIntervalSeconds:5},
  {brightnessLimit:256},{brightnessLimit:-1},{otaEnabled:"yes"},{featureFlags:{token:"secret"}},
  {frameUrl:"https://user:secret@worker.test/api/v1/frame/"+boardProfile},{otaManifestUrl:"http://worker.test/ota"}])
  assert.equal(validateDeviceConfig({...model,...patch}).valid,false,JSON.stringify(patch));
assert.ok(validateDeviceConfig({...model,otaEnabled:false}).valid);
assert.equal(validateDeviceSettings(undefined).valid,false);

const maps=new Map(),objects=new Map();
const namespace={idFromName:x=>x,get:id=>{
  if(!objects.has(id)){
    const values=new Map();maps.set(id,values);
    const storage={get:async k=>values.get(k),put:async(k,v)=>{
      if(typeof k==="string")values.set(k,structuredClone(v));
      else Object.entries(k).forEach(([key,value])=>values.set(key,structuredClone(value)));
    },list:async({prefix})=>new Map([...values].filter(([k])=>k.startsWith(prefix)))};
    const object=new DeviceStatus({storage});
    objects.set(id,{fetch:(url,options)=>object.fetch(new Request(url,options))});
  }
  return objects.get(id);
}};
namespace.get("__device-registry__");
const registry=maps.get("__device-registry__");
const store=(value)=>registry.set("device:"+deviceId,structuredClone(value));
store(entry);
const env={DEVICE_STATUS:namespace,PUBLISH_ADMIN_TOKEN:"admin-token"};
const headers={authorization:"Bearer "+token};
const call=(path,method="GET",body,extra={},environment=env)=>worker.fetch(new Request("https://worker.test"+path,{
  method,headers:{...headers,...extra},...(body===undefined?{}:{body:typeof body==="string"?body:JSON.stringify(body)})
}),environment);
const configPath="/api/v1/device/config/"+deviceId;
const originalFetch=globalThis.fetch,originalNow=Date.now,originalError=console.error;
let upstream=0;
try {
  Date.now=()=>Date.parse("2026-09-27T12:00:00Z");
  globalThis.fetch=async(url,options)=>{
    upstream++;
    const path=String(url).split("/main/")[1];
    if(path?.startsWith("config/")){
      try{return new Response(await fs.readFile(new URL("../"+path,import.meta.url)));}
      catch{return new Response("",{status:404});}
    }
    if(options?.method==="POST")return Response.json({data:{vehicles:[]}});
    throw Error("Unexpected external request");
  };
  for(const storage of [env,{}]){
    const count=upstream;
    const health=await call("/api/v1/platform/health","GET",undefined,{},storage);
    assert.equal(health.status,200);const data=await health.json();
    assert.equal(data.providers.status,"not_probed");
    assert.equal(data.deviceStorage.status,storage.DEVICE_STATUS?"bound_not_probed":"unavailable");
    assert.equal(upstream,count,"Health must not fetch configuration/providers/storage");
  }
  assert.equal((await call(configPath,"GET",undefined,{authorization:""})).status,401);
  assert.equal((await call(configPath,"GET",undefined,{authorization:"Bearer wrong"})).status,401);
  assert.equal((await call(configPath,"GET",undefined,{"x-transitcore-device":"other"})).status,400);
  assert.equal((await call("/api/v1/device/config/unknown-device")).status,404);
  assert.equal((await call(configPath,"GET",undefined,{},{})).status,503);
  const configResponse=await call(configPath);
  assert.equal(configResponse.status,200);assert.deepEqual(await configResponse.json(),model);
  assert.equal(configResponse.headers.get("cache-control"),"no-store");
  store({...entry,enabled:false});assert.equal((await call(configPath)).status,403);
  store({...entry,deviceConfig:undefined});assert.equal((await call(configPath)).status,409);
  store({...entry,hardwareProfile:"unknown-hardware"});assert.equal((await call(configPath)).status,409);
  store({...entry,hardwareProfile:"../bad"});assert.equal((await call(configPath)).status,409);
  store({...entry,boardProfile:"bad/board"});assert.equal((await call(configPath)).status,409);
  store({...entry,deviceConfig:{...settings,pollIntervalSeconds:0}});assert.equal((await call(configPath)).status,409);
  store({...entry,deviceConfig:{...settings,brightnessLimit:33}});assert.equal((await call(configPath)).status,409);
  store({...entry,tokenHash:"invalid"});assert.equal((await call(configPath)).status,503);
  store({...entry,deviceId:"mismatch"});assert.equal((await call(configPath)).status,503);
  console.error=()=>{};
  store({...entry,boardProfile:"unknown-board"});assert.equal((await call(configPath)).status,503);
  store(entry);
  const broken={DEVICE_STATUS:{idFromName:x=>x,get:()=>({fetch:async()=>new Response("",{status:503})})}};
  assert.equal((await call(configPath,"GET",undefined,{},broken)).status,503);
  // No secret-map fallback when authoritative registry storage is unavailable.
  broken.DEVICE_INGEST_TOKENS=JSON.stringify({[deviceId]:{token,boardProfile}});
  assert.equal((await call(configPath,"GET",undefined,{},broken)).status,503);

  // Frame alias executes identical pipeline and shared provider cache.
  const oldFrame=await call("/v1/boards/"+boardProfile+"/frame");
  const count=upstream;
  const newFrame=await call("/api/v1/frame/"+boardProfile);
  assert.equal(newFrame.status,oldFrame.status);
  assert.deepEqual(await newFrame.json(),await oldFrame.json());
  assert.equal(upstream,count,"Alias must share existing provider/config cache");
  assert.equal((await call("/api/v1/frame/unknown-board")).status,503);
  assert.equal((await call("/api/v1/frame/BAD")).status,404);

  const payload={schemaVersion:1,deviceId,boardProfile,firmware:"1.2.13",uptimeSeconds:20,
    wifiOutages:0,wifiRecoveries:0,feedSuccesses:1,feedFailures:0,frameAgeSeconds:1,
    frameValid:true,freeHeap:200000,minimumFreeHeap:190000};
  const oldStatus=await call("/v1/devices/"+deviceId+"/status","POST",payload);
  const oldSample=structuredClone(maps.get(deviceId).get("latest"));
  const newStatus=await call("/api/v1/device/status","POST",payload);
  assert.equal(newStatus.status,200);assert.deepEqual(await newStatus.json(),await oldStatus.json());
  assert.deepEqual(maps.get(deviceId).get("latest"),oldSample);
  assert.equal((await call("/api/v1/device/status","POST",payload,{authorization:"Bearer wrong"})).status,401);
  assert.equal((await call("/api/v1/device/status","POST",{...payload,boardProfile:"wrong"})).status,400);
  assert.equal((await call("/api/v1/device/status","POST","{")).status,400);
  assert.equal((await call("/api/v1/device/status","POST",{})).status,400);
  assert.equal((await call("/api/v1/device/status","POST",payload,{"x-transitcore-device":"other"})).status,400);
  store({...entry,enabled:false});
  assert.equal((await call("/api/v1/device/status","POST",payload)).status,404);
  store(entry);

  const release={deviceId,boardProfile,version:"1.2.13",chip:"esp32s3",gpio:14,ledCount:16,
    physicalLedCount:16,size:1500000,md5:"a".repeat(32),url:"https://example.test/firmware.bin"};
  env.OTA_RELEASE_MANIFEST=JSON.stringify({devices:{[deviceId]:release}});
  const otaHeaders={"x-transitcore-device":deviceId,"x-transitcore-board":boardProfile,
    "x-transitcore-chip":"esp32s3","x-transitcore-gpio":"14","x-transitcore-leds":"16",
    "x-transitcore-physical-leds":"16","x-transitcore-firmware":"1.2.12"};
  const oldOta=await call("/v1/firmware/manifest","GET",undefined,otaHeaders);
  const newOta=await call("/api/v1/ota/"+deviceId,"GET",undefined,otaHeaders);
  assert.equal(newOta.status,200);assert.deepEqual(await newOta.json(),await oldOta.json());
  assert.equal((await call("/api/v1/ota/"+deviceId,"GET",undefined,{...otaHeaders,"x-transitcore-chip":"esp32"})).status,204);
  store({...entry,deviceConfig:{...settings,otaEnabled:false}});
  assert.equal((await call("/api/v1/ota/"+deviceId,"GET",undefined,otaHeaders)).status,204);
  assert.equal((await call("/v1/firmware/manifest","GET",undefined,otaHeaders)).status,204,"Explicit registry policy cannot be bypassed via legacy path");
  store({...entry,deviceConfig:undefined});
  assert.equal((await call("/v1/firmware/manifest","GET",undefined,otaHeaders)).status,200,"Unprovisioned legacy devices retain existing OTA");
  store(entry);
  assert.equal((await call("/api/v1/ota/"+deviceId,"GET",undefined,{...otaHeaders,"x-transitcore-board":"other-board"})).status,409);
  assert.equal((await call("/api/v1/ota/"+deviceId,"GET",undefined,{authorization:""})).status,401);
  store({...entry,enabled:false});assert.equal((await call("/api/v1/ota/"+deviceId,"GET",undefined,otaHeaders)).status,403);
  store(entry);

  // Existing authenticated admin path provisions settings, never secrets.
  const configure={action:"configure",deviceId,hardwareProfile,deviceConfig:{...settings,pollIntervalSeconds:20}};
  assert.equal((await call("/v1/admin/devices","POST",configure)).status,401);
  const admin={authorization:"Bearer admin-token"};
  assert.equal((await call("/v1/admin/devices","POST",{...configure,hardwareProfile:"unknown-profile"},admin)).status,409);
  assert.equal((await call("/v1/admin/devices","POST",configure,admin)).status,200);
  const visualConfigure={...configure,deviceConfig:{...configure.deviceConfig,visual:{pulsePeriodMs:2400,backgroundBrightness:0}}};
  assert.equal((await call("/v1/admin/devices","POST",visualConfigure,admin)).status,200);
  assert.deepEqual(registry.get("device:"+deviceId).deviceConfig.visual,visualConfigure.deviceConfig.visual);
  const visualResponse=await call(configPath,"GET",undefined,{"X-TransitCore-Visual-Version":"1"});
  assert.equal(visualResponse.status,200);
  assert.deepEqual((await visualResponse.json()).visual,{pulsePeriodMs:2400,pulseMinBrightness:0,pulseMaxBrightness:255,backgroundBrightness:0});
  assert.ok(!Object.hasOwn(await (await call(configPath)).json(),"visual"));
  assert.equal((await (await call(configPath)).json()).pollIntervalSeconds,20);
  assert.equal(registry.get("device:"+deviceId).tokenHash,tokenHash);
  const missingHardware={...entry};delete missingHardware.hardwareProfile;delete missingHardware.deviceConfig;
  store(missingHardware);
  assert.equal((await call(configPath)).status,409);
  assert.equal((await call("/v1/devices/"+deviceId+"/status","POST",payload)).status,200,"Old clients need no config");
  assert.equal((await call("/v1/admin/devices","POST",configure,admin)).status,200);
  for(const [path,method] of [[configPath,"POST"],["/api/v1/device/status","GET"],["/api/v1/ota/"+deviceId,"POST"],
    ["/api/v1/frame/"+boardProfile,"POST"],["/api/v1/platform/health","POST"]])
    assert.equal((await call(path,method)).status,405);
  assert.equal((await call(configPath,"OPTIONS")).status,204);
  assert.equal((await call("/api/v1/unknown")).status,404);
} finally {globalThis.fetch=originalFetch;Date.now=originalNow;console.error=originalError;}
console.log("API v1: config validation/auth/provisioning, frame/status/OTA compatibility, health and failure paths passed");

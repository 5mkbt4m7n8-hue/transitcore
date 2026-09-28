import assert from "node:assert/strict";
import fs from "node:fs";
import {normalizeHealthStatus} from "../core/models/health-status.mjs";
import {validateDeviceConfig} from "../core/models/device-config.mjs";
const firmware=fs.readFileSync(new URL("../firmware/esp32/TransitCore_Universal_BoardClient_v1_3_0.ino",import.meta.url),"utf8");
const header=fs.readFileSync(new URL("../firmware/esp32/TransitCore_Platform_v1.h",import.meta.url),"utf8");
const baseline=fs.readFileSync(new URL("../firmware/esp32/TransitCore_Universal_BoardClient_v1_2_13.ino",import.meta.url),"utf8");
const origin="https://worker.test",identity={deviceId:"device-one",boardProfile:"board-one",hardwareProfile:"hardware-one"};
const valid={schemaVersion:1,...identity,frameUrl:origin+"/api/v1/frame/board-one",otaManifestUrl:origin+"/api/v1/ota/device-one",
 pollIntervalSeconds:10,statusIntervalSeconds:300,brightnessLimit:32,otaEnabled:true,featureFlags:{}};
assert.equal(validateDeviceConfig(valid).valid,true);
// Executable contract simulation, not an ESP emulator. C++ compilation is a separate gate.
function decode(input){
 const c=structuredClone(input);
 for(const key of ["pollIntervalSeconds","statusIntervalSeconds"])if(!Number.isInteger(c[key])||c[key]<1||c[key]>0xffffffff)throw Error("interval");
 c.pollIntervalSeconds=Math.min(300,Math.max(5,c.pollIntervalSeconds));
 c.statusIntervalSeconds=Math.min(900,Math.max(300,c.statusIntervalSeconds));
 if(!validateDeviceConfig(c).valid)throw Error("invalid");
 for(const key of ["deviceId","boardProfile","hardwareProfile"])if(c[key]!==identity[key])throw Error("mismatch");
 if(c.frameUrl!==valid.frameUrl||c.otaManifestUrl!==valid.otaManifestUrl)throw Error("untrusted");
 c.brightnessLimit=Math.min(32,c.brightnessLimit);return c;
}
assert.deepEqual(decode(valid),valid);
for(const patch of [{schemaVersion:2},{deviceId:"other-one"},{boardProfile:"other-board"},{hardwareProfile:"other-hardware"},
 {frameUrl:"https://attacker.test/api/v1/frame/board-one"},{frameUrl:valid.frameUrl+"?token=x"},
 {otaManifestUrl:"http://worker.test/api/v1/ota/device-one"},{otaEnabled:"true"},{brightnessLimit:256},
 {pollIntervalSeconds:0},{statusIntervalSeconds:-1},{featureFlags:{ambientLighting:"yes"}}])
 assert.throws(()=>decode({...valid,...patch}));
assert.equal(decode({...valid,pollIntervalSeconds:1}).pollIntervalSeconds,5);
assert.equal(decode({...valid,pollIntervalSeconds:0xffffffff}).pollIntervalSeconds,300);
assert.equal(decode({...valid,statusIntervalSeconds:1}).statusIntervalSeconds,300);
assert.equal(decode({...valid,statusIntervalSeconds:0xffffffff}).statusIntervalSeconds,900);
assert.equal(decode({...valid,statusIntervalSeconds:9999,brightnessLimit:255}).brightnessLimit,32);
let active=decode(valid),cached=JSON.stringify(active),writes=0,source="CACHED";
function fetchConfig(code,body){
 try {if(code!==200)throw Error("http");const candidate=decode(JSON.parse(body));active=candidate;source="LIVE";
 const encoded=JSON.stringify(candidate);if(encoded!==cached){cached=encoded;writes++;}}catch{}
}
for(const code of [-1,401,404,429,500]){fetchConfig(code,"");assert.equal(source,"CACHED");assert.deepEqual(active,valid);}
fetchConfig(200,"{");assert.deepEqual(active,valid);
fetchConfig(200,JSON.stringify({...valid,hardwareProfile:"wrong"}));assert.deepEqual(active,valid);
fetchConfig(200,JSON.stringify(valid));assert.equal(source,"LIVE");assert.equal(writes,0);
fetchConfig(200,JSON.stringify({...valid,pollIntervalSeconds:20}));assert.equal(writes,1);
function boot(cache,compiled=valid,bindingMatches=true){
 try{if(!bindingMatches)throw Error("binding");return {source:"CACHED",config:decode(JSON.parse(cache))};}catch{}
 try{return {source:"DEFAULT",config:decode(compiled)};}catch{return {source:"DEFAULT",config:null};}
}
assert.equal(boot(JSON.stringify(valid)).source,"CACHED");
assert.equal(boot("corrupt").source,"DEFAULT");
assert.equal(boot(JSON.stringify(valid),valid,false).source,"DEFAULT");
assert.equal(boot("",null).config,null,"Missing config remains safe, not guessed");
fetchConfig(200,JSON.stringify({...valid,pollIntervalSeconds:20}));assert.equal(writes,1);
// Firmware binding and safe-mode gates are explicit in the actual implementation.
for(const fragment of ['out=std::move(candidate); return true','if(fromCache && String(doc["cacheBinding"] | "")!=platformBinding())return false',
 'if(!platformIdentityValid','encoded!=cachedConfigEncoding','runtimeConfig=std::move(candidate)','platformOutputs[]',
 'constrain(poll,5U,300U)','constrain(health,300U,900U)','prefs.putUInt("bootCount",platformBootCount)',
 'previous<UINT32_MAX','%08lx-%08lx','if(bootCountKnown)','esp_timer_get_time()',
 'case ESP_RST_BROWNOUT: return "BROWNOUT"','case ESP_RST_SW: return "SOFTWARE_RESET"',
 'CONFIG_REFRESH_MS = 3600000UL, CONFIG_RETRY_MS = 300000UL',
 'candidate.frameUrl!=origin+"/api/v1/frame/"+candidate.board'])assert.ok(header.includes(fragment),fragment);
const health={schemaVersion:1,...identity,firmwareVersion:"1.3.0",uptimeSeconds:100,wifiRssi:-55,freeHeap:200000,
 bootCount:3,bootId:"12345678-90abcdef",resetReason:"POWER_ON",lastFrameAgeSeconds:2,lastFrameSequence:123,
 successfulPolls:10,failedPolls:1,wifiOutages:0,configSource:"CACHED",configFetchResult:"FAILED_HTTP",
 lastOtaResult:"pending",otaStage:"TRIAL_BOOT",errors:[{id:1,code:"CONFIG_FAILED",severity:"warning",count:1,active:true}]};
const normalized=normalizeHealthStatus(health,identity);
for(const key of ["configSource","configFetchResult","otaStage","bootId","bootCount","wifiRssi","lastFrameSequence"])
 assert.equal(normalized[key],health[key]);
for(const source of ["LIVE","CACHED","DEFAULT"])assert.equal(normalizeHealthStatus({...health,configSource:source},identity).configSource,source);
for(const stage of ["NOT_CHECKED","NO_UPDATE","UPDATE_AVAILABLE","DOWNLOAD_STARTED","TRIAL_BOOT","SUCCESS","FAILED_HTTP","FAILED_VALIDATION","FAILED_FLASH","DISABLED"])
 assert.equal(normalizeHealthStatus({...health,otaStage:stage},identity).otaStage,stage);
for(const patch of [{configSource:"secret url"},{configFetchResult:"password"},{otaStage:"fake"}])assert.throws(()=>normalizeHealthStatus({...health,...patch},identity));
assert.equal(normalizeHealthStatus({schemaVersion:1,...identity,firmware:"1.2.13",resetReason:1},identity).configSource,null);
// Preserve important baseline algorithms byte-for-byte, apart from explicit board context.
function section(s,name,end){return s.slice(s.indexOf(name),s.indexOf(end,s.indexOf(name))).replaceAll("\r\n","\n");}
assert.equal(section(firmware,"bool parseAndValidateFrame(","void acceptCandidateFrame(").replace("runtimeConfig.board.c_str()","EXPECTED_BOARD_PROFILE"),
 section(baseline,"bool parseAndValidateFrame(","void acceptCandidateFrame("));
assert.equal(section(firmware,"uint8_t approachingPulse()","void showStatusColor("),section(baseline,"uint8_t approachingPulse()","void showStatusColor("));
assert.equal(section(firmware,"void renderFrame()","void beginLedTest("),section(baseline,"void renderFrame()","void beginLedTest("));
for(const fragment of ['hasEverConnected && wifiOutageCount < UINT32_MAX','setPlatformError(PWIFI,true)',
 'lastSequence = sequence','lastAcceptedFrameUs = esp_timer_get_time()','if (successfulFeedPolls < UINT32_MAX)',
 'if (failedFeedPolls < UINT32_MAX)','readPlatformBody(http, body, MAX_RESPONSE_BYTES)',
 'esp_ota_mark_app_valid_cancel_rollback()==ESP_OK','setOtaStage("SUCCESS","success")',
 'setOtaStage(otaFailureStage(httpUpdate.getLastError()),"failed")','lastHealthReportAtMs = now;',
 'platformConfigured &&','lastPollAtMs = millis()'])assert.ok(firmware.includes(fragment),fragment);
assert.ok(!section(firmware,"void ensureWifi()","String feedHost()").includes("ESP.restart"));
assert.ok(section(firmware,"void enforceTtl()","bool newerFirmwareVersion").includes("ttlExpired = true"));
// The preserved parser is the actual firmware parser; source guard confirms commit remains after validation.
const attempt=section(firmware,"bool fetchFrameAttempt(","void fetchFrame()");
assert.ok(attempt.indexOf("parseAndValidateFrame(")<attempt.indexOf("acceptCandidateFrame("));
assert.ok(attempt.indexOf("sequence < lastSequence")<attempt.indexOf("acceptCandidateFrame("));
// No credential-bearing body dumps or dynamic upstream error text in new logs.
assert.doesNotMatch(header,/printf.*(DEVICE_TOKEN|WIFI_PASSWORD)|println.*(body|encoded)/);
assert.ok(firmware.includes('if (document.overflowed())'));
assert.ok(baseline.includes('const char* TRANSITCORE_FIRMWARE_VERSION = "1.2.13"'));
console.log("Firmware1.3: policy simulations, canonical telemetry, failure/clamp/cache fixtures and source regression guards passed; hardware execution pending");

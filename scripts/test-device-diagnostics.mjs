import assert from 'node:assert/strict';
import worker, {DeviceStatus} from '../worker/led-feed-worker.mjs';
import {diagnosticsRequest,cleanLog,selectOtaRelease,SESSION_MS} from '../worker/device-diagnostics.mjs';
const values=new Map(), storage={get:async k=>values.get(k),put:async(k,v)=>{if(typeof k==='object')Object.entries(k).forEach(([key,value])=>values.set(key,value));else values.set(k,v);}};
const call=(path,method='GET',body)=>new Request('https://internal'+path,{method,body:body?JSON.stringify(body):undefined});
const batch={bootId:'abc123',uptimeSeconds:100,lines:[{seq:1,text:'LED 001 | PASSED'}]};
assert.equal((await diagnosticsRequest(storage,call('/logs','POST',batch),1000)).status,403);
await diagnosticsRequest(storage,call('/logs/session','POST',{active:true}),1000);
await diagnosticsRequest(storage,call('/logs','POST',batch),2000);
await diagnosticsRequest(storage,call('/logs','POST',batch),3000);
assert.equal(values.get('diagnosticLog').length,1,'retries must not duplicate lines');
await diagnosticsRequest(storage,call('/logs','POST',{...batch,bootId:'def456'}),4000);
assert.equal(values.get('diagnosticLog').length,2,'reboot sequence can restart');
for(let i=2;i<330;i++)await diagnosticsRequest(storage,call('/logs','POST',{...batch,lines:[{seq:i,text:'HTTP 200'}]}),5000);
assert.equal(values.get('diagnosticLog').length,300);
assert.equal((await diagnosticsRequest(storage,call('/logs','POST',batch),1000+SESSION_MS)).status,403);
await diagnosticsRequest(storage,call('/logs/session','POST',{active:false}),6000);
assert.equal((await (await diagnosticsRequest(storage,call('/logs'),6000)).json()).logSeconds,0);
assert.throws(()=>cleanLog({...batch,lines:[{seq:1,text:'x\ny'}]}));
assert.throws(()=>cleanLog({...batch,lines:[{seq:1,text:'x'.repeat(192)}]}));
assert.throws(()=>cleanLog({...batch,lines:Array(25).fill(batch.lines[0])}));
const publicData=await new DeviceStatus({storage}).fetch(call('/')).then(r=>r.json());
assert.equal(publicData.diagnosticLog,undefined,'public status never exposes log content');

const deviceId='test-device',boardProfile='test-board',token='device-secret-01234567890123456789';
const object=new DeviceStatus({storage});
const env={PUBLISH_ADMIN_TOKEN:'admin-secret',DEVICE_INGEST_TOKENS:JSON.stringify({[deviceId]:{boardProfile,token}}),
 DEVICE_STATUS:{idFromName:x=>x,get:()=>({fetch:(url,options)=>object.fetch(new Request(url,options))})}};
const external=(method,path,auth,body)=>worker.fetch(new Request('https://worker/v1/devices/test-device/logs'+path,{method,headers:auth?{authorization:'Bearer '+auth}:{},body:body?JSON.stringify(body):undefined}),env);
assert.equal((await external('GET','',null)).status,401);
assert.equal((await external('GET','',token)).status,401,'device cannot read remote logs');
assert.equal((await external('POST','/session',token,{active:true})).status,401);
assert.equal((await external('POST','/session','admin-secret',{active:true})).status,200);
assert.equal((await external('POST','',token,batch)).status,200);
assert.equal((await external('GET','','admin-secret')).status,200);

const release={deviceId,boardProfile,version:'1.2.13',chip:'esp32s3',gpio:14,ledCount:16,physicalLedCount:16,size:1500000,md5:'a'.repeat(32),url:'https://example.com/prototype.bin'};
const headers=new Headers({'x-transitcore-chip':'esp32s3','x-transitcore-gpio':'14','x-transitcore-leds':'16','x-transitcore-physical-leds':'16','x-transitcore-firmware':'1.2.12'});
const releases={devices:{[deviceId]:release}};
assert.equal(selectOtaRelease(releases,deviceId,boardProfile,headers).gpio,14);
assert.equal(selectOtaRelease({'*':release},deviceId,boardProfile,headers),null,'no wildcard binaries');
for(const key of ['x-transitcore-chip','x-transitcore-gpio','x-transitcore-leds','x-transitcore-physical-leds']){
 const wrong=new Headers(headers);wrong.set(key,'wrong');assert.equal(selectOtaRelease(releases,deviceId,boardProfile,wrong),null);
}
const installed=new Headers(headers);installed.set('x-transitcore-firmware','1.2.13');
assert.equal(selectOtaRelease(releases,deviceId,boardProfile,installed),null);
assert.throws(()=>selectOtaRelease({devices:{[deviceId]:{...release,deviceId:'different'}}},deviceId,boardProfile,headers));
assert.throws(()=>selectOtaRelease({devices:{[deviceId]:{...release,md5:''}}},deviceId,boardProfile,headers));
console.log('Wireless diagnostics: authorization, expiry, reboot, deduplication, retention and OTA targeting OK');

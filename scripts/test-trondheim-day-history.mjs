import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compactFrame,recordDaySample,pinDemo,dayHistoryStorage,handleTrondheimHistory} from '../worker/trondheim-history.mjs';
const board='trondheim-shared-stops-board';
const localDay=stamp=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(stamp));
class Storage{
 data=new Map();
 async get(k){return this.data.get(k)}
 async put(k,v){this.data.set(k,structuredClone(v))}
 async delete(k){this.data.delete(k)}
 async list({prefix='',limit=1000,startAfter=''}){return new Map([...this.data].filter(([k])=>
   k.startsWith(prefix)&&k>startAfter).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))}
}
const store=new Storage(),now=Date.now(),day=localDay(now);
const previous=localDay(now-24*60*60*1000);
const sample=offset=>new Date(now+offset).toISOString();
const makeFrame=(at,sequence=5)=>({schemaVersion:1,boardProfile:board,ledCount:147,
 generatedAt:at,sequence,ttlSeconds:30,leds:[
 {id:8,rgb:[25,90,110],brightness:32,state:'AT_STOP',
  vehicle:{id:'test-bus-11',line:'11',destination:'Lerkendal',latitude:63.1,longitude:10.4,source:'GPS'},
  occupants:[{id:'test-bus-11',line:'11',destination:'Lerkendal',latitude:63.1,longitude:10.4,
   ageSeconds:8,distanceMeters:11,source:'GPS',state:'AT_STOP',rgb:[25,90,110]}]}
 ]});
const f=makeFrame(sample(-1000));
assert.equal(compactFrame(f).leds[0].occupants[0].source,'GPS');
assert.equal(compactFrame(f).leds[0].occupants[0].latitude,undefined,'Do not expose raw GPS coordinates in history');
assert.equal(compactFrame(f).leds[0].vehicle.latitude,undefined);
assert.throws(()=>compactFrame({...f,boardProfile:'oslo-metro-board'}),/invalid_recorded_frame/);
assert.throws(()=>compactFrame({...f,leds:[f.leds[0],f.leds[0]]}),/invalid_recorded_led/);
assert.equal((await recordDaySample(store,{capturedAt:sample(-1000),frame:f})).status,'OK');
assert.equal((await recordDaySample(store,{capturedAt:sample(-1000),frame:null,error:'HTTP 503'})).status,'ALREADY_OK');
const gapAt=sample(-301000);
assert.equal((await recordDaySample(store,{capturedAt:gapAt,error:'HTTP 503'})).status,'ERROR');
const pageReq=new Request('https://status.internal/trondheim-history?day='+day+'&limit=1');
let page=await dayHistoryStorage(store,pageReq).then(r=>r.json());
assert.equal(page.records.length,1);assert(page.nextCursor);
page=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history?day='+day+
 '&limit=1&cursor='+page.nextCursor)).then(r=>r.json());
assert.equal(page.records.length,1);assert.equal(page.nextCursor,null);
assert.equal(page.records[0].status,'OK');
const meta=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
assert.equal(meta.boardProfile,board);assert.equal(meta.cadenceMinutes,5);
assert.equal(meta.days[0].count,2);assert.equal(meta.days[0].errors,1);
assert.equal((await pinDemo(store,day,now)).status,409,'Do not archive unfinished current day');
// A near-complete previous day is preserved automatically even if the user
// does not open the browser or enter an administrator key.
const auto=new Storage(),prefix='trondheim-history:v1:';
await auto.put(prefix+'index',[previous]);
await auto.put(prefix+'meta:'+previous,{day:previous,count:270,errors:3,
 first:new Date(now-30*3600000).toISOString(),last:new Date(now-7*3600000).toISOString()});
await recordDaySample(auto,{capturedAt:new Date(now-1000).toISOString(),frame:makeFrame(new Date(now-1000).toISOString())});
const autoIndex=await dayHistoryStorage(auto,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
assert.equal(autoIndex.archive.day,previous);
assert.equal(autoIndex.archive.automatic,true,'First complete day is kept for future demos');

const pastTime=now-24*3600000;
assert.equal((await recordDaySample(store,{capturedAt:new Date(pastTime).toISOString(),frame:makeFrame(new Date(pastTime).toISOString(),100)})).status,'OK');
const pinned=await pinDemo(store,previous,now);
assert.equal(pinned.status,200);assert.equal(pinned.body.demo.day,previous);
const archived=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history?demo=1')).then(r=>r.json());
assert.equal(archived.day,previous);assert.equal(archived.archived,true);assert.equal(archived.records.length,1);
assert.equal((await pinDemo(store,'1999-01-01',now)).status,404);
const unauth=await handleTrondheimHistory(new Request('https://worker.example/v1/admin/trondheim/history/demo',
 {method:'POST',body:JSON.stringify({day:previous})}),{},async()=>true);
assert.equal(unauth.status,503);
const env={PUBLISH_ADMIN_TOKEN:'test-admin',
 DEVICE_STATUS:{idFromName:value=>value,get:()=>({
 fetch:(url,opts)=>dayHistoryStorage(store,new Request(url,opts))
 })}};
const forbidden=await handleTrondheimHistory(new Request('https://worker.example/v1/admin/trondheim/history/demo',{
 method:'POST',headers:{authorization:'Bearer incorrect',origin:'https://5mkbt4m7n8-hue.github.io'},
 body:JSON.stringify({day:previous})
}),env,async(a,b)=>a===b);
assert.equal(forbidden.status,401);
const approved=await handleTrondheimHistory(new Request('https://worker.example/v1/admin/trondheim/history/demo',{
 method:'POST',headers:{authorization:'Bearer test-admin',origin:'https://5mkbt4m7n8-hue.github.io'},
 body:JSON.stringify({day:previous})
}),env,async(a,b)=>a===b);
assert.equal(approved.status,200);
const publicResponse=await handleTrondheimHistory(new Request('https://worker.example/v1/trondheim/history'),env,async()=>false);
assert.equal(publicResponse.status,200);
assert.equal((await publicResponse.json()).archive.day,previous);
const worker=fs.readFileSync(new URL('../worker/led-feed-worker.mjs',import.meta.url),'utf8');
assert.match(worker,/boardFrameResponse\("trondheim-shared-stops-board",env,"history"\)/);
assert.match(worker,/recordScheduledTrondheimFrame\(/);
assert.match(worker,/v1\/trondheim\/history/);
const ui=fs.readFileSync(new URL('../web/linear/network/map.js',import.meta.url),'utf8');
const browser=fs.readFileSync(new URL('../web/linear/network/history-ui.js',import.meta.url),'utf8');
for(const text of ['playbackFrame','playbackClock','recordedStop','loadReplayBoard','History.create'])assert(ui.includes(text));
for(const text of ['dayHistory','timeline','archive','Bevar valgt døgn','onFrame(sample)','onLive()'])assert(browser.includes(text));
console.log('Trondheim history: 5min records, explicit errors, pagination, 24h+demo, privacy, admin and replay hooks PASS');

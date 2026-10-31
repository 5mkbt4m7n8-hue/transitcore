import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fastLine1Storage,recordFastLine1Sample,handleFastLine1History}
 from '../worker/trondheim-line1-fast.mjs';
import {summarizeLine1ScheduledFrame} from '../worker/trondheim-line1-quality.mjs';
const require=createRequire(import.meta.url);
const {create}=require('../web/linear/network/line1-quality-report.js');
const board=JSON.parse(readFileSync(new URL('../config/boards/trondheim-city-lines-catalog.json',import.meta.url)));
const patterns=JSON.parse(readFileSync(new URL('../config/gps/atb-journey-patterns-1-11.json',import.meta.url)));
const profile=JSON.parse(readFileSync(new URL('../config/routes/atb-bus-1-live.json',import.meta.url)));
const quay='NSR:Quay:102733';
const node=board.nodes.find(n=>n.quayId===quay);
assert(node&&Number.isInteger(node.led));
// Two sample slots belong to one Oslo day, even if CI runs at midnight.
// Noon UTC works as a stable local daytime anchor in both CET and CEST.
const osloDay=new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
const now=Date.parse(osloDay+'T12:00:00Z'),at=new Date(now-1000).toISOString();
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
const privateVehicle='ATB:Vehicle:PRIVATE-EXAMPLE-12345';
const gps={schemaVersion:1,boardProfile:board.id,ledCount:board.leds.count,
 generatedAt:at,sequence:Math.floor(now/1000),ttlSeconds:30,
 leds:[{id:node.led,state:'APPROACHING',
 occupants:[{id:privateVehicle,line:'1',destination:'Ranheim',
  positionType:'gps-nearest-stop',nearestQuayLed:node.led,state:'APPROACHING'}]}]};
const summary=summarizeLine1ScheduledFrame(gps,board);
assert(summary&&summary.items.some(([q])=>q===quay));
assert.equal(summary.items.find(([q])=>q===quay)[1].gps,1);
assert(!JSON.stringify(summary).includes(privateVehicle));
assert.equal((await recordFastLine1Sample(store,{capturedAt:at,quality:summary},now)).status,'OK');
assert.equal((await recordFastLine1Sample(store,{capturedAt:at,quality:summary},now)).status,'ALREADY_OK');
const url='https://status.internal/line1-fast-history';
const index=await fastLine1Storage(store,new Request(url)).then(r=>r.json());
assert.equal(index.cadenceMinutes,5);
assert.equal(index.offsetMinutes,2);
assert.equal(index.days.length,1);
assert.equal(index.days[0].count,1);
const day=index.days[0].day;
let page=await fastLine1Storage(store,new Request(url+'?day='+day)).then(r=>r.json());
assert.equal(page.records.length,1);
assert.equal(page.records[0].status,'OK');
assert.equal(page.records[0].quality.items.find(([q])=>q===quay)[1].gps,1);
assert(!JSON.stringify(page).includes(privateVehicle));
const errorAt=new Date(now+301000).toISOString();
assert.equal((await recordFastLine1Sample(store,{capturedAt:errorAt,quality:null,error:'HTTP 429'},now)).status,'ERROR');
page=await fastLine1Storage(store,new Request(url+'?day='+day+'&limit=1')).then(r=>r.json());
assert.equal(page.records.length,1);
assert(page.nextCursor);
const page2=await fastLine1Storage(store,new Request(url+'?day='+day+'&limit=1&cursor='+page.nextCursor)).then(r=>r.json());
assert.equal(page2.records.length,1);
assert.equal(page2.records[0].status,'ERROR');
assert.equal(page2.records[0].error,'HTTP 429');
assert.equal(page2.nextCursor,null);
const meta=await fastLine1Storage(store,new Request(url)).then(r=>r.json());
assert.equal(meta.days[0].errors,1);
assert.equal((await fastLine1Storage(store,new Request(url+'?day=2000-01-01'))).status,404);
assert.equal((await fastLine1Storage(store,new Request(url+'?day='+day+'&cursor=abc'))).status,400);
const wrongOrigin=await handleFastLine1History(
 new Request('https://worker.example/v1/trondheim/line1-fast',{headers:{origin:'https://evil.example'}}),
 {DEVICE_STATUS:{}});
assert.equal(wrongOrigin.status,403);
const env={DEVICE_STATUS:{idFromName:x=>x,get:()=>({
 fetch:(url,options)=>fastLine1Storage(store,new Request(url,options))
})}};
const publicRead=await handleFastLine1History(
 new Request('https://worker.example/v1/trondheim/line1-fast?day='+day,
 {headers:{origin:'https://5mkbt4m7n8-hue.github.io'}}),env);
assert.equal(publicRead.status,200);
assert.equal((await publicRead.json()).records.length,2);
const quality=create({board,profile,patterns,clock:()=>now});
const oldRecord={version:1,slot:Math.floor(now/300000)*300000-300000,
 capturedAt:new Date(now-300000).toISOString(),status:'OK',
 frame:{boardProfile:board.id,leds:[]}};
const full=quality.historyReport([oldRecord],{day,
 fastRecords:[...page.records,...page2.records]});
assert.equal(full.samples,2,'Full frame + one valid GPS midpoint');
assert.equal(full.total,3,'Include failed extra sample in total');
assert.equal(full.fastSamples,1);
assert.equal(full.fastErrors,1);
assert.equal(full.rows.find(r=>r.quay===quay).gps,1);
assert.equal(full.rows.find(r=>r.quay===quay).siri,0);
assert(!JSON.stringify(full).includes(privateVehicle));
assert.throws(()=>quality.historyReport([],{fastRecords:[page.records[0],page.records[0]]}),
 /invalid-fast-time/);
const missing=quality.historyReport([oldRecord],{day});
assert.equal(missing.fastSamples,0,'Old Worker remains backward compatible');
assert.equal(missing.samples,1);
const worker=readFileSync(new URL('../worker/led-feed-worker.mjs',import.meta.url),'utf8');
const wrangler=readFileSync(new URL('../worker/wrangler.toml',import.meta.url),'utf8');
assert(worker.includes('runFastLine1Sample(env,controller.scheduledTime)'));
assert(worker.includes("profiles:[profile],hardware,vehicles:onlyLine1"));
assert(wrangler.includes('2-59/5 * * * *'));
console.log('Line 1 fast sampling: GPS-only compact evidence, DO pagination, error slots, history merge, public read and 2-minute offset PASS');

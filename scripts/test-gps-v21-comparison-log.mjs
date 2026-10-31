import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const V20=require('../web/linear/network/gps-v20-baseline.js');
const V21=require('../web/linear/network/gps-v2-shadow.js');
const Logger=require('../web/linear/network/gps-v2-comparison-log.js');
const base=Date.parse('2026-10-31T18:00:00Z');
const a={quayId:'NSR:Quay:901001',stationId:'NSR:StopPlace:90100',
 led:1,lat:63.4000,lon:10.4000,routes:['atb-bus-1-live'],stopIds:['NSR:Quay:901001']};
const b={...a,led:2,quayId:'NSR:Quay:901002',
 lon:10.4002,stopIds:['NSR:Quay:901002']};
const c={...a,led:3,quayId:'NSR:Quay:901003',lat:63.402,
 stopIds:['NSR:Quay:901003']};
const x={...a,led:4,quayId:'NSR:Quay:902001',lat:63.43,
 routes:['atb-bus-11-live'],stopIds:['NSR:Quay:902001']};
const y={...x,led:5,quayId:'NSR:Quay:902002',lat:63.432,
 stopIds:['NSR:Quay:902002']};
const board={id:'trondheim-city-lines-catalog',nodes:[a,b,c,x,y],
 routes:['atb-bus-1-live','atb-bus-11-live'],
 render:{freshnessSeconds:30,arrivalRadiusMeters:85}};
const patterns={lines:{
 '1':{patterns:[
  {directionType:'inbound',quays:[a.quayId,c.quayId]},
  {directionType:'outbound',quays:[b.quayId,'NSR:Quay:901004']}
 ]},
 '11':{patterns:[{directionType:'inbound',quays:[x.quayId,y.quayId]},
  {directionType:'outbound',quays:[y.quayId,x.quayId]}]}
}};
const SECRET='NEVER-STORE-BUS-ID',SRC='production';
function make(t,node,opts={}){
 const vehicle={id:opts.id||SECRET,line:opts.line||'1',
  positionType:'gps-nearest-stop',ageSeconds:1,
  latitude:opts.lat??node.lat,longitude:opts.lon??node.lon};
 return {boardProfile:board.id,generatedAt:new Date(t).toISOString(),
  ttlSeconds:30,leds:[{id:node.led,state:'APPROACHING',vehicle,
   occupants:[{id:vehicle.id,line:vehicle.line,positionType:'gps-nearest-stop'},
    {id:'OTHER-PRIVATE-VEHICLE',line:vehicle.line,positionType:'gps-nearest-stop'}]}]};
}
const store=new Map();
const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),
 removeItem:k=>store.delete(k)};
const old=V20.create({board,patterns});
const next=V21.create({board,patterns});
const log=Logger.create({storage,clock:()=>base+1000});
function step(frame,source=SRC){
 const at=Date.parse(frame.generatedAt)+1000;
 old.ingest(frame,{now:at,source});next.ingest(frame,{now:at,source});
 return log.record({frame,v20:old.summary(),v21:next.summary(),source,now:at});
}
const f1=make(base,a,{lon:a.lon+0.0001});const copy=JSON.stringify(f1);
assert.equal(step(f1).recorded,true);
assert.equal(JSON.stringify(f1),copy);
let summary=log.report({now:base+1000,source:SRC});
assert.equal(summary.lines['1'].frames,1);
assert.equal(summary.lines['1'].livePrimaryGps,1);
assert.equal(summary.lines['1'].liveOtherGpsNoCoordinates,1);
assert.equal(summary.lines['1'].v20Supported,0);
assert.equal(summary.lines['1'].v21Supported,0);
assert.equal(step(f1).reason,'DUPLICATE_FRAME');
assert.equal(log.report({now:base+1000}).lines['1'].frames,1);
const f2=make(base+10000,c);
assert.equal(step(f2).recorded,true);
summary=log.report({now:base+11000,source:SRC});
assert.equal(summary.lines['1'].frames,2);
assert.equal(summary.lines['1'].v20Supported,0,
 'Frozen V2.0 cannot resolve first ambiguous A/B frame');
assert.equal(summary.lines['1'].v21Supported,1,
 'V2.1 can resolve an ambiguous origin after a distinct matching Quay');
assert.equal(summary.lines['1'].v21Resolved,1);
assert.equal(summary.lines['1'].v21Narrowed,1);
assert.equal(summary.lines['1'].livePrimaryGps,2);
assert.equal(summary.lines['1'].liveOtherGpsNoCoordinates,2);
assert.equal(summary.lines['11'].frames,2,
 'A completely empty other line still has comparable frame coverage');
assert.equal(summary.minutesWithSamples,1,'Minute buckets, not raw events');
assert.equal(log.report({now:base+11000,source:SRC}).sessionFrames,2);
assert(!JSON.stringify([...store]).includes(SECRET));
assert(!JSON.stringify([...store]).includes('OTHER-PRIVATE-VEHICLE'));
assert(!JSON.stringify([...store]).includes('latitude'));
assert(!JSON.stringify([...store]).includes(a.quayId));
assert(!log.exportCsv({now:base+11000}).includes(SECRET));
assert(!log.exportJson({now:base+11000}).includes(SECRET));
assert(log.exportCsv({now:base+11000}).startsWith('minuteUtc,source,line,frames,'));
const reopened=Logger.create({storage,clock:()=>base+11000});
assert.equal(reopened.report({now:base+11000}).lines['1'].v21Resolved,1,
 'Only anonymous minute aggregates persist across browser reloads');
const stale=make(base+20000,c);
assert.equal(log.record({frame:stale,v20:old.summary(),v21:next.summary(),
 source:SRC,now:base+90000}).reason,'EXPIRED_FRAME');
assert.equal(log.report({now:base+90000}).lines['1'].frames,2);
const staging=make(base+30000,c);
assert.equal(step(staging,'staging').recorded,true);
assert.equal(log.report({now:base+31000,source:'staging'}).lines['1'].frames,1);
assert.equal(log.report({now:base+31000,source:SRC}).lines['1'].frames,2);
assert.equal(log.report({now:base+31000}).lines['1'].frames,3);
assert.equal(step(staging,'staging').reason,'DUPLICATE_FRAME');
const future=make(base+25*3600000,c);
step(future,'staging');
assert.equal(log.report({now:base+25*3600000+1000}).lines['1'].frames,1,
 'No raw or aggregate records survive beyond rolling 24h');
assert.equal(log.report({now:base+25*3600000+1000}).minutesWithSamples,1);
log.clear();
assert.equal(log.report({now:base+25*3600000+1000}).lines['1'].frames,0);
assert(!store.size,'Clearing log deletes the own storage key');
// Persisted input is sanitized: other fields, including unexpected IDs, are
// never rehydrated into the report or a subsequent export.
const unsafe={version:1,rows:[{minute:base,source:'production',line:'1',
 frames:1,vehicleId:SECRET,gps:[63.1,10.4],
 ...Object.fromEntries(Logger.keys.map(k=>[k,0]))}]};
storage.setItem('intransit-trondheim-gps-v21-anonymous-minutes-v1',JSON.stringify(unsafe));
const sanitized=Logger.create({storage,clock:()=>base+1000});
assert.equal(sanitized.report({now:base+1000}).lines['1'].frames,1);
assert(!sanitized.exportJson({now:base+1000}).includes(SECRET));
const html=readFileSync(new URL('../web/linear/index.html',import.meta.url),'utf8');
assert(html.includes('InTransitGpsV20Shadow.create'));
assert(html.includes('gpsCompareLog.record({frame,source'));
assert(html.includes('gpsCompareLog.exportCsv()'));
assert(html.includes('id="gpsCompareRows"'));
assert(html.includes('id="gpsCompareClear"'));
const yaml=readFileSync(new URL('../.github/workflows/linear-mobile.yml',import.meta.url),'utf8');
assert(yaml.includes('node scripts/test-gps-v21-comparison-log.mjs'));
console.log('Trondheim GPS V2.0/V2.1 vs live: same fresh frames, V2.1 later disambiguation, duplicate/old frame protection, source separation, minute rollups, 24h expiry and anonymous JSON/CSV PASS');
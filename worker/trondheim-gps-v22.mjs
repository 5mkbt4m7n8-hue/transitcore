// Read-only GPS V2.2 daily proof, fed ONLY by existing scheduled source samples.
// Vehicle IDs and GPS coordinates remain in the Durable Object's volatile RAM
// for the existing V2.0/V2.1 engines. They are NEVER written to storage,
// returned by the API, logged, or added to the public PixelFrame.
import v20 from '../web/linear/network/gps-v20-baseline.js';
import v21 from '../web/linear/network/gps-v2-shadow.js';
import sourcePatterns from '../config/gps/atb-journey-patterns-1-11.json' with {type:'json'};

const BOARD='trondheim-city-lines-catalog',ROOT='trondheim-gps-v22:v1:';
const LINES=['1','11'],LANES=['catalog','line1-fast'],CUTOFF=85;
const FIELDS=['gpsPrimary','gpsSecondaryUnlocated','v20Compared','v20Supported',
 'v20Unresolved','v20DifferentLed','v21Compared','v21Supported',
 'v21Unresolved','v21DifferentLed','retained','narrowed','resolved',
 'sourceStop','sequenceConflict','hypothesisLimit'];
const SPOTS=[['lerkendal-1','1','NSR:Quay:102720'],
 ['lerkendal-11','11','NSR:Quay:73421'],
 ['tonstadkrysset-1','1','NSR:Quay:102733']];
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'access-control-allow-origin':'https://5mkbt4m7n8-hue.github.io',
 'access-control-allow-methods':'GET, OPTIONS'}});
const valid=x=>Number.isSafeInteger(x)&&x>=0&&x<=5000;
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&
 !Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const dayOf=ts=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(ts));
const zero=()=>Object.fromEntries(FIELDS.map(k=>[k,0]));
const siteZero=()=>({nearGps:0,overlappingQuays:0});
const bucketKey=(day,lane,slot)=>ROOT+'sample:'+day+':'+slot+':'+lane;
const prefix=day=>ROOT+'sample:'+day+':';
const freshSlot=(at,now)=>Number.isFinite(at)&&Math.abs(now-at)<=48*3600000;
const metres=(a,b)=>{
 const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r;
 const z=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(z)));
};
const sitesFor=board=>SPOTS.map(([name,line,q])=>{
 const node=board.nodes.find(n=>n.quayId===q&&Number.isFinite(n.lat)&&Number.isFinite(n.lon));
 return node?{name,line,quay:q,lat:node.lat,lon:node.lon}:null;
}).filter(Boolean);
function gpsCounters(frame,board,lane){
 const lines=Object.fromEntries(LINES.map(line=>[line,zero()]));
 const spots=Object.fromEntries(SPOTS.map(([name])=>[name,siteZero()]));
 const points=sitesFor(board),validLines=new Set(lane==='line1-fast'?['1']:LINES);
 const live=new Map(),duplicates=new Set();
 for(const led of frame.leds){
  const v=led?.vehicle,code=String(v?.line||'');
  if(validLines.has(code)&&typeof v?.id==='string'&&v.id&&
     v.positionType==='gps-nearest-stop'&&Number.isFinite(v.latitude)&&
     Number.isFinite(v.longitude)&&Math.abs(v.latitude)<=90&&
     Math.abs(v.longitude)<=180&&Number.isFinite(v.ageSeconds)&&
     v.ageSeconds>=0&&v.ageSeconds<=30){
   const key=code+'|'+v.id;
   if(live.has(key))duplicates.add(key);
   else live.set(key,{v,code,led});
  }
  for(const other of Array.isArray(led?.occupants)?led.occupants:[]){
   const line=String(other?.line||'');
   if(validLines.has(line)&&other?.positionType==='gps-nearest-stop'&&
     typeof other.id==='string'&&other.id&&
     !(v?.id===other.id&&code===line))lines[line].gpsSecondaryUnlocated++;
  }
 }
 for(const key of duplicates)live.delete(key);
 for(const {v,code} of live.values()){
  lines[code].gpsPrimary++;
  for(const spot of points){
   if(code!==spot.line||metres({lat:v.latitude,lon:v.longitude},spot)>CUTOFF)continue;
   spots[spot.name].nearGps++;
   const near=board.nodes.filter(n=>n.routes?.includes('atb-bus-'+code+'-live')&&
    Number.isFinite(n.lat)&&Number.isFinite(n.lon)&&
    metres({lat:v.latitude,lon:v.longitude},n)<=CUTOFF);
   if(new Set(near.map(n=>n.quayId)).size>1)spots[spot.name].overlappingQuays++;
  }
 }
 return {lines,spots};
}
function makeEngine(board){
 if(board?.id!==BOARD||!Array.isArray(board.nodes)||board.nodes.length>5000)
  throw Error('invalid_catalog');
 return {board,baseline:v20.create({board,patterns:sourcePatterns}),
  newer:v21.create({board,patterns:sourcePatterns}),lastFrame:-Infinity};
}
// Engine state stays solely in volatile object memory. Cloudflare DO eviction
// naturally forgets all per-bus hypotheses: reports MUST NOT assume continuous
// tracking over an entire day or count source-order as verified passages.
export function createVolatileState(board){return makeEngine(board);}
const transfer=(target,old,n)=>Object.assign(target,{
 v20Compared:old.comparedGps,v20Supported:old.acceptedBySourceSequence,
 v20Unresolved:old.unresolved,v20DifferentLed:old.differentFromLive,
 v21Compared:n.comparedGps,v21Supported:n.acceptedBySourceSequence,
 v21Unresolved:n.unresolved,v21DifferentLed:n.differentFromLive,
 retained:n.ambiguousCandidatesRetained||0,narrowed:n.ambiguityNarrowed||0,
 resolved:n.ambiguityResolvedAfterFollowup||0,sourceStop:n.sourceReportedStop||0,
 sequenceConflict:(n.sourceDirectionConflict||0)+(n.sequenceConflict||0),
 hypothesisLimit:n.hypothesisLimit||0
});
export function evaluateV22(frame,board,state,{lane='catalog'}={}){
 if(!LANES.includes(lane)||!state||frame?.boardProfile!==BOARD||
   !Array.isArray(frame.leds)||!Number.isFinite(Date.parse(frame.generatedAt))||
   !Number.isFinite(frame.ttlSeconds)||frame.ttlSeconds<1)
  throw Error('invalid_v22_frame');
 const ts=Date.parse(frame.generatedAt);
 if(ts<=state.lastFrame)throw Error('duplicate_or_reordered_frame');
 const old=state.baseline.ingest(frame,{source:'production',now:ts+1000});
 const newer=state.newer.ingest(frame,{source:'production',now:ts+1000});
 if(old.status!=='ACTIVE_BROWSER_SHADOW'||newer.status!=='ACTIVE_BROWSER_SHADOW')
  throw Error('v22_engine_unavailable');
 state.lastFrame=ts;
 const result=gpsCounters(frame,board,lane);
 const supported=lane==='line1-fast'?['1']:LINES;
 for(const code of supported)transfer(result.lines[code],old.lines[code],newer.lines[code]);
 // A fast Line 1 frame cannot be a negative Line 11 measurement.
 for(const code of LINES)if(!supported.includes(code))delete result.lines[code];
 return {version:1,scope:'scheduled-v22-shadow',lane,lines:result.lines,
  sites:Object.fromEntries(Object.entries(result.spots).filter(([name])=>
   lane==='catalog'||!name.includes('11')))};
}
export function validateV22(value){
 if(value?.version!==1||value.scope!=='scheduled-v22-shadow'||
  !LANES.includes(value.lane)||!value.lines||!value.sites||
  typeof value.lines!=='object'||typeof value.sites!=='object')return null;
 const safe={version:1,scope:'scheduled-v22-shadow',lane:value.lane,lines:{},sites:{}};
 const expected=value.lane==='line1-fast'?['1']:LINES;
 for(const code of expected){
  const v=value.lines[code];if(!v||!FIELDS.every(k=>valid(v[k])))return null;
  safe.lines[code]=Object.fromEntries(FIELDS.map(k=>[k,v[k]]));
 }
 if(Object.keys(value.lines).length!==expected.length)return null;
 for(const [name,code] of SPOTS){
  if(value.lane==='line1-fast'&&code==='11')continue;
  const v=value.sites[name];
  if(!v||!valid(v.nearGps)||!valid(v.overlappingQuays)||
     v.overlappingQuays>v.nearGps)return null;
  safe.sites[name]={nearGps:v.nearGps,overlappingQuays:v.overlappingQuays};
 }
 return safe;
}
export async function recordV22Storage(storage,{at,lane,metrics=null,error=false}={},now=Date.now()){
 const stamp=Date.parse(at||'');
 if(!freshSlot(stamp,now)||!LANES.includes(lane))throw Error('invalid_slot');
 const day=dayOf(stamp),slot=Math.floor(stamp/300000)*300000;
 const key=bucketKey(day,lane,slot),before=await storage.get(key);
 if(before?.status==='OK')return {recorded:false,status:'ALREADY_OK',day};
 const safe=error?null:validateV22(metrics);
 if(!error&&!safe)throw Error('invalid_metrics');
 const data={version:1,day,slot,lane,status:safe?'OK':'ERROR',
  metrics:safe,error:safe?null:'SOURCE_UNAVAILABLE'};
 await storage.put(key,data);
 const indexKey=ROOT+'index',index=await storage.get(indexKey)||[];
 if(!index.includes(day)){index.push(day);index.sort();await storage.put(indexKey,index);}
 const current=dayOf(now),previous=dayOf(Date.UTC(Number(current.slice(0,4)),
  Number(current.slice(5,7))-1,Number(current.slice(8))-1,12));
 const keep=new Set([current,previous]);
 for(const expired of index.filter(d=>!keep.has(d))){
  const entries=await storage.list({prefix:prefix(expired),limit:1000});
  for(const k of entries.keys())await storage.delete(k);
 }
 await storage.put(indexKey,index.filter(d=>keep.has(d)));
 return {recorded:true,status:data.status,day};
}
const sumLine=(lines,code,vals)=>{
 const dest=lines[code]||(lines[code]={frames:0,...zero()});
 dest.frames++;
 for(const k of FIELDS)dest[k]+=vals[k];
};
export async function reportV22Storage(storage,{now=Date.now(),day=null}={}){
 const today=dayOf(now),yesterday=dayOf(Date.UTC(Number(today.slice(0,4)),
  Number(today.slice(5,7))-1,Number(today.slice(8))-1,12));
 const chosen=day||today;
 if(!validDay(chosen)||![today,yesterday].includes(chosen))
  return {error:'day_unavailable'};
 const entries=await storage.list({prefix:prefix(chosen),limit:1000});
 const lines={},spots=Object.fromEntries(SPOTS.map(([name,code])=>
  [name,{line:code,...siteZero(),frames:0}]));
 const lanes={catalog:{samples:0,errors:0},'line1-fast':{samples:0,errors:0}};
 let first=null,last=null;
 for(const item of entries.values()){
  if(!LANES.includes(item?.lane)||item.day!==chosen)continue;
  if(item.status!=='OK'||!validateV22(item.metrics)){lanes[item.lane].errors++;continue;}
  lanes[item.lane].samples++;
  const ts=new Date(item.slot).toISOString();
  if(!first||ts<first)first=ts;if(!last||ts>last)last=ts;
  for(const [code,values] of Object.entries(item.metrics.lines))
   sumLine(lines,code,values);
  for(const [name,values] of Object.entries(item.metrics.sites)){
   if(!spots[name])continue;
   spots[name].frames++;
   spots[name].nearGps+=values.nearGps;
   spots[name].overlappingQuays+=values.overlappingQuays;
  }
 }
 return {version:1,scope:'trondheim-gps-v22-scheduled-quality',
  day:chosen,timezone:'Europe/Oslo',status:lanes.catalog.samples+
   lanes['line1-fast'].samples?'SAMPLES':'NO_SAMPLES',
  lanes,first,last,lines,spots,
  limitations:[
   'Sampling: 5-minute full catalog plus existing 2-minute-offset Line 1 only; no extra provider requests.',
   'V2.0 and V2.1 use the same sample; route hypotheses live in volatile DO memory and may reset.',
   'Five-minute Line 11 samples are too sparse to imply verified A-B-C travel.',
   'Near a focus Quay is geometric proximity only, never a physical arrival or correct platform.',
   'Only primary LED vehicle has usable GPS; IDs and positions are not persisted.',
   'Higher candidate support is not validated GPS accuracy.'
  ]};
}
export async function v22Storage(storage,request){
 const url=new URL(request.url);
 if(url.pathname!=='/gps-v22')return reply({error:'not_found'},404);
 if(request.method==='GET'){
  const result=await reportV22Storage(storage,{day:url.searchParams.get('day')||null});
  return reply(result,result.error?404:200);
 }
 return reply({error:'method_not_allowed'},405);
}
export async function handleV22Public(request,env){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
  'access-control-allow-origin':'https://5mkbt4m7n8-hue.github.io',
  'access-control-allow-methods':'GET, OPTIONS'}});
 if(request.method!=='GET')return reply({error:'method_not_allowed'},405);
 const origin=request.headers.get('origin');
 if(origin&&origin!=='https://5mkbt4m7n8-hue.github.io')
  return reply({error:'invalid_origin'},403);
 if(!env?.DEVICE_STATUS)return reply({error:'storage_unavailable'},503);
 try{
  const stub=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName('__trondheim-gps-v22__'));
  const search=new URL(request.url).search;
  const res=await stub.fetch('https://status.internal/gps-v22'+search);
  return new Response(res.body,{status:res.status,headers:{
   'content-type':'application/json; charset=utf-8','cache-control':'no-store',
   'access-control-allow-origin':'https://5mkbt4m7n8-hue.github.io'}});
 }catch{return reply({error:'report_unavailable'},503);}
}
export async function recordScheduledV22(env,frame,board,lane,at=new Date().toISOString(),error=false){
 if(!env.DEVICE_STATUS)return {recorded:false,error:'storage_unavailable'};
 const stub=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName('__trondheim-gps-v22__'));
 const r=await stub.fetch('https://status.internal/gps-v22/observe',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({at,lane,frame:frame||null,board:board||null,error})
 });
 if(!r.ok)throw Error('v22_store_http_'+r.status);
 return r.json();
}
// The Worker alone invokes this internal endpoint; no public write route.
export async function observeV22Internal(storage,request,volatile,now=Date.now()){
 if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
 let payload;try{payload=await request.json();}catch{return reply({error:'invalid_json'},400);}
 const {at,lane,frame,board,error}=payload||{};
 if(!LANES.includes(lane)||!freshSlot(Date.parse(at||''),now))
  return reply({error:'invalid_observation'},400);
 const slot=Math.floor(Date.parse(at)/300000)*300000;
 const existing=await storage.get(bucketKey(dayOf(Date.parse(at)),lane,slot));
 if(existing?.status==='OK')return reply({recorded:false,status:'ALREADY_OK'});
 let metrics=null;
 if(!error&&frame&&board){
  try{
   // Changing catalog geometry invalidates the prior ephemeral hypotheses.
   const fingerprint=String(frame.profileFingerprint||'')+':'+String(board.nodes.length);
   if(!volatile.engine||volatile.fingerprint!==fingerprint){
    volatile.engine=createVolatileState(board);volatile.fingerprint=fingerprint;
   }
   metrics=evaluateV22(frame,board,volatile.engine,{lane});
   if(!validateV22(metrics))throw Error('invalid_v22_metrics');
  }catch(err){
   // Fail closed instead of recording fake zero GPS traffic.
   console.warn('gps_v22_shadow_unavailable',err?.message||'unknown');
  }
 }
 try{
  const result=await recordV22Storage(storage,{at,lane,metrics,error:!metrics},now);
  return reply(result);
 }catch{return reply({error:'record_failed'},503);}
}

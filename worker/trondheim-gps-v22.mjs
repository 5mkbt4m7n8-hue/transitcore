// Read-only GPS V2.2 daily proof, fed ONLY by existing scheduled source samples.
// Vehicle IDs and GPS coordinates remain in the Durable Object's volatile RAM
// for the existing V2.0/V2.1 engines. They are NEVER written to storage,
// returned by the API, logged, or added to the public PixelFrame.
import v20 from '../web/linear/network/gps-v20-baseline.js';
import v21 from '../web/linear/network/gps-v2-shadow.js';
import sourcePatterns from '../config/gps/atb-journey-patterns-1-11.json' with {type:'json'};

const BOARD='trondheim-city-lines-catalog',ROOT='trondheim-gps-v22:v1:';
const LINES=['1','11'],LANES=['catalog','line1-fast','dual-fast'],CUTOFF=85;
const TTL_MS=180000,SEEN_WINDOW_MS=30*60000;
const DIAG_FIELDS=['firstSeen','sameVehicleWithin3m','sameVehicleAfter3m',
 'outsideQuayRadius','oneNearbyQuay','multipleNearbyQuays'];
const zeroDiag=()=>Object.fromEntries(DIAG_FIELDS.map(key=>[key,0]));
// V2.4: counters only. IDs and positions never leave the DO's volatile memory.
const MEMORY=['coldStart','catalogReset','continued','priorWithin3m',
 'priorAfter3m','priorUnknown'];
const FRAME_MATCH=['priorFrameKnown','priorPrimary','currentPrimary',
 'repeatedPrimary','newSincePrior','absentSincePrior','uncomparablePrimary'];
const zeroMemory=()=>Object.fromEntries(MEMORY.map(k=>[k,0]));
const zeroFrameMatch=()=>Object.fromEntries(FRAME_MATCH.map(k=>[k,0]));
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
  newer:v21.create({board,patterns:sourcePatterns}),lastFrame:-Infinity,
  lastGps:new Map(),previousPrimary:new Map()};
}
// Fingerprint only STABLE source catalog geometry and route membership. The
// per-frame profileFingerprint changes when a catalog-only route filter
// differs from the dual-line fast frame; using it resets every hypothesis
// across alternating scheduled samples.
export function v23BoardSignature(board){
 if(board?.id!==BOARD||!Array.isArray(board.nodes))throw Error('invalid_board_signature');
 let h=2166136261;
 const consume=value=>{
  for(const ch of String(value)){h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;}
 };
 consume(board.id);consume(board.profileRevision??'');
 for(const id of board.routes||[])consume(id);
 for(const n of board.nodes){
  consume(n.quayId);consume(n.led);consume(n.lat);consume(n.lon);
  for(const route of n.routes||[])consume(route);
 }
 return String(h>>>0)+':'+board.nodes.length;
}
function continuity(frame,board,state,ts,lane){
 const validLines=lane==='line1-fast'?new Set(['1']):new Set(LINES);
 const result=Object.fromEntries([...validLines].map(code=>[code,zeroDiag()]));
 const frameMatch=Object.fromEntries([...validLines].map(code=>[code,zeroFrameMatch()]));
 const current=Object.fromEntries([...validLines].map(code=>[code,new Set()]));
 for(const [key,last] of state.lastGps)
  if(ts-last>SEEN_WINDOW_MS||ts<last)state.lastGps.delete(key);
 const unique=new Map(),duplicates=new Set();
 for(const led of frame.leds){
  const v=led?.vehicle,code=String(v?.line||'');
  if(!validLines.has(code)||typeof v?.id!=='string'||!v.id||
     v.positionType!=='gps-nearest-stop'||!Number.isFinite(v.latitude)||
     !Number.isFinite(v.longitude)||Math.abs(v.latitude)>90||
     Math.abs(v.longitude)>180||!Number.isFinite(v.ageSeconds)||
     v.ageSeconds<0||v.ageSeconds>30)continue;
  const key=code+'|'+v.id;
  if(unique.has(key))duplicates.add(key);else unique.set(key,{code,v});
 }
 for(const key of duplicates)unique.delete(key);
 for(const [key,{code,v}] of unique){
  current[code].add(key);
  const counters=result[code],last=state.lastGps.get(key),age=ts-last;
  if(last==null||age<0)counters.firstSeen++;
  else if(age<=TTL_MS)counters.sameVehicleWithin3m++;
  else counters.sameVehicleAfter3m++;
  const n=board.nodes.filter(node=>node?.routes?.includes('atb-bus-'+code+'-live')&&
    Number.isFinite(node.lat)&&Number.isFinite(node.lon)&&
    metres({lat:v.latitude,lon:v.longitude},node)<=CUTOFF);
  const candidates=new Set(n.map(node=>node.quayId)).size;
  if(!candidates)counters.outsideQuayRadius++;
  else if(candidates===1)counters.oneNearbyQuay++;
  else counters.multipleNearbyQuays++;
  state.lastGps.set(key,ts);
 }
 for(const code of validLines){
  const prior=state.previousPrimary.get(code),nowKeys=current[code];
  const evidence=frameMatch[code];
  evidence.currentPrimary=nowKeys.size;
  if(prior){
   evidence.priorFrameKnown=1;
   evidence.priorPrimary=prior.size;
   evidence.repeatedPrimary=[...nowKeys].filter(id=>prior.has(id)).length;
   evidence.newSincePrior=nowKeys.size-evidence.repeatedPrimary;
   evidence.absentSincePrior=prior.size-evidence.repeatedPrimary;
  }else{
   evidence.uncomparablePrimary=nowKeys.size;
  }
  state.previousPrimary.set(code,nowKeys);
 }
 return {result,frameMatch};
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
export function evaluateV22(frame,board,state,{lane='catalog',memory='continued'}={}){
 if(!LANES.includes(lane)||!state||frame?.boardProfile!==BOARD||
   !Array.isArray(frame.leds)||!Number.isFinite(Date.parse(frame.generatedAt))||
   !Number.isFinite(frame.ttlSeconds)||frame.ttlSeconds<1)
  throw Error('invalid_v22_frame');
 const ts=Date.parse(frame.generatedAt);
 if(ts<=state.lastFrame)throw Error('duplicate_or_reordered_frame');
 if(!['continued','coldStart','catalogReset'].includes(memory))
  throw Error('invalid_memory_evidence');
 const previousAt=state.lastFrame;
 const memoryEvidence=zeroMemory();
 memoryEvidence[memory]=1;
 if(previousAt===-Infinity)memoryEvidence.priorUnknown=1;
 else if(ts-previousAt<=TTL_MS)memoryEvidence.priorWithin3m=1;
 else memoryEvidence.priorAfter3m=1;
 const old=state.baseline.ingest(frame,{source:'production',now:ts+1000});
 const newer=state.newer.ingest(frame,{source:'production',now:ts+1000});
 if(old.status!=='ACTIVE_BROWSER_SHADOW'||newer.status!=='ACTIVE_BROWSER_SHADOW')
  throw Error('v22_engine_unavailable');
 state.lastFrame=ts;
 const result=gpsCounters(frame,board,lane);
 const supported=lane==='line1-fast'?['1']:LINES;
 const {result:detail,frameMatch}=continuity(frame,board,state,ts,lane);
 for(const code of supported){
  transfer(result.lines[code],old.lines[code],newer.lines[code]);
  result.lines[code].diagnostics=detail[code];
  result.lines[code].frameMatch=frameMatch[code];
 }
 // A fast Line 1 frame cannot be a negative Line 11 measurement.
 for(const code of LINES)if(!supported.includes(code))delete result.lines[code];
 return {version:1,scope:'scheduled-v22-shadow',lane,lines:result.lines,
  memory:memoryEvidence,sites:Object.fromEntries(Object.entries(result.spots).filter(([name])=>
   lane!=='line1-fast'||!name.includes('11')))};
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
  // Older V2.2 slots have no V2.3 evidence. Never backfill them as zero.
  if(v.diagnostics!=null){
   if(typeof v.diagnostics!=='object'||Array.isArray(v.diagnostics)||
      !DIAG_FIELDS.every(key=>valid(v.diagnostics[key])))return null;
   const d=v.diagnostics;
   if(d.firstSeen+d.sameVehicleWithin3m+d.sameVehicleAfter3m!==v.gpsPrimary||
      d.outsideQuayRadius+d.oneNearbyQuay+d.multipleNearbyQuays!==v.gpsPrimary)
    return null;
   safe.lines[code].diagnostics=Object.fromEntries(
    DIAG_FIELDS.map(key=>[key,d[key]]));
  }
  if(v.frameMatch!=null){
   const m=v.frameMatch;
   if(!m||typeof m!=='object'||Array.isArray(m)||
      !FRAME_MATCH.every(k=>valid(m[k]))||
      m.currentPrimary!==v.gpsPrimary||
      m.priorFrameKnown>1||m.repeatedPrimary>m.priorPrimary||
      m.repeatedPrimary>m.currentPrimary||
      m.newSincePrior+m.repeatedPrimary+m.uncomparablePrimary!==m.currentPrimary||
      m.absentSincePrior+m.repeatedPrimary!==m.priorPrimary||
      (m.priorFrameKnown===0&&(m.priorPrimary!==0||m.repeatedPrimary!==0||
       m.newSincePrior!==0||m.absentSincePrior!==0))||
      (m.priorFrameKnown===1&&m.uncomparablePrimary!==0))return null;
   safe.lines[code].frameMatch=Object.fromEntries(FRAME_MATCH.map(k=>[k,m[k]]));
  }
 }
 if(Object.keys(value.lines).length!==expected.length)return null;
 if(value.memory!=null){
  const m=value.memory;
  if(!m||typeof m!=='object'||Array.isArray(m)||
     !MEMORY.every(k=>valid(m[k]))||
     m.coldStart+m.catalogReset+m.continued!==1||
     m.priorWithin3m+m.priorAfter3m+m.priorUnknown!==1||
     ((m.coldStart||m.catalogReset)&&m.priorUnknown!==1))return null;
  safe.memory=Object.fromEntries(MEMORY.map(k=>[k,m[k]]));
 }
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
 const dest=lines[code]||(lines[code]={frames:0,...zero(),
  diagnostics:{frames:0,...zeroDiag()}});
 dest.frames++;
 for(const k of FIELDS)dest[k]+=vals[k];
 if(vals.diagnostics){
  dest.diagnostics.frames++;
  for(const key of DIAG_FIELDS)dest.diagnostics[key]+=vals.diagnostics[key];
 }
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
 const lanes=Object.fromEntries(LANES.map(lane=>[lane,{samples:0,errors:0}]));
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
  day:chosen,timezone:'Europe/Oslo',status:LANES.some(
   lane=>lanes[lane].samples>0)?'SAMPLES':'NO_SAMPLES',
  lanes,first,last,lines,spots,
  limitations:[
   'Sampling: 5-minute catalog plus existing offset Line 1 fast history; V2.3 dual-fast also measures Line 11 using the SAME AtB source response, no extra provider requests.',
   'V2.0 and V2.1 use the same sample; route hypotheses live in volatile DO memory and may reset.',
   'Older Line 11 five-minute-only samples are too sparse for proven stop sequences; V2.3 diagnostics start only on new samples.',
   'Near a focus Quay is geometric proximity only, never a physical arrival or correct platform.',
   'Only primary LED vehicle has usable GPS; IDs and positions are not persisted.',
   'GPS diagnostic categories classify continuity and geographic candidates, not correct Quay, stops or verified journeys.',
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
   const fingerprint=v23BoardSignature(board);
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

// GPS V2.5 shadow ONLY. The only private durable record is a bounded,
// HMAC-pseudonymized 3-minute journey-pattern snapshot. No raw vehicle IDs,
// Quays, coordinates, destinations or GPS frames are persisted.
import v21 from '../web/linear/network/gps-v2-shadow.js';
import patterns from '../config/gps/atb-journey-patterns-1-11.json' with {type:'json'};
import {v23BoardSignature} from './trondheim-gps-v22.mjs';

export const V25_KEY='trondheim-gps-v25:v1:expiring-shadow';
export const V25_TTL=180000;
const ALARM_GRACE_MS=5000;
const MAX_KEY_AGE=30*60000;
const LINES=['1','11'];
const STATES=['fresh','restored','expired','catalogChanged','keyRotated'];
const bounded=x=>Number.isSafeInteger(x)&&x>=0&&x<=5000;
const validKey=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const encode=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const hexBytes=hex=>new Uint8Array(hex.match(/../g).map(x=>parseInt(x,16)));
const sourcePrimary=(frame,lane)=>{
 const allowed=lane==='line1-fast'?new Set(['1']):new Set(LINES);
 const entries=new Map(),duplicated=new Set();
 for(const led of frame.leds){
  const v=led?.vehicle,code=String(v?.line||'');
  if(!allowed.has(code)||typeof v?.id!=='string'||!v.id||
   v.positionType!=='gps-nearest-stop'||!Number.isFinite(v.latitude)||
   !Number.isFinite(v.longitude)||Math.abs(v.latitude)>90||
   Math.abs(v.longitude)>180||!Number.isFinite(v.ageSeconds)||
   v.ageSeconds<0||v.ageSeconds>30)continue;
  const id=code+'|'+v.id;
  if(entries.has(id))duplicated.add(id);
  else entries.set(id,{led,v,code});
 }
 for(const id of duplicated)entries.delete(id);
 return entries;
};
// V2.6: count *only* GPS-primary follow-ups which were actually restored.
// The Quay lookup is transient; no Quay, vehicle token or route path is
// included in the persisted daily counters or returned public report.
const FOLLOWUP_FIELDS=['restoredWithCandidates','restoredAmbiguous',
 'restoredChanged','restoredNarrowed','restoredDirection','restoredABC'];
const allowedPatterns=Object.fromEntries(LINES.map(code=>[code,
 (patterns.lines[code]?.patterns||[]).filter(p=>
  ['inbound','outbound'].includes(p.directionType)&&Array.isArray(p.quays)&&
  p.quays.length>=2&&p.quays.every(q=>/^NSR:Quay:\d+$/.test(q)))]));
function candidateQuays(row,code){
 const candidates=new Set(),source=allowedPatterns[code]||[];
 for(const h of row?.hypotheses||[]){
  const [pattern,index]=h,quay=source[pattern]?.quays?.[index];
  if(quay)candidates.add(quay);
 }
 return candidates;
}
function followupEvidence(before,after,ids,tokens,code){
 const out=Object.fromEntries(FOLLOWUP_FIELDS.map(k=>[k,0]));
 for(const id of ids){
  const key=code+'|'+tokens.get(id),prior=before.get(key);
  if(!prior)continue;
  const oldQuays=candidateQuays(prior,code);
  if(!oldQuays.size)continue;
  out.restoredWithCandidates++;
  if(oldQuays.size>1)out.restoredAmbiguous++;
  const later=after.get(key),newQuays=candidateQuays(later,code);
  if(!newQuays.size)continue;
  const changed=oldQuays.size!==newQuays.size||
   [...oldQuays].some(q=>!newQuays.has(q));
  if(!changed)continue;
  out.restoredChanged++;
  if(oldQuays.size>1&&newQuays.size<oldQuays.size)out.restoredNarrowed++;
  // A source-compatible direction is only a candidate, NOT verified GPS
  // movement, passage, side of road, platform or physical stop.
  if(later.direction&&newQuays.size===1&&
     later.hypotheses.length>0&&later.hypotheses.every(h=>h[3]>=1)){
   out.restoredDirection++;
   if(later.hypotheses.every(h=>h[3]>=2)&&
      !prior.hypotheses.every(h=>h[3]>=2))out.restoredABC++;
  }
 }
 return out;
}
export async function expireV25State(storage,now=Date.now()){
 const s=await storage.get(V25_KEY);
 if(!s)return;
 if(!Number.isFinite(s.expiresAt)||s.expiresAt<=now){
  await storage.delete(V25_KEY);
 }else if(typeof storage.setAlarm==='function'){
  await storage.setAlarm(s.expiresAt);
 }
}
export async function evaluateV25(storage,frame,board,{lane,now=Date.now()}={}){
 if(!['catalog','line1-fast','dual-fast'].includes(lane)||
  frame?.boardProfile!=='trondheim-city-lines-catalog'||
  !Array.isArray(frame.leds)||!Array.isArray(board?.nodes))
  throw Error('invalid_v25_source');
 const ts=Date.parse(frame.generatedAt||''),sig=v23BoardSignature(board);
 if(!Number.isFinite(ts)||Math.abs(ts-now)>120000)
  throw Error('invalid_v25_freshness');
 // Read only this dedicated key, never read or touch active device state.
 let prior=await storage.get(V25_KEY);
 let status='fresh';
 if(prior){
  if(prior.version!==1||!Number.isSafeInteger(prior.at)||
     !Number.isSafeInteger(prior.issuedAt)||
     !Number.isSafeInteger(prior.expiresAt)||
     !validKey(prior.secret)||!Array.isArray(prior.tracks)||
     prior.tracks.length>128||ts<=prior.at||
     ts>prior.expiresAt||ts-prior.at>V25_TTL||
     prior.expiresAt>prior.at+V25_TTL+ALARM_GRACE_MS){
   status='expired';prior=null;
  }else if(prior.sig!==sig){status='catalogChanged';prior=null;}
  else if(ts-prior.issuedAt>=MAX_KEY_AGE){status='keyRotated';prior=null;}
  else status='restored';
 }
 const secret=prior?.secret||encode(crypto.getRandomValues(new Uint8Array(32)));
 const key=await crypto.subtle.importKey('raw',hexBytes(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const tokenCache=new Map();
 async function token(id){
  if(!tokenCache.has(id)){
   const sig=await crypto.subtle.sign('HMAC',key,
    new TextEncoder().encode('transitcore-v25-ephemeral:'+id));
   tokenCache.set(id,encode(new Uint8Array(sig)));
  }
  return tokenCache.get(id);
 }
 const primary=sourcePrimary(frame,lane);
 const hashed=new Map();
 for(const [id] of primary)hashed.set(id,await token(id));
 // Source provider-stop evidence is included in shadow only; never persist raw.
 const safeLeds=[];
 for(const led of frame.leds){
  const v=led?.vehicle,code=String(v?.line||'');
  if(!LINES.includes(code)||!v||typeof v.id!=='string'||!v.id)continue;
  safeLeds.push({id:led.id,state:led.state,
   vehicle:{...v,id:await token(code+'|'+v.id)}});
 }
 const anonymized={boardProfile:frame.boardProfile,generatedAt:frame.generatedAt,
  ttlSeconds:frame.ttlSeconds,leds:safeLeds};
 const engine=v21.create({board,patterns});
 const restored=status==='restored'?
  engine.restoreSnapshot(prior.tracks,{now:ts+1000}):0;
 const before=new Map(engine.exportSnapshot({now:ts+1000}).map(r=>[r.key,r]));
 const summary=engine.ingest(anonymized,{now:ts+1000,source:'production'});
 if(summary.status!=='ACTIVE_BROWSER_SHADOW')throw Error('v25_shadow_not_active');
 const tracks=engine.exportSnapshot({now:ts+1000});
 const after=new Map(tracks.map(r=>[r.key,r]));
 const priorKeys=new Set((prior?.tracks||[]).map(row=>row.key));
 const lines={};
 for(const code of (lane==='line1-fast'?['1']:LINES)){
  const ids=[...primary.keys()].filter(id=>id.startsWith(code+'|'));
  const matched=ids.filter(id=>priorKeys.has(code+'|'+hashed.get(id))).length;
  const s=summary.lines?.[code]||{};
  lines[code]={
   primary:ids.length,matchedPrior:matched,
   compared:s.comparedGps||0,supported:s.acceptedBySourceSequence||0,
   retained:s.ambiguousCandidatesRetained||0,
   narrowed:s.ambiguityNarrowed||0,
   resolved:s.ambiguityResolvedAfterFollowup||0,
   ...followupEvidence(before,after,ids,hashed,code)
  };
 }
 const record={version:1,at:ts,expiresAt:ts+V25_TTL+ALARM_GRACE_MS,
  issuedAt:prior?.issuedAt||ts,sig,secret,tracks};
 // Only the pseudonyms + pattern indices; forbid raw IDs / source coordinates.
 if(!validKey(secret)||tracks.some(r=>!/^(1|11)\|[a-f0-9]{64}$/.test(r.key)))
  throw Error('v25_unsafe_snapshot');
 await storage.put(V25_KEY,record);
 // Fail closed: an expiring snapshot without an alarm is not permitted.
 try{
  if(typeof storage.setAlarm!=='function')throw Error('v25_alarm_unavailable');
  await storage.setAlarm(record.expiresAt);
 }catch(err){
  await storage.delete(V25_KEY);
  throw Error('v25_expiry_not_guaranteed');
 }
 return {version:1,status,restoredTracks:restored,tracksWritten:tracks.length,lines};
}
export function sanitizeV25(metrics,lane){
 if(metrics?.version!==1||!STATES.includes(metrics.status)||
  !bounded(metrics.restoredTracks)||!bounded(metrics.tracksWritten)||
  !metrics.lines||typeof metrics.lines!=='object')return null;
 const lines={},allowed=lane==='line1-fast'?['1']:LINES;
 for(const code of allowed){
  const x=metrics.lines[code];
  if(!x||!['primary','matchedPrior','compared','supported','retained',
   'narrowed','resolved'].every(k=>bounded(x[k]))||
   x.matchedPrior>x.primary||x.compared>x.primary)return null;
  lines[code]=Object.fromEntries(['primary','matchedPrior','compared','supported',
   'retained','narrowed','resolved'].map(k=>[k,x[k]]));
  const hasNew=FOLLOWUP_FIELDS.some(k=>x[k]!==undefined);
  if(hasNew){
   if(!FOLLOWUP_FIELDS.every(k=>bounded(x[k]))||
      x.restoredWithCandidates>x.matchedPrior||
      x.restoredAmbiguous>x.restoredWithCandidates||
      x.restoredChanged>x.restoredWithCandidates||
      x.restoredNarrowed>x.restoredAmbiguous||
      x.restoredDirection>x.restoredChanged||
      x.restoredABC>x.restoredDirection)return null;
   for(const k of FOLLOWUP_FIELDS)lines[code][k]=x[k];
  }
 }
 if(Object.keys(metrics.lines).length!==allowed.length)return null;
 return {version:1,status:metrics.status,
  restoredTracks:metrics.restoredTracks,tracksWritten:metrics.tracksWritten,lines};
}

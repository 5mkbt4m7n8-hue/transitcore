// A small second sampling lane for Line 1: no full Trondheim board fetch,
// no extra SIRI journey lookups, no private vehicle IDs stored. The main
// five-minute history and its existing pinned-demo storage stay unchanged.
import {validatedLine1ScheduledQuality} from './trondheim-line1-quality.mjs';
const ROOT='trondheim-line1-fast:v1:', BOARD='trondheim-city-lines-catalog';
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'access-control-allow-origin':'https://5mkbt4m7n8-hue.github.io',
 'access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'content-type'};
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:HEADERS});
const dayOf=value=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(value));
const isoDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const dayMeta=d=>ROOT+'meta:'+d;
const prefix=d=>ROOT+'sample:'+d+':';
const indexKey=ROOT+'index';
const trim=v=>typeof v==='string'?v.slice(0,120):'unavailable';
export async function recordFastLine1Sample(storage,{capturedAt,quality=null,error=''}={},now=Date.now()){
 const at=Date.parse(capturedAt||'');
 if(!Number.isFinite(at)||Math.abs(now-at)>48*3600000)
  throw Error('invalid_record_time');
 const day=dayOf(at),slot=Math.floor(at/300000)*300000;
 const key=prefix(day)+String(slot).padStart(13,'0');
 const valid=validatedLine1ScheduledQuality(quality);
 const status=valid?'OK':'ERROR';
 const record={version:1,day,slot,capturedAt:new Date(at).toISOString(),
  status,quality:valid,error:status==='OK'?null:trim(error||'source_unavailable')};
 const old=await storage.get(key);
 if(old?.status==='OK')return {recorded:false,status:'ALREADY_OK',day};
 await storage.put(key,record);
 const previous=await storage.get(dayMeta(day))||{day,count:0,errors:0,first:null,last:null};
 const meta={...previous,count:previous.count+(old?0:1),
  errors:Math.max(0,previous.errors+(status==='ERROR'?1:0)-(old?.status==='ERROR'?1:0)),
  first:previous.first&&previous.first<record.capturedAt?previous.first:record.capturedAt,
  last:previous.last&&previous.last>record.capturedAt?previous.last:record.capturedAt};
 await storage.put(dayMeta(day),meta);
 const index=await storage.get(indexKey)||[];
 if(!index.includes(day)){index.push(day);index.sort();await storage.put(indexKey,index);}
 const today=dayOf(now),yesterday=dayOf(now-24*3600000);
 const keep=new Set([today,yesterday]);
 const expired=index.filter(x=>!keep.has(x));
 for(const expiredDay of expired){
  const records=await storage.list({prefix:prefix(expiredDay),limit:1000});
  for(const key of records.keys())await storage.delete(key);
  await storage.delete(dayMeta(expiredDay));
 }
 if(expired.length)await storage.put(indexKey,index.filter(d=>keep.has(d)));
 return {recorded:true,status,day};
}
export async function fastLine1Storage(storage,request){
 const url=new URL(request.url);
 if(url.pathname!=='/line1-fast-history')return json({error:'not_found'},404);
 if(request.method==='POST'){
  let body;try{body=await request.json()}catch{return json({error:'invalid_json'},400);}
  if(body?.action!=='record')return json({error:'invalid_action'},400);
  try{return json(await recordFastLine1Sample(storage,body));}
  catch(error){return json({error:error.message},400);}
 }
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 const today=dayOf(Date.now()),yesterday=dayOf(Date.now()-24*3600000);
 const days=[...new Set([today,yesterday])];
 if(!url.searchParams.has('day')){
  const metas=await Promise.all(days.map(d=>storage.get(dayMeta(d))));
  return json({version:1,boardProfile:BOARD,cadenceMinutes:5,offsetMinutes:2,
   sampling:'line1-gps-only',additionalSamplesPerHour:12,
   timeZone:'Europe/Oslo',days:metas.filter(Boolean)});
 }
 const day=url.searchParams.get('day');
 if(!isoDay(day)||!days.includes(day))return json({error:'day_unavailable'},404);
 const limit=Math.max(1,Math.min(40,Number(url.searchParams.get('limit'))||40));
 const cursor=url.searchParams.get('cursor')||'';
 if(cursor&&!/^\d{13}$/.test(cursor))return json({error:'invalid_cursor'},400);
 const p=prefix(day);
 const entries=await storage.list({prefix:p,limit:limit+1,
  ...(cursor?{startAfter:p+cursor}:{})});
 const values=[...entries.values()],more=values.length>limit,records=values.slice(0,limit);
 return json({version:1,day,boardProfile:BOARD,cadenceMinutes:5,offsetMinutes:2,
  sampling:'line1-gps-only',records,
  nextCursor:more?String(records.at(-1).slot).padStart(13,'0'):null,
  meta:await storage.get(dayMeta(day))||null});
}
export async function recordScheduledFastLine1(env,quality,error='',at=new Date().toISOString()){
 if(!env.DEVICE_STATUS)return {recorded:false,error:'status_storage_unavailable'};
 const stub=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName('__trondheim-day-history__'));
 const response=await stub.fetch('https://status.internal/line1-fast-history',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({action:'record',capturedAt:at,quality,error})});
 if(!response.ok)throw Error('fast_line1_storage_http_'+response.status);
 return response.json();
}
export async function handleFastLine1History(request,env){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 const origin=request.headers.get('origin');
 if(origin&&origin!=='https://5mkbt4m7n8-hue.github.io')
  return json({error:'invalid_origin'},403);
 if(!env.DEVICE_STATUS)return json({error:'history_storage_unavailable'},503);
 const stub=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName('__trondheim-day-history__'));
 const url=new URL(request.url);
 const response=await stub.fetch('https://status.internal/line1-fast-history'+url.search);
 return new Response(response.body,{status:response.status,headers:HEADERS});
}

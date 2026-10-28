// Read-only public Trondheim playback plus admin-pinned one-day demo.
// Recording runs in the EXISTING five-minute Worker cron, not in a browser.
const BOARD="trondheim-shared-stops-board";
const PREFIX="trondheim-history:v1:";
const INDEX=PREFIX+"index";
const DEMO=PREFIX+"demo";
const HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "access-control-allow-origin":"https://5mkbt4m7n8-hue.github.io",
 "access-control-allow-methods":"GET, POST, OPTIONS",
 "access-control-allow-headers":"authorization, content-type"};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const localDay=stamp=>new Intl.DateTimeFormat("en-CA",{
 timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"
}).format(new Date(stamp));
const isoDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&new Date(day+"T00:00:00Z").toISOString().slice(0,10)===day;
const metaKey=day=>PREFIX+"meta:"+day;
const samplePrefix=day=>PREFIX+"sample:"+day+":";
const safeString=(v,n=160)=>typeof v==="string"?v.slice(0,n):"";
const num=v=>Number.isFinite(v)?v:null;
function vehicle(v){
 if(!v||typeof v!=="object")return null;
 return {id:safeString(v.id,100),line:safeString(v.line,20),destination:safeString(v.destination),
  state:safeString(v.state,25),source:safeString(v.source,40),
  ageSeconds:num(v.ageSeconds),distanceMeters:num(v.distanceMeters),
  rgb:Array.isArray(v.rgb)&&v.rgb.length===3?v.rgb:null};
}
export function compactFrame(frame){
 if(frame?.schemaVersion!==1||frame.boardProfile!==BOARD||!Array.isArray(frame.leds)||
  !Number.isInteger(frame.sequence)||frame.sequence<=0||
  !Number.isInteger(frame.ledCount)||frame.ledCount<1||frame.ledCount>5000||
  !Number.isInteger(frame.ttlSeconds)||frame.ttlSeconds<1||frame.ttlSeconds>300||
  !Number.isFinite(Date.parse(frame.generatedAt)))throw Error("invalid_recorded_frame");
 const seen=new Set();
 const leds=frame.leds.map(item=>{
  if(!Number.isInteger(item.id)||item.id<0||item.id>=frame.ledCount||seen.has(item.id))throw Error("invalid_recorded_led");
  seen.add(item.id);
  return {id:item.id,state:safeString(item.state,25),lifecycle:safeString(item.lifecycle,25),
   rgb:Array.isArray(item.rgb)&&item.rgb.length===3?item.rgb:null,
   brightness:Number.isInteger(item.brightness)?item.brightness:0,
   vehicle:vehicle(item.vehicle),occupants:(item.occupants||[]).slice(0,8).map(vehicle).filter(Boolean)};
 });
 return {schemaVersion:1,boardProfile:BOARD,profileRevision:frame.profileRevision||0,
  profileFingerprint:safeString(frame.profileFingerprint,24),ledCount:frame.ledCount,
  generatedAt:frame.generatedAt,ttlSeconds:frame.ttlSeconds,
  sequence:frame.sequence,leds};
}
export async function recordDaySample(storage,{capturedAt,frame=null,error=""}){
 const at=Date.parse(capturedAt);
 if(!Number.isFinite(at)||Math.abs(Date.now()-at)>48*3600*1000)throw Error("invalid_record_time");
 const day=localDay(at),slot=String(Math.floor(at/300000)*300000);
 const key=samplePrefix(day)+slot;
 let snapshot=null,reason="";
 try{if(frame)snapshot=compactFrame(frame);else reason=safeString(error||"feed_unavailable",120)}
 catch(e){reason=e.message}
 if(snapshot&&JSON.stringify(snapshot).length>170000){snapshot=null;reason="frame_too_large"}
 const sample={version:1,day,slot:Number(slot),capturedAt:new Date(at).toISOString(),
  status:snapshot?"OK":"ERROR",frame:snapshot,error:snapshot?null:reason};
 const existing=await storage.get(key);
 // A retry may upgrade an error to a valid sample but never downgrade it.
 if(existing?.status==="OK"&&sample.status!=="OK")return {recorded:false,day,status:"ALREADY_OK"};
 await storage.put(key,sample);
 const previous=await storage.get(metaKey(day))||{day,count:0,errors:0,first:null,last:null};
 const next={...previous,count:previous.count+(existing?0:1),
  errors:Math.max(0,previous.errors+(sample.status==="ERROR"?1:0)-(existing?.status==="ERROR"?1:0)),
  first:previous.first&&previous.first<sample.capturedAt?previous.first:sample.capturedAt,
  last:previous.last&&previous.last>sample.capturedAt?previous.last:sample.capturedAt};
 await storage.put(metaKey(day),next);
 const index=await storage.get(INDEX)||[];
 if(!index.includes(day)){index.push(day);index.sort();await storage.put(INDEX,index)}
 // Keep today and preceding Oslo calendar day, plus ONE explicitly pinned demo.
 const archive=await storage.get(DEMO);
 const today=localDay(Date.now());
 const yesterday=localDay(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-1,Number(today.slice(8))-1,12));
 const keep=new Set([today,yesterday,archive?.day].filter(Boolean));
 const expired=index.filter(d=>!keep.has(d));
 if(expired.length){
  for(const d of expired){
   const rows=await storage.list({prefix:samplePrefix(d),limit:1000});
   for(const id of rows.keys())await storage.delete(id);
   await storage.delete(metaKey(d));
  }
  await storage.put(INDEX,index.filter(d=>keep.has(d)));
 }
 return {recorded:true,day,status:sample.status};
}
export async function pinDemo(storage,day,now=Date.now()){
 if(!isoDay(day))return {status:400,body:{error:"invalid_day"}};
 const current=localDay(now);
 if(day>=current)return {status:409,body:{error:"day_not_complete"}};
 const meta=await storage.get(metaKey(day));
 if(!meta?.count)return {status:404,body:{error:"day_not_found"}};
 const entry={day,pinnedAt:new Date(now).toISOString(),count:meta.count,errors:meta.errors};
 await storage.put(DEMO,entry);
 return {status:200,body:{ok:true,demo:entry}};
}
export async function dayHistoryStorage(storage,request){
 const url=new URL(request.url);
 if(url.pathname==="/trondheim-history/pin"){
  if(request.method!=="POST")return reply({error:"method_not_allowed"},405);
  let body;try{body=await request.json()}catch{return reply({error:"invalid_json"},400)}
  const result=await pinDemo(storage,body?.day);
  return reply(result.body,result.status);
 }
 if(url.pathname!=="/trondheim-history")return reply({error:"not_found"},404);
 if(request.method==="POST"){
  let body;try{body=await request.json()}catch{return reply({error:"invalid_json"},400)}
  if(body?.action!=="record")return reply({error:"invalid_action"},400);
  try{return reply(await recordDaySample(storage,body))}
  catch(error){return reply({error:error.message},400)}
 }
 if(request.method!=="GET")return reply({error:"method_not_allowed"},405);
 const archive=await storage.get(DEMO)||null;
 const current=localDay(Date.now());
 const yesterday=localDay(Date.UTC(Number(current.slice(0,4)),Number(current.slice(5,7))-1,Number(current.slice(8))-1,12));
 const index=await storage.get(INDEX)||[];
 if(!url.searchParams.has("day")&&!url.searchParams.has("demo")){
  const days=[];
  for(const day of index.filter(d=>d===current||d===yesterday||d===archive?.day).sort().reverse()){
   const item=await storage.get(metaKey(day));if(item)days.push({...item,savedAsDemo:day===archive?.day});
  }
  return reply({version:1,boardProfile:BOARD,cadenceMinutes:5,
   timeZone:"Europe/Oslo",currentDay:current,previousDay:yesterday,archive,days});
 }
 const day=url.searchParams.has("demo")?archive?.day:url.searchParams.get("day");
 if(!day||!isoDay(day)||!(day===current||day===yesterday||day===archive?.day))
  return reply({error:"day_unavailable"},404);
 const limit=Math.max(1,Math.min(40,Number(url.searchParams.get("limit"))||30));
 const cursor=url.searchParams.get("cursor")||"";
 if(cursor&&!/^\d{13}$/.test(cursor))return reply({error:"invalid_cursor"},400);
 const prefix=samplePrefix(day);
 const items=await storage.list({prefix,limit:limit+1,...(cursor?{startAfter:prefix+cursor}:{})});
 const values=[...items.values()];
 const hasMore=values.length>limit,selected=values.slice(0,limit);
 const last=hasMore?String(selected.at(-1).slot):null;
 const meta=await storage.get(metaKey(day));
 return reply({version:1,day,archived:day===archive?.day,
  meta,records:selected,nextCursor:last});
}
export async function handleTrondheimHistory(request,env,authenticate){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:HEADERS});
 const url=new URL(request.url);
 const pin=url.pathname==="/v1/admin/trondheim/history/demo";
 if((pin&&request.method!=="POST")||(!pin&&request.method!=="GET"))return reply({error:"method_not_allowed"},405);
 const origin=request.headers.get("origin");
 if(origin&&origin!=="https://5mkbt4m7n8-hue.github.io")return reply({error:"invalid_origin"},403);
 if(pin){
  if(!env.PUBLISH_ADMIN_TOKEN)return reply({error:"admin_key_not_configured"},503);
  const auth=request.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer ")||!await authenticate(auth.slice(7),env.PUBLISH_ADMIN_TOKEN))return reply({error:"unauthorized"},401);
 }
 if(!env.DEVICE_STATUS)return reply({error:"history_storage_unavailable"},503);
 const stub=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName("__trondheim-day-history__"));
 const internal="/trondheim-history"+(pin?"/pin":url.search);
 try{
  const result=await stub.fetch("https://status.internal"+internal,{
   method:request.method,...(pin?{headers:{"content-type":"application/json"},body:await request.text()}:{})
  });
  return new Response(result.body,{status:result.status,headers:HEADERS});
 }catch(error){console.error("history storage error",error);return reply({error:"history_storage_error"},503)}
}
export async function recordScheduledTrondheimFrame(env,frame,error="",at=new Date().toISOString()){
 if(!env.DEVICE_STATUS)return {recorded:false,error:"history_storage_unavailable"};
 const stub=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName("__trondheim-day-history__"));
 const result=await stub.fetch("https://status.internal/trondheim-history",{method:"POST",
  headers:{"content-type":"application/json"},body:JSON.stringify({action:"record",capturedAt:at,frame,error})});
 if(!result.ok)throw Error("history_write_http_"+result.status);
 return result.json();
}

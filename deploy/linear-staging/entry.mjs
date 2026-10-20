// Public read-only gateway. No provider, lifecycle, device or production access.
import {validatePixelFrame} from '../../core/models/pixel-frame.mjs';
const GPS_BOARD='trondheim-bus-1-gps-staging';
const BOARDS=new Map([['trondheim-bus-board',147],['trondheim-shared-stops-board',147],['trondheim-city-lines-catalog',1282],['trondheim-flybuss-live',46],[GPS_BOARD,147]]);
const UPSTREAM='https://transitcore-staging.lgb84.workers.dev';
const PAGE='https://5mkbt4m7n8-hue.github.io';
const APPROVED_SHA='eb43b06e26e38c558e3beabf033274172b0eecdc';
function publicDiagnostics(data,boardId,ledCount){
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const keys=(x,allowed)=>object(x)&&Object.keys(x).every(k=>allowed.includes(k));
 const number=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 const id=x=>x===null||(typeof x==='string'&&/^[a-zA-Z0-9:_./-]{1,128}$/.test(x));
 const date=x=>typeof x==='string'&&x.length<=40&&Number.isFinite(Date.parse(x));
 const gps=boardId===GPS_BOARD;
 if(!keys(data,['boardId','algorithm','sequence','generatedAt','ageSeconds','status','uncertain','reason','observations','truncated',...(gps?['mode']:[])])||
  data.boardId!==boardId||data.algorithm!=='unified-bus-v1'||
  !['CURRENT','STALE','NOT_OBSERVED'].includes(data.status)||
  !(data.sequence===null||Number.isSafeInteger(data.sequence)&&data.sequence>=0)||
  typeof data.uncertain!=='boolean'||!Array.isArray(data.observations)||data.observations.length>2048)return null;
 if(data.status!=='NOT_OBSERVED'&&(!date(data.generatedAt)||!number(data.ageSeconds)))return null;
 if(gps&&!(data.mode==='gps-proximity-v1'||data.status==='NOT_OBSERVED'&&data.mode===undefined))return null;
 if(data.truncated!==undefined&&(!Number.isSafeInteger(data.truncated)||data.truncated<0))return null;
 const observations=[];
 for(const d of data.observations){
  if(!keys(d,['vehicleId','lineId','logicalLed','source','observationTime','state','confidence','reason','uncertain',
    ...(gps?['distanceMeters','observationAgeMs','stateChangedAt','physicalLed']:[])])||
   !id(d.vehicleId)||!id(d.lineId)||
   !(d.logicalLed===null||Number.isInteger(d.logicalLed)&&d.logicalLed>=0&&d.logicalLed<ledCount)||
   !['GPS','ESTIMATED_CALL','UNKNOWN'].includes(d.source)||
   !(d.observationTime===null||number(d.observationTime))||
   !['OFF','APPROACHING','AT_STOP','PASSED','PARKED'].includes(d.state)||
   !['inferred','forecast','timetable','reported','unknown'].includes(d.confidence)||
   typeof d.uncertain!=='boolean')return null;
  if(gps&&(![d.distanceMeters,d.observationAgeMs,d.stateChangedAt].every(v=>v===null||number(v))||
    !(d.physicalLed===null||Number.isInteger(d.physicalLed)&&d.physicalLed>=0&&d.physicalLed<ledCount)))return null;
  // Do not forward arbitrary free-text reasons, even under a known field name.
  observations.push({vehicleId:d.vehicleId,lineId:d.lineId,logicalLed:d.logicalLed,source:d.source,
   observationTime:d.observationTime,state:d.state,confidence:d.confidence,uncertain:d.uncertain,
   reason:'Public evidence summary; not measured hardware state.',
   ...(gps?{distanceMeters:d.distanceMeters,observationAgeMs:d.observationAgeMs,stateChangedAt:d.stateChangedAt,physicalLed:d.physicalLed}:{})});
 }
 return {boardId,algorithm:data.algorithm,sequence:data.sequence,status:data.status,...(data.mode?{mode:data.mode}:{}),
  ...(data.status==='NOT_OBSERVED'?{}:{generatedAt:data.generatedAt,ageSeconds:data.ageSeconds}),
  uncertain:data.uncertain,truncated:data.truncated??0,observations,
  reason:'Public evidence summary; not measured hardware state.'};
}
// A single reviewed staging source SHA is pinned for every public read-only profile.
export default {async fetch(request,env){
 const url=new URL(request.url),origin=request.headers.get('origin');
 const headers={'access-control-allow-origin':PAGE,'access-control-expose-headers':'x-transitcore-stop-algorithm,x-transitcore-environment,x-transitcore-source-sha','cache-control':'no-store','content-type':'application/json','x-content-type-options':'nosniff','vary':'Origin'};
 const fail=status=>new Response(JSON.stringify({error:'Testfeed unavailable'}),{status,headers});
 if(origin&&origin!==PAGE)return fail(403);
 const match=url.pathname.match(/^\/api\/v1\/frame\/([a-z0-9-]+)(\/diagnostics)?$/);
 if(url.search||!match||!BOARDS.has(match[1]))return fail(404);
 const boardId=match[1],ledCount=BOARDS.get(boardId),diagnostics=!!match[2];
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'GET','access-control-max-age':'600'}});
 if(request.method!=='GET')return fail(405);
 if(!env.STAGING_ACCESS_TOKEN||!env.PUBLIC_READ_LIMIT)return fail(503);
 try{
  if(!(await env.PUBLIC_READ_LIMIT.limit({key:request.headers.get('cf-connecting-ip')||'unknown'})).success)return fail(429);
  const response=await fetch(UPSTREAM+url.pathname,{method:'GET',redirect:'manual',headers:{authorization:'Bearer '+env.STAGING_ACCESS_TOKEN},signal:AbortSignal.timeout(15000)});
  if(response.status!==200||response.headers.get('x-transitcore-environment')!=='isolated-staging'||response.headers.get('x-transitcore-source-sha')!==APPROVED_SHA){await response.body?.cancel();return fail(502);}
  // Bound upstream body; never expose arbitrary upstream errors/headers.
  const reader=response.body.getReader();let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144){await reader.cancel();return fail(502);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const text=new TextDecoder().decode(bytes),data=JSON.parse(text);
  // Defence in depth: refuse a response that unexpectedly contains the credential.
  if(text.includes(env.STAGING_ACCESS_TOKEN))return fail(502);
  if(!diagnostics){if(!validatePixelFrame(data,{expectedBoardProfile:boardId,expectedLedCount:ledCount,now:Date.now()}).valid)return fail(502);}
  let output=text;
  if(diagnostics){const diagnostic=publicDiagnostics(data,boardId,ledCount);if(!diagnostic)return fail(502);output=JSON.stringify(diagnostic);}
  for(const name of ['x-transitcore-stop-algorithm','x-transitcore-environment','x-transitcore-source-sha']){
   const value=response.headers.get(name);if(value&&value.length<128&&!value.includes(env.STAGING_ACCESS_TOKEN))headers[name]=value;
  }
  return new Response(output,{headers});
 }catch{return fail(502);}
}};

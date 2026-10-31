// Read-only production proof: no Entur calls, no vehicle identifiers,
// no raw frames. A successful GitHub Pages build is not production evidence.
const API='https://transitcore-led-feed.lgb84.workers.dev/v1/trondheim/gps-v22';
const fresh=stamp=>Number.isFinite(Date.parse(stamp||''))&&
 Date.now()-Date.parse(stamp)>=0&&Date.now()-Date.parse(stamp)<=25*60000;
export function inspect(payload,{now=Date.now()}={}){
 if(payload?.scope!=='trondheim-gps-v22-scheduled-quality'||!payload.lanes)
  return {status:'OLD_WORKER_OR_UNKNOWN_RESPONSE'};
 const full=payload.lanes.catalog?.samples||0,fast=payload.lanes['line1-fast']?.samples||0;
 if(!full&&!fast)return {status:'NO_SAMPLES',full,fast};
 if(!Number.isFinite(Date.parse(payload.last||''))||
   now-Date.parse(payload.last)>25*60000||
   now-Date.parse(payload.last)<-60000)
  return {status:'STALE',full,fast,last:payload.last||null};
 return {status:'ACTIVE',full,fast,last:payload.last,
  line1Frames:payload.lines?.['1']?.frames||0,
  line11Frames:payload.lines?.['11']?.frames||0};
}
export async function probe({fetchImpl=fetch,now=Date.now()}={}){
 const controller=new AbortController();
 let result={status:'NETWORK_UNAVAILABLE'};
 const timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const res=await fetchImpl(API,{cache:'no-store',signal:controller.signal});
  if(!res.ok)result={status:res.status===404?
   'OLD_WORKER_OR_NOT_DEPLOYED':'HTTP_ERROR',httpStatus:res.status};
  else result=inspect(await res.json(),{now});
 }catch{result={status:'NETWORK_UNAVAILABLE'};}
 finally{clearTimeout(timeout);}
 return result;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const proof=await probe();
 const json=JSON.stringify(proof);
 console.log('GPS_V22_PRODUCTION_PROOF',json);
 if(process.env.GITHUB_STEP_SUMMARY){
  const {appendFile}=await import('node:fs/promises');
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
   '\n### Trondheim GPS V2.2 production proof\n\n'+
   '| Status | Full katalog-prøver | Linje 1 ekstra prøver | Linje 1 frames | Linje 11 frames | Siste prøve |\n'+
   '|---|---:|---:|---:|---:|---|\n'+
   '| '+proof.status+' | '+(proof.full??'—')+' | '+(proof.fast??'—')+
   ' | '+(proof.line1Frames??'—')+' | '+(proof.line11Frames??'—')+
   ' | '+(proof.last??'—')+' |\n\n'+
   'Ingen GPS- eller kjøretøy-ID-er er hentet. Dette beviser at aggregatene produseres, ikke fysisk GPS-nøyaktighet.\n');
 }
}

// Daily read-only evidence sampler. Intended for a one-day, time-bounded
// GitHub Actions schedule; it cannot inspect buses before it is running.
import {writeFile,mkdir} from 'node:fs/promises';
import {loadCatalog,summarizeGps,summarizeFrame,isAuditDay,ROUTES} from './trondheim-day-audit-core.mjs';
const origin='https://transitcore-led-feed.lgb84.workers.dev';
const frames=['trondheim-shared-stops-board','trondheim-city-lines-catalog'];
const intervalMs=20_000,durationMs=205_000;
async function request(path){
 try{
  const r=await fetch(origin+path,{headers:{Accept:'application/json'},
   redirect:'error',signal:AbortSignal.timeout(12_000),cache:'no-store'});
  if(!r.ok)return {status:'http_'+r.status};
  const text=await r.text();
  if(text.length>850_000)return {status:'payload_too_large'};
  return {status:'ok',body:JSON.parse(text)};
 }catch{return {status:'network_or_schema_error'};}
}
async function capture(catalog){
 const now=new Date();
 const [gps,...responses]=await Promise.all([
  request('/api/v1/vehicles/atb-live-all'),
  ...frames.map(id=>request('/api/v1/frame/'+id))
 ]);
 const result={takenAt:now.toISOString(),gps:{status:gps.status},frames:{}};
 if(gps.status==='ok'){
  try{result.gps={status:'ok',...summarizeGps(gps.body,catalog,now)};}
  catch{result.gps={status:'invalid_gps_contract'};}
 }
 for(let i=0;i<frames.length;i++){
  const response=responses[i],name=frames[i];
  if(response.status!=='ok')result.frames[name]={status:response.status};
  else try{result.frames[name]=summarizeFrame(response.body,name);}
  catch{result.frames[name]={status:'invalid_frame_contract'};}
 }
 return result;
}
const start=new Date();
if(!isAuditDay(start)){
 console.log('Date outside 2026-10-27 Europe/Oslo; no sampling.');
 process.exit(0);
}
const catalog=await loadCatalog();
if(catalog.ledCount!==1282||ROUTES.length!==47)
 throw Error('Catalog/route mismatch, abort without invented stop evidence');
const history=[],begin=Date.now();
while(Date.now()-begin<durationMs&&isAuditDay(new Date())){
 const sample=await capture(catalog);
 history.push(sample);
 console.log('Sample '+history.length+' '+sample.takenAt+
  ' GPS='+sample.gps.status+' fresh='+(sample.gps.fresh??'?')+
  ' shared='+sample.frames[frames[0]].status+
  ' catalog='+sample.frames[frames[1]].status);
 const next=begin+history.length*intervalMs;
 if(next>Date.now()&&Date.now()-begin<durationMs)
  await new Promise(resolve=>setTimeout(resolve,Math.min(next-Date.now(),durationMs-(Date.now()-begin))));
}
const output={schemaVersion:1,auditDate:'2026-10-27',timezone:'Europe/Oslo',
 startedAt:start.toISOString(),endedAt:new Date().toISOString(),
 catalog:catalog.boardId,routeCount:47,
 samplingIntervalSeconds:20,nearestStopRadiusMeters:85,
 note:'Only observed GPS proximity candidates (not proven stop arrivals), independent LED states; no raw vehicle IDs/GPS coordinates',
 snapshots:history};
await mkdir('out',{recursive:true});
await writeFile('out/trondheim-day-snapshot.json',JSON.stringify(output)+'\n');
console.log('Wrote '+history.length+' independent samples for later report');

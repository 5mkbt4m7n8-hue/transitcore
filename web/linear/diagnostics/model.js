// InTransit public, read-only diagnostics. Pure model for Node/Chromium tests.
// Never export raw vehicle records, coordinates, vehicle IDs or credentials.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitDiagnosticsModel=api;
})(globalThis,function(){
 'use strict';
 const API_ROOT='https://transitcore-led-feed.lgb84.workers.dev';
 const API=[
  {id:'health',kind:'health',name:'Worker – API-helse',url:API_ROOT+'/api/v1/platform/health'},
  {id:'fleet',kind:'gps',code:'all',name:'GPS – alle katalogførte AtB-linjer',url:API_ROOT+'/api/v1/vehicles/atb-live-all'},
  ...['1','2','3'].map(code=>({id:'gps-'+code,kind:'gps',code,name:'GPS – linje '+code,
   url:API_ROOT+'/api/v1/vehicles/atb-line-'+code}))
 ];
 const STATUSES=['ok','empty','http-error','network-error','invalid','timeout','partial'];
 function timeLabel(value){
  if(!value||!Number.isFinite(Date.parse(value)))return 'Ingen gyldig måletid';
  return new Date(value).toLocaleString('nb-NO',{dateStyle:'short',timeStyle:'medium'});
 }
 function classifyHttp(code){
  if(code===404)return 'HTTP 404 – dette endepunktet finnes ikke i versjonen nettleseren når.';
  if(code===503)return 'HTTP 503 – endepunktet svarer, men datakilden er utilgjengelig.';
  if(code===401||code===403)return 'HTTP '+code+' – tilgang avvist.';
  if(code===429)return 'HTTP 429 – tjenesten begrenser antall forespørsler.';
  return 'HTTP '+code+' – endepunktet svarte med en feil.';
 }
 function diagnosticsError(error){
  if(error?.name==='AbortError'||error?.name==='TimeoutError')
   return {status:'timeout',detail:'Tidsavbrudd – ingen HTTP-status tilgjengelig.'};
  return {status:'network-error',
   detail:'Nettverksfeil eller CORS-blokkering. HTTP-status kan ikke fastslås fra nettleseren.'};
 }
 function gpsAggregate(parsed,now=Date.now()){
  const vehicles=Array.isArray(parsed?.vehicles)?parsed.vehicles:[];
  const dates=vehicles.map(v=>Date.parse(v.lastUpdated||'')).filter(Number.isFinite);
  const newest=dates.length?new Date(Math.max(...dates)).toISOString():null;
  const codes=[...new Set(vehicles.map(v=>v.line).filter(Boolean))].sort((a,b)=>Number(a)-Number(b));
  return {freshCount:vehicles.length,newestGpsIso:newest,
   newestAgeSeconds:newest?Math.max(0,Math.floor((now-Date.parse(newest))/1000)):null,
   activeLineCount:codes.length};
 }
 function summarize(results,totalCatalog){
  const current=results||[];
  const api=current.filter(c=>['health','gps'].includes(c.kind));
  const catalog=current.filter(c=>c.kind==='catalog');
  const count=(items,status)=>items.filter(c=>c.status===status).length;
  return {checks:current.length,workerOk:count(api,'ok')+count(api,'empty'),
   workerUnavailable:api.filter(c=>!['ok','empty'].includes(c.status)).length,
   catalogLoaded:count(catalog,'ok'),
   catalogExpected:totalCatalog||0,
   catalogFailed:catalog.length-count(catalog,'ok'),
   freshBuses:current.find(c=>c.id==='fleet')?.freshCount??null};
 }
 const EXPORT_FIELDS=[
  'id','kind','name','code','status','httpCode','durationMs','detail','checkedAt',
  'points','stops','freshCount','activeLineCount','newestGpsIso','newestAgeSeconds'
 ];
 function exportReport(rows,now=new Date().toISOString()){
  const checks=(rows||[]).map(item=>{
   const safe={};
   for(const k of EXPORT_FIELDS){
    const value=item[k];
    if(value===null||typeof value==='string'||typeof value==='boolean'||
      (typeof value==='number'&&Number.isFinite(value)))safe[k]=value;
   }
   return safe;
  });
  return {format:'intransit-public-diagnostics-v1',generatedAt:now,
   limitation:'HTTP/CORS diagnostic only; no Cloudflare active deployment version can be verified from this page.',
   privacy:'Only status, timings and aggregate GPS counts; no GPS coordinates, vehicle identifiers, tokens or raw responses.',
   checks};
 }
 return {API,STATUSES,classifyHttp,diagnosticsError,gpsAggregate,summarize,
  timeLabel,exportReport};
});

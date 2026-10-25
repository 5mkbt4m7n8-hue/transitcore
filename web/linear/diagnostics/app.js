// Browser-only, read-only diagnostic runner. Does not use localStorage or device APIs.
(function(root){
 'use strict';
 const D=root.InTransitDiagnosticsModel,C=root.InTransitAllCatalog;
 const GPS=root.InTransitLiveGps,Fleet=root.InTransitFleetGps;
 const $=id=>document.getElementById(id);
 const results=new Map();
 const statusNames={ok:'OK',empty:'0 FERSKE',partial:'DELVIS',
  'http-error':'HTTP-FEIL','network-error':'NETTVERK/CORS',
  invalid:'UGYLDIG SVAR',timeout:'TIDSAVBRUDD'};
 let running=false,lastChecked=null;
 function duration(start){return Math.max(0,Date.now()-start);}
 function entry(key,kind,name,values={}){
  results.set(key,{id:key,kind,name,checkedAt:new Date().toISOString(),...values});
  update();
 }
 async function responseFor(url,ms=9000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
  const start=Date.now();
  try{
   const response=await fetch(url,{method:'GET',cache:'no-store',signal:controller.signal});
   const elapsed=duration(start);
   if(!response.ok)return {status:'http-error',httpCode:response.status,durationMs:elapsed,
    detail:D.classifyHttp(response.status)};
   let body;
   try{body=await response.json();}
   catch{return {status:'invalid',httpCode:response.status,durationMs:elapsed,
    detail:'HTTP 200, men responsen er ikke gyldig JSON.'};}
   return {status:'ok',httpCode:response.status,durationMs:elapsed,body};
  }catch(error){
   return {...D.diagnosticsError(controller.signal.aborted?{name:'AbortError'}:error),
    durationMs:duration(start),httpCode:null};
  }finally{clearTimeout(timer);}
 }
 async function probeApi(item){
  const result=await responseFor(item.url);
  if(result.status!=='ok'){
   entry(item.id,item.kind,item.name,{...result,code:item.code||null});
   return;
  }
  const {body,...publicResult}=result;
  if(item.kind==='health'){
   const isOk=body?.api?.status==='ok'&&body?.api?.version===1;
   entry(item.id,item.kind,item.name,{...publicResult,status:isOk?'ok':'invalid',
    detail:isOk?'API v1 svarer med gyldig helsestatus. Aktiv Cloudflare-versjon kan ikke leses her.':
     'HTTP 200, men forventet API-helseformat mangler.'});
   return;
  }
  try{
   const measurement=item.code==='all'?
    Fleet.parse(body,C.CODES):GPS.parse(body,item.code);
   const aggregates=D.gpsAggregate(measurement);
   entry(item.id,item.kind,item.name,{...publicResult,code:item.code,...aggregates,
    status:aggregates.freshCount?'ok':'empty',
    detail:aggregates.freshCount?
     aggregates.freshCount+' ferske, målte GPS-posisjoner. Nyeste: '+D.timeLabel(aggregates.newestGpsIso)+
      ' (alder ca. '+aggregates.newestAgeSeconds+' sek).':
     'Endepunktet svarer HTTP 200 med riktig format, men 0 ferske GPS-posisjoner. Det beviser ikke at det ikke kjører busser.'});
  }catch{
   entry(item.id,item.kind,item.name,{...publicResult,code:item.code,status:'invalid',
    detail:'HTTP 200, men måledata stemmer ikke med forventet linje, GPS-kilde eller format.'});
  }
 }
 async function probeCatalog(code){
  const url=C.routeUrl(code),result=await responseFor(url);
  if(result.status!=='ok'){
   entry('route-'+code,'catalog','Linje '+code,{...result,code});
   return;
  }
  const {body,...publicResult}=result;
  try{
   const profile=C.normalize(body,code);
   entry('route-'+code,'catalog','Linje '+code,{...publicResult,code,status:'ok',
    points:profile.route.length,stops:profile.stops.length,
    detail:'Gyldig lagret AtB-ruteprofil: '+profile.route.length+' trasépunkter, '+
     profile.stops.length+' stoppoppføringer.'});
  }catch{
   entry('route-'+code,'catalog','Linje '+code,{...publicResult,code,status:'invalid',
    detail:'Ruteprofilen har feil ID, linjenummer, kilde, stopp eller koordinater.'});
  }
 }
 function showChecks(){
  const panel=$('apiChecks');
  const checks=D.API.map(item=>results.get(item.id));
  panel.replaceChildren(...D.API.map((item,i)=>{
   const check=checks[i];
   const row=document.createElement('article');row.className='check';
   const heading=document.createElement('div');heading.className='check-name';heading.textContent=item.name;
   const badge=document.createElement('span');badge.className='status '+(check?.status||'');
   badge.textContent=check?statusNames[check.status]||'UKJENT':'IKKE KJØRT';
   const detail=document.createElement('div');detail.className='check-detail';
   detail.textContent=check?.detail||'Venter på kontroll.';
   const meta=document.createElement('div');meta.className='check-meta';
   meta.textContent=check?
    'HTTP '+(check.httpCode??'ukjent')+' · '+check.durationMs+' ms · '+D.timeLabel(check.checkedAt):
    'Ikke målt';
   row.append(heading,badge,detail,meta);return row;
  }));
 }
 function showCatalog(){
  const available=C.CODES.map(code=>results.get('route-'+code));
  const finished=available.filter(Boolean).length;
  const ok=available.filter(v=>v?.status==='ok').length;
  $('catalogCount').textContent=ok+' av '+C.CODES.length+' gyldige'+(finished<C.CODES.length?
   ' · '+finished+' kontrollert':'');
  const host=$('catalogList');
  host.replaceChildren(...C.CODES.map(code=>{
   const item=results.get('route-'+code);
   const line=document.createElement('div');
   line.className='catalogline'+(item&&item.status!=='ok'?' bad':'');
   const title=document.createElement('b');title.textContent='Linje '+code;
   const extra=document.createElement('small');
   extra.textContent=item?
    (item.status==='ok'?item.stops+' stopp · '+item.points+' punkt':
     (item.httpCode?'HTTP '+item.httpCode:statusNames[item.status]||'Feil')):
    'Ikke kontrollert';
   line.title=item?.detail||'Venter på kontroll';
   line.append(title,extra);return line;
  }));
 }
 function update(){
  const checks=[...results.values()],stats=D.summarize(checks,C.CODES.length);
  $('metricRoutes').textContent=stats.catalogLoaded+' / '+stats.catalogExpected;
  $('metricWorker').textContent=stats.workerOk+' / '+D.API.length;
  $('metricBuses').textContent=stats.freshBuses===null?'–':String(stats.freshBuses);
  $('metricTime').textContent=lastChecked?D.timeLabel(lastChecked):'–';
  if(running)$('progress').textContent=checks.length+' av '+(C.CODES.length+D.API.length)+
   ' kontroller gjennomført …';
  showChecks();showCatalog();
 }
 async function runCatalog(){
  const pending=[...C.CODES];
  await Promise.all(Array.from({length:6},async()=>{
   while(pending.length)await probeCatalog(pending.shift());
  }));
 }
 async function runAll(){
  if(running)return;
  running=true;lastChecked=null;results.clear();
  $('run').disabled=true;$('export').disabled=true;
  $('run').textContent='Kontrollerer …';
  update();
  try{
   await Promise.all([...D.API.map(probeApi),runCatalog()]);
   lastChecked=new Date().toISOString();
   const stats=D.summarize([...results.values()],C.CODES.length);
   $('progress').textContent='Ferdig: '+stats.catalogLoaded+' av '+stats.catalogExpected+
    ' ruteprofiler gyldige, '+stats.workerOk+' av '+D.API.length+
    ' API-endepunkter tilgjengelige. En feil ved GPS betyr ikke automatisk at rutekartet er nede.';
  }finally{
   running=false;$('run').disabled=false;
   $('run').textContent='Kjør kontroll på nytt';
   $('export').disabled=results.size===0;
   update();
  }
 }
 function downloadReport(){
  if(!results.size||running)return;
  const report=D.exportReport([...results.values()]);
  const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{
   type:'application/json;charset=utf-8'
  });
  const objectUrl=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=objectUrl;link.download='intransit-diagnostics.json';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
 }
 $('run').addEventListener('click',()=>runAll());
 $('export').addEventListener('click',downloadReport);
 update();
})(globalThis);

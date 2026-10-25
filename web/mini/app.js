// Browser-only Mini control surface; DEMO works without Worker or Internet.
(function(root){
 'use strict';
 const M=root.InTransitMiniModel,R=root.InTransitMiniRenderer,$=id=>document.getElementById(id);
 const API='https://transitcore-led-feed.lgb84.workers.dev/api/v1/mini/departures';
 let board=null,profile=null,pending=null,liveRequest=0,working=false,lastStopId='',errorState=false;
 const numFmt=new Intl.NumberFormat('nb-NO');
 const typeName=kind=>kind==='led'?'RGB LED':kind==='mono'?'OLED (mono)':'LCD / TFT';
 function currentStop(){
  const selection=$('stop').value;
  return selection==='custom'?
   {id:$('customStop').value.trim(),name:'Valgt holdeplass'}:
   M.PRESETS.find(p=>p.id===selection)||M.PRESETS[0];
 }
 function displayProfile(){
  const id=$('profile').value,p=M.profile(id,$('width').value,$('height').value);
  if(id==='custom')p.kind=$('kind').value;
  return p;
 }
 function notice(message,error=false){
  errorState=error;$('status').textContent=message;$('status').classList.toggle('error',error);
 }
 function createFile(name,content,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function render(){
  try{
   profile=displayProfile();
   const frame=$('frame');
   frame.width=profile.width;frame.height=profile.height;
   if(!board){const s=currentStop();board={schemaVersion:1,stopId:s.id,stopName:s.name,source:'pending',departures:[]};}
   const demo=$('source').value==='demo';
   const drawn=R.draw(frame,profile,board,{demo,now:Date.now(),palette:$('palette').value});
   R.preview(frame,$('preview'),profile);
   $('preview').style.aspectRatio=profile.width+'/'+profile.height;
   $('preview').style.filter='brightness('+Number($('brightness').value)/100+')';
   $('profileLabel').textContent=profile.width+' × '+profile.height+' · '+typeName(profile.kind);
   $('resValue').textContent=profile.width+' × '+profile.height;
   $('pixelValue').textContent=numFmt.format(profile.width*profile.height);
   $('rowsValue').textContent=String(drawn.visible)+' / '+String(drawn.rows);
   $('kindValue').textContent=typeName(profile.kind);
   $('brightnessValue').textContent=$('brightness').value+' %';
   $('sourceBadge').textContent=demo?'DEMO · SIMULERT':'ENTUR · AVGANGER';
   $('sourceBadge').classList.toggle('live',!demo);
   $('preview').setAttribute('aria-label',profile.width+' × '+profile.height+' '+
    typeName(profile.kind)+'-forhåndsvisning. '+(demo?'DEMO, simulert.':'Entur-avganger.'));
   $('lastUpdated').textContent=demo?'SIMULERT · ingen sanntid':
    'Hentet fra Entur: '+(board.checkedAt?
      new Date(board.checkedAt).toLocaleTimeString('nb-NO'):'ikke hentet');
  }catch(e){
   notice('Ugyldig skjermoppsett: '+e.message,true);
  }
 }
 function invalidateLive(){liveRequest++;working=false;}
 function demoBoard(){
  invalidateLive();
  const s=currentStop();
  board=M.demo(Date.now(),M.validStopId(s.id)?s:M.PRESETS[0]);
  lastStopId=s.id;notice('DEMO – eksempelavganger. Ingen live API-spørringer eller maskinvaretilkobling.');
  render();
 }
 async function liveBoard(){
  const s=currentStop();
  if(!M.validStopId(s.id)){
   notice('Oppgi gyldig NSR:StopPlace-ID, for eksempel NSR:StopPlace:41613.',true);
   return;
  }
  if(working)return;
  const token=++liveRequest;working=true;board=null;
  $('refresh').disabled=true;
  notice('Henter avgangstider fra Entur via TransitCore Worker …');
  render();
  try{
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),11000);
   let response;
   try{response=await fetch(API+'?stop='+encodeURIComponent(s.id),{
    cache:'no-store',signal:ctrl.signal
   });}finally{clearTimeout(timer);}
   if(!response.ok)throw Object.assign(Error('HTTP '+response.status),{code:response.status});
   const result=M.normalize(await response.json());
   if(token!==liveRequest||$('source').value!=='live')return;
   if(result.stopId!==s.id)throw Error('Avgangene kommer fra feil holdeplass');
   board=result;lastStopId=s.id;
   notice(result.departures.length?
    result.departures.length+' avganger hentet fra Entur. Sanntid er markert der kilden oppgir det.':
    'Entur returnerte ingen aktuelle avganger. Ingen eksempeltider vises som ekte data.');
   render();
  }catch(err){
   if(token!==liveRequest||$('source').value!=='live')return;
   board={schemaVersion:1,stopId:s.id,stopName:s.name,
    source:'unavailable',checkedAt:null,departures:[]};
   const msg=err.code===404?'HTTP 404: Mini-endepunktet er ikke aktivt i Cloudflare.':
    err.code===503?'HTTP 503: Entur-kilden eller Worker-feeden svarte med feil.':
    err.name==='AbortError'?'Avgangskilden brukte for lang tid.':
    err.code?'HTTP '+err.code+' fra Worker.':
    'Live-avganger kan ikke hentes (nettverk/CORS eller ugyldig svar).';
   notice(msg+' DEMO kan brukes separat; vi viser aldri eksempler som ekte.',true);
   render();
  }finally{
   if(token===liveRequest){working=false;$('refresh').disabled=false;}
  }
 }
 function reloadData(){
  if($('source').value==='demo')demoBoard();else liveBoard();
 }
 function exportConfig(){
  try{
   const p=displayProfile(),stop=currentStop();
   const config={schemaVersion:1,product:'intransit-mini',
    hardware:{type:p.kind,width:p.width,height:p.height,pixelCount:p.width*p.height},
    display:{palette:$('palette').value,brightnessPercent:Number($('brightness').value)},
    datasource:{mode:$('source').value,stopId:stop.id},
    note:'Visningsprofil for prototyping. Tilpass maskinvarespesifikke pinout, strøm og driver før ESP32-bruk.'};
   createFile('intransit-mini-'+p.width+'x'+p.height+'.json',
    JSON.stringify(config,null,2)+'\n','application/json');
  }catch(err){notice(err.message,true);}
 }
 function exportPng(){
  try{
   render();const frame=$('frame'),url=frame.toDataURL('image/png');
   const a=document.createElement('a');a.href=url;a.download='intransit-mini-'+
    frame.width+'x'+frame.height+'.png';document.body.append(a);a.click();a.remove();
  }catch(err){notice('Kunne ikke eksportere PNG: '+err.message,true);}
 }
 $('profile').onchange=()=>{
  $('customFields').hidden=$('profile').value!=='custom';render();
 };
 for(const id of ['width','height','kind','palette','brightness']){
  $(id).addEventListener(id==='width'||id==='height'?'input':'change',render);
 }
 $('stop').onchange=()=>{
  $('customStopField').hidden=$('stop').value!=='custom';
  if($('stop').value!=='custom')reloadData();
 };
 $('customStop').onchange=reloadData;
 $('source').onchange=reloadData;
 $('refresh').onclick=reloadData;
 $('downloadConfig').onclick=exportConfig;
 $('downloadImage').onclick=exportPng;
 // Active departures should update without repeated manual reloads.
 setInterval(()=>{
  if(document.hidden)return;
  if($('source').value==='live'){
   if(!working&&lastStopId===currentStop().id)liveBoard();
  }else{
   // Keep the demo list fixed relative to creation time, allowing countdowns.
   render();
  }
 },30000);
 setInterval(()=>{if(!document.hidden&&board)render();},15000);
 demoBoard();
})(globalThis);

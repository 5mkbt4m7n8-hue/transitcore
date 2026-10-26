// Browser-only Mini control surface; DEMO works without Worker or Internet.
(function(root){
 'use strict';
 const M=root.InTransitMiniModel,R=root.InTransitMiniRenderer,$=id=>document.getElementById(id);
 const API='https://transitcore-led-feed.lgb84.workers.dev/api/v1/mini/departures';
 let board=null,profile=null,liveRequest=0,working=false,lastStopId='',errorState=false;
 let selectedLines=null,selectedDestination='',selectedStopName='';
 let searchToken=0,searchTimer=null,searchAbort=null;
 const numFmt=new Intl.NumberFormat('nb-NO');
 const typeName=kind=>kind==='led'?'RGB LED':kind==='mono'?'OLED (mono)':'LCD / TFT';
 function currentStop(){
  const selection=$('stop').value;
  return selection==='custom'?
   {id:$('customStop').value.trim(),name:selectedStopName||'Valgt holdeplass'}:
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
 function lineOptions(){
  const choices=M.filterChoices(board),available=choices.lines;
  if(selectedLines!==null)selectedLines=new Set([...selectedLines].filter(x=>available.includes(x)));
  const host=$('lineFilters');
  host.replaceChildren(...available.map(code=>{
   const label=document.createElement('label'),check=document.createElement('input');
   check.type='checkbox';check.value=code;
   check.checked=selectedLines===null||selectedLines.has(code);
   check.setAttribute('aria-label','Vis linje '+code);
   const name=document.createElement('span');name.textContent='Linje '+code;
   check.addEventListener('change',()=>{
    if(selectedLines===null)selectedLines=new Set(available);
    if(check.checked)selectedLines.add(code);else selectedLines.delete(code);
    lineOptions();render();
   });
   label.append(check,name);return label;
  }));
  if(!available.length)host.textContent='Ingen linjer tilgjengelige ved valgt stopp.';
  const current=selectedLines===null?available:available.filter(x=>selectedLines.has(x));
  const destinations=[...new Set((board?.departures||[]).filter(v=>
   !v.cancelled&&current.includes(v.line)).map(v=>v.destination))]
   .sort((a,b)=>a.localeCompare(b,'nb'));
  if(selectedDestination&&!destinations.includes(selectedDestination))selectedDestination='';
  $('direction').replaceChildren(new Option('Alle retninger',''),
   ...destinations.map(d=>new Option(d,d)));
  $('direction').value=selectedDestination;
  $('filterSummary').textContent=(selectedLines===null?'Alle linjer':
   current.length+' av '+available.length+' linjer')+
   (selectedDestination?' · mot '+selectedDestination:' · alle retninger');
 }
 function resetFilters(){
  selectedLines=null;selectedDestination='';lineOptions();render();
 }
 function searchReset(){
  ++searchToken;
  if(searchTimer!==null)clearTimeout(searchTimer);
  searchTimer=null;
  if(searchAbort)searchAbort.abort();searchAbort=null;
  $('stopResults').replaceChildren();$('stopResults').hidden=true;
 }
 function displayStops(stops){
  const host=$('stopResults');
  host.replaceChildren(...stops.map(stop=>{
   const btn=document.createElement('button');btn.type='button';
   btn.className='stop-choice';
   const name=document.createElement('strong');name.textContent=stop.label;
   const id=document.createElement('small');id.textContent=stop.id;
   btn.append(name,id);
   btn.onclick=()=>{
    searchReset();
    selectedStopName=stop.name;
    $('stop').value='custom';$('customStopField').hidden=false;
    $('customStop').value=stop.id;$('stopSearch').value=stop.label;
    selectedLines=null;selectedDestination='';
    $('searchStatus').textContent='Valgt holdeplass: '+stop.name+' ('+stop.id+').';
    reloadData();
   };
   return btn;
  }));
  host.hidden=!stops.length;
 }
 async function queryStops(query,token){
  if(token!==searchToken)return;
  if($('source').value==='demo'){
   const value=query.toLocaleLowerCase('nb');
   const results=M.PRESETS.filter(p=>p.name.toLocaleLowerCase('nb').includes(value))
    .map(p=>({...p,label:p.name}));
   displayStops(results);
   $('searchStatus').textContent=results.length?
    'DEMO: '+results.length+' eksempelholdeplasser. Velg Entur for fullstendig søk.':
    'DEMO har ingen eksempler som matcher. Velg Entur for å søke andre stopp.';
   return;
  }
  searchAbort=new AbortController();
  try{
   const reply=await fetch('https://transitcore-led-feed.lgb84.workers.dev/api/v1/mini/stop-search?q='+
    encodeURIComponent(query),{cache:'no-store',signal:searchAbort.signal});
   if(!reply.ok)throw Object.assign(Error('HTTP '+reply.status),{httpStatus:reply.status});
   const result=await reply.json();
   if(token!==searchToken||$('source').value!=='live')return;
   if(result?.schemaVersion!==1||result?.source!=='Entur Geocoder v3'||
      result.query!==query||!Array.isArray(result.stops))throw Error('Ugyldig søkerespons');
   const stops=result.stops.filter(p=>M.validStopId(p?.id)&&typeof p?.name==='string'&&
    p.name.length<=150&&typeof p?.label==='string'&&p.label.length<=200).slice(0,12);
   displayStops(stops);
   $('searchStatus').textContent=stops.length?
    stops.length+' treff fra Entur. Velg riktig holdeplass:':
    'Ingen registrerte holdeplasser funnet.';
  }catch(error){
   if(token!==searchToken||error.name==='AbortError')return;
   $('stopResults').hidden=true;
   $('searchStatus').textContent=error.httpStatus===404?
    'Søketjenesten er ikke aktiv i Cloudflare ennå (HTTP 404). Bruk eksisterende holdeplassvalg eller NSR-ID.':
    'Kunne ikke søke hos Entur. Sjekk Worker/nettverk eller bruk NSR-ID.';
  }finally{if(token===searchToken)searchAbort=null;}
 }
 function onSearch(){
  searchReset();
  const q=$('stopSearch').value.trim();
  if(q.length<2){
   $('searchStatus').textContent='Skriv minst to tegn for å søke etter en holdeplass.';
   return;
  }
  if(q.length>80){
   $('searchStatus').textContent='Søket må være kortere enn 81 tegn.';
   return;
  }
  const token=searchToken;
  $('searchStatus').textContent='Søker etter holdeplasser …';
  searchTimer=setTimeout(()=>{searchTimer=null;queryStops(q,token);},300);
 }
 function render(){
  try{
   profile=displayProfile();
   const frame=$('frame');
   frame.width=profile.width;frame.height=profile.height;
   if(!board){const s=currentStop();board={schemaVersion:1,stopId:s.id,stopName:s.name,source:'pending',departures:[]};}
   const demo=$('source').value==='demo';
   const visibleBoard=M.filterBoard(board,{lines:selectedLines,destination:selectedDestination});
   const drawn=R.draw(frame,profile,visibleBoard,{demo,now:Date.now(),palette:$('palette').value});
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
  lineOptions();render();
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
   lineOptions();
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
   lineOptions();render();
  }finally{
   if(token===liveRequest){working=false;$('refresh').disabled=false;}
  }
 }
 function reloadData(){
  invalidateLive();working=false;
  if($('source').value==='demo')demoBoard();else liveBoard();
 }
 function exportConfig(){
  try{
   const p=displayProfile(),stop=currentStop();
   const config={schemaVersion:1,product:'intransit-mini',
    hardware:{type:p.kind,width:p.width,height:p.height,pixelCount:p.width*p.height},
    display:{palette:$('palette').value,brightnessPercent:Number($('brightness').value)},
    datasource:{mode:$('source').value,stopId:stop.id,stopName:stop.name,
     filters:{lines:selectedLines===null?null:[...selectedLines].sort(),
      destination:selectedDestination||null}},
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
  invalidateLive();selectedLines=null;selectedDestination='';
  selectedStopName='';
  $('customStopField').hidden=$('stop').value!=='custom';
  if($('stop').value!=='custom')reloadData();
  else{
   board={schemaVersion:1,stopId:'',stopName:'Velg holdeplass',source:'pending',departures:[]};
   lineOptions();render();
  }
 };
 $('customStop').onchange=()=>{
  selectedStopName='';selectedLines=null;selectedDestination='';
  reloadData();
 };
 $('source').onchange=()=>{
  searchReset();$('searchStatus').textContent=$('source').value==='demo'?
   'DEMO: bare eksempelholdeplasser. Velg Entur for fullt søk.':
   'Entur: søk på navn for å finne registrert holdeplass.';
  selectedLines=null;selectedDestination='';reloadData();
 };
 $('stopSearch').addEventListener('input',onSearch);
 $('direction').onchange=()=>{selectedDestination=$('direction').value;lineOptions();render();};
 $('resetFilters').onclick=resetFilters;
 $('selectAllLines').onclick=()=>{selectedLines=null;lineOptions();render();};
 $('clearAllLines').onclick=()=>{selectedLines=new Set();lineOptions();render();};
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

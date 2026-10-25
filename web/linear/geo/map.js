(function(root){
'use strict';
const M=root.InTransitGeoModel,N=root.InTransitStopLinks,G=root.InTransitLine1Gps;
const GPS_URL='https://transitcore-led-feed.lgb84.workers.dev/api/v1/vehicles/atb-line-1';
const LIB='https://unpkg.com/leaflet@1.9.4/dist/';
let pendingLibrary;
function loadLeaflet(){
 if(root.L?.map)return Promise.resolve();
 if(pendingLibrary)return pendingLibrary;
 pendingLibrary=new Promise((resolve,reject)=>{
  const css=document.createElement('link');css.rel='stylesheet';css.href=LIB+'leaflet.css';
  css.integrity='sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';css.crossOrigin='anonymous';document.head.append(css);
  const script=document.createElement('script');script.src=LIB+'leaflet.js';
  script.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  script.crossOrigin='anonymous';script.onload=()=>root.L?.map?resolve():reject(Error('Kartbiblioteket ble ikke lastet'));
  script.onerror=()=>reject(Error('Kartbiblioteket kunne ikke lastes. Kontroller nettforbindelsen.'));
  document.head.append(script);
 }).catch(e=>{pendingLibrary=null;throw e;});
 return pendingLibrary;
}
function download(name,text){
 const url=URL.createObjectURL(new Blob([text],{type:'application/geo+json'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
root.InTransitGeoLayoutBase=document.currentScript?.src||new URL('map.js',location.href).href;
root.InTransitGeo={async create(host){
 const response=await fetch(new URL('../network/trondheim-layout.json',root.InTransitGeoLayoutBase).href,{cache:'no-store'});
 if(!response.ok)throw Error('Kunne ikke hente kartpunktene');
 const layout=await response.json();
 host.innerHTML='<div class="geo-shell"><div class="geo-head"><strong>Geografisk Trondheim-kart</strong><small>Foreslåtte stoppunkter fra katalogen må kontrolleres. Dette er ikke GPS-sporing av bussene.</small></div>'+
 '<div class="geo-tools"><a data-g="schematic" href="../index.html?view=network" class="geo-back-stop">Vis valgt stopp på skjemakartet</a><label>Holdeplass <select data-g="stop"></select></label><button data-g="place">Plasser valgt stopp</button><button data-g="reset">Tilbakestill dette stoppet</button><button data-g="draw">Tegn ny trasé</button>'+
 '<button data-g="undo" hidden>Fjern siste punkt</button><button data-g="finish" hidden>Fullfør trasé</button><button data-g="cancel" hidden>Avbryt</button><button data-g="export">Eksporter GeoJSON</button><label>Importer GeoJSON <input type="file" data-g="import" accept=".geojson,.json,application/geo+json"></label><button data-g="discard">Forkast geografiske endringer</button></div>'+
 '<div class="geo-tools geo-edit-tools"><label>Visningsnavn for valgt stopp <input type="text" maxlength="80" data-g="stopName" placeholder="Lokalt navn"></label><button data-g="saveName">Lagre stopnavn</button><button data-g="clearName">Bruk originalnavn</button><label>Velg geografisk linje <select data-g="geoPath"></select></label><label>Linjenavn <input type="text" maxlength="80" data-g="pathName" placeholder="Valgfritt"></label><button data-g="savePathName">Lagre linjenavn</button><label>Farge <input type="color" data-g="pathColor" value="#e4ae63"></label><button data-g="saveColor">Bruk farge</button><button data-g="extend">Forleng valgt linje</button><button data-g="insert">+ Knekkpunkt på valgt linje</button><button data-g="deleteVertex">Slett siste linjepunkt</button><button data-g="deletePath">Slett valgt linje</button><button data-g="historyUndo">Angre endring</button><button data-g="historyRedo">Gjenta endring</button></div>'+ 
 '<div class="geo-live-panel" aria-label="Live GPS linje 1"><div class="geo-live-top"><strong>AtB linje 1 – faktiske GPS-posisjoner</strong><label><input type="checkbox" data-g="gpsEnabled" checked> Vis busser</label><button data-g="gpsNow" type="button">Oppdater GPS</button><button data-g="gpsFit" type="button" disabled>Vis alle busser</button></div><p data-g="gpsStatus" role="status" aria-live="polite">Henter målt GPS fra Entur …</p><small>Røde bussmarkører = målt posisjon fra Entur, maksimalt 90 sekunder gammel. Ingen bevegelse beregnes mellom målingene. Hule gule stoppmarkører er fortsatt katalogforslag, ikke GPS.</small></div>'+
 '<p data-g="message" aria-live="polite">Laster kart…</p><div class="geo-canvas" data-g="map" role="application" aria-label="Geografisk kart over Trondheim"></div>'+
 '<p class="geo-footnote">Hule gule punkter = ubekreftede forslag fra holdeplasskatalogen. Grønne punkter = manuelt plassert. Lysende punkter kan vise status fra eksisterende tavlefeed, ikke nødvendigvis GPS. Kart © OpenStreetMap contributors.</p></div>';
 const q=id=>host.querySelector('[data-g="'+id+'"]');
 const selected=q('stop'),message=q('message');
 const initialIds=layout.stops.map(s=>s.id).join('|');
 let hash=2166136261;for(const ch of initialIds){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
 const fingerprint=(hash>>>0).toString(16)+'-'+layout.stops.length;
 const key='intransit-geo-draft-v1';
 const requestedStop=new URLSearchParams(location.search).get('stop');
 let geo=M.empty(),context={},catalog={},mode='',sketch=[],chosen=layout.stops.some(s=>s.id===requestedStop)?requestedStop:(layout.stops[0]?.id||''),selectedPath='',selectedVertex=-1,markers=new Map(),shapes=[],handles=[],preview=null;
 const history=[],future=[],MAX_HISTORY=60;
 let gpsMarkers=new Map(),gpsEnabled=true,gpsBusy=false,gpsRequestSequence=0;
 const gpsStatus=text=>q('gpsStatus').textContent=text;
 function clearGps(){for(const marker of gpsMarkers.values())map.removeLayer(marker);gpsMarkers=new Map();q('gpsFit').disabled=true;}
 function renderGps(vehicles){
  clearGps();
  for(const v of vehicles){
   const marker=L.circleMarker([v.latitude,v.longitude],{
    radius:9,weight:3,color:'#fff0dd',fillColor:'#eb414b',fillOpacity:1
   }).addTo(map);
   const tooltip=document.createElement('span');
   tooltip.textContent='Buss 1 · '+(v.destination||'retning ukjent')+' · målt GPS ('+v.ageSeconds+' s)';
   marker.bindTooltip(tooltip);
   const popup=document.createElement('div');
   const title=document.createElement('strong');title.textContent='AtB linje 1';
   const info=document.createElement('p');info.textContent='Mot '+(v.destination||'ukjent destinasjon');
   const age=document.createElement('small');age.textContent='Målt GPS: '+v.lastUpdated+' · '+v.ageSeconds+' sek siden · Kilde: Entur';
   popup.append(title,info,age);marker.bindPopup(popup);
   gpsMarkers.set(v.id,marker);
  }
  q('gpsFit').disabled=!gpsMarkers.size;
 }
 async function refreshGps(){
  if(!gpsEnabled||gpsBusy||document.hidden)return;
  gpsBusy=true;const sequence=++gpsRequestSequence;
  try{
   const response=await fetch(GPS_URL,{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   const snapshot=G.parse(await response.json());
   if(sequence!==gpsRequestSequence||!gpsEnabled)return;
   renderGps(snapshot.vehicles);
   const count=snapshot.vehicles.length;
   gpsStatus(count?count+' busser med fersk målt GPS på linje 1 (maks 90 sek). Kilde: Entur / AtB.':
    'Ingen ferske linje 1-posisjoner ble levert nå. Det betyr ikke at det ikke kjører busser.');
  }catch(error){
   if(sequence!==gpsRequestSequence||!gpsEnabled)return;
   clearGps();gpsStatus('GPS-kilden er utilgjengelig ('+error.message+'). Ingen ETA-posisjoner vises som GPS.');
  }finally{gpsBusy=false;}
 }
 q('gpsEnabled').onchange=()=>{
  gpsEnabled=q('gpsEnabled').checked;
  gpsRequestSequence++;
  if(!gpsEnabled){clearGps();gpsStatus('GPS-visningen er avslått.');}
  else{gpsStatus('Henter faktiske GPS-posisjoner …');refreshGps();}
 };
 q('gpsNow').onclick=()=>refreshGps();
 q('gpsFit').onclick=()=>{
  if(!gpsMarkers.size)return;
  map.fitBounds(L.latLngBounds([...gpsMarkers.values()].map(marker=>marker.getLatLng())),{padding:[35,35],maxZoom:15});
 };
 const snapshot=()=>JSON.stringify(geo);
 try{
  const saved=localStorage.getItem(key);
  if(saved){
   const data=JSON.parse(saved);
   if(data.fingerprint===fingerprint){geo=M.validate(data.geo,layout);message.textContent='Lokale geografiske endringer hentet';}
   else message.textContent='Gammelt geografisk utkast kan ikke automatisk legges over dette kartet.';
  }
 }catch{message.textContent='Kunne ikke hente geografisk arbeidskopi.';}
 function save(){
  M.validate(geo,layout);
  try{localStorage.setItem(key,JSON.stringify({fingerprint,geo}));message.textContent='Geografiske endringer lagret lokalt';}
  catch{message.textContent='Lokal lagring utilgjengelig. Eksporter GeoJSON.';}
 }
 await loadLeaflet();
 const L=root.L,map=L.map(q('map'),{preferCanvas:true}).setView([63.4305,10.4000],12);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom:19
 }).addTo(map);
 function setMessage(msg){message.textContent=msg;}
 function positions(){return {...catalog,...geo.stops};}
 function displayName(stop){return geo.names?.[stop.id]||stop.name;}
 function showHistory(){q('historyUndo').disabled=!history.length;q('historyRedo').disabled=!future.length;}
 function updateAll(){drawMarkers();drawLines();showMode();showHistory();}
 function commit(action){
  const before=snapshot();
  try{
   action();M.validate(geo,layout);
   if(snapshot()===before)return false;
   history.push(before);if(history.length>MAX_HISTORY)history.shift();future.length=0;
   save();updateAll();return true;
  }catch(e){geo=JSON.parse(before);updateAll();throw e;}
 }
 function restoreHistory(source,target){
  if(!source.length)return;
  const before=snapshot(),next=source.pop();
  try{geo=M.validate(JSON.parse(next),layout);target.push(before);if(target.length>MAX_HISTORY)target.shift();
   mode='';sketch=[];sketchPreview();save();updateAll();
   setMessage('Kartendringen er gjenopprettet.');}
  catch(e){source.push(next);geo=JSON.parse(before);setMessage(e.message);}
 }
 function activePath(){return geo.paths.find(p=>p.id===selectedPath);}
 function updatePathSelect(){
  const menu=q('geoPath'),items=geo.paths;
  if(!items.some(p=>p.id===selectedPath)){selectedPath=items.at(-1)?.id||'';selectedVertex=-1;}
  menu.replaceChildren(...(items.length?items.map(p=>new Option((p.name||p.id)+' ('+p.coordinates.length+' pkt)',p.id)):[new Option('Ingen linjer','')]));
  menu.value=selectedPath;
  const path=activePath();q('pathName').value=path?.name||'';q('pathColor').value=path?.color||'#e4ae63';
  for(const id of ['savePathName','saveColor','extend','insert','deleteVertex','deletePath','pathName','pathColor'])q(id).disabled=!path;
  q('deleteVertex').disabled=!path||path.coordinates.length<=2;
 }
 function nearestSegment(points,p){
  const cos=Math.cos(p[1]*Math.PI/180);let best=0,distance=Infinity;
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1],dx=(b[0]-a[0])*cos,dy=b[1]-a[1];
   const scale=dx*dx+dy*dy,t=scale?Math.max(0,Math.min(1,(((p[0]-a[0])*cos)*dx+(p[1]-a[1])*dy)/scale)):0;
   const near=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],d=Math.hypot((p[0]-near[0])*cos,p[1]-near[1]);
   if(d<distance){distance=d;best=i;}
  }
  return best;
 }
 function currentSignals(stop){
  if(stop.verification!=='confirmed'||!context.board||!context.hardware)return [];
  return root.InTransitMapModel.signals(stop,context.board,context.hardware,context.frame,context.all?null:context.line);
 }
 function updateStopSelect(){
  const at=positions();
  selected.replaceChildren(...layout.stops.map(stop=>{
   const prefix=geo.stops[stop.id]?'✓ ':at[stop.id]?'◌ ':'– ';
   return new Option(prefix+displayName(stop),stop.id);
  }));
  selected.value=chosen;q('stopName').value=geo.names?.[chosen]||'';
  q('schematic').href=N.schematicUrl(chosen);
 }
 function drawMarkers(){
  for(const marker of markers.values())map.removeLayer(marker);markers=new Map();
  const at=positions();
  for(const stop of layout.stops){
   const point=at[stop.id];if(!point)continue;
   const [lon,lat]=point.coordinates,reviewed=!!geo.stops[stop.id],active=currentSignals(stop);
   const v=active.find(x=>x.state==='AT_STOP')||active.find(x=>x.state==='APPROACHING')||active[0];
   const color=v?.rgb?.length===3&&v.rgb.every(x=>Number.isInteger(x)&&x>=0&&x<=255)
    ?'rgb('+v.rgb.join(',')+')':reviewed?'#39cbae':'#e9b85f';
   const marker=L.circleMarker([lat,lon],{
    radius:reviewed?8:6,weight:reviewed?3:2,
    color:reviewed?'#ffffff':'#e9b85f',fillColor:color,fillOpacity:reviewed||v?.state?0.96:0.35,
    dashArray:reviewed?null:'3 3'
   }).addTo(map);
   const label=document.createElement('span');
   label.textContent=displayName(stop)+(reviewed?' · manuelt plassert':' · katalogforslag');
   marker.bindTooltip(label);
   marker.on('click',e=>{
    if(mode)return;
    chosen=stop.id;selected.value=chosen;q('schematic').href=N.schematicUrl(chosen);q('stopName').value=geo.names?.[chosen]||'';
    const state=active.length?' · '+active.map(v=>(v.line||'?')+' '+v.state).join(', '):'';
    setMessage(displayName(stop)+(reviewed?' · din plassering':' · forslag, ikke kontrollert')+state);
    L.DomEvent.stopPropagation(e);
   });
   markers.set(stop.id,marker);
  }
  updateStopSelect();
 }
 function drawLines(){
  for(const p of [...shapes,...handles])map.removeLayer(p);
  shapes=[];handles=[];updatePathSelect();
  for(const line of geo.paths){
   const selected=line.id===selectedPath;
   const path=L.polyline(line.coordinates.map(p=>[p[1],p[0]]),{color:line.color||'#e4ae63',weight:selected?6:3,dashArray:selected?null:'7 5'}).addTo(map);
   const label=document.createElement('span');label.textContent=(line.name||line.id)+' · manuelt tegnet; ikke ruteverifisert';
   path.bindTooltip(label);
   path.on('click',e=>{
    if(mode)return;
    selectedPath=line.id;drawLines();
    setMessage('Valgt '+(line.name||line.id)+'. Dra hvite knekkpunkter eller bruk redigeringsknappene.');
    L.DomEvent.stopPropagation(e);
   });
   shapes.push(path);
  }
  const active=activePath();
  if(active&&!mode)active.coordinates.forEach((point,index)=>{
   const marker=L.marker([point[1],point[0]],{
    draggable:true,autoPan:true,keyboard:false,
    icon:L.divIcon({className:'geo-vertex-handle',html:'',iconSize:[16,16],iconAnchor:[8,8]})
   }).addTo(map);
   marker.on('click',e=>{selectedVertex=index;setMessage('Knekkpunkt '+(index+1)+' valgt. Bruk slett-knappen eller dra punktet.');L.DomEvent.stopPropagation(e);});
   marker.on('dragend',e=>change(()=>{
    const pos=e.target.getLatLng();selectedVertex=index;
    commit(()=>M.moveVertex(geo,active.id,index,[pos.lng,pos.lat]));
    setMessage('Knekkpunkt flyttet og lagret.');
   }));
   handles.push(marker);
  });
 }
 function sketchPreview(){
  if(preview){map.removeLayer(preview);preview=null;}
  const points=mode==='extend'&&activePath()?[activePath().coordinates.at(-1),...sketch]:sketch;
  if(points.length>=2)preview=L.polyline(points.map(p=>[p[1],p[0]]),{color:'#ffffff',weight:4,dashArray:'5 5'}).addTo(map);
 }
 function showMode(){
  for(const action of ['finish','undo','cancel'])q(action).hidden=!['draw','extend'].includes(mode);
  q('finish').disabled=sketch.length<(mode==='extend'?1:2);q('undo').disabled=sketch.length===0;
  for(const id of ['draw','place','extend','insert'])q(id).setAttribute('aria-pressed',String(mode===id));
 }
 function change(action){try{action();}catch(e){setMessage(e.message);}}
 selected.onchange=()=>{
  chosen=selected.value;q('schematic').href=N.schematicUrl(chosen);
  q('stopName').value=geo.names?.[chosen]||'';
  const p=positions()[chosen];if(p)map.panTo([p.coordinates[1],p.coordinates[0]]);
  setMessage(p?'Velg «Plasser valgt stopp» for å justere punktet.':'Ikke plassert. Velg «Plasser valgt stopp» og trykk på kartet.');
 };
 q('saveName').onclick=()=>change(()=>{
  commit(()=>M.renameStop(geo,layout,chosen,q('stopName').value));
  setMessage('Lokalt stopnavn lagret. Opprinnelig stopp-ID og GPS-kobling er ikke endret.');
 });
 q('clearName').onclick=()=>change(()=>{
  commit(()=>M.renameStop(geo,layout,chosen,''));
  setMessage('Originalt stopnavn vises igjen.');
 });
 q('geoPath').onchange=()=>{
  selectedPath=q('geoPath').value;selectedVertex=-1;drawLines();
  setMessage(selectedPath?'Linje valgt. Dra de hvite punktene for å redigere.':'Ingen linje valgt.');
 };
 q('savePathName').onclick=()=>change(()=>{
  commit(()=>M.renamePath(geo,selectedPath,q('pathName').value));
  setMessage('Linjenavn lagret lokalt; ikke koblet til virkelig bussrute.');
 });
 q('saveColor').onclick=()=>change(()=>{
  commit(()=>M.colorPath(geo,selectedPath,q('pathColor').value));
  setMessage('Farge lagret på den manuelle linjen.');
 });
 q('historyUndo').onclick=()=>restoreHistory(history,future);
 q('historyRedo').onclick=()=>restoreHistory(future,history);
 q('place').onclick=()=>change(()=>{
  mode=mode==='place'?'':'place';sketch=[];sketchPreview();updateAll();
  setMessage(mode==='place'?'Trykk der '+displayName(layout.stops.find(s=>s.id===chosen))+' faktisk ligger.':'Plasseringen avbrutt.');
 });
 q('reset').onclick=()=>change(()=>{
  commit(()=>M.removeStop(geo,chosen));
  setMessage('Manuell plassering fjernet; eventuelt katalogforslag vises igjen.');
 });
 q('draw').onclick=()=>change(()=>{
  mode=mode==='draw'?'':'draw';sketch=[];sketchPreview();updateAll();
  setMessage(mode==='draw'?'Trykk på kartet for hvert nytt rutepunkt. Fullfør ved minst to punkter.':'Tegning avbrutt.');
 });
 q('extend').onclick=()=>change(()=>{
  if(!activePath())throw Error('Velg en linje først');
  mode=mode==='extend'?'':'extend';sketch=[];sketchPreview();updateAll();
  setMessage(mode==='extend'?'Trykk på kartet for å forlenge valgt linje. Minst ett nytt punkt.':'Forlengelse avbrutt.');
 });
 q('insert').onclick=()=>change(()=>{
  if(!activePath())throw Error('Velg en linje først');
  mode=mode==='insert'?'':'insert';sketch=[];sketchPreview();updateAll();
  setMessage(mode==='insert'?'Trykk på kartet nær delstrekningen der du ønsker et nytt knekkpunkt.':'Innsetting avbrutt.');
 });
 q('deleteVertex').onclick=()=>change(()=>{
  const path=activePath();if(!path)throw Error('Velg en linje først');
  const i=selectedVertex>=0?selectedVertex:path.coordinates.length-1;
  commit(()=>M.removeVertex(geo,path.id,i));selectedVertex=-1;
  setMessage('Knekkpunkt slettet. Angre endring for å gjenopprette.');
 });
 q('deletePath').onclick=()=>change(()=>{
  if(!activePath())throw Error('Velg en linje først');
  if(!root.confirm('Slette valgt geografisk linje? Du kan angre etterpå.'))return;
  commit(()=>M.deletePath(geo,selectedPath));selectedVertex=-1;
  setMessage('Geografisk linje slettet lokalt. Angre er tilgjengelig.');
 });
 q('undo').onclick=()=>{sketch.pop();sketchPreview();showMode();};
 q('cancel').onclick=()=>{mode='';sketch=[];sketchPreview();updateAll();};
 q('finish').onclick=()=>change(()=>{
  if(mode!=='draw'&&mode!=='extend')throw Error('Ingen pågående tegning');
  const was=mode;
  commit(()=>{if(was==='draw')selectedPath=M.draw(geo,sketch);
   else M.appendPath(geo,selectedPath,sketch);});
  mode='';sketch=[];selectedVertex=-1;sketchPreview();updateAll();
  setMessage(was==='draw'?'Geografisk trasé opprettet. Ikke bekreftet bussrute.':'Linjen forlenget. Eksisterende punkt er beholdt.');
 });
 q('export').onclick=()=>change(()=>download('trondheim-geografisk.geojson',JSON.stringify(M.exportGeo(geo,layout),null,2)+'\\n'));
 q('import').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   if(file.size>2000000)throw Error('GeoJSON-filen er for stor');
   const data=M.importGeo(JSON.parse(await file.text()),layout);
   if(!root.confirm('Erstatte lokale geografiske endringer med denne GeoJSON-filen? Endringen kan angres i denne økten.'))return;
   commit(()=>{geo=data;});mode='';sketch=[];selectedVertex=-1;sketchPreview();updateAll();
   setMessage('GeoJSON importert. Lokal angrefunksjon og eksport er tilgjengelig.');
  }catch(error){setMessage(error.message);}finally{e.target.value='';}
 };
 q('discard').onclick=()=>change(()=>{
  if(!root.confirm('Forkaste ALLE lokale geografiske plasseringer, navn og linjer? Eksporter GeoJSON først hvis du vil beholde dem.'))return;
  commit(()=>{geo=M.empty();});mode='';sketch=[];selectedVertex=-1;sketchPreview();updateAll();
  setMessage('Lokale geografiske endringer nullstilt. Du kan angre i denne økten. Skjemakartet er uendret.');
 });
 map.on('click',e=>change(()=>{
  const coord=[e.latlng.lng,e.latlng.lat];
  if(mode==='place'){
   commit(()=>M.place(geo,layout,chosen,coord));mode='';updateAll();
   setMessage('Plassert '+displayName(layout.stops.find(s=>s.id===chosen))+' manuelt på kartet.');
  }else if(mode==='draw'||mode==='extend'){
   const prev=sketch.at(-1)||(mode==='extend'?activePath()?.coordinates.at(-1):null);
   if(prev&&Math.hypot(coord[0]-prev[0],coord[1]-prev[1])<1e-7)return;
   sketch.push(coord);sketchPreview();showMode();
   setMessage(sketch.length+' nye punkter – fortsett eller fullfør.');
  }else if(mode==='insert'){
   const path=activePath();if(!path)throw Error('Velg en linje');
   const segment=nearestSegment(path.coordinates,coord);
   commit(()=>M.insertVertex(geo,path.id,segment,coord));selectedVertex=segment+1;mode='';updateAll();
   setMessage('Nytt knekkpunkt lagt til på valgt linje.');
  }
 }));
 document.addEventListener('keydown',e=>{
  if(host.hidden)return;
  const isField=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'');
  if(!isField&&(e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){
   e.preventDefault();
   if(e.key.toLowerCase()==='y'||e.shiftKey)q('historyRedo').click();else q('historyUndo').click();
   return;
  }
  if(isField)return;
  if(e.key==='Escape'&&mode){e.preventDefault();mode='';sketch=[];sketchPreview();updateAll();}
  if(e.key==='Backspace'&&(mode==='draw'||mode==='extend')){e.preventDefault();q('undo').click();}
  if(e.key==='Enter'&&(mode==='draw'||mode==='extend')&&sketch.length>=(mode==='draw'?2:1)){e.preventDefault();q('finish').click();}
 });
 function refresh(next){
  context=next||context;catalog=M.candidates(layout,context.boards||[]);
  updateAll();
  if(requestedStop){const found=positions()[requestedStop];if(found)map.panTo([found.coordinates[1],found.coordinates[0]]);}
 }
 root.addEventListener('storage',e=>{
  if(e.key!==N.KEY)return;
  try{
   const incoming=N.readGeo(layout);
   geo=incoming;history.length=0;future.length=0;mode='';sketch=[];sketchPreview();updateAll();
   setMessage('Endring fra skjemakartet er oppdatert. Ny angrehistorikk starter her.');
  }catch(error){setMessage(error.message);}
 });
 setInterval(()=>{if(!document.hidden&&gpsEnabled)refreshGps();},30000);
 root.addEventListener('visibilitychange',()=>{if(!document.hidden&&gpsEnabled)refreshGps();});
 showMode();showHistory();refresh();refreshGps();
 if(!message.textContent||message.textContent==='Laster kart…')setMessage('Trykk på et punkt for informasjon, eller velg et stopp for å plassere det.');
 return {update(next){refresh(next);},visible(){map.invalidateSize();},clear(){context.frame=null;drawMarkers();}};
 }};
})(globalThis);

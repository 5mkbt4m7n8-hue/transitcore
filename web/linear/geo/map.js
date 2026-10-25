(function(root){
'use strict';
const M=root.InTransitGeoModel;
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
 '<div class="geo-tools"><label>Holdeplass <select data-g="stop"></select></label><button data-g="place">Plasser valgt stopp</button><button data-g="reset">Tilbakestill dette stoppet</button><button data-g="draw">Tegn ny trasé</button>'+
 '<button data-g="undo" hidden>Fjern siste punkt</button><button data-g="finish" hidden>Fullfør trasé</button><button data-g="cancel" hidden>Avbryt</button><button data-g="export">Eksporter GeoJSON</button><label>Importer GeoJSON <input type="file" data-g="import" accept=".geojson,.json,application/geo+json"></label><button data-g="discard">Forkast geografiske endringer</button></div>'+
 '<p data-g="message" aria-live="polite">Laster kart…</p><div class="geo-canvas" data-g="map" role="application" aria-label="Geografisk kart over Trondheim"></div>'+
 '<p class="geo-footnote">Hule gule punkter = ubekreftede forslag fra holdeplasskatalogen. Grønne punkter = manuelt plassert. Lysende punkter kan vise status fra eksisterende tavlefeed, ikke nødvendigvis GPS. Kart © OpenStreetMap contributors.</p></div>';
 const q=id=>host.querySelector('[data-g="'+id+'"]');
 const selected=q('stop'),message=q('message');
 const initialIds=layout.stops.map(s=>s.id).join('|');
 let hash=2166136261;for(const ch of initialIds){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
 const fingerprint=(hash>>>0).toString(16)+'-'+layout.stops.length;
 const key='intransit-geo-draft-v1';
 let geo=M.empty(),context={},catalog={},mode='',sketch=[],chosen=layout.stops[0]?.id||'',markers=new Map(),shapes=[],preview=null;
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
 function currentSignals(stop){
  if(stop.verification!=='confirmed'||!context.board||!context.hardware)return [];
  return root.InTransitMapModel.signals(stop,context.board,context.hardware,context.frame,context.all?null:context.line);
 }
 function updateStopSelect(){
  const at=positions();
  selected.replaceChildren(...layout.stops.map(stop=>{
   const prefix=geo.stops[stop.id]?'✓ ':at[stop.id]?'◌ ':'– ';
   return new Option(prefix+stop.name,stop.id);
  }));
  selected.value=chosen;
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
   label.textContent=stop.name+(reviewed?' · manuelt plassert':' · katalogforslag');
   marker.bindTooltip(label);
   marker.on('click',e=>{
    if(mode==='place'||mode==='draw')return;
    chosen=stop.id;selected.value=chosen;
    const state=active.length?' · '+active.map(v=>(v.line||'?')+' '+v.state).join(', '):'';
    setMessage(stop.name+(reviewed?' · din plassering':' · forslag, ikke kontrollert')+state);
    L.DomEvent.stopPropagation(e);
   });
   markers.set(stop.id,marker);
  }
  updateStopSelect();
 }
 function drawLines(){
  for(const p of shapes)map.removeLayer(p);shapes=[];
  for(const line of geo.paths){
   const path=L.polyline(line.coordinates.map(p=>[p[1],p[0]]),{color:'#e4ae63',weight:3,dashArray:'7 5'}).addTo(map);
   const label=document.createElement('span');label.textContent='Manuelt tegnet trasé. Rutetilhørighet ikke bekreftet.';
   path.bindTooltip(label);shapes.push(path);
  }
 }
 function sketchPreview(){
  if(preview){map.removeLayer(preview);preview=null;}
  if(sketch.length>=2)preview=L.polyline(sketch.map(p=>[p[1],p[0]]),{color:'#ffffff',weight:4,dashArray:'5 5'}).addTo(map);
 }
 function showMode(){
  for(const action of ['finish','undo','cancel'])q(action).hidden=mode!=='draw';
  q('finish').disabled=sketch.length<2;q('undo').disabled=sketch.length===0;
  q('draw').setAttribute('aria-pressed',String(mode==='draw'));
  q('place').setAttribute('aria-pressed',String(mode==='place'));
 }
 function change(action){try{action();}catch(e){setMessage(e.message);}}
 selected.onchange=()=>{
  chosen=selected.value;
  const p=positions()[chosen];if(p)map.panTo([p.coordinates[1],p.coordinates[0]]);
  setMessage(p?'Velg «Plasser valgt stopp» for å justere punktet.':'Ikke plassert. Velg «Plasser valgt stopp» og trykk på kartet.');
 };
 q('place').onclick=()=>change(()=>{
  mode=mode==='place'?'':'place';sketch=[];sketchPreview();showMode();
  setMessage(mode==='place'?'Trykk der '+layout.stops.find(s=>s.id===chosen)?.name+' faktisk ligger.':'Plasseringen avbrutt.');
 });
 q('reset').onclick=()=>change(()=>{
  delete geo.stops[chosen];save();drawMarkers();
  setMessage('Manuell plassering fjernet; eventuelt katalogforslag vises igjen.');
 });
 q('draw').onclick=()=>change(()=>{
  mode=mode==='draw'?'':'draw';sketch=[];sketchPreview();showMode();
  setMessage(mode==='draw'?'Trykk på kartet for hvert nytt rutepunkt. Fullfør ved minst to punkter.':'Tegning avbrutt.');
 });
 q('undo').onclick=()=>{sketch.pop();sketchPreview();showMode();};
 q('cancel').onclick=()=>{mode='';sketch=[];sketchPreview();showMode();};
 q('finish').onclick=()=>change(()=>{
  M.draw(geo,sketch);mode='';sketch=[];sketchPreview();save();drawLines();showMode();
  setMessage('Geografisk trasé lagret. Streken er ikke bekreftet som bussrute.');
 });
 q('export').onclick=()=>change(()=>download('trondheim-geografisk.geojson',JSON.stringify(M.exportGeo(geo,layout),null,2)+'\n'));
 q('import').onchange=async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
   if(file.size>2000000)throw Error('GeoJSON-filen er for stor');
   const data=M.importGeo(JSON.parse(await file.text()),layout);
   geo=data;mode='';sketch=[];sketchPreview();showMode();save();drawMarkers();drawLines();
   setMessage('GeoJSON importert. Endringer er lagret lokalt og kan angres ved å forkaste geografiske endringer.');
  }catch(error){setMessage(error.message);}finally{e.target.value='';}
 };
 q('discard').onclick=()=>change(()=>{
  geo=M.empty();localStorage.removeItem(key);mode='';sketch=[];sketchPreview();showMode();
  drawMarkers();drawLines();setMessage('Geografisk arbeidskopi forkastet. Skjemakartet er uendret.');
 });
 map.on('click',e=>change(()=>{
  const coord=[e.latlng.lng,e.latlng.lat];
  if(mode==='place'){
   M.place(geo,layout,chosen,coord);mode='';save();drawMarkers();showMode();
   setMessage('Plassert '+layout.stops.find(s=>s.id===chosen)?.name+' manuelt på kartet.');
  }else if(mode==='draw'){
   if(sketch.length&&Math.hypot(coord[0]-sketch.at(-1)[0],coord[1]-sketch.at(-1)[1])<1e-7)return;
   sketch.push(coord);sketchPreview();showMode();setMessage(sketch.length+' punkter – fortsett å tegne, eller fullfør.');
  }
 }));
 document.addEventListener('keydown',e=>{
  if(host.hidden||mode!=='draw'||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;
  if(e.key==='Escape'){e.preventDefault();q('cancel').click();}
  if(e.key==='Backspace'){e.preventDefault();q('undo').click();}
  if(e.key==='Enter'&&sketch.length>=2){e.preventDefault();q('finish').click();}
 });
 function refresh(next){
  context=next||context;catalog=M.candidates(layout,context.boards||[]);
  drawMarkers();drawLines();
 }
 showMode();refresh();if(!message.textContent||message.textContent==='Laster kart…')setMessage('Trykk på et punkt for informasjon, eller velg et stopp for å plassere det.');
 return {update(next){refresh(next);},visible(){map.invalidateSize();},clear(){context.frame=null;drawMarkers();}};
 }};
})(globalThis);

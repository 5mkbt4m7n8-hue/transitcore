// A separate, view-only layer for all 47 catalogued Trondheim-area bus routes.
// Single-line behavior remains in app.js, including its existing GPS controls.
(function(root){
 'use strict';
 const C=root.InTransitAllCatalog,G=root.InTransitFleetGps,R=root.InTransitLiveLine1;
 const $=id=>document.getElementById(id);
 const URL='https://transitcore-led-feed.lgb84.workers.dev/api/v1/vehicles/atb-live-all';
 function setup({L,map}){
  const profiles=new Map(),routeLayers=new Map(),routeStops=L.layerGroup();
  const buses=new Map(),visible=new Set(C.CODES);
  let active=false,loading=null,generation=0,feed=null,fetching=false,request=0,following='';
  function info(message){$('gpsStatus').textContent=message;}
  function count(){ $('busCount').textContent=String(buses.size); }
  function clearBuses(){
   for(const entry of buses.values())map.removeLayer(entry.marker);
   buses.clear();following='';$('followBus').replaceChildren(new Option('Ikke følg buss',''));
   $('followBus').disabled=true;$('fitBuses').disabled=true;$('followDetail').hidden=true;count();
  }
  function updateOptions(){
   const sel=$('followBus');
   sel.replaceChildren(new Option('Ikke følg buss',''),...([...buses.values()].map(entry=>{
    const v=entry.data;
    return new Option('Linje '+v.line+' · mot '+(v.destination||'ukjent')+
     ' ('+R.ageText(v.ageSeconds)+')',v.id);
   })));
   if(!buses.has(following))following='';
   sel.value=following;sel.disabled=buses.size===0;$('fitBuses').disabled=buses.size===0;
   $('followDetail').hidden=!following;
  }
  function followView(){
   const entry=buses.get(following);
   $('followDetail').hidden=!entry;
   if(!entry)return;
   const v=entry.data;
   $('followDetail').textContent='Følger linje '+v.line+' · '+(v.destination||'retning ukjent')+
    ' · siste målte GPS '+R.ageText(v.ageSeconds);
   map.panTo([v.latitude,v.longitude],{animate:false});
  }
  function popup(v){
   const node=document.createElement('div'),head=document.createElement('strong');
   head.textContent='AtB linje '+v.line;
   const message=document.createElement('p');
   message.textContent='Mot '+(v.destination||'ukjent retning');
   const timestamp=document.createElement('small');
   timestamp.textContent='Målt GPS · '+v.lastUpdated+' · '+R.ageText(v.ageSeconds);
   node.append(head,message,timestamp);return node;
  }
  function renderPositions(positions){
   const keys=new Set(positions.map(v=>v.id));
   for(const [id,entry] of buses)if(!keys.has(id)){map.removeLayer(entry.marker);buses.delete(id);}
   for(const v of positions){
    let entry=buses.get(v.id);
    if(!entry){
     const code=v.line;
     const safeCode=String(Number(code)),color=C.color(code);
     const marker=L.marker([v.latitude,v.longitude],{
      icon:L.divIcon({className:'',iconSize:[30,30],iconAnchor:[15,15],
       html:'<span class="live-fleet-pin" style="background:'+color+'">'+safeCode+'</span>'})
     }).addTo(map);
     marker.on('click',()=>{following=v.id;updateOptions();followView();});
     entry={marker,data:v};buses.set(v.id,entry);
    }
    entry.data=v;
    entry.marker.setLatLng([v.latitude,v.longitude]);
    entry.marker.bindTooltip('AtB '+v.line+' · '+(v.destination||'ukjent')+
      ' · GPS '+R.ageText(v.ageSeconds),{className:'live-bus-tooltip'});
    entry.marker.bindPopup(popup(v));
   }
   updateOptions();count();if(following)followView();
  }
  function renderFeed(){
   if(!feed||!active)return;
   try{
    const current=G.parse(feed,visible);
    renderPositions(current.vehicles);
    if(!current.vehicles.length)info('Ingen ferske GPS-posisjoner for de valgte linjene. Det betyr ikke at bussene ikke kjører.');
   }catch{
    feed=null;clearBuses();info('GPS-data kan ikke valideres. Ingen ETA-posisjoner vises som GPS.');
   }
  }
  function uniqueStops(){
   const unique=new Map();
   for(const code of visible){
    const profile=profiles.get(code);
    if(!profile)continue;
    for(const stop of profile.stops){
     const entry=unique.get(stop.id);
     if(entry)entry.codes.add(code);
     else unique.set(stop.id,{stop,codes:new Set([code])});
    }
   }
   return unique;
  }
  function repaintRoutes(){
   for(const [code,polyline] of routeLayers){
    if(!active||!visible.has(code)||!$('showRoute').checked)map.removeLayer(polyline);
    else polyline.addTo(map);
   }
   routeStops.clearLayers();
   if(active&&$('showStops').checked){
    for(const {stop,codes} of uniqueStops().values()){
     const marker=L.circleMarker([stop.lat,stop.lon],{
      radius:4,color:'#314c62',weight:1.1,fillColor:'#b4e5f3',fillOpacity:.9
     });
     const popup=document.createElement('div'),name=document.createElement('strong');
     name.textContent=stop.name;
     const details=document.createElement('p');
     details.textContent='Registrert holdeplass · linje '+[...codes].sort((a,b)=>Number(a)-Number(b)).join(', ');
     popup.append(name,details);marker.bindPopup(popup);marker.addTo(routeStops);
    }
    routeStops.addTo(map);
   }else map.removeLayer(routeStops);
   if(feed)renderFeed();
   const ready=[...visible].filter(code=>profiles.has(code));
   const fails=visible.size-ready.length;
   $('allLinesSummary').textContent=visible.size+' av '+C.CODES.length+' linjer valgt';
   $('routeStatus').textContent=ready.length+' ruteprofiler · '+uniqueStops().size+
    ' unike holdeplasser'+(fails?' · '+fails+' profiler utilgjengelige':'')+
    ' · geografiske ruter, ikke målte kjørespor';
  }
  function fitRoutes(){
   const layers=[...visible].map(code=>routeLayers.get(code)).filter(Boolean);
   if(!layers.length)return;
   const bounds=L.latLngBounds(layers.flatMap(x=>{
    const b=x.getBounds();return [b.getSouthWest(),b.getNorthEast()];
   }));
   if(bounds.isValid())map.fitBounds(bounds,{padding:[24,24],maxZoom:12});
  }
  function fitBuses(){
   if(!buses.size)return;
   map.fitBounds(L.latLngBounds([...buses.values()].map(x=>x.marker.getLatLng())),{
    padding:[45,45],maxZoom:15});
  }
  function drawList(){
   const host=$('allLineList');
   host.replaceChildren(...C.CODES.map(code=>{
    const label=document.createElement('label'),checkbox=document.createElement('input');
    checkbox.type='checkbox';checkbox.checked=visible.has(code);checkbox.value=code;
    checkbox.setAttribute('aria-label','Vis linje '+code);
    const swatch=document.createElement('span');swatch.className='route-swatch';
    swatch.style.background=C.color(code);
    const info=document.createElement('span');info.className='route-info';
    const id=document.createElement('strong');id.textContent='Linje '+code;
    const small=document.createElement('small');
    small.textContent=profiles.get(code)?.name||'Registrert ruteprofil';
    info.append(id,small);
    checkbox.addEventListener('change',()=>{
     if(checkbox.checked)visible.add(code);else visible.delete(code);
     repaintRoutes();filterList();
    });
    label.append(checkbox,swatch,info);return label;
   }));
   filterList();
  }
  function filterList(){
   const word=$('routeSearch').value.trim().toLocaleLowerCase('nb-NO');
   for(const label of $('allLineList').children){
    const text=label.textContent.toLocaleLowerCase('nb-NO');
    label.hidden=Boolean(word&&!text.includes(word));
   }
   $('allLinesSummary').textContent=visible.size+' av '+C.CODES.length+' linjer valgt';
  }
  async function loadProfiles(){
   if(loading)return loading;
   const pending=[...C.CODES];
   loading=Promise.all(Array.from({length:6},async()=>{
    while(pending.length){
     const code=pending.shift();
     try{
      const response=await fetch(C.routeUrl(code),{cache:'no-store'});
      if(!response.ok)throw Error('HTTP '+response.status);
      const model=C.normalize(await response.json(),code);
      profiles.set(code,model);
     }catch{/* Keep other verified profiles visible and flag missing count. */}
    }
   }));
   await loading;loading=null;
  }
  async function enter(){
   const token=++generation;
   active=true;feed=null;clearBuses();
   $('allLinesPanel').hidden=false;
   $('title').firstChild.textContent='Alle AtB-linjer ';
   $('endpoints').textContent='Registrerte bussruter i Trondheimsområdet';
   $('map').setAttribute('aria-label','Oversiktskart med valgbare AtB-bussruter i Trondheimsområdet');
   $('fitRoute').title='Vis valgte linjer';
   info('Laster de 47 registrerte ruteprofilene …');
   $('routeStatus').textContent='Henter geografiske ruteprofiler fra prosjektet.';
   await loadProfiles();
   if(!active||token!==generation)return false;
   for(const code of C.CODES){
    if(routeLayers.has(code)||!profiles.has(code))continue;
    const model=profiles.get(code);
    const route=L.polyline(model.route,{
     color:model.color,weight:3.1,opacity:.73,lineJoin:'round',interactive:true
    });
    const title=document.createElement('span');title.textContent='Linje '+code+' · '+model.name;
    route.bindTooltip(title);routeLayers.set(code,route);
   }
   drawList();repaintRoutes();fitRoutes();
   return true;
  }
  function leave(){
   active=false;++generation;++request;feed=null;fetching=false;
   for(const route of routeLayers.values())map.removeLayer(route);
   map.removeLayer(routeStops);clearBuses();$('allLinesPanel').hidden=true;
  }
  async function refreshGPS(){
   if(!active||fetching||document.hidden)return;
   const token=++request;fetching=true;$('refresh').disabled=true;
   try{
    const response=await fetch(URL,{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Object.assign(Error('HTTP '+response.status),{status:response.status});
    const data=await response.json();
    const values=G.parse(data,visible);
    if(!active||token!==request)return;
    feed=data;renderPositions(values.vehicles);
    if(values.vehicles.length)info(values.vehicles.length+
      ' ferske, målte GPS-posisjoner fordelt på de valgte AtB-linjene.');
    else info('Ingen ferske målte GPS-posisjoner for valgte linjer akkurat nå.');
   }catch(error){
    if(!active||token!==request)return;
    feed=null;clearBuses();
    info(error.status?R.statusForFetch(error.status):
      'GPS-kilden kan ikke nås. Ruteprofiler og holdeplasser vises fortsatt uten beregnede bussposisjoner.');
   }finally{
    if(token===request){fetching=false;$('refresh').disabled=false;}
   }
  }
  function ageGPS(){if(active&&feed)renderFeed();}
  $('toggleAllPanel').onclick=()=>{
   const details=$('allLineDetails'),open=details.hidden;
   details.hidden=!open;$('toggleAllPanel').setAttribute('aria-expanded',String(open));
   $('toggleAllPanel').textContent=open?'Skjul linjevalg':'Velg linjer';
  };
  $('routeSearch').oninput=filterList;
  $('enableAllRoutes').onclick=()=>{
   visible.clear();C.CODES.forEach(code=>visible.add(code));drawList();repaintRoutes();fitRoutes();
  };
  $('disableAllRoutes').onclick=()=>{
   visible.clear();drawList();repaintRoutes();clearBuses();
  };
  return {enter,leave,refreshGPS,ageGPS,fitRoutes,fitBuses,
   get active(){return active;},
   repaintRoutes,selectFollow(id){following=id;followView();},
   stopFollow(){following='';updateOptions();$('followDetail').hidden=true;},
   catalogCount:()=>C.CODES.length,loadedCount:()=>profiles.size,visibleCount:()=>visible.size};
 }
 root.InTransitAllMode={setup};
})(globalThis);

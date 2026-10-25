// Map-first view of all 47 registered AtB routes plus original one-line views. No edits or inferred positions.
(function(root){
 'use strict';
 const R=root.InTransitLiveLine1,G=root.InTransitLiveGps,All=root.InTransitAllMode;
 const $=id=>document.getElementById(id);
 const LEAFLET_BASE='https://unpkg.com/leaflet@1.9.4/dist/';
 async function leaflet(){
  if(root.L?.map)return root.L;
  const style=document.createElement('link');style.rel='stylesheet';style.href=LEAFLET_BASE+'leaflet.css';
  style.integrity='sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  style.crossOrigin='anonymous';document.head.append(style);
  await new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=LEAFLET_BASE+'leaflet.js';
   script.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
   script.crossOrigin='anonymous';script.onload=resolve;
   script.onerror=()=>reject(Error('Kartbiblioteket kunne ikke lastes'));document.head.append(script);
  });
  if(!root.L?.map)throw Error('Kartbiblioteket mangler');
  return root.L;
 }
 function textElement(tag,value){
  const node=document.createElement(tag);node.textContent=String(value);return node;
 }
 async function start(){
  const L=await leaflet(),map=L.map('map',{zoomControl:true,preferCanvas:true,worldCopyJump:false})
   .setView([63.421,10.399],12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
   maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const vehicles=new Map(),all=All.setup({L,map});
  let lineCode='1',routeLayer=null,stopsLayer=null,routeBounds=null;
  let lastFeed=null,gpsError='',gpsBusy=false,gpsRequestId=0,routeRequestId=0;
  let routeLoading=false,followId='',fullscreenFallback=false;
  const status=text=>{$('gpsStatus').textContent=text;};
  const statusCount=()=>{$('busCount').textContent=String(vehicles.size);};

  function makePopup(vehicle){
   const el=document.createElement('div');
   el.append(textElement('strong','AtB linje '+lineCode),
    textElement('p','Mot '+(vehicle.destination||'ukjent destinasjon')),
    textElement('small','Målt GPS · '+vehicle.lastUpdated+' · '+R.ageText(vehicle.ageSeconds)));
   return el;
  }
  function followView(){
   const entry=vehicles.get(followId);
   $('followDetail').hidden=!entry;
   if(!entry)return;
   $('followDetail').textContent='Følger buss '+lineCode+' · '+
    (entry.data.destination||'retning ukjent')+' · siste GPS '+R.ageText(entry.data.ageSeconds);
   map.panTo([entry.data.latitude,entry.data.longitude],{animate:false});
  }
  function options(){
   const selector=$('followBus'),previous=followId;
   selector.replaceChildren(new Option('Ikke følg buss',''),
    ...[...vehicles.values()].map((entry,i)=>
     new Option('Buss '+(i+1)+' · mot '+(entry.data.destination||'ukjent')+
      ' ('+R.ageText(entry.data.ageSeconds)+')',entry.data.id)));
   if(!vehicles.has(previous))followId='';
   selector.value=followId;selector.disabled=vehicles.size===0;
   $('fitBuses').disabled=vehicles.size===0;$('followDetail').hidden=!followId;
  }
  function render(positions){
   const ids=new Set(positions.map(v=>v.id));
   for(const [id,entry] of vehicles){
    if(ids.has(id))continue;
    map.removeLayer(entry.marker);vehicles.delete(id);
   }
   for(const observation of positions){
    let entry=vehicles.get(observation.id);
    if(!entry){
     const marker=L.circleMarker([observation.latitude,observation.longitude],{
      radius:10,weight:3,color:'#f6ece6',fillColor:'#ef4350',fillOpacity:1,
      className:'live-bus-point'
     }).addTo(map);
     marker.on('click',()=>{
      followId=observation.id;options();followView();
     });
     entry={marker,data:observation};vehicles.set(observation.id,entry);
    }
    entry.data=observation;
    entry.marker.setLatLng([observation.latitude,observation.longitude]);
    entry.marker.bindTooltip('AtB '+lineCode+' · '+(observation.destination||'ukjent')+
     ' · GPS '+R.ageText(observation.ageSeconds),{className:'live-bus-tooltip'});
    entry.marker.bindPopup(makePopup(observation));
   }
   options();statusCount();if(followId)followView();
  }
  function latestOnly(){
   if(lineCode==='all'){all.ageGPS();return;}
   if(!lastFeed||gpsError||routeLoading)return;
   try{
    const positions=G.parse(lastFeed,lineCode).vehicles;
    render(positions);
    if(!positions.length)status('Ingen ferske GPS-posisjoner for linje '+lineCode+
      ' akkurat nå. Rute og holdeplasser vises fortsatt.');
   }catch{
    lastFeed=null;render([]);
    status('GPS-data kan ikke valideres. Ingen beregnede posisjoner vises.');
   }
  }
  async function refreshGPS(){
   if(lineCode==='all')return all.refreshGPS();
   if(gpsBusy||routeLoading||!routeBounds||document.hidden)return;
   const requestCode=lineCode,token=++gpsRequestId;
   gpsBusy=true;$('refresh').disabled=true;
   try{
    const response=await fetch(R.gpsUrl(requestCode),{
     cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw Object.assign(Error('HTTP '+response.status),{status:response.status});
    const feed=await response.json();
    const valid=G.parse(feed,requestCode);
    if(token!==gpsRequestId||lineCode!==requestCode)return;
    lastFeed=feed;gpsError='';render(valid.vehicles);
    if(valid.vehicles.length)status(valid.vehicles.length+
     ' ferske, målte GPS-posisjoner for linje '+lineCode+' fra Entur/AtB.');
    else status('Entur rapporterer ingen ferske posisjoner for linje '+lineCode+
     ' nå. Det betyr ikke at bussene står stille.');
   }catch(error){
    if(token!==gpsRequestId||lineCode!==requestCode)return;
    lastFeed=null;gpsError=error.message;render([]);
    status(error.status?R.statusForFetch(error.status):
     'GPS-kilden kan ikke nås for linje '+lineCode+'. Ingen beregnede posisjoner vises.');
   }finally{
    if(token===gpsRequestId){gpsBusy=false;$('refresh').disabled=false;}
   }
  }
  function routeStopLayers(profile){
   const line=L.polyline(profile.route,{
    color:profile.color,weight:5,opacity:.85,lineJoin:'round'
   });
   const stops=L.layerGroup();
   for(const stop of profile.stops){
    const marker=L.circleMarker([stop.lat,stop.lon],{
     radius:4.8,color:'#223849',weight:1.5,fillColor:'#a9dcef',fillOpacity:.98
    });
    const popup=document.createElement('div');
    popup.append(textElement('strong',stop.name),
     textElement('p','Linje '+profile.line+' · holdeplass (NSR)'));
    marker.bindPopup(popup);marker.addTo(stops);
   }
   return {line,stops};
  }
  async function chooseLine(code,{initial=false}={}){
   if(!R.supports(code))return;
   if(all.active)all.leave();
   const token=++routeRequestId;
   ++gpsRequestId;gpsBusy=false;lastFeed=null;gpsError='';
   render([]);routeLoading=true;
   $('lineSelect').disabled=true;$('refresh').disabled=true;
   status('Laster ruteprofil for linje '+code+' …');
   try{
    const response=await fetch(R.routeUrl(code),{cache:'no-store'});
    if(!response.ok)throw Error('Ruteprofil HTTP '+response.status);
    const profile=R.normalize(await response.json(),code);
    if(token!==routeRequestId)return;
    const layers=routeStopLayers(profile);
    if(routeLayer)map.removeLayer(routeLayer);
    if(stopsLayer)map.removeLayer(stopsLayer);
    routeLayer=layers.line;stopsLayer=layers.stops;routeBounds=routeLayer.getBounds();
    lineCode=code;$('lineSelect').value=code;
    if($('showStops').checked)stopsLayer.addTo(map);
    if($('showRoute').checked)routeLayer.addTo(map);
    const first=profile.stops[0],last=profile.stops.at(-1);
    $('title').firstChild.textContent='Linje '+code+' ';
    $('endpoints').textContent=first.name+' ↔ '+last.name;
    $('routeStatus').textContent=profile.stops.length+' holdeplasser · '+
     profile.route.length+' trasépunkter · lagret ruteprofil: '+profile.name;
    $('map').setAttribute('aria-label','Kart over AtB linje '+code+' med registrert trasé og holdeplasser');
    $('fitRoute').title='Vis hele linje '+code;
    $('linePickerHint').textContent='Registrert profil, ikke målt kjørespor.';
    map.fitBounds(routeBounds,{padding:[24,24],maxZoom:14});
    if(!initial){
     const url=new URL(location.href);url.searchParams.set('line',code);
     history.replaceState(null,'',url.pathname+url.search+url.hash);
    }
    status('Linje '+code+' er klar. Henter faktiske GPS-posisjoner …');
   }catch(error){
    if(token!==routeRequestId)return;
    $('lineSelect').value=lineCode;
    status('Ruteprofil for linje '+code+' er utilgjengelig ('+error.message+
      '). Tidligere rute er beholdt. Ingen GPS-posisjoner er gjettet.');
   }finally{
    if(token===routeRequestId){
     routeLoading=false;$('lineSelect').disabled=false;
     $('refresh').disabled=!routeBounds;
     if(routeBounds)refreshGPS();
    }
   }
  }
  async function chooseAll({initial=false}={}){
   const token=++routeRequestId;
   ++gpsRequestId;gpsBusy=false;lastFeed=null;gpsError='';
   render([]);
   routeLoading=true;lineCode='all';
   $('lineSelect').value='all';$('lineSelect').disabled=true;$('refresh').disabled=true;
   if(routeLayer)map.removeLayer(routeLayer);
   if(stopsLayer)map.removeLayer(stopsLayer);
   try{
    const enabled=await all.enter();
    if(!enabled||token!==routeRequestId)return;
    if(!initial){
     const url=new URL(location.href);url.searchParams.set('line','all');
     history.replaceState(null,'',url.pathname+url.search+url.hash);
    }
   }catch(error){
    if(token===routeRequestId){
     $('gpsStatus').textContent='Kunne ikke laste oversiktskartet: '+error.message;
    }
   }finally{
    if(token===routeRequestId){
     routeLoading=false;$('lineSelect').disabled=false;$('refresh').disabled=false;
     if(all.active)all.refreshGPS();
    }
   }
  }
  $('lineSelect').onchange=()=>{
   const code=$('lineSelect').value;
   if(code==='all')chooseAll();else chooseLine(code);
  };
  $('showStops').onchange=()=>{
   if(lineCode==='all'){all.repaintRoutes();return;}
   if(!stopsLayer)return;
   if($('showStops').checked)stopsLayer.addTo(map);else map.removeLayer(stopsLayer);
  };
  $('showRoute').onchange=()=>{
   if(lineCode==='all'){all.repaintRoutes();return;}
   if(!routeLayer)return;
   if($('showRoute').checked)routeLayer.addTo(map);else map.removeLayer(routeLayer);
  };
  $('fitRoute').onclick=()=>{
   if(lineCode==='all'){all.fitRoutes();return;}
   if(routeBounds)map.fitBounds(routeBounds,{padding:[22,22],maxZoom:14});
  };
  $('fitBuses').onclick=()=>{
   if(lineCode==='all'){all.fitBuses();return;}
   if(!vehicles.size)return;
   map.fitBounds(L.latLngBounds([...vehicles.values()].map(v=>[v.data.latitude,v.data.longitude])),{
    padding:[45,45],maxZoom:15
   });
  };
  $('followBus').onchange=()=>{
   if(lineCode==='all'){all.selectFollow($('followBus').value);return;}
   followId=$('followBus').value;followView();
  };
  map.on('dragstart',()=>{
   if(lineCode==='all'){all.stopFollow();return;}
   if(!followId)return;
   followId='';options();$('followDetail').hidden=true;
  });
  $('refresh').onclick=()=>refreshGPS();
  const shell=$('app'),fullscreenButton=$('fullscreen');
  function reflectFullscreen(){
   const on=document.fullscreenElement===shell||fullscreenFallback;
   fullscreenButton.textContent=on?'Avslutt fullskjerm':'Fullskjerm';
   fullscreenButton.setAttribute('aria-pressed',String(on));
   setTimeout(()=>map.invalidateSize(),60);
  }
  fullscreenButton.onclick=async()=>{
   if(fullscreenFallback){
    fullscreenFallback=false;shell.classList.remove('simulated-fullscreen');
    reflectFullscreen();return;
   }
   if(document.fullscreenElement===shell){await document.exitFullscreen();return;}
   if(shell.requestFullscreen){
    try{await shell.requestFullscreen();reflectFullscreen();return;}
    catch{/* Some iOS browsers disallow arbitrary-element fullscreen. */}
   }
   fullscreenFallback=true;shell.classList.add('simulated-fullscreen');reflectFullscreen();
  };
  document.addEventListener('fullscreenchange',reflectFullscreen);
  document.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&fullscreenFallback){
    fullscreenFallback=false;shell.classList.remove('simulated-fullscreen');reflectFullscreen();
   }
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshGPS();});
  setInterval(()=>{if(!document.hidden)refreshGPS();},30000);
  setInterval(()=>{if(!document.hidden)latestOnly();},10000);
  const requested=new URLSearchParams(location.search).get('line');
  const initial=requested==='all'||!R.supports(requested)?'all':requested;
  $('lineSelect').value=initial;
  if(initial==='all')await chooseAll({initial:true});else await chooseLine(initial,{initial:true});
 }
 start().catch(error=>{
  $('gpsStatus').textContent='Kunne ikke åpne rutekartet: '+error.message;
  $('routeStatus').textContent='Ingen GPS-posisjoner eller kartdata blir gjettet.';
  $('refresh').disabled=true;$('fitRoute').disabled=true;$('lineSelect').disabled=true;
 });
})(globalThis);

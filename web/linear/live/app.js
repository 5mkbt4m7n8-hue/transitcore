// A read-only, phone-first live map: immutable route profile + fresh measured GPS.
(function(root){
 'use strict';
 const R=root.InTransitLiveLine1,G=root.InTransitLine1Gps;
 const $=id=>document.getElementById(id);
 const GPS_URL='https://transitcore-led-feed.lgb84.workers.dev/api/v1/vehicles/atb-line-1';
 const ROUTE_URL='../../../config/routes/atb-bus-1-live.json';
 const LEAFLET_BASE='https://unpkg.com/leaflet@1.9.4/dist/';
 async function leaflet(){
  if(root.L?.map)return root.L;
  const style=document.createElement('link');style.rel='stylesheet';
  style.href=LEAFLET_BASE+'leaflet.css';
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
  const n=document.createElement(tag);n.textContent=String(value);return n;
 }
 async function start(){
  const response=await fetch(ROUTE_URL,{cache:'no-store'});
  if(!response.ok)throw Error('Ruteprofil HTTP '+response.status);
  const profile=R.normalize(await response.json()),L=await leaflet();
  const map=L.map('map',{zoomControl:true,preferCanvas:true,worldCopyJump:false});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
   maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  const route=L.polyline(profile.route,{color:profile.color,weight:5,opacity:0.85,lineJoin:'round'});
  const routeBounds=route.getBounds();
  map.fitBounds(routeBounds,{padding:[24,24],maxZoom:14});
  const stops=L.layerGroup();
  profile.stops.forEach(stop=>{
   const marker=L.circleMarker([stop.lat,stop.lon],{
    radius:4.8,color:'#223849',weight:1.5,fillColor:'#a9dcef',fillOpacity:.98
   });
   const popup=document.createElement('div');
   popup.append(textElement('strong',stop.name),textElement('p','Linje 1 · holdeplass (NSR)'));
   marker.bindPopup(popup);marker.addTo(stops);
  });
  stops.addTo(map);route.addTo(map);
  $('routeStatus').textContent=profile.stops.length+' holdeplasser · '+profile.route.length+' trasépunkter · registrert ruteprofil';
  const vehicles=new Map();
  let followId='',lastFeed=null,busy=false,requestId=0,gpsError='',fullscreenFallback=false;
  const status=text=>{$('gpsStatus').textContent=text;};
  const statusCount=()=>{$('busCount').textContent=String(vehicles.size);};
  function makePopup(vehicle){
   const el=document.createElement('div');
   const title=textElement('strong','AtB linje 1');
   const dest=textElement('p','Mot '+(vehicle.destination||'ukjent destinasjon'));
   const timestamp=textElement('small','Målt GPS · '+vehicle.lastUpdated+' · '+R.ageText(vehicle.ageSeconds));
   el.append(title,dest,timestamp);return el;
  }
  function followView(){
   const v=vehicles.get(followId);
   $('followDetail').hidden=!v;
   if(!v)return;
   $('followDetail').textContent='Følger buss 1 · '+(v.data.destination||'retning ukjent')+
    ' · siste GPS '+R.ageText(v.data.ageSeconds);
   map.panTo([v.data.latitude,v.data.longitude],{animate:false});
  }
  function options(){
   const selector=$('followBus');
   const previous=followId;
   selector.replaceChildren(new Option('Ikke følg buss',''),...([...vehicles.values()].map((v,i)=>
    new Option('Buss '+(i+1)+' · mot '+(v.data.destination||'ukjent')+' ('+R.ageText(v.data.ageSeconds)+')',v.data.id))));
   if(!vehicles.has(previous))followId='';
   selector.value=followId;selector.disabled=vehicles.size===0;
   $('fitBuses').disabled=vehicles.size===0;
   $('followDetail').hidden=!followId;
  }
  function render(positions){
   const ids=new Set(positions.map(v=>v.id));
   for(const [id,item] of vehicles)if(!ids.has(id)){map.removeLayer(item.marker);vehicles.delete(id);}
   for(const v of positions){
    let entry=vehicles.get(v.id);
    if(!entry){
     const marker=L.circleMarker([v.latitude,v.longitude],{
      radius:10,weight:3,color:'#f6ece6',fillColor:'#ef4350',fillOpacity:1,
      className:'live-bus-point'
     }).addTo(map);
     marker.on('click',()=>{
      followId=v.id;options();followView();
     });
     entry={marker,data:v};vehicles.set(v.id,entry);
    }
    entry.data=v;entry.marker.setLatLng([v.latitude,v.longitude]);
    entry.marker.bindTooltip('AtB 1 · '+(v.destination||'ukjent')+' · GPS '+R.ageText(v.ageSeconds),{className:'live-bus-tooltip'});
    entry.marker.bindPopup(makePopup(v));
   }
   options();statusCount();if(followId)followView();
  }
  function latestOnly(){
   if(!lastFeed||gpsError)return;
   try{
    const points=G.parse(lastFeed).vehicles;
    if(points.length!==vehicles.size){
     render(points);
     if(!points.length)status('Ingen ferske GPS-posisjoner akkurat nå. Ruten og holdeplassene vises fortsatt.');
    }else{
     // Update age labels without inventing positions.
     render(points);
    }
   }catch{
    lastFeed=null;render([]);status('GPS-data kan ikke valideres. Ingen beregnede posisjoner vises.');
   }
  }
  async function refreshGPS(){
   if(busy||document.hidden)return;
   busy=true;const token=++requestId;$('refresh').disabled=true;
   try{
    const reply=await fetch(GPS_URL,{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!reply.ok)throw Object.assign(Error('HTTP '+reply.status),{status:reply.status});
    const feed=await reply.json();
    const clean=G.parse(feed);
    if(token!==requestId)return;
    lastFeed=feed;gpsError='';render(clean.vehicles);
    if(clean.vehicles.length)status(clean.vehicles.length+' ferske, målte GPS-posisjoner fra Entur/AtB · oppdateres hvert 30. sekund.');
    else status('Entur rapporterer ingen ferske posisjoner for linje 1 nå. Det betyr ikke at bussene står stille.');
   }catch(error){
    if(token!==requestId)return;
    gpsError=error.message;lastFeed=null;
    render([]);status(error.status?R.statusForFetch(error.status):
     'GPS-kilden kan ikke nås. Ingen beregnede posisjoner vises. Ruteprofilen er fortsatt tilgjengelig.');
   }finally{busy=false;$('refresh').disabled=false;}
  }
  $('showStops').onchange=()=>{
   if($('showStops').checked)stops.addTo(map);else map.removeLayer(stops);
  };
  $('showRoute').onchange=()=>{
   if($('showRoute').checked)route.addTo(map);else map.removeLayer(route);
  };
  $('fitRoute').onclick=()=>map.fitBounds(routeBounds,{padding:[22,22],maxZoom:14});
  $('fitBuses').onclick=()=>{
   if(!vehicles.size)return;
   map.fitBounds(L.latLngBounds([...vehicles.values()].map(v=>[v.data.latitude,v.data.longitude])),{
    padding:[45,45],maxZoom:15});
  };
  $('followBus').onchange=()=>{followId=$('followBus').value;followView();};
  map.on('dragstart',()=>{
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
   if(fullscreenFallback){fullscreenFallback=false;shell.classList.remove('simulated-fullscreen');reflectFullscreen();return;}
   if(document.fullscreenElement===shell){await document.exitFullscreen();return;}
   if(shell.requestFullscreen){
    try{await shell.requestFullscreen();reflectFullscreen();return;}
    catch{/* Safari/iOS may not support fullscreen on arbitrary elements. */}
   }
   fullscreenFallback=true;shell.classList.add('simulated-fullscreen');reflectFullscreen();
  };
  document.addEventListener('fullscreenchange',reflectFullscreen);
  document.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&fullscreenFallback){
    fullscreenFallback=false;shell.classList.remove('simulated-fullscreen');reflectFullscreen();
   }
  });
  document.addEventListener('visibilitychange',()=>{
   if(!document.hidden)refreshGPS();
  });
  setInterval(()=>{if(!document.hidden)refreshGPS();},30000);
  setInterval(()=>{if(!document.hidden)latestOnly();},10000);
  await refreshGPS();
 }
 start().catch(error=>{
  $('gpsStatus').textContent='Kunne ikke åpne rutekartet: '+error.message;
  $('routeStatus').textContent='Ingen GPS-posisjoner eller kartdata blir gjettet.';
  $('refresh').disabled=true;$('fitRoute').disabled=true;
 });
})(globalThis);

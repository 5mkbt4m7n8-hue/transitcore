// DEMO presentation layer. Entirely local to browser: zero Entur/Worker requests.
// All simulated vehicles have distinct demo:* IDs and prominent DEMO labels.
(function(root){
 'use strict';
 const E=root.InTransitDemoEngine,C=root.InTransitAllCatalog;
 const $=id=>document.getElementById(id);
 function setup({L,map}){
  const markers=new Map(),cached=new Map();
  let active=false,paused=false,elapsed=0,speed=1,lastTick=null,timer=null,followId='',profileIds=[];
  const info=()=>{$('gpsStatus').textContent='DEMO – '+markers.size+
   ' simulerte busser langs lagrede ruteprofiler. Ikke faktiske GPS-posisjoner.';};
  function popup(v){
   const element=document.createElement('div');
   const title=document.createElement('strong');title.textContent='DEMO · linje '+v.line;
   const desc=document.createElement('p');
   desc.textContent='SIMULERT bevegelse langs lagret ruteprofil. Ingen faktisk buss eller sanntid.';
   element.append(title,desc);return element;
  }
  function updateSelect(){
   const select=$('followBus');
   select.replaceChildren(new Option('Ikke følg buss',''),
    ...[...markers.values()].map(entry=>
     new Option('DEMO · linje '+entry.data.line+' · buss '+(entry.data.direction==='A'?'1':'2'),
      entry.data.id)));
   if(!markers.has(followId))followId='';
   select.disabled=!markers.size;select.value=followId;
   $('fitBuses').disabled=!markers.size;$('followDetail').hidden=!followId;
  }
  function follow(){
   const entry=markers.get(followId);
   $('followDetail').hidden=!entry;
   if(!entry)return;
   $('followDetail').textContent='DEMO – følger simulert buss '+entry.data.line+
    ' ('+(entry.data.direction==='A'?'1':'2')+'). Ingen virkelig GPS.';
   map.panTo(entry.marker.getLatLng(),{animate:false});
  }
  function clear(){
   for(const entry of markers.values())map.removeLayer(entry.marker);
   markers.clear();followId='';updateSelect();$('busCount').textContent='0';
  }
  function render(){
   if(!active)return;
   const sample=[];
   for(const code of profileIds){
    const p=cached.get(code);
    if(p)sample.push(...E.positionsOnTrack(code,p.track,elapsed,speed));
   }
   const ids=new Set(sample.map(x=>x.id));
   let changed=markers.size!==ids.size;
   for(const [id,item] of markers){
    if(!ids.has(id)){map.removeLayer(item.marker);markers.delete(id);changed=true;}
   }
   for(const observation of sample){
    let entry=markers.get(observation.id);
    if(!entry){
     const code=observation.line,color=C.color(code);
     const marker=L.marker([observation.latitude,observation.longitude],{
      icon:L.divIcon({className:'demo-pin-container',iconSize:[43,44],iconAnchor:[21,22],
       html:'<span class="demo-pin" style="--demo-route:'+color+'">'+
        '<strong>'+code+'</strong><small>DEMO</small></span>'})
     }).addTo(map);
     marker.on('click',()=>{followId=observation.id;updateSelect();follow();});
     marker.bindTooltip('DEMO · simulert linje '+observation.line);
     marker.bindPopup(popup(observation));
     entry={marker,data:observation};markers.set(observation.id,entry);changed=true;
    }
    entry.data=observation;
    entry.marker.setLatLng([observation.latitude,observation.longitude]);
   }
   if(changed){
    $('busCount').textContent=String(sample.length);
    updateSelect();info();
   }
   if(followId)follow();
  }
  function tick(){
   if(!active)return;
   const now=performance.now();
   if(lastTick===null){lastTick=now;return;}
   const delta=Math.min(0.3,Math.max(0,(now-lastTick)/1000));
   lastTick=now;
   if(!paused&&!document.hidden){elapsed+=delta;render();}
  }
  function setRoutes(routes){
   if(!active)return;
   const used=new Set(),next=[];
   for(const profile of routes||[]){
    const code=profile?.line;
    if(!C.supports(code)||used.has(code))continue;
    used.add(code);
    try{
     const old=cached.get(code);
     if(!old||old.original!==profile){
      cached.set(code,{original:profile,track:E.track(profile.route)});
     }
     next.push(code);
    }catch{/* Missing/invalid original route is never synthesized. */}
   }
   profileIds=next;
   render();
  }
  function activate(routes=[]){
   if(active){setRoutes(routes);return;}
   active=true;paused=false;elapsed=0;speed=1;lastTick=null;profileIds=[];
   $('demoControls').hidden=false;$('demoStamp').hidden=false;
   $('demoBanner').hidden=false;$('app').classList.add('is-demo');
   $('demoPause').textContent='Pause';$('demoPause').setAttribute('aria-pressed','false');
   $('demoSpeed').value='1';$('refresh').disabled=true;
   setRoutes(routes);
   timer=setInterval(tick,100);
  }
  function deactivate(){
   if(timer!==null)clearInterval(timer);timer=null;
   active=false;paused=false;profileIds=[];lastTick=null;
   clear();$('demoControls').hidden=true;$('demoStamp').hidden=true;
   $('demoBanner').hidden=true;$('app').classList.remove('is-demo');
   $('refresh').disabled=false;
  }
  function pauseToggle(){
   if(!active)return;
   paused=!paused;lastTick=null;
   $('demoPause').textContent=paused?'Fortsett':'Pause';
   $('demoPause').setAttribute('aria-pressed',String(paused));
   $('demoBanner').textContent=paused?
    'DEMO – SIMULERT · PAUSE · ingen sanntid':
    'DEMO – SIMULERT · ingen faktisk GPS / ingen sanntid';
  }
  function setSpeed(value){
   const n=Number(value);
   if(![0.5,1,2,4].includes(n))return;
   speed=n;
  }
  function fit(){
   if(!markers.size)return;
   const bounds=L.latLngBounds([...markers.values()].map(v=>v.marker.getLatLng()));
   map.fitBounds(bounds,{padding:[40,40],maxZoom:15});
  }
  $('demoPause').onclick=pauseToggle;
  $('demoSpeed').onchange=()=>setSpeed($('demoSpeed').value);
  document.addEventListener('visibilitychange',()=>{lastTick=null;});
  return {activate,deactivate,setRoutes,fit,follow,
   selectFollow(id){followId=id;follow();},
   stopFollow(){followId='';updateSelect();$('followDetail').hidden=true;},
   get active(){return active;},get count(){return markers.size;}};
 }
 root.InTransitDemoMode={setup};
})(globalThis);

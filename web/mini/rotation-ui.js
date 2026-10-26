// Mini 4.0 browser-only slideshow. Interacts with Mini 3 solely via
// getPresets/getActive/showPreset; uses the same source validation on every view.
(function(root){
 'use strict';
 const Q=root.InTransitMiniRotation,B=root.InTransitMiniBridge;
 const $=id=>document.getElementById(id);
 const storage=(()=>{try{return root.localStorage;}catch{return null;}})();
 const identities=()=>B.getPresets().map(p=>p.id);
 const loaded=Q.read(storage,identities());
 let settings=loaded.value,playing=false,paused=false,elapsed=0,lastTick=0;
 function setStatus(message){$('rotationStatus').textContent=message;}
 function selectedIds(){
  const available=new Set(identities());
  return settings.ids.filter(id=>available.has(id));
 }
 function persist(){
  if(!storage){setStatus('Lokal lagring utilgjengelig – spillelisten brukes bare i denne fanen.');return;}
  try{settings=Q.save(storage,settings,identities());}
  catch(e){setStatus('Kunne ikke lagre spilleliste: '+e.message);}
 }
 function stop(message='Automatisk veksling stoppet.'){
  playing=false;paused=false;elapsed=0;lastTick=0;
  $('rotationProgress').style.width='0%';
  renderControls();
  setStatus(message);
 }
 function renderControls(){
  const ids=selectedIds(),ok=ids.length>=2;
  $('rotationToggle').disabled=!ok;
  $('rotationNext').disabled=!ok;
  $('rotationPrevious').disabled=!ok;
  $('rotationToggle').textContent=!playing?'Start visning':paused?'Fortsett':'Pause';
  $('rotationToggle').setAttribute('aria-pressed',String(playing&&!paused));
  $('rotationInterval').value=String(settings.seconds);
 }
 function refreshProfiles(){
  const items=B.getPresets();
  settings.ids=selectedIds(); // Newly created profiles must be explicitly opted in.
  const target=$('rotationProfiles');
  target.replaceChildren(...items.map(item=>{
   const label=document.createElement('label'),check=document.createElement('input');
   check.type='checkbox';check.value=item.id;check.checked=settings.ids.includes(item.id);
   check.setAttribute('aria-label','Vis '+item.name+' i rotasjon');
   check.addEventListener('change',()=>{
    if(playing)stop('Rotasjonen stoppet fordi utvalget ble endret.');
    const ids=new Set(settings.ids);
    if(check.checked)ids.add(item.id);else ids.delete(item.id);
    settings.ids=items.map(p=>p.id).filter(x=>ids.has(x));
    persist();refreshProfiles();
   });
   const title=document.createElement('span');title.textContent=item.name;
   label.append(check,title);return label;
  }));
  if(!items.length)target.textContent='Lagre skjermoppsett under for å lage en spilleliste.';
  renderControls();
  if(playing&&selectedIds().length<2)
   stop('Du må ha minst to skjermoppsett i spillelisten.');
 }
 function show(id){
  if(!id)return;
  try{
   if(!B.showPreset(id))throw Error('Skjermoppsettet finnes ikke lenger.');
  }catch(error){stop('Kunne ikke vise skjerm: '+error.message);return;}
  elapsed=0;lastTick=performance.now();
  $('rotationProgress').style.width='0%';
  const ids=selectedIds(),item=B.getPresets().find(p=>p.id===id);
  setStatus('Viser '+(item?.name||'skjerm')+' ('+(ids.indexOf(id)+1)+' av '+ids.length+')'+
   (playing?' · neste om '+settings.seconds+' s':' · manuelt valgt'));
 }
 function step(direction){
  const ids=selectedIds();if(ids.length<2)return;
  const next=Q.advance(ids,B.getActive(),direction);
  show(next);
 }
 function toggle(){
  if(!playing){
   const ids=selectedIds();
   if(ids.length<2){setStatus('Velg minst to skjermoppsett først.');return;}
   playing=true;paused=false;
   show(ids.includes(B.getActive())?B.getActive():ids[0]);
  }else{
   paused=!paused;
   lastTick=performance.now();
   if(paused)setStatus('Pause – trykk Fortsett for å gjenoppta vekslingen.');
  }
  renderControls();
 }
 function tick(){
  if(!playing)return;
  const now=performance.now(),delta=lastTick?Math.min(1000,Math.max(0,now-lastTick)):0;
  lastTick=now;
  if(paused||document.hidden)return;
  elapsed+=delta;
  const ms=settings.seconds*1000;
  if(elapsed>=ms){step(1);return;}
  $('rotationProgress').style.width=(Math.min(100,elapsed/ms*100)).toFixed(1)+'%';
  const item=B.getPresets().find(p=>p.id===B.getActive());
  setStatus('Viser '+(item?.name||'skjerm')+' · neste om '+Q.remaining(ms,elapsed)+' s');
 }
 $('rotationToggle').addEventListener('click',toggle);
 $('rotationNext').addEventListener('click',()=>step(1));
 $('rotationPrevious').addEventListener('click',()=>step(-1));
 $('rotationInterval').addEventListener('change',()=>{
  const seconds=Number($('rotationInterval').value);
  if(!Q.INTERVALS.includes(seconds))return;
  settings.seconds=seconds;elapsed=0;lastTick=performance.now();
  persist();renderControls();
  setStatus(playing?'Intervall endret til '+seconds+' sekunder.':
   'Intervall: '+seconds+' sekunder. Start visning når du ønsker.');
 });
 $('rotationFullscreen').addEventListener('click',async()=>{
  try{
   const viewer=document.querySelector('.viewer');
   if(document.fullscreenElement)await document.exitFullscreen();
   else if(viewer?.requestFullscreen)await viewer.requestFullscreen();
   else setStatus('Nettleseren støtter ikke fullskjerm for dette panelet.');
  }catch{setStatus('Fullskjerm ble ikke tillatt av nettleseren.');}
 });
 document.addEventListener('mini-presets-changed',refreshProfiles);
 document.addEventListener('visibilitychange',()=>{
  lastTick=performance.now();
  if(playing&&document.hidden)setStatus('Vekslingen venter mens fanen er skjult.');
 });
 // Manual settings take precedence over a running slideshow. Using the
 // exported preset action or saving an image does not stop playback.
 const settingsPanel=document.querySelector('.settings');
 function manual(event){
  if(!playing||event.target.closest('.rotation-config'))return;
  if(event.type==='click'){
   const btn=event.target.closest('button');
   if(!btn||['downloadImage','downloadConfig','exportPreset'].includes(btn.id))return;
  }
  stop('Rotasjon stoppet for manuell redigering.');
 }
 settingsPanel.addEventListener('input',manual,true);
 settingsPanel.addEventListener('change',manual,true);
 settingsPanel.addEventListener('click',manual,true);
 setInterval(tick,200);
 refreshProfiles();
 if(loaded.error)setStatus(loaded.error);
 else setStatus('Velg minst to lagrede oppsett og trykk Start visning.');
 root.InTransitMiniRotationControl={ // Expose read-only diagnostics for browser regression tests.
  state:()=>({playing,paused,active:B.getActive(),ids:[...selectedIds()],
    seconds:settings.seconds,elapsedMs:elapsed})
 };
})(globalThis);

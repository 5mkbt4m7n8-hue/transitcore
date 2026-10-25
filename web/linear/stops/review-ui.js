// Guided inspection of exactly the source-unnamed original map stops.
// Two views are visual aids; neither edits geometry or claims source/GPS verification.
(function(root){
 'use strict';
 const R=root.InTransitNameReview,N=root.InTransitStopLinks;
 const NS='http://www.w3.org/2000/svg';
 const $=id=>document.getElementById(id);
 const make=(name,attrs={})=>{
  const element=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attrs))element.setAttribute(key,String(value));
  return element;
 };
 function download(name,text){
  const blob=new Blob([text],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function mount({layout,getRows,onAliasSaved}){
  const queue=R.queue(layout),stateCount=()=>R.progress(layout,reviews);
  const originalIds=new Set(queue.map(stop=>stop.id));
  const picker=$('reviewPicker'),canvas=$('reviewOriginal'),ctx=canvas.getContext('2d');
  const sourceImage=new Image();
  let imageReady=false,reviews,current=queue[0]?.id||'';
  const info=text=>$('reviewMessage').textContent=text;
  function refreshReviews(){
   try{reviews=R.load(layout);return true;}
   catch(error){
    reviews=R.empty(layout);
    info('Lagret gjennomgang kan ikke leses: '+error.message+' Den blir ikke overskrevet.');
    return false;
   }
  }
  let validReview=refreshReviews();
  function listOptions(){
   picker.replaceChildren(...queue.map(stop=>{
    const entry=reviews.entries[stop.id];
    const marker=entry?.status==='looked-at'?'✓ ':entry?.status==='needs-research'?'? ':'– ';
    return new Option(marker+stop.id,stop.id);
   }));
  }
  function drawOriginal(stop){
   const status=$('reviewImageStatus'),w=canvas.width,h=canvas.height;
   ctx.clearRect(0,0,w,h);
   ctx.fillStyle='#111722';ctx.fillRect(0,0,w,h);
   if(!imageReady){
    status.textContent='Originalbildet kunne ikke åpnes ennå. Navn og notater kan fortsatt gjennomgås.';
    canvas.dataset.loaded='false';return;
   }
   try{
    const crop=R.crop(layout,stop,Number($('reviewZoom').value),w/h);
    ctx.drawImage(sourceImage,crop.x,crop.y,crop.width,crop.height,0,0,w,h);
    const cx=crop.markerX*w,cy=crop.markerY*h;
    ctx.lineWidth=2;ctx.strokeStyle='#10151c';ctx.beginPath();ctx.arc(cx,cy,15,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='#ffe785';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo(cx-23,cy);ctx.lineTo(cx-8,cy);ctx.moveTo(cx+8,cy);ctx.lineTo(cx+23,cy);
    ctx.moveTo(cx,cy-23);ctx.lineTo(cx,cy-8);ctx.moveTo(cx,cy+8);ctx.lineTo(cx,cy+23);ctx.stroke();
    ctx.beginPath();ctx.arc(cx,cy,15,0,Math.PI*2);ctx.stroke();
    status.textContent='Originalens bildepiksler: '+stop.source.centerPixels.x+', '+stop.source.centerPixels.y+' · gult siktepunkt er kartmarkør, ikke GPS.';
    canvas.dataset.loaded='true';
   }catch(error){status.textContent=error.message;canvas.dataset.loaded='false';}
  }
  function drawSchematic(stop){
   const svg=$('reviewSchematic'),vx=stop.x-120,vy=stop.y-75,w=240,h=150;
   svg.setAttribute('viewBox',[vx,vy,w,h].join(' '));svg.replaceChildren();
   svg.append(make('rect',{x:vx,y:vy,width:w,height:h,fill:'#111e2c'}));
   for(const path of layout.paths){
    const poly=make('polyline',{points:path.points.map(p=>p.x+','+p.y).join(' '),
     stroke:path.color, 'stroke-width':Math.max(1.5,path.width||2),fill:'none',opacity:'.8'});
    svg.append(poly);
   }
   const nearby=layout.stops.filter(s=>Math.abs(s.x-stop.x)<w/2&&Math.abs(s.y-stop.y)<h/2);
   for(const other of nearby){
    const active=other.id===stop.id;
    svg.append(make('circle',{cx:other.x,cy:other.y,r:active?6:3,
     fill:active?'#f7da8b':'#9cbad2',stroke:active?'#172334':'#172334','stroke-width':active?2:1}));
   }
   svg.append(make('circle',{cx:stop.x,cy:stop.y,r:10,fill:'none',stroke:'#ffe785','stroke-width':2}));
   const text=make('text',{x:Math.max(vx+4,Math.min(vx+w-95,stop.x+12)),y:Math.max(vy+14,stop.y-10),
    fill:'#fff1bd','font-size':11,'font-weight':700,stroke:'#122034','stroke-width':3,'paint-order':'stroke'});
   text.textContent=stop.id;svg.append(text);
  }
  function render(){
   if(!$('reviewPanel')||!current)return;
   listOptions();picker.value=current;
   const stop=queue.find(s=>s.id===current),entry=reviews.entries[current],p=stateCount();
   $('reviewTitle').textContent='Uavklart stopp '+(queue.indexOf(stop)+1)+' av '+queue.length;
   $('reviewProgress').textContent=p.visited+' av '+p.total+' gjennomgått lokalt · '+p.looked+' sett på · '+p.research+' må undersøkes · '+p.pending+' ikke gjennomgått.';
   $('reviewStatus').value=entry?.status||'pending';
   $('reviewNote').value=entry?.note||'';
   const row=getRows().find(r=>r.id===current);
   $('reviewAlias').value=row?.alias||'';
   $('reviewStopInfo').textContent=(row?.displayName||stop.name)+' · '+stop.id;
   $('reviewEvidence').textContent=(row?.geoEvidence||'Geografisk koordinat ikke verifisert')+' · Originalnavn fortsatt ubekreftet.';
   $('reviewSchematicLink').href='../index.html?view=network&stop='+encodeURIComponent(current);
   $('reviewGeoLink').href='../geo/?stop='+encodeURIComponent(current);
   const idx=queue.indexOf(stop);
   $('reviewPrev').disabled=idx===0;$('reviewNext').disabled=idx===queue.length-1;
   $('reviewNextPending').disabled=p.pending===0;
   drawOriginal(stop);drawSchematic(stop);
  }
  function choose(id){
   if(!originalIds.has(id))return;
   current=id;render();
   info('Valgt '+id+'. Notat og status lagres når du trykker Lagre.');
  }
  function move(step){
   const i=queue.findIndex(s=>s.id===current),next=Math.max(0,Math.min(queue.length-1,i+step));
   choose(queue[next].id);
  }
  function toggle(open){
   $('reviewPanel').hidden=!open;$('reviewStart').setAttribute('aria-expanded',String(open));
   if(open){render();$('reviewPanel').scrollIntoView({block:'start',behavior:'instant'});}
  }
  sourceImage.addEventListener('load',()=>{
   if(sourceImage.naturalWidth!==layout.reference.width||sourceImage.naturalHeight!==layout.reference.height){
    $('reviewImageStatus').textContent='Originalbilde har uventet størrelse. Viser ikke et misvisende utsnitt.';return;
   }
   imageReady=true;if(!$('reviewPanel').hidden)render();
  });
  sourceImage.addEventListener('error',()=>{$('reviewImageStatus').textContent='Originalbildet kunne ikke lastes. Ingen erstatning eller oppdiktet bilde brukes.';});
  if(layout.reference?.available&&layout.reference.width===5906&&layout.reference.height===8268&&
    layout.reference.path==='./assets/trondheim-original.jpg')
   sourceImage.src='../assets/trondheim-original.jpg';
  else $('reviewImageStatus').textContent='Originalreferansen samsvarer ikke med den dokumenterte bildefilen.';
  picker.addEventListener('change',()=>choose(picker.value));
  $('reviewPrev').addEventListener('click',()=>move(-1));
  $('reviewNext').addEventListener('click',()=>move(1));
  $('reviewNextPending').addEventListener('click',()=>{
   const start=queue.findIndex(s=>s.id===current);
   for(let n=1;n<=queue.length;n++){
    const stop=queue[(start+n)%queue.length];
    if(!reviews.entries[stop.id]||reviews.entries[stop.id].status==='pending'){choose(stop.id);return;}
   }
   info('Ingen stopp gjenstår som ikke er gjennomgått lokalt.');
  });
  $('reviewZoom').addEventListener('change',()=>{const stop=queue.find(s=>s.id===current);if(stop)drawOriginal(stop);});
  $('reviewSave').addEventListener('click',()=>{
   try{
    if(!validReview)throw Error('Ukompatibel lokal gjennomgang kan ikke overskrives.');
    reviews=R.save(layout,current,$('reviewStatus').value,$('reviewNote').value);
    render();info('Notat og lokal gjennomgangsstatus lagret. Originalnavnet er fortsatt ubekreftet.');
   }catch(error){info(error.message);}
  });
  $('reviewReset').addEventListener('click',()=>{
   try{
    if(!validReview)throw Error('Ukompatibel lokal gjennomgang kan ikke overskrives.');
    reviews=R.save(layout,current,'pending','');
    render();info('Gjennomgangsnotat og lokal status fjernet; navneforslaget er beholdt.');
   }catch(error){info(error.message);}
  });
  $('reviewSaveName').addEventListener('click',()=>{
   try{
    N.rename(layout,current,$('reviewAlias').value);
    onAliasSaved();
    render();info('Lokalt navneforslag lagret i begge kart – ikke kildebekreftet.');
   }catch(error){info('Kunne ikke lagre navneforslag: '+error.message);}
  });
  $('reviewExport').addEventListener('click',()=>{
   const p=stateCount(),names=Object.fromEntries(getRows().filter(r=>r.alias).map(r=>[r.id,r.alias]));
   download('intransit-navnegjennomgang.json',JSON.stringify({
    type:'intransit-name-review',schemaVersion:1,originalStopCount:layout.stops.length,
    sourceNameConfirmed:false,notice:'Local notes and suggestions – not verified official names, coordinates or vehicle GPS',
    progress:p,entries:reviews.entries,localNameSuggestions:names
   },null,2)+'\n');
   info('Gjennomgang og navneforslag eksportert til JSON. Originalkartet er uendret.');
  });
  $('reviewStart').addEventListener('click',()=>{
   if(!queue.length)return;
   if($('reviewPanel').hidden){
    const next=queue.find(s=>!reviews.entries[s.id]||reviews.entries[s.id].status==='pending');
    choose(next?.id||queue[0].id);toggle(true);
   }else toggle(false);
  });
  $('reviewClose').addEventListener('click',()=>toggle(false));
  root.addEventListener('storage',event=>{
   if(event.key!==R.KEY)return;
   validReview=refreshReviews();if(!$('reviewPanel').hidden)render();
  });
  const params=new URLSearchParams(location.search),requested=params.get('stop');
  if(params.get('review')==='1'){
   if(requested&&originalIds.has(requested))current=requested;
   toggle(true);
  }
  return {focus(id){if(originalIds.has(id)){current=id;toggle(true);return true;}return false;},
    getProgress:()=>stateCount()};
 }
 root.InTransitReviewUI={mount};
})(globalThis);

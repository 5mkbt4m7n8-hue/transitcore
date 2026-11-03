(async function(){
 'use strict';
 const D=InTransitStudioDocument,$=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg',key='intransit-artwork-v1';
 let initial=D.blank(),warning='';try{const saved=localStorage.getItem(key);if(saved)initial=D.validate(JSON.parse(saved));}catch{warning='Kunne ikke gjenåpne lokal kopi. Åpne en lagret prosjektfil.';}
 let history=D.history(initial),doc=history.get(),selected=null,selection=[],endpoint=null,extension=null,tool='select',draft=[],hover=null,gesture=null,pendingStation=null,propertyEdit=null,section=null,area=null,ledDetailsOpen=false,space=false,serial=Date.now(),camera={x:0,y:0,k:1};
 const canvas=$('canvas'),stage=$('stage');
 const make=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
 const all=()=>[...doc.artwork.lines,...doc.artwork.stops],object=()=>all().find(o=>o.id===selected),isLine=o=>o&&Array.isArray(o.points),id=prefix=>prefix+'-'+(++serial);
 const marked=()=>all().filter(o=>selection.includes(o.id));
 function selectOnly(value){area=null;section=null;pendingStation=null;selected=value;selection=value?[value]:[];endpoint=null;}
 function choose(value,add=false){area=null;section=null;pendingStation=null;endpoint=null;if(!add){selectOnly(value);return;}if(!value)return;if(selection.includes(value))selection=selection.filter(id=>id!==value);else selection.push(value);selected=selection.at(-1)||null;}
 function cancelDraft(){draft=[];hover=null;extension=null;}
 function pruneSelection(){selection=selection.filter(id=>all().some(o=>o.id===id));selected=selection.includes(selected)?selected:selection.at(-1)||null;endpoint=null;}
 const status=s=>$('status').textContent=s;
 function persist(){try{localStorage.setItem(key,JSON.stringify(doc));status('Lagret på denne enheten');}catch{status('Lokal lagring er utilgjengelig. Bruk Lagre prosjekt.');}}
 function commit(fn){finishSpacing();pendingStation=null;history.change(fn);doc=history.get();selection=selection.filter(id=>all().some(o=>o.id===id));selected=selection.includes(selected)?selected:selection.at(-1)||null;if(endpoint&&!selection.includes(endpoint.id))endpoint=null;persist();render();}
 function view(){canvas.setAttribute('viewBox',`${camera.x} ${camera.y} ${stage.clientWidth/camera.k} ${stage.clientHeight/camera.k}`);$('zoom').textContent=Math.round(camera.k*100)+' %';}
 function fit(){camera.k=Math.max(.05,Math.min((stage.clientWidth-64)/doc.width,(stage.clientHeight-64)/doc.height));camera.x=(doc.width-stage.clientWidth/camera.k)/2;camera.y=(doc.height-stage.clientHeight/camera.k)/2;view();}
 function zoom(f,x=stage.clientWidth/2,y=stage.clientHeight/2){const k=Math.max(.05,Math.min(6,camera.k*f));camera.x+=x/camera.k-x/k;camera.y+=y/camera.k-y/k;camera.k=k;view();draw();}
 function point(e){const r=canvas.getBoundingClientRect();return {x:camera.x+(e.clientX-r.left)/camera.k,y:camera.y+(e.clientY-r.top)/camera.k};}
 const bounded=p=>({x:Math.max(0,Math.min(doc.width,p.x)),y:Math.max(0,Math.min(doc.height,p.y))});
 function snap(p,previous){p=bounded(p);if($('snap').checked)p={x:Math.round(p.x/20)*20,y:Math.round(p.y/20)*20};if(previous&&$('angle').checked){const dx=p.x-previous.x,dy=p.y-previous.y,a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,len=Math.hypot(dx,dy);p={x:previous.x+Math.cos(a)*len,y:previous.y+Math.sin(a)*len};}return bounded(p);}
 function setTool(t){finishSpacing();if(draft.length&&t!==tool){status('Linjetegningen ble avbrutt');cancelDraft();}tool=t;selectOnly(null);hover=null;render();}
 function draw(){
  $('paper').replaceChildren(make('rect',{x:0,y:0,width:doc.width,height:doc.height,fill:'white'}),...($('snap').checked?[make('rect',{x:0,y:0,width:doc.width,height:doc.height,fill:'url(#grid)'})]:[]));
  const nodes=[],handles=[],halos=[];
  for(const l of doc.artwork.lines.filter(l=>l.visible)){
   const points=l.points.map(p=>p.x+','+p.y).join(' ');
   if(selection.includes(l.id))halos.push(make('polyline',{points,fill:'none',stroke:'#98cdb7','stroke-width':l.width+7,'stroke-linejoin':'round','stroke-linecap':'round','pointer-events':'none','data-selection':l.id}));
   nodes.push(make('polyline',{points,fill:'none',stroke:l.color,'stroke-width':l.width,'stroke-linejoin':'round','stroke-linecap':'round','data-id':l.id}));
   nodes.push(make('polyline',{points,fill:'none',stroke:'transparent','stroke-width':Math.max(l.width,16/camera.k),'data-id':l.id}));
   if(selection.length===1&&l.id===selected&&!l.locked)l.points.forEach((p,i)=>handles.push(make('circle',{cx:p.x,cy:p.y,r:((i===0||i===l.points.length-1)?7:5)/camera.k,'data-active':String(endpoint?.id===l.id&&endpoint.index===i),'data-endpoint':String(i===0||i===l.points.length-1),'data-id':l.id,'data-vertex':i})));
  }
  for(const s of doc.artwork.stops.filter(s=>s.visible)){
   if(selection.includes(s.id))nodes.push(make('circle',{cx:s.x,cy:s.y,r:11,fill:'#bcdfcb','pointer-events':'none'}));
   const label=D.label(s);
   for(const part of D.stationShapes(doc,s))nodes.push(make(part.tag,{...part.attrs,'data-id':s.id}));
   nodes.push(make('text',{x:label.x,y:label.y,'text-anchor':label.anchor,transform:'rotate('+label.angle+' '+label.x+' '+label.y+')','font-family':'system-ui,sans-serif','font-size':12,fill:'#203c32','data-id':s.id,'data-label':'true'},s.name));
  }
  if(draft.length){const pts=[...draft,...(hover?[hover]:[])];nodes.push(make('polyline',{points:pts.map(p=>p.x+','+p.y).join(' '),fill:'none',stroke:extension?doc.artwork.lines.find(l=>l.id===extension.id).color:'#267a59','stroke-width':extension?doc.artwork.lines.find(l=>l.id===extension.id).width:6,'stroke-linejoin':'round','stroke-dasharray':'8 4','pointer-events':'none'}));draft.forEach(p=>handles.push(make('circle',{cx:p.x,cy:p.y,r:4/camera.k,'pointer-events':'none'})));}
  const activeArea=gesture?.kind==='rubber'?(gesture.nextArea||area):area;if(activeArea){const b=activeArea.bounds;handles.push(make('rect',{x:b.x1,y:b.y1,width:b.x2-b.x1,height:b.y2-b.y1,fill:'#e08a3b11',stroke:'#b96918','stroke-width':1/camera.k,'stroke-dasharray':'5 3','pointer-events':'none','data-area-frame':'true'}));for(const [id,indices]of Object.entries(activeArea.vertices)){const l=all().find(o=>o.id===id);if(l?.visible)for(const i of indices){const p=l.points[i];if(p)handles.push(make('circle',{cx:p.x,cy:p.y,r:6/camera.k,style:'fill:#e08a3b;stroke:#64390f','data-id':id,'data-area-vertex':i}));}}for(const part of activeArea.sections){const l=all().find(o=>o.id===part.id);if(l?.visible){const ref=u=>({segment:Math.min(Math.floor(u),l.points.length-2),t:u>=l.points.length-1?1:u-Math.floor(u)});try{const range=D.sectionRange(doc,l.id,ref(part.from),ref(part.to));handles.push(make('polyline',{points:range.points.map(p=>p.x+','+p.y).join(' '),fill:'none',stroke:'#e08a3b88','stroke-width':l.width+3,'pointer-events':'none'}));}catch{}}}}
  if(gesture?.kind==='marquee'){const a=gesture.start,b=gesture.current||a;handles.push(make('rect',{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y),fill:'#21896718',stroke:'#218967','stroke-width':1/camera.k,'stroke-dasharray':'5 3','pointer-events':'none','data-marquee':'true'}));}
  if(section){const line=all().find(o=>o.id===section.id);for(const p of [section.from,section.to].filter(Boolean))handles.push(make('circle',{cx:p.x,cy:p.y,r:7/camera.k,style:'fill:#e08a3b;stroke:#64390f','pointer-events':'none'}));if(section.from&&section.to)try{const range=D.sectionRange(doc,line.id,section.from,section.to);handles.push(make('polyline',{points:range.points.map(p=>p.x+','+p.y).join(' '),fill:'none',stroke:'#e08a3b','stroke-width':(line.width+5),'stroke-dasharray':'6 3','pointer-events':'none'}));}catch{}}
  if(pendingStation){for(const c of pendingStation.candidates)handles.push(make('circle',{cx:c.x,cy:c.y,r:9/camera.k,fill:'none',stroke:'#267a59','stroke-dasharray':'3 3','pointer-events':'none','data-snap-candidate':c.lineId}));handles.push(make('circle',{cx:pendingStation.p.x,cy:pendingStation.p.y,r:5/camera.k,fill:'#e08a3b','pointer-events':'none','data-snap-preview':'true'}));}
  // Selection decoration sits below every route, preserving each route's color.
  $('art').replaceChildren(...halos,...nodes);$('handles').replaceChildren(...handles);
  $('welcome').hidden=all().length>0||draft.length>0||tool==='pen'||tool==='stop';
 }
 function artboard(box){
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Tegneområde';details.append(summary);
  const w=document.createElement('input'),h=document.createElement('input');w.type=h.type='number';w.value=doc.width;h.value=doc.height;w.min=h.min=100;w.max=h.max=10000;w.id='artWidth';h.id='artHeight';
  for(const [text,i]of [['Bredde',w],['Høyde',h]]){const l=document.createElement('label');l.textContent=text;l.append(i);details.append(l);}
  const apply=document.createElement('button');apply.textContent='Endre tegneområde';apply.onclick=()=>{try{commit(d=>D.resize(d,Number(w.value),Number(h.value)));}catch(e){status('Området må være 100–10000 og romme alle punktene.');}};
  const swap=document.createElement('button');swap.textContent='Bytt bredde og høyde';swap.onclick=()=>{const v=w.value;w.value=h.value;h.value=v;};details.append(swap,apply);const arrange=document.createElement('button');arrange.textContent='Foreslå navneplassering';arrange.onclick=()=>commit(d=>D.arrangeLabels(d));details.append(arrange);const p=document.createElement('p');p.textContent='Kartkoordinater, uavhengig av tavlens cm-format. Punktene flyttes ikke. Bruk Tilpass kart for å se hele området.';details.append(p);box.append(details);
 }
 function lineColors(box,objects){
  const ids=objects.map(o=>o.id),locked=objects.some(o=>o.locked),heading=document.createElement('p');heading.textContent='Farger i bruk';box.append(heading);const swatches=document.createElement('div');swatches.className='swatches';
  for(const color of [...new Set(doc.artwork.lines.map(l=>l.color.toLowerCase()))]){const b=document.createElement('button');b.style.backgroundColor=color;b.title=color;b.setAttribute('aria-label','Bruk farge '+color);b.setAttribute('aria-pressed',String(objects.every(o=>o.color.toLowerCase()===color)));b.disabled=locked;b.onclick=()=>commit(d=>D.styleLines(d,ids,{color}));swatches.append(b);}box.append(swatches);
  const l=document.createElement('label'),input=document.createElement('input');l.textContent='Velg ny farge';input.type='color';input.setAttribute('aria-label','Linjefarge');input.value=objects[0].color;input.disabled=locked;input.onchange=()=>commit(d=>D.styleLines(d,ids,{color:input.value}));l.append(input);box.append(l);
 }
 function attempt(fn){try{commit(fn);}catch(e){status(e.message);}}
 function numberField(box,text,value,min,max){const label=document.createElement('label'),input=document.createElement('input');label.textContent=text;input.type='number';input.value=value;input.min=min;input.max=max;label.append(input);box.append(label);return input;}
 function sideField(box,text,value='right'){const label=document.createElement('label'),input=document.createElement('select');label.textContent=text;input.setAttribute('aria-label',text);for(const [v,t]of [['right','Høyre'],['left','Venstre'],['center','Sentrert']])input.add(new Option(t,v));input.value=value;label.append(input);box.append(label);return input;}
 function finishSpacing(cancel=false){if(!propertyEdit)return;const edit=propertyEdit;propertyEdit=null;doc=edit.before;if(!cancel&&edit.valid&&edit.result){history.change(d=>Object.assign(d,edit.result));doc=history.get();persist();}else if(cancel||!edit.valid){edit.input.value=edit.original;edit.input.removeAttribute('aria-invalid');}draw();$('undo').disabled=!history.canUndo();$('redo').disabled=!history.canRedo();}
 function liveSpacing(input,g){input.oninput=()=>{propertyEdit??={before:history.get(),input,original:g.spacing};const edit=propertyEdit,next=structuredClone(edit.before);try{D.updateParallel(next,g.id,g.memberIds.length,Number(input.value),g.side);edit.valid=true;edit.result=next;doc=next;input.removeAttribute('aria-invalid');draw();status('Forhåndsvisning av traséavstand');}catch(e){edit.valid=false;input.setAttribute('aria-invalid','true');status(e.message);}};input.onchange=input.onblur=()=>finishSpacing();input.onkeydown=e=>{if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();e.stopPropagation();finishSpacing(e.key==='Escape');}};}
 function groupProperties(box,g){
  const details=document.createElement('details');details.open=true;const summary=document.createElement('summary');summary.textContent=g.kind==='visual'?'Visuell gruppe':g.kind==='joined'?'Koblede endepunkter':'Koblet felles trasé';details.append(summary);
  const note=document.createElement('p');note.textContent=g.memberIds.length+' selvstendige linjer. Dra en linje for å flytte hele gruppen. '+(g.spine?'Dra et punkt for å forme felles trasé. Farge og tykkelse gjelder linjen du velger.':'Kildekoblinger, farger og linje-ID-er beholdes.');details.append(note);
  const locked=g.memberIds.some(id=>all().find(o=>o.id===id).locked);
  const select=document.createElement('button');select.textContent='Velg hele gruppen';select.onclick=()=>{selection=[...g.memberIds];selected=selection.at(-1);endpoint=null;render();};details.append(select);
  if(g.spine){
   const count=numberField(details,'Antall linjer',g.memberIds.length,Math.max(2,g.memberIds.length-g.generatedIds.length),9),spacing=numberField(details,'Traséavstand',g.spacing,2,200),side=sideField(details,'Plassering',g.side);
   spacing.disabled=locked;liveSpacing(spacing,g);const b=document.createElement('button');b.textContent='Oppdater parallelle linjer';b.disabled=locked;b.onclick=()=>attempt(d=>D.updateParallel(d,g.id,Number(count.value),Number(spacing.value),side.value,Array.from({length:Math.max(0,Math.min(9,Number(count.value))-g.memberIds.length)},()=>id('line'))));details.append(b);
   const help=document.createElement('p');help.textContent='Antallet inkluderer originalene. Reduksjon fjerner bare nye kopier uten stopp eller kildekoblinger. Høyre/venstre følger retningen fra første til siste punkt.';details.append(help);
  }
  const detach=document.createElement('button');detach.textContent='Løsne linjene';detach.disabled=locked;detach.onclick=()=>attempt(d=>D.detachGroup(d,g.id));details.append(detach);const help=document.createElement('p');help.textContent='Løsne beholder dagens geometri. Angre gjenoppretter handlingen og eventuell tidligere geometri.';details.append(help);box.append(details);
 }
 function connectionActions(box,lines){
  const groups=[...new Set(lines.map(l=>D.groupFor(doc,l.id)).filter(Boolean))];
  if(groups.length===1&&lines.every(l=>groups[0].memberIds.includes(l.id))){groupProperties(box,groups[0]);return;}
  const note=document.createElement('p');note.textContent='Flervalg endrer bare utvalget. Velg en egen handling nedenfor. Alle linje-ID-er, farger og kildekoblinger beholdes.';box.append(note);
  const blocked=lines.some(l=>l.locked)||groups.length>0;let joinReason='';try{D.joinPlan(doc,lines.map(l=>l.id));}catch(e){joinReason=e.message;}
  const join=document.createElement('button');join.textContent='Slå sammen';join.disabled=blocked||!!joinReason;join.title=joinReason||'Koble møtende endepunkter til én sammenhengende trasé, med separate linjeobjekter';join.onclick=()=>attempt(d=>D.joinLines(d,selection,id('group')));box.append(join);
  const explanation=document.createElement('p');explanation.textContent='Slå sammen kobler endepunkter i en åpen kjede. '+joinReason;box.append(explanation);
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Felles visuell trasé';details.append(summary);
  const spacing=numberField(details,'Avstand for felles trasé',14,2,200),side=sideField(details,'Plassering for felles trasé');
  const text=document.createElement('p');text.textContent='Bruker den først valgte linjens form. De andre flyttes til parallelle spor langs hele denne traséen. Form, avstand og plassering kan justeres senere.';details.append(text);
  const share=document.createElement('button');share.textContent='Bruk felles trasé';share.disabled=blocked||lines.length>9;share.onclick=()=>attempt(d=>D.shareRoute(d,selection,Number(spacing.value),side.value,id('group')));details.append(share);box.append(details);
  const group=document.createElement('button');group.textContent='Grupper';group.disabled=blocked;group.onclick=()=>attempt(d=>D.groupLines(d,selection,id('group')));box.append(group);const groupNote=document.createElement('p');groupNote.textContent=groups.length?'Løsne eksisterende grupper før du kobler dem på nytt.':'Grupper beholder geometrien og lar deg flytte linjene samlet.';box.append(groupNote);
 }
 function parallelCreator(box,o){
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Koblede parallelle linjer';details.append(summary);
  const count=numberField(details,'Totalt antall linjer',3,2,9),spacing=numberField(details,'Ny traséavstand',14,2,200),side=sideField(details,'Ny plassering');
  const b=document.createElement('button');b.textContent='Opprett parallelle linjer';b.disabled=o.locked;b.onclick=()=>attempt(d=>D.linkedParallel(d,o.id,Number(count.value),Number(spacing.value),side.value,id('group'),Array.from({length:Math.max(0,Math.min(9,Number(count.value))-1)},()=>id('line'))));details.append(b);const note=document.createElement('p');note.textContent='Beholder originalen og lager egne linjer med hver sin farge. Antall, avstand, side og felles form kan endres etterpå.';details.append(note);box.append(details);
 }
 function finishStationPlacement(placement,ids,kind){
  const {stop,p,create}=placement;try{pendingStation=null;tool='select';selectOnly(stop.id);commit(d=>{if(create)d.artwork.stops.push(structuredClone(stop));D.placeStation(d,stop.id,ids.length?p:snap(p),ids,kind);});if(create){const input=document.querySelector('#properties input');input.focus({preventScroll:true});input.select();}}
  catch(e){pendingStation=placement;status(e.message);render();}
 }
 function positionStation(stop,p,create=false,force=false){
  p=bounded(p);const candidates=D.stationCandidates(doc,p,camera.k),placement={stop:structuredClone(stop),p,create,candidates};
  if(candidates.length>1||force&&candidates.length){tool='select';selectOnly(stop.id);pendingStation=placement;status('Flere linjer er nær stoppet. Velg linje, trasé eller felles stasjon.');render();}
  else finishStationPlacement(placement,candidates.map(c=>c.lineId),candidates.length?'line':'free');
 }
 function stationChoice(box){
  const placement=pendingStation,heading=document.createElement('h3');heading.textContent='Velg hvor stoppet skal festes';box.append(heading);
  const note=document.createElement('p');note.textContent='Flere linjer ligger nær pekeren. Ingen endring lagres før du velger. Esc avbryter.';box.append(note);
  const groups=[...new Set(placement.candidates.map(c=>D.groupFor(doc,c.lineId)).filter(g=>g?.spine))],ids=[...new Set([...placement.candidates.map(c=>c.lineId),...groups.flatMap(g=>g.memberIds.filter(id=>all().find(o=>o.id===id).visible))])],checks=[];
  for(const id of ids){const line=all().find(o=>o.id===id),button=document.createElement('button');button.textContent='Fest til '+line.name;button.onclick=()=>finishStationPlacement(placement,[id],'line');box.append(button);}
  for(const g of groups){const visible=g.memberIds.filter(id=>all().find(o=>o.id===id).visible);if(visible.length<2)continue;const button=document.createElement('button');button.textContent='Følg felles trasé · '+visible.map(id=>all().find(o=>o.id===id).name).join(', ');button.onclick=()=>finishStationPlacement(placement,visible,'route');box.append(button);}
  const common=document.createElement('details'),summary=document.createElement('summary');common.open=true;common.className='station-lines';summary.textContent='Felles stasjon';common.append(summary);
  for(const id of ids){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;label.append(input,document.createTextNode(all().find(o=>o.id===id).name));common.append(label);checks.push({id,input});}
  const shared=document.createElement('button');shared.textContent='Felles stasjon på valgte linjer';const update=()=>shared.disabled=checks.filter(c=>c.input.checked).length<2;for(const c of checks)c.input.onchange=update;update();shared.onclick=()=>finishStationPlacement(placement,checks.filter(c=>c.input.checked).map(c=>c.id),'station');common.append(shared);box.append(common);
  const free=document.createElement('button');free.textContent='Plasser fritt';free.onclick=()=>finishStationPlacement(placement,[],'free');box.append(free);const help=document.createElement('p');help.textContent='Fri plassering beholder eksisterende linje- og kildekoblinger. Bruk Løsne fra linjene for å fjerne linjekoblingene.';box.append(help);
  const cancel=document.createElement('button');cancel.textContent='Avbryt plassering';cancel.onclick=()=>{pendingStation=null;selectOnly(placement.create?null:placement.stop.id);render();};box.append(cancel);
 }
 function stationProperties(box,s){
  const note=document.createElement('p');note.textContent=s.lineIds.length?'Tilknyttede linjer: '+s.lineIds.map(id=>all().find(o=>o.id===id).name).join(', '):'Stoppet har ingen linjekobling.';box.append(note);
  const attach=document.createElement('button');attach.textContent='Fest til linjer her';attach.disabled=s.locked;attach.onclick=()=>positionStation(s,s,false,true);box.append(attach);
  const detach=document.createElement('button');detach.textContent='Løsne fra linjene';detach.disabled=s.locked||!s.lineIds.length;detach.onclick=()=>attempt(d=>D.detachStation(d,s.id));box.append(detach);
  if(s.anchor&&['double','capsule','leds'].includes(s.symbol)){const fit=document.createElement('button');fit.textContent='Tilpass symbolet til linjene';fit.disabled=s.locked;fit.onclick=()=>attempt(d=>{d.artwork.stops.find(o=>o.id===s.id).autoSymbol=true;D.refreshStations(d);});box.append(fit);}
  if(s.symbol==='leds'){
   const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Separate LED-punkter';details.dataset.ledDetails='true';details.open=ledDetailsOpen;details.append(summary);const help=document.createElement('p');help.textContent='Ett grafisk punkt per linje. Velg eventuell eksisterende Quay-kilde for hvert punkt. Kildene beholdes separat; editoren viser ikke sanntidstilstand.';details.append(help);
   for(const led of (s.leds||[]).filter(l=>s.lineIds.includes(l.lineId))){const label=document.createElement('label'),input=document.createElement('select'),name=all().find(o=>o.id===led.lineId).name;label.textContent='LED-kilde for '+name;input.setAttribute('aria-label','LED-kilde for '+name);input.add(new Option('Ingen datakilde (grafisk punkt)',''));for(const source of doc.artwork.stops)for(const quayId of doc.bindings[source.id]?.quayIds||[])input.add(new Option(source.name+' · '+quayId,JSON.stringify([source.id,quayId])));input.value=led.sourceStopId?JSON.stringify([led.sourceStopId,led.quayId]):'';input.disabled=s.locked;input.onchange=()=>attempt(d=>D.setLedSource(d,s.id,led.id,...(input.value?JSON.parse(input.value):[null,null])));label.append(input);details.append(label);}box.append(details);
  }
 }
 function beginSection(id){area=null;finishSpacing();pendingStation=null;selection=[id];selected=id;endpoint=null;section={id,from:null,to:null,name:(object().name+' · utskilt').slice(0,200),policy:''};render();canvas.focus({preventScroll:true});}
 function performSection(operation){if(!section?.from||!section?.to){status('Velg to grensepunkter først');return;}const current=section;try{let result;commit(d=>{result=D.editSection(d,current.id,current.from,current.to,{operation,stationPolicy:current.policy,name:current.name,newIds:{section:id('line'),after:id('line')}});});selectOnly(result.selectedId);render();}catch(e){status(e.message);}}
 function sectionProperties(box){const current=section,line=all().find(o=>o.id===current.id),title=document.createElement('h3');title.textContent='Velg strekning';box.append(title);const note=document.createElement('p');note.textContent='Klikk to punkter på linjen, eller velg to stopp nedenfor. Oransje viser den sammenhengende strekningen. Ingen endring skjer før du velger en handling.';box.append(note);
  for(const [label,key]of [['Fra stopp','from'],['Til stopp','to']]){const l=document.createElement('label'),input=document.createElement('select');l.textContent=label;input.setAttribute('aria-label',label);input.add(new Option('Velg stopp',''));for(const stop of doc.artwork.stops)input.add(new Option(stop.name,stop.id));input.value=current[key+'Stop']||'';input.onchange=()=>{const stop=all().find(o=>o.id===input.value);if(stop){current[key]=D.project(stop,line);current[key+'Stop']=stop.id;render();}};l.append(input);box.append(l);}
  let range=null,affected=[];try{range=D.sectionRange(doc,line.id,current.from,current.to);affected=D.sectionStations(doc,line.id,current.from,current.to);}catch{}
  const name=document.createElement('label'),input=document.createElement('input');name.textContent='Navn på utskilt strekning';input.value=current.name;input.maxLength=200;input.oninput=()=>current.name=input.value;name.append(input);box.append(name);
  const help=document.createElement('p');help.textContent=affected.length?'Stasjoner på strekningen: '+affected.map(s=>s.name).join(', ')+'. Ingen stasjoner slettes eller flyttes. Velg håndtering før handlingen.':'Stasjoner utenfor den valgte strekningen beholdes.';box.append(help);
  const policy=document.createElement('label'),choice=document.createElement('select');policy.textContent='Stasjoner på strekningen';choice.setAttribute('aria-label','Stasjoner på strekningen');for(const [v,t]of [['','Velg håndtering'],['keep','Behold på stedet; løsne fra denne strekningen'],['extract','Behold på stedet; knytt til utskilt del']])choice.add(new Option(t,v));choice.value=current.policy;choice.onchange=()=>{current.policy=choice.value;render();};policy.append(choice);box.append(policy);
  if(D.groupFor(doc,line.id)){const p=document.createElement('p');p.textContent='Handlingen løsner linjegruppen. Andre linjer beholder formen. Kildedata endres ikke.';box.append(p);}
  for(const [label,operation]of [['Skill ut strekning','extract'],['Fjern valgt strekning','remove']]){const b=document.createElement('button');b.textContent=label;b.disabled=!range||line.locked||affected.length&&!current.policy||operation==='remove'&&current.policy==='extract';b.onclick=()=>performSection(operation);box.append(b);}const cancel=document.createElement('button');cancel.textContent='Avbryt strekning';cancel.onclick=()=>{section=null;render();};box.append(cancel);
 }
 function performAreaDelete(){if(!area)return;try{if(area.sections.length)commit(d=>D.removeArea(d,area,()=>id('line')));else if(area.stops.length)commit(d=>D.removeObjects(d,area.stops));else{status('Marker en strekning med minst to punkter');return;}selectOnly(null);render();}catch(e){status(e.message);}}
 function areaProperties(box){const count=Object.values(area.vertices).reduce((n,a)=>n+a.length,0)+Object.values(area.cuts).reduce((n,a)=>n+a.length,0),title=document.createElement('h3');title.textContent='Områdemarkering';box.append(title);const p=document.createElement('p');p.textContent=count+' punkter, '+area.stops.length+' stasjoner. Dra inni rammen for å strekke markeringen. Bare markerte punkter/stasjoner flyttes; koblede parallelle punkter følger samlet.';box.append(p);const dx=numberField(box,'Flytt vannrett',0,-10000,10000),dy=numberField(box,'Flytt loddrett',0,-10000,10000),move=document.createElement('button');move.textContent='Flytt markerte punkter';move.onclick=()=>{try{let next;commit(d=>{next=D.rubberMove(d,area,Number(dx.value),Number(dy.value));});area=next;render();}catch(e){status(e.message);}};box.append(move);const remove=document.createElement('button');remove.textContent=area.sections.length?'Fjern markerte strekninger':'Slett valgte stasjoner';remove.disabled=!area.sections.length&&!area.stops.length;remove.onclick=performAreaDelete;box.append(remove);const note=document.createElement('p');note.textContent=area.sections.length?'Delete fjerner bare markerte strekninger. Stasjonene beholdes på stedet. Enkeltpunkter sletter ikke hele linjer.':'Delete sletter bare uttrykkelig valgte stasjoner når ingen strekning er markert.';box.append(note);const clear=document.createElement('button');clear.textContent='Opphev områdemarkering';clear.onclick=()=>{area=null;render();};box.append(clear);}
 function multiProperties(box){
  const objects=marked(),lines=objects.filter(isLine),locked=objects.some(o=>o.locked),p=document.createElement('p');p.textContent=objects.length+' objekter valgt. Ctrl-klikk legger til eller fjerner fra utvalget.';box.append(p);
  if(lines.length===objects.length){
   connectionActions(box,lines);
   lineColors(box,lines);const l=document.createElement('label'),input=document.createElement('input');l.textContent='Felles linjetykkelse';input.type='number';input.min=1;input.max=40;input.value=lines.every(o=>o.width===lines[0].width)?lines[0].width:'';input.placeholder='Ulik tykkelse';input.disabled=locked;input.onchange=()=>{try{commit(d=>D.styleLines(d,selection,{width:Number(input.value)}));}catch(e){status(e.message);render();}};l.append(input);box.append(l);
   if(!lines.some(l=>D.groupFor(doc,l.id))){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Felles avstand';details.append(summary);const label=document.createElement('label'),spacing=document.createElement('input');label.textContent='Avstand i kartet';spacing.type='number';spacing.value=14;spacing.min=2;spacing.max=200;label.append(spacing);details.append(label);const note=document.createElement('p');note.textContent='Engangsjustering langs første valgte linje. Linjene kobles ikke. For redigerbar kobling, velg Bruk felles trasé.';details.append(note);const b=document.createElement('button');b.textContent='Bruk felles avstand';b.disabled=locked;b.onclick=()=>{try{commit(d=>D.spaceLines(d,selection,Number(spacing.value)));}catch(e){status(e.message);}};details.append(b);box.append(details);}
  }
  const del=document.createElement('button');del.textContent='Slett markerte';del.disabled=locked;del.onclick=remove;box.append(del);if(locked){const note=document.createElement('p');note.textContent='Utvalget inneholder låste lag. Lås opp eller fjern dem fra utvalget for å redigere samlet.';box.append(note);}
 }
 function properties(){
  const box=$('properties'),ledDetails=box.querySelector('[data-led-details]');if(ledDetails)ledDetailsOpen=ledDetails.open;box.replaceChildren();box.dataset.stationChoice=String(!!pendingStation);if(pendingStation){stationChoice(box);return;}if(section){sectionProperties(box);return;}if(area){areaProperties(box);return;}const o=object();let target=box;if(extension){const p=document.createElement('p');p.textContent='Du fortsetter den valgte linjen. Klikk nye punkter. Enter lagrer, Esc avbryter, og Backspace fjerner siste nye punkt.';box.append(p);return;}if(selection.length>1){multiProperties(box);return;}
  if(!o){artboard(box);const p=document.createElement('p');p.textContent=tool==='pen'?'Klikk for hvert knekkpunkt. Enter fullfører linjen. Esc avbryter.':tool==='stop'?'Klikk på kartet for å plassere et stopp. Gi stoppet navn her.':'Velg et stopp eller en linje i kartet eller laglisten. Dra for å flytte. Dobbeltklikk en valgt linje for å legge til et punkt.';box.append(p);return;}
  function field(label,type,value,fn){const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.type=type;i.value=value;i.disabled=o.locked;i.maxLength=200;i.onchange=()=>{try{commit(d=>fn(d.artwork[isLine(o)?'lines':'stops'].find(v=>v.id===o.id),i.value));}catch(e){status(e.message);render();}};l.append(i);target.append(l);return i;}
  field(isLine(o)?'Linjenavn':'Stoppnavn','text',o.name,(n,v)=>n.name=v);
  if(isLine(o)){lineColors(box,[o]);field('Linjetykkelse','number',o.width,(n,v)=>n.width=Number(v));}
  else{
   choice('Navneretning','custom',[['custom','Egen vinkel'],['horizontal','Vannrett · 0°'],['up','Skrått opp · −45°'],['down','Skrått ned · 45°'],['vertical','Loddrett · 90°'],['right','Vannrett til høyre'],['left','Vannrett til venstre']],(n,v)=>{if(v!=='custom')D.labelPreset(n,v);});
   field('Navnevinkel (0–360°)','number',o.labelAngle||0,(n,v)=>n.labelAngle=Number(v));
   choice('Navneside',o.labelSide||'right',[['right','Høyre'],['left','Venstre']],(n,v)=>{n.labelSide=v;n.labelDx=(v==='left'?-1:1)*Math.abs(n.labelDx||12);});
   choice('Stoppsymbol',o.symbol||'circle',[['circle','Sirkel'],['ring','Fylt sirkel'],['double','Dobbelt stopp'],['capsule','Felles stopp'],['leds','Felles LED-punkter']],(n,v,d)=>D.setStationSymbol(d,n.id,v));
   if(['capsule','double','leds'].includes(o.symbol)){field('Bredde over linjene','number',o.span||30,(n,v)=>{n.span=Number(v);n.autoSymbol=false;});field('Symbolvinkel (0–360°)','number',o.symbolAngle||0,(n,v)=>{n.symbolAngle=Number(v);n.autoSymbol=false;});}stationProperties(box,o);
   const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Nøyaktig plassering';details.append(summary);box.append(details);target=details;
   field('Navneavstand vannrett','number',o.labelDx,(n,v)=>n.labelDx=Number(v));field('Navneavstand loddrett','number',o.labelDy,(n,v)=>n.labelDy=Number(v));field('X','number',o.x,(n,v)=>{n.x=Number(v);delete n.anchor;});field('Y','number',o.y,(n,v)=>{n.y=Number(v);delete n.anchor;});target=box;
  }
  function choice(text,value,options,fn){const l=document.createElement('label'),i=document.createElement('select');l.textContent=text;i.setAttribute('aria-label',text);for(const [v,t]of options)i.add(new Option(t,v));i.value=value;i.disabled=o.locked;i.onchange=()=>commit(d=>fn(d.artwork.stops.find(n=>n.id===o.id),i.value,d));l.append(i);target.append(l);}
  if(isLine(o)){
   const sectionButton=document.createElement('button');sectionButton.textContent='Velg strekning';sectionButton.disabled=o.locked;sectionButton.onclick=()=>beginSection(o.id);box.append(sectionButton);const g=D.groupFor(doc,o.id);if(g)groupProperties(box,g);else parallelCreator(box,o);
   if(tool==='select'&&endpoint?.id===o.id){const b=document.createElement('button');b.textContent='Fortsett linjen';b.disabled=o.locked;b.onclick=startExtension;box.append(b);}else{const p=document.createElement('p');p.textContent='Velg et av de store endepunktene for å fortsette linjen.';box.append(p);}
   const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Parallelle linjekopier';details.append(summary);
   const count=document.createElement('input'),spacing=document.createElement('input');count.type=spacing.type='number';count.value=1;count.min=1;count.max=8;spacing.value=14;spacing.min=2;spacing.max=200;
   for(const [text,input]of [['Antall ekstra linjer',count],['Avstand i kartet',spacing]]){const l=document.createElement('label');l.textContent=text;l.append(input);details.append(l);}
   const b=document.createElement('button');b.textContent='Lag parallelle kopier';b.disabled=o.locked;b.onclick=()=>{try{const n=Number(count.value);if(!Number.isInteger(n)||n<1||n>8)throw Error('Velg 1–8 kopier');commit(d=>D.parallel(d,o.id,n,Number(spacing.value),Array.from({length:n},()=>id('line'))));}catch(e){status(e.message);}};details.append(b);const p=document.createElement('p');p.textContent='Kopiene får egne farger og kan velges og redigeres separat. Avstanden gjelder når kopiene lages. Felles stopp tegnes én gang med symbolet «Felles stopp».';details.append(p);box.append(details);
  }
  const p=document.createElement('p');p.textContent=o.locked?'Laget er låst. Lås det opp i laglisten.':isLine(o)?'Dra punktene for å forme linjen. Dra linjen for å flytte hele laget.':'Dra stoppet for å flytte det. Dra navnet separat.';box.append(p);
  const del=document.createElement('button');del.textContent='Slett '+(isLine(o)?'linje':'stopp');del.disabled=o.locked;del.onclick=remove;box.append(del);
 }
 function layers(){const box=$('layers');box.replaceChildren();$('count').textContent=all().length;for(const o of all().slice().reverse()){
  const row=document.createElement('div');row.dataset.selected=String(selection.includes(o.id));
  const pick=document.createElement('button');pick.className='pick';pick.textContent=(isLine(o)?'━ ':'○ ')+o.name;pick.title=o.name;pick.onclick=e=>{choose(o.id,e.ctrlKey||e.metaKey);tool='select';cancelDraft();render();};row.append(pick);
  for(const [prop,label,on,off]of [['visible','Synlighet','◉','○'],['locked','Lås','🔒','◇']]){const b=document.createElement('button');b.className='toggle';b.textContent=o[prop]?on:off;b.setAttribute('aria-label',label+' '+o.name);b.setAttribute('aria-pressed',String(o[prop]));b.onclick=()=>commit(d=>{d.artwork[isLine(o)?'lines':'stops'].find(v=>v.id===o.id)[prop]=!o[prop];});row.append(b);}box.append(row);
 }}
 function render(){draw();properties();layers();$('title').value=doc.title;canvas.dataset.tool=space?'hand':tool;document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));$('undo').disabled=!history.canUndo();$('redo').disabled=!history.canRedo();$('finish').hidden=tool!=='pen';$('finish').disabled=draft.length<2;$('cancel').hidden=tool!=='pen';$('hint').textContent=extension?'Fortsett samme linje → Enter lagrer · Esc avbryter':tool==='pen'?'Klikk punkter → Enter fullfører · Esc avbryter':tool==='stop'?'Klikk for å plassere stopp → gi det navn i Egenskaper':tool==='hand'?'Dra for å panorere · hjul zoomer rundt pekeren':'Ctrl-klikk for flervalg · mellomrom panorerer · hjul zoomer';const b=doc.bindings[selected];$('binding').textContent=b?'Kopiert fra Trondheim. Kilde: '+b.sourceId+'. '+b.quayIds.length+' plattformkoblinger beholdt. Grafisk flytting endrer ikke kilden.':'Ingen sanntidskobling. Dette er et fritt grafisk objekt.';view();}
 function remove(){if(!selection.length)return;try{commit(d=>D.removeObjects(d,selection));selectOnly(null);render();}catch(e){status(e.message);}}
 function startExtension(){const o=object();if(!isLine(o)||o.locked||!endpoint||endpoint.id!==o.id)return;extension={id:o.id,end:endpoint.index===0?'start':'end'};draft=[structuredClone(o.points[endpoint.index])];hover=null;tool='pen';render();canvas.focus({preventScroll:true});}
 function finish(){if(draft.length<2)return;
  if(extension){const ext=extension,points=structuredClone(draft.slice(1));try{commit(d=>D.extend(d,ext.id,ext.end,points));cancelDraft();tool='select';selectOnly(ext.id);render();canvas.focus({preventScroll:true});}catch(e){status(e.message);}return;}
  const line={id:id('line'),name:'Linje '+(doc.artwork.lines.length+1),color:['#218967','#e08a3b','#6e68bb','#cc5271'][doc.artwork.lines.length%4],width:6,visible:true,locked:false,points:structuredClone(draft)};cancelDraft();selectOnly(line.id);tool='select';commit(d=>d.artwork.lines.push(line));document.querySelector('#properties input').focus({preventScroll:true});}
 function nearest(p,line){let best=null;line.points.slice(1).forEach((b,i)=>{const a=line.points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),q={x:a.x+t*dx,y:a.y+t*dy},dist=Math.hypot(q.x-p.x,q.y-p.y);if(!best||dist<best.dist)best={...q,dist,index:i+1};});return best;}
 canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==1)return;e.preventDefault();canvas.focus({preventScroll:true});const p=point(e),hit=e.target.closest('[data-id]');
  if(tool==='hand'||space||e.button===1){gesture={kind:'pan',start:{x:e.clientX,y:e.clientY},camera:{...camera}};}
  else if(tool==='pen'){const q=snap(p,draft.at(-1));if(!draft.length||Math.hypot(q.x-draft.at(-1).x,q.y-draft.at(-1).y)>1)draft.push(q);hover=null;render();return;}
  else if(tool==='stop'){const s={id:id('stop'),name:'Nytt stopp',...bounded(p),labelDx:12,labelDy:-12,lineIds:[],visible:true,locked:false};positionStation(s,p,true);return;}
  else{
   if(section&&!e.ctrlKey&&!e.metaKey){const line=all().find(o=>o.id===section.id),p= D.project(point(e),line);if(p.dist<=Math.max(14/camera.k,line.width/2)){if(!section.from||section.to){section.from=p;section.to=null;}else section.to=p;render();}return;}
   if(area&&!e.ctrlKey&&!e.metaKey&&p.x>=area.bounds.x1&&p.x<=area.bounds.x2&&p.y>=area.bounds.y1&&p.y<=area.bounds.y2){gesture={kind:'rubber',start:p,before:doc,area:structuredClone(area),hitId:hit?.dataset.id||null};canvas.setPointerCapture(e.pointerId);return;}
   // Wide transparent hit areas and endpoint handles can overlap another route.
   // Resolve route selection by distance to the actual path, with stable paint-order ties.
   let hitId=hit?.dataset.id||null;
   if((!e.target.hasAttribute('data-vertex')||e.ctrlKey||e.metaKey)&&(!hitId||isLine(all().find(o=>o.id===hitId)))){
    const candidates=doc.artwork.lines.filter(l=>l.visible).map((l,i)=>({id:l.id,dist:nearest(p,l).dist,i,width:l.width})).filter(l=>l.dist<=Math.max(l.width/2,8/camera.k)).sort((a,b)=>a.dist-b.dist||b.i-a.i);
    if(candidates.length)hitId=candidates[0].id;
   }
   if(e.ctrlKey||e.metaKey){choose(hitId,true);render();return;}
   if(!hitId){selectOnly(null);gesture={kind:'marquee',start:p,current:p,before:doc};canvas.setPointerCapture(e.pointerId);render();return;}
   if(!selection.includes(hitId))selectOnly(hitId);
   const o=object(),vertex=e.target.dataset.id===hitId&&e.target.hasAttribute('data-vertex')?Number(e.target.dataset.vertex):null;
   endpoint=isLine(o)&&vertex!==null&&(vertex===0||vertex===o.points.length-1)?{id:o.id,index:vertex}:null;
   const moveIds=D.transformIds(doc,selection),objects=all().filter(o=>moveIds.includes(o.id));
   if(o&&!objects.some(o=>o.locked))gesture={kind:selection.length===1&&vertex!==null?'vertex':objects.length>1?'group':e.target.hasAttribute('data-label')?'label':isLine(o)?'line':'stop',start:p,original:structuredClone(o),objects:structuredClone(objects),vertex,before:doc};render();
  }
  if(gesture)canvas.setPointerCapture(e.pointerId);
 });
 canvas.addEventListener('pointermove',e=>{
  if(!gesture){if(tool==='pen'&&draft.length){hover=snap(point(e),draft.at(-1));draw();}return;}
  if(gesture.kind==='marquee'){gesture.current=point(e);draw();return;}
  if(gesture.kind==='rubber'){const g=gesture,p=point(e);let dx=p.x-g.start.x,dy=p.y-g.start.y;if($('snap').checked){dx=Math.round(dx/20)*20;dy=Math.round(dy/20)*20;}if(!dx&&!dy)return;const next=structuredClone(g.before);try{const nextArea=D.rubberMove(next,g.area,dx,dy);doc=next;g.nextArea=nextArea;g.moved=true;draw();}catch(e){status(e.message);}return;}
  if(gesture.kind==='pan'){camera.x=gesture.camera.x-(e.clientX-gesture.start.x)/camera.k;camera.y=gesture.camera.y-(e.clientY-gesture.start.y)/camera.k;view();return;}
  const p=point(e),g=gesture,o=g.original;let dx=p.x-g.start.x,dy=p.y-g.start.y;
  if(g.kind==='stop'){g.raw=bounded({x:o.x+dx,y:o.y+dy});g.moved ||= Math.hypot(dx,dy)*camera.k>=3;if(!g.moved)return;doc=structuredClone(g.before);const n=all().find(v=>v.id===o.id),candidates=D.stationCandidates(doc,g.raw,camera.k);Object.assign(n,candidates.length===1?{x:candidates[0].x,y:candidates[0].y}:g.raw);delete n.anchor;draw();return;}
  if(g.kind==='vertex'){const origin=g.kind==='vertex'?o.points[g.vertex]:o,q=snap({x:origin.x+dx,y:origin.y+dy});dx=q.x-origin.x;dy=q.y-origin.y;}
  const previous=doc;doc=structuredClone(g.before);const n=all().find(v=>v.id===o.id);
  try{
  if(g.kind==='group'){
   const points=g.objects.flatMap(o=>isLine(o)?o.points:[o]);dx=Math.max(-Math.min(...points.map(p=>p.x)),Math.min(doc.width-Math.max(...points.map(p=>p.x)),dx));dy=Math.max(-Math.min(...points.map(p=>p.y)),Math.min(doc.height-Math.max(...points.map(p=>p.y)),dy));D.translate(doc,g.objects.map(o=>o.id),dx,dy);
  }
  else if(g.kind==='label'){n.labelDx=o.labelDx+dx;n.labelDy=o.labelDy+dy;}
  else if(g.kind==='line'){dx=Math.max(-Math.min(...o.points.map(p=>p.x)),Math.min(doc.width-Math.max(...o.points.map(p=>p.x)),dx));dy=Math.max(-Math.min(...o.points.map(p=>p.y)),Math.min(doc.height-Math.max(...o.points.map(p=>p.y)),dy));D.translate(doc,[o.id],dx,dy);}
  else if(g.kind==='vertex'){const points=structuredClone(o.points);points[g.vertex]=bounded({x:o.points[g.vertex].x+dx,y:o.points[g.vertex].y+dy});D.setLinePoints(doc,o.id,points);}
  else Object.assign(n,bounded({x:o.x+dx,y:o.y+dy}));D.validate(doc);
  }catch(e){doc=previous;status(e.message);return;}draw();
 });
 function end(e,cancel=false){if(!gesture)return;const g=gesture;gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(g.kind==='pan')return;if(g.kind==='marquee'){if(!cancel&&Math.hypot(g.current.x-g.start.x,g.current.y-g.start.y)*camera.k>=3)area=D.areaSelection(doc,{x1:g.start.x,y1:g.start.y,x2:g.current.x,y2:g.current.y});render();return;}if(g.kind==='rubber'){const result=doc;doc=g.before;if(!cancel&&g.moved){commit(d=>Object.assign(d,result));area=g.nextArea;}else if(!cancel&&g.hitId)selectOnly(g.hitId);render();return;}if(g.kind==='stop'){doc=g.before;if(!cancel&&g.moved)positionStation(g.original,g.raw);else render();return;}const result=doc;doc=g.before;if(!cancel){try{commit(d=>Object.assign(d,result));}catch(err){status(err.message);doc=history.get();render();}}else render();}
 canvas.addEventListener('pointerup',e=>end(e));canvas.addEventListener('pointercancel',e=>end(e,true));
 canvas.addEventListener('dblclick',e=>{if(area||section||e.ctrlKey||e.metaKey||e.shiftKey||space||tool!=='select'||selection.length!==1)return;const o=object();if(!isLine(o)||o.locked||e.target.dataset.id!==o.id||e.target.hasAttribute('data-vertex'))return;const p=nearest(point(e),o),points=structuredClone(o.points);points.splice(p.index,0,{x:p.x,y:p.y});attempt(d=>D.setLinePoints(d,o.id,points));});
 canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
 document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('start').onclick=()=>setTool('pen');$('finish').onclick=finish;$('cancel').onclick=()=>{cancelDraft();setTool('select');};
 function travel(redo){finishSpacing();area=null;section=null;pendingStation=null;cancelDraft();if(tool==='pen')tool='select';history[redo?'redo':'undo']();doc=history.get();pruneSelection();persist();render();}
 $('undo').onclick=()=>travel(false);$('redo').onclick=()=>travel(true);$('fit').onclick=fit;$('in').onclick=()=>zoom(1.25);$('out').onclick=()=>zoom(.8);$('snap').onchange=draw;
 $('title').onchange=e=>commit(d=>d.title=e.target.value);
 document.addEventListener('keydown',e=>{
  if(section&&e.key==='Escape'){e.preventDefault();section=null;render();return;}
  if(pendingStation&&e.key==='Escape'){e.preventDefault();const placement=pendingStation;selectOnly(placement.create?null:placement.stop.id);render();return;}

  if(e.target.closest('input,select,textarea')||e.target.isContentEditable||$('newDialog').open)return;
  if(area&&e.key==='Delete'){e.preventDefault();performAreaDelete();return;}
  if(section&&e.key==='Delete'){e.preventDefault();performSection('remove');return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();travel(e.shiftKey);return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();travel(true);return;}
  if(e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.code==='Space'){e.preventDefault();if(!gesture){space=true;canvas.style.cursor='grab';canvas.dataset.tool='hand';}return;}
  if(e.key==='Escape'){if(gesture){doc=gesture.before||doc;gesture=null;}cancelDraft();selectOnly(null);tool='select';render();}else if(e.key==='Enter'&&tool==='pen')finish();else if(e.key==='Backspace'&&tool==='pen'){e.preventDefault();if(draft.length>(extension?1:0))draft.pop();render();}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(tool!=='pen')remove();}else if(!e.ctrlKey&&!e.metaKey&&({v:'select',h:'hand',p:'pen',s:'stop'})[e.key.toLowerCase()])setTool(({v:'select',h:'hand',p:'pen',s:'stop'})[e.key.toLowerCase()]);
 });document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;canvas.style.cursor='';canvas.dataset.tool=tool;}});window.addEventListener('blur',()=>{space=false;canvas.style.cursor='';canvas.dataset.tool=tool;if(gesture){doc=gesture.before||doc;gesture=null;render();}});
 function replace(next){finishSpacing(true);history=D.history(D.validate(next));doc=history.get();selectOnly(null);cancelDraft();tool='select';persist();render();fit();}
 $('new').onclick=()=>$('newDialog').showModal();$('newDialog').addEventListener('close',()=>{if($('newDialog').returnValue==='create'){const d=D.blank();d.title=$('newTitle').value||'Nytt kart';[d.width,d.height]=$('newSize').value.split(',').map(Number);replace(d);}});
 $('template').onclick=async()=>{if(!confirm('Erstatt arbeidsflaten med en kopi av Trondheim? Lagre prosjektet først hvis du vil beholde en egen fil.'))return;try{const r=await fetch('network/trondheim-layout.json');if(!r.ok)throw Error('Kartet kunne ikke lastes');replace(D.fromTrondheim(await r.json()));}catch(e){status(e.message);}};
 function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('save').onclick=()=>{download('intransit-prosjekt.json',JSON.stringify(doc,null,2),'application/json');status('Prosjektfil lastet ned');};$('export').onclick=()=>download('intransit-kart.svg',D.svg(doc),'image/svg+xml');$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;try{if(f.size>5e6)throw Error('Prosjektfilen er for stor');const next=D.validate(JSON.parse(await f.text()));replace(next);status('Prosjekt åpnet');}catch(e){status('Kunne ikke åpne prosjekt: '+e.message);}$('file').value='';};
 new ResizeObserver(()=>view()).observe(stage);render();fit();if(warning)status(warning);
 // Read-only state for browser regressions; mutations always use the UI.
 window.InTransitStudio={snapshot:()=>structuredClone({doc,camera,selected,selection,endpoint,extension,tool,draft,pendingStation,section,area})};
})();

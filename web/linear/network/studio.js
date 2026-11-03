(async function(){
 'use strict';
 const D=InTransitStudioDocument,$=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg',key='intransit-artwork-v1';
 let initial=D.blank(),warning='';try{const saved=localStorage.getItem(key);if(saved)initial=D.validate(JSON.parse(saved));}catch{warning='Kunne ikke gjenåpne lokal kopi. Åpne en lagret prosjektfil.';}
 let history=D.history(initial),doc=history.get(),selected=null,selection=[],endpoint=null,extension=null,tool='select',draft=[],hover=null,gesture=null,space=false,serial=Date.now(),camera={x:0,y:0,k:1};
 const canvas=$('canvas'),stage=$('stage');
 const make=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
 const all=()=>[...doc.artwork.lines,...doc.artwork.stops],object=()=>all().find(o=>o.id===selected),isLine=o=>o&&Array.isArray(o.points),id=prefix=>prefix+'-'+(++serial);
 const marked=()=>all().filter(o=>selection.includes(o.id));
 function selectOnly(value){selected=value;selection=value?[value]:[];endpoint=null;}
 function choose(value,add=false){endpoint=null;if(!add){selectOnly(value);return;}if(!value)return;if(selection.includes(value))selection=selection.filter(id=>id!==value);else selection.push(value);selected=selection.at(-1)||null;}
 function cancelDraft(){draft=[];hover=null;extension=null;}
 function pruneSelection(){selection=selection.filter(id=>all().some(o=>o.id===id));selected=selection.includes(selected)?selected:selection.at(-1)||null;endpoint=null;}
 const status=s=>$('status').textContent=s;
 function persist(){try{localStorage.setItem(key,JSON.stringify(doc));status('Lagret på denne enheten');}catch{status('Lokal lagring er utilgjengelig. Bruk Lagre prosjekt.');}}
 function commit(fn){history.change(fn);doc=history.get();selection=selection.filter(id=>all().some(o=>o.id===id));selected=selection.includes(selected)?selected:selection.at(-1)||null;if(endpoint&&!selection.includes(endpoint.id))endpoint=null;persist();render();}
 function view(){canvas.setAttribute('viewBox',`${camera.x} ${camera.y} ${stage.clientWidth/camera.k} ${stage.clientHeight/camera.k}`);$('zoom').textContent=Math.round(camera.k*100)+' %';}
 function fit(){camera.k=Math.max(.05,Math.min((stage.clientWidth-64)/doc.width,(stage.clientHeight-64)/doc.height));camera.x=(doc.width-stage.clientWidth/camera.k)/2;camera.y=(doc.height-stage.clientHeight/camera.k)/2;view();}
 function zoom(f,x=stage.clientWidth/2,y=stage.clientHeight/2){const k=Math.max(.05,Math.min(6,camera.k*f));camera.x+=x/camera.k-x/k;camera.y+=y/camera.k-y/k;camera.k=k;view();draw();}
 function point(e){const r=canvas.getBoundingClientRect();return {x:camera.x+(e.clientX-r.left)/camera.k,y:camera.y+(e.clientY-r.top)/camera.k};}
 const bounded=p=>({x:Math.max(0,Math.min(doc.width,p.x)),y:Math.max(0,Math.min(doc.height,p.y))});
 function snap(p,previous){p=bounded(p);if($('snap').checked)p={x:Math.round(p.x/20)*20,y:Math.round(p.y/20)*20};if(previous&&$('angle').checked){const dx=p.x-previous.x,dy=p.y-previous.y,a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,len=Math.hypot(dx,dy);p={x:previous.x+Math.cos(a)*len,y:previous.y+Math.sin(a)*len};}return bounded(p);}
 function setTool(t){if(draft.length&&t!==tool){status('Linjetegningen ble avbrutt');cancelDraft();}tool=t;selectOnly(null);hover=null;render();}
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
   const shape=D.symbol(s),label=D.label(s);
   nodes.push(make('rect',{x:s.x-shape.width/2,y:s.y-5,width:shape.width,height:10,rx:5,fill:shape.ring?'#203c32':'white',stroke:'#203c32','stroke-width':2,transform: 'rotate('+shape.angle+' '+s.x+' '+s.y+')','data-id':s.id}));
   nodes.push(make('text',{x:label.x,y:label.y,'text-anchor':label.anchor,transform:'rotate('+label.angle+' '+label.x+' '+label.y+')','font-family':'system-ui,sans-serif','font-size':12,fill:'#203c32','data-id':s.id,'data-label':'true'},s.name));
  }
  if(draft.length){const pts=[...draft,...(hover?[hover]:[])];nodes.push(make('polyline',{points:pts.map(p=>p.x+','+p.y).join(' '),fill:'none',stroke:extension?doc.artwork.lines.find(l=>l.id===extension.id).color:'#267a59','stroke-width':extension?doc.artwork.lines.find(l=>l.id===extension.id).width:6,'stroke-linejoin':'round','stroke-dasharray':'8 4','pointer-events':'none'}));draft.forEach(p=>handles.push(make('circle',{cx:p.x,cy:p.y,r:4/camera.k,'pointer-events':'none'})));}
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
 function multiProperties(box){
  const objects=marked(),lines=objects.filter(isLine),locked=objects.some(o=>o.locked),p=document.createElement('p');p.textContent=objects.length+' objekter valgt. Ctrl-klikk legger til eller fjerner fra utvalget.';box.append(p);
  if(lines.length===objects.length){
   const selectionNote=document.createElement('p');selectionNote.textContent='Linjene er valgt hver for seg. Flervalg endrer ikke linjene. Slå sammen lager én linje; Bruk felles trasé samordner geometrien; Grupper kobler redigering. Disse tre handlingene er ikke implementert ennå.';box.append(selectionNote);
   for(const label of ['Slå sammen','Bruk felles trasé','Grupper']){const b=document.createElement('button');b.textContent=label;b.disabled=true;b.title='Ikke implementert ennå';box.append(b);}
   lineColors(box,lines);const l=document.createElement('label'),input=document.createElement('input');l.textContent='Felles linjetykkelse';input.type='number';input.min=1;input.max=40;input.value=lines.every(o=>o.width===lines[0].width)?lines[0].width:'';input.placeholder='Ulik tykkelse';input.disabled=locked;input.onchange=()=>{try{commit(d=>D.styleLines(d,selection,{width:Number(input.value)}));}catch(e){status(e.message);render();}};l.append(input);box.append(l);
   const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Felles avstand';details.append(summary);const label=document.createElement('label'),spacing=document.createElement('input');label.textContent='Avstand i kartet';spacing.type='number';spacing.value=14;spacing.min=2;spacing.max=200;label.append(spacing);details.append(label);const note=document.createElement('p');note.textContent='Legger de valgte linjene langs den første valgte linjens trasé, i valgrekkefølge. Farger og identiteter beholdes. Kan angres.';details.append(note);const b=document.createElement('button');b.textContent='Bruk felles avstand';b.disabled=locked;b.onclick=()=>{try{commit(d=>D.spaceLines(d,selection,Number(spacing.value)));}catch(e){status(e.message);}};details.append(b);box.append(details);
  }
  const del=document.createElement('button');del.textContent='Slett markerte';del.disabled=locked;del.onclick=remove;box.append(del);if(locked){const note=document.createElement('p');note.textContent='Utvalget inneholder låste lag. Lås opp eller fjern dem fra utvalget for å redigere samlet.';box.append(note);}
 }
 function properties(){
  const box=$('properties');box.replaceChildren();const o=object();let target=box;if(extension){const p=document.createElement('p');p.textContent='Du fortsetter den valgte linjen. Klikk nye punkter. Enter lagrer, Esc avbryter, og Backspace fjerner siste nye punkt.';box.append(p);return;}if(selection.length>1){multiProperties(box);return;}
  if(!o){artboard(box);const p=document.createElement('p');p.textContent=tool==='pen'?'Klikk for hvert knekkpunkt. Enter fullfører linjen. Esc avbryter.':tool==='stop'?'Klikk på kartet for å plassere et stopp. Gi stoppet navn her.':'Velg et stopp eller en linje i kartet eller laglisten. Dra for å flytte. Dobbeltklikk en valgt linje for å legge til et punkt.';box.append(p);return;}
  function field(label,type,value,fn){const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.type=type;i.value=value;i.disabled=o.locked;i.maxLength=200;i.onchange=()=>{try{commit(d=>fn(d.artwork[isLine(o)?'lines':'stops'].find(v=>v.id===o.id),i.value));}catch(e){status(e.message);render();}};l.append(i);target.append(l);return i;}
  field(isLine(o)?'Linjenavn':'Stoppnavn','text',o.name,(n,v)=>n.name=v);
  if(isLine(o)){lineColors(box,[o]);field('Linjetykkelse','number',o.width,(n,v)=>n.width=Number(v));}
  else{
   choice('Navneretning','custom',[['custom','Egen vinkel'],['horizontal','Vannrett · 0°'],['up','Skrått opp · −45°'],['down','Skrått ned · 45°'],['vertical','Loddrett · 90°'],['right','Vannrett til høyre'],['left','Vannrett til venstre']],(n,v)=>{if(v!=='custom')D.labelPreset(n,v);});
   field('Navnevinkel (0–360°)','number',o.labelAngle||0,(n,v)=>n.labelAngle=Number(v));
   choice('Navneside',o.labelSide||'right',[['right','Høyre'],['left','Venstre']],(n,v)=>{n.labelSide=v;n.labelDx=(v==='left'?-1:1)*Math.abs(n.labelDx||12);});
   choice('Stoppsymbol',o.symbol||'circle',[['circle','Sirkel'],['ring','Fylt sirkel'],['capsule','Felles stopp']],(n,v)=>n.symbol=v);
   if(o.symbol==='capsule'){field('Bredde over linjene','number',o.span||30,(n,v)=>n.span=Number(v));field('Symbolvinkel (0–360°)','number',o.symbolAngle||0,(n,v)=>n.symbolAngle=Number(v));}
   const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Nøyaktig plassering';details.append(summary);box.append(details);target=details;
   field('Navneavstand vannrett','number',o.labelDx,(n,v)=>n.labelDx=Number(v));field('Navneavstand loddrett','number',o.labelDy,(n,v)=>n.labelDy=Number(v));field('X','number',o.x,(n,v)=>n.x=Number(v));field('Y','number',o.y,(n,v)=>n.y=Number(v));target=box;
  }
  function choice(text,value,options,fn){const l=document.createElement('label'),i=document.createElement('select');l.textContent=text;i.setAttribute('aria-label',text);for(const [v,t]of options)i.add(new Option(t,v));i.value=value;i.disabled=o.locked;i.onchange=()=>commit(d=>fn(d.artwork.stops.find(n=>n.id===o.id),i.value));l.append(i);target.append(l);}
  if(isLine(o)){
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
  else if(tool==='stop'){let q=snap(p),line=doc.artwork.lines.filter(l=>l.visible&&!l.locked).map(l=>({l,p:nearest(q,l)})).sort((a,b)=>a.p.dist-b.p.dist)[0];const attached=line&&line.p.dist<14/camera.k;if(attached)q={x:line.p.x,y:line.p.y};const s={id:id('stop'),name:'Nytt stopp',...q,labelDx:12,labelDy:-12,lineIds:attached?[line.l.id]:[],visible:true,locked:false};selectOnly(s.id);tool='select';commit(d=>d.artwork.stops.push(s));const input=document.querySelector('#properties input');input.focus({preventScroll:true});input.select();return;}
  else{
   // Wide transparent hit areas and endpoint handles can overlap another route.
   // Resolve route selection by distance to the actual path, with stable paint-order ties.
   let hitId=hit?.dataset.id||null;
   if(!hitId||isLine(all().find(o=>o.id===hitId))){
    const candidates=doc.artwork.lines.filter(l=>l.visible).map((l,i)=>({id:l.id,dist:nearest(p,l).dist,i,width:l.width})).filter(l=>l.dist<=Math.max(l.width/2,8/camera.k)).sort((a,b)=>a.dist-b.dist||b.i-a.i);
    if(candidates.length)hitId=candidates[0].id;
   }
   if(e.ctrlKey||e.metaKey){choose(hitId,true);render();return;}
   if(!hitId||!selection.includes(hitId))selectOnly(hitId);
   const o=object(),vertex=e.target.dataset.id===hitId&&e.target.hasAttribute('data-vertex')?Number(e.target.dataset.vertex):null;
   endpoint=isLine(o)&&vertex!==null&&(vertex===0||vertex===o.points.length-1)?{id:o.id,index:vertex}:null;
   if(o&&!marked().some(o=>o.locked))gesture={kind:selection.length>1?'group':e.target.hasAttribute('data-label')?'label':isLine(o)?vertex!==null?'vertex':'line':'stop',start:p,original:structuredClone(o),objects:structuredClone(marked()),vertex,before:doc};render();
  }
  if(gesture)canvas.setPointerCapture(e.pointerId);
 });
 canvas.addEventListener('pointermove',e=>{
  if(!gesture){if(tool==='pen'&&draft.length){hover=snap(point(e),draft.at(-1));draw();}return;}
  if(gesture.kind==='pan'){camera.x=gesture.camera.x-(e.clientX-gesture.start.x)/camera.k;camera.y=gesture.camera.y-(e.clientY-gesture.start.y)/camera.k;view();return;}
  const p=point(e),g=gesture,o=g.original;let dx=p.x-g.start.x,dy=p.y-g.start.y;
  if(g.kind==='stop'||g.kind==='vertex'){const origin=g.kind==='vertex'?o.points[g.vertex]:o,q=snap({x:origin.x+dx,y:origin.y+dy});dx=q.x-origin.x;dy=q.y-origin.y;}
  doc=structuredClone(g.before);const n=all().find(v=>v.id===o.id);
  if(g.kind==='group'){
   const points=g.objects.flatMap(o=>isLine(o)?o.points:[o]);dx=Math.max(-Math.min(...points.map(p=>p.x)),Math.min(doc.width-Math.max(...points.map(p=>p.x)),dx));dy=Math.max(-Math.min(...points.map(p=>p.y)),Math.min(doc.height-Math.max(...points.map(p=>p.y)),dy));for(const o of g.objects){const n=all().find(n=>n.id===o.id);if(isLine(o))n.points=o.points.map(p=>({x:p.x+dx,y:p.y+dy}));else{n.x=o.x+dx;n.y=o.y+dy;}}
  }
  else if(g.kind==='label'){n.labelDx=o.labelDx+dx;n.labelDy=o.labelDy+dy;}
  else if(g.kind==='line'){dx=Math.max(-Math.min(...o.points.map(p=>p.x)),Math.min(doc.width-Math.max(...o.points.map(p=>p.x)),dx));dy=Math.max(-Math.min(...o.points.map(p=>p.y)),Math.min(doc.height-Math.max(...o.points.map(p=>p.y)),dy));n.points=o.points.map(p=>({x:p.x+dx,y:p.y+dy}));}
  else if(g.kind==='vertex')n.points[g.vertex]=bounded({x:o.points[g.vertex].x+dx,y:o.points[g.vertex].y+dy});
  else Object.assign(n,bounded({x:o.x+dx,y:o.y+dy}));draw();
 });
 function end(e,cancel=false){if(!gesture)return;const g=gesture;gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(g.kind==='pan')return;const result=doc;doc=g.before;if(!cancel){try{commit(d=>Object.assign(d,result));}catch(err){status(err.message);doc=history.get();render();}}else render();}
 canvas.addEventListener('pointerup',e=>end(e));canvas.addEventListener('pointercancel',e=>end(e,true));
 canvas.addEventListener('dblclick',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||space||tool!=='select'||selection.length!==1)return;const o=object();if(!isLine(o)||o.locked||e.target.dataset.id!==o.id||e.target.hasAttribute('data-vertex'))return;const p=nearest(point(e),o);commit(d=>d.artwork.lines.find(l=>l.id===o.id).points.splice(p.index,0,{x:p.x,y:p.y}));});
 canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
 document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('start').onclick=()=>setTool('pen');$('finish').onclick=finish;$('cancel').onclick=()=>{cancelDraft();setTool('select');};
 function travel(redo){cancelDraft();if(tool==='pen')tool='select';history[redo?'redo':'undo']();doc=history.get();pruneSelection();persist();render();}
 $('undo').onclick=()=>travel(false);$('redo').onclick=()=>travel(true);$('fit').onclick=fit;$('in').onclick=()=>zoom(1.25);$('out').onclick=()=>zoom(.8);$('snap').onchange=draw;
 $('title').onchange=e=>commit(d=>d.title=e.target.value);
 document.addEventListener('keydown',e=>{
  if(e.target.closest('input,select,textarea')||e.target.isContentEditable||$('newDialog').open)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();travel(e.shiftKey);return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();travel(true);return;}
  if(e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.code==='Space'){e.preventDefault();if(!gesture){space=true;canvas.style.cursor='grab';canvas.dataset.tool='hand';}return;}
  if(e.key==='Escape'){if(gesture){doc=gesture.before||doc;gesture=null;}cancelDraft();selectOnly(null);tool='select';render();}else if(e.key==='Enter'&&tool==='pen')finish();else if(e.key==='Backspace'&&tool==='pen'){e.preventDefault();if(draft.length>(extension?1:0))draft.pop();render();}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(tool!=='pen')remove();}else if(!e.ctrlKey&&!e.metaKey&&({v:'select',h:'hand',p:'pen',s:'stop'})[e.key.toLowerCase()])setTool(({v:'select',h:'hand',p:'pen',s:'stop'})[e.key.toLowerCase()]);
 });document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;canvas.style.cursor='';canvas.dataset.tool=tool;}});window.addEventListener('blur',()=>{space=false;canvas.style.cursor='';canvas.dataset.tool=tool;if(gesture){doc=gesture.before||doc;gesture=null;render();}});
 function replace(next){history=D.history(D.validate(next));doc=history.get();selectOnly(null);cancelDraft();tool='select';persist();render();fit();}
 $('new').onclick=()=>$('newDialog').showModal();$('newDialog').addEventListener('close',()=>{if($('newDialog').returnValue==='create'){const d=D.blank();d.title=$('newTitle').value||'Nytt kart';[d.width,d.height]=$('newSize').value.split(',').map(Number);replace(d);}});
 $('template').onclick=async()=>{if(!confirm('Erstatt arbeidsflaten med en kopi av Trondheim? Lagre prosjektet først hvis du vil beholde en egen fil.'))return;try{const r=await fetch('network/trondheim-layout.json');if(!r.ok)throw Error('Kartet kunne ikke lastes');replace(D.fromTrondheim(await r.json()));}catch(e){status(e.message);}};
 function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('save').onclick=()=>{download('intransit-prosjekt.json',JSON.stringify(doc,null,2),'application/json');status('Prosjektfil lastet ned');};$('export').onclick=()=>download('intransit-kart.svg',D.svg(doc),'image/svg+xml');$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;try{if(f.size>5e6)throw Error('Prosjektfilen er for stor');const next=D.validate(JSON.parse(await f.text()));replace(next);status('Prosjekt åpnet');}catch(e){status('Kunne ikke åpne prosjekt: '+e.message);}$('file').value='';};
 new ResizeObserver(()=>view()).observe(stage);render();fit();if(warning)status(warning);
 // Read-only state for browser regressions; mutations always use the UI.
 window.InTransitStudio={snapshot:()=>structuredClone({doc,camera,selected,selection,endpoint,extension,tool,draft})};
})();

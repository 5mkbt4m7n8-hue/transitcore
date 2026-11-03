(async function(){
 'use strict';
 const D=InTransitStudioDocument,$=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg',key='intransit-artwork-v1';
 let initial=D.blank(),warning='';try{const saved=localStorage.getItem(key);if(saved)initial=D.validate(JSON.parse(saved));}catch{warning='Kunne ikke gjenåpne lokal kopi. Åpne en lagret prosjektfil.';}
 let history=D.history(initial),doc=history.get(),selected=null,tool='select',draft=[],hover=null,gesture=null,space=false,serial=Date.now(),camera={x:0,y:0,k:1};
 const canvas=$('canvas'),stage=$('stage');
 const make=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
 const all=()=>[...doc.artwork.lines,...doc.artwork.stops],object=()=>all().find(o=>o.id===selected),isLine=o=>o&&Array.isArray(o.points),id=prefix=>prefix+'-'+(++serial);
 const status=s=>$('status').textContent=s;
 function persist(){try{localStorage.setItem(key,JSON.stringify(doc));status('Lagret på denne enheten');}catch{status('Lokal lagring er utilgjengelig. Bruk Lagre prosjekt.');}}
 function commit(fn){history.change(fn);doc=history.get();persist();render();}
 function view(){canvas.setAttribute('viewBox',`${camera.x} ${camera.y} ${stage.clientWidth/camera.k} ${stage.clientHeight/camera.k}`);$('zoom').textContent=Math.round(camera.k*100)+' %';}
 function fit(){camera.k=Math.max(.05,Math.min((stage.clientWidth-64)/doc.width,(stage.clientHeight-64)/doc.height));camera.x=(doc.width-stage.clientWidth/camera.k)/2;camera.y=(doc.height-stage.clientHeight/camera.k)/2;view();}
 function zoom(f,x=stage.clientWidth/2,y=stage.clientHeight/2){const k=Math.max(.05,Math.min(6,camera.k*f));camera.x+=x/camera.k-x/k;camera.y+=y/camera.k-y/k;camera.k=k;view();draw();}
 function point(e){const r=canvas.getBoundingClientRect();return {x:camera.x+(e.clientX-r.left)/camera.k,y:camera.y+(e.clientY-r.top)/camera.k};}
 const bounded=p=>({x:Math.max(0,Math.min(doc.width,p.x)),y:Math.max(0,Math.min(doc.height,p.y))});
 function snap(p,previous){p=bounded(p);if($('snap').checked)p={x:Math.round(p.x/20)*20,y:Math.round(p.y/20)*20};if(previous&&$('angle').checked){const dx=p.x-previous.x,dy=p.y-previous.y,a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,len=Math.hypot(dx,dy);p={x:previous.x+Math.cos(a)*len,y:previous.y+Math.sin(a)*len};}return bounded(p);}
 function setTool(t){if(draft.length&&t!==tool){status('Linjetegningen ble avbrutt');draft=[];}tool=t;selected=null;hover=null;render();}
 function draw(){
  $('paper').replaceChildren(make('rect',{x:0,y:0,width:doc.width,height:doc.height,fill:'white'}),...($('snap').checked?[make('rect',{x:0,y:0,width:doc.width,height:doc.height,fill:'url(#grid)'})]:[]));
  const nodes=[],handles=[];
  for(const l of doc.artwork.lines.filter(l=>l.visible)){
   const points=l.points.map(p=>p.x+','+p.y).join(' ');
   if(l.id===selected)nodes.push(make('polyline',{points,fill:'none',stroke:'#98cdb7','stroke-width':l.width+7,'stroke-linejoin':'round','stroke-linecap':'round','pointer-events':'none'}));
   nodes.push(make('polyline',{points,fill:'none',stroke:l.color,'stroke-width':l.width,'stroke-linejoin':'round','stroke-linecap':'round','data-id':l.id}));
   nodes.push(make('polyline',{points,fill:'none',stroke:'transparent','stroke-width':Math.max(l.width,16/camera.k),'data-id':l.id}));
   if(l.id===selected&&!l.locked)l.points.forEach((p,i)=>handles.push(make('circle',{cx:p.x,cy:p.y,r:5/camera.k,'data-id':l.id,'data-vertex':i})));
  }
  for(const s of doc.artwork.stops.filter(s=>s.visible)){
   if(s.id===selected)nodes.push(make('circle',{cx:s.x,cy:s.y,r:11,fill:'#bcdfcb','pointer-events':'none'}));
   const shape=D.symbol(s),label=D.label(s);
   nodes.push(make('rect',{x:s.x-shape.width/2,y:s.y-5,width:shape.width,height:10,rx:5,fill:shape.ring?'#203c32':'white',stroke:'#203c32','stroke-width':2,transform: 'rotate('+shape.angle+' '+s.x+' '+s.y+')','data-id':s.id}));
   nodes.push(make('text',{x:label.x,y:label.y,'text-anchor':label.anchor,transform:'rotate('+label.angle+' '+label.x+' '+label.y+')','font-family':'system-ui,sans-serif','font-size':12,fill:'#203c32','data-id':s.id,'data-label':'true'},s.name));
  }
  if(draft.length){const pts=[...draft,...(hover?[hover]:[])];nodes.push(make('polyline',{points:pts.map(p=>p.x+','+p.y).join(' '),fill:'none',stroke:'#267a59','stroke-width':6,'stroke-linejoin':'round','stroke-dasharray':'8 4','pointer-events':'none'}));draft.forEach(p=>handles.push(make('circle',{cx:p.x,cy:p.y,r:4/camera.k,'pointer-events':'none'})));}
  $('art').replaceChildren(...nodes);$('handles').replaceChildren(...handles);
  $('welcome').hidden=all().length>0||draft.length>0||tool==='pen'||tool==='stop';
 }
 function artboard(box){
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Tegneområde';details.append(summary);
  const w=document.createElement('input'),h=document.createElement('input');w.type=h.type='number';w.value=doc.width;h.value=doc.height;w.min=h.min=100;w.max=h.max=10000;w.id='artWidth';h.id='artHeight';
  for(const [text,i]of [['Bredde',w],['Høyde',h]]){const l=document.createElement('label');l.textContent=text;l.append(i);details.append(l);}
  const apply=document.createElement('button');apply.textContent='Endre tegneområde';apply.onclick=()=>{try{commit(d=>D.resize(d,Number(w.value),Number(h.value)));}catch(e){status('Området må være 100–10000 og romme alle punktene.');}};
  const swap=document.createElement('button');swap.textContent='Bytt bredde og høyde';swap.onclick=()=>{const v=w.value;w.value=h.value;h.value=v;};details.append(swap,apply);const arrange=document.createElement('button');arrange.textContent='Foreslå navneplassering';arrange.onclick=()=>commit(d=>D.arrangeLabels(d));details.append(arrange);const p=document.createElement('p');p.textContent='Kartkoordinater, uavhengig av tavlens cm-format. Punktene flyttes ikke. Bruk Tilpass kart for å se hele området.';details.append(p);box.append(details);
 }
 function properties(){
  const box=$('properties');box.replaceChildren();const o=object();let target=box;
  if(!o){artboard(box);const p=document.createElement('p');p.textContent=tool==='pen'?'Klikk for hvert knekkpunkt. Enter fullfører linjen. Esc avbryter.':tool==='stop'?'Klikk på kartet for å plassere et stopp. Gi stoppet navn her.':'Velg et stopp eller en linje i kartet eller laglisten. Dra for å flytte. Dobbeltklikk en valgt linje for å legge til et punkt.';box.append(p);return;}
  function field(label,type,value,fn){const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.type=type;i.value=value;i.disabled=o.locked;i.maxLength=200;i.onchange=()=>{try{commit(d=>fn(d.artwork[isLine(o)?'lines':'stops'].find(v=>v.id===o.id),i.value));}catch(e){status(e.message);render();}};l.append(i);target.append(l);return i;}
  field(isLine(o)?'Linjenavn':'Stoppnavn','text',o.name,(n,v)=>n.name=v);
  if(isLine(o)){field('Linjefarge','color',o.color,(n,v)=>n.color=v);field('Linjetykkelse','number',o.width,(n,v)=>n.width=Number(v));}
  else{
   field('Navnevinkel (0–360°)','number',o.labelAngle||0,(n,v)=>n.labelAngle=Number(v));
   choice('Navneside',o.labelSide||'right',[['right','Høyre'],['left','Venstre']],(n,v)=>{n.labelSide=v;n.labelDx=(v==='left'?-1:1)*Math.abs(n.labelDx||12);});
   choice('Stoppsymbol',o.symbol||'circle',[['circle','Sirkel'],['ring','Fylt sirkel'],['capsule','Felles stopp']],(n,v)=>n.symbol=v);
   if(o.symbol==='capsule'){field('Bredde over linjene','number',o.span||30,(n,v)=>n.span=Number(v));field('Symbolvinkel (0–360°)','number',o.symbolAngle||0,(n,v)=>n.symbolAngle=Number(v));}
   const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Nøyaktig plassering';details.append(summary);box.append(details);target=details;
   field('Navneavstand vannrett','number',o.labelDx,(n,v)=>n.labelDx=Number(v));field('Navneavstand loddrett','number',o.labelDy,(n,v)=>n.labelDy=Number(v));field('X','number',o.x,(n,v)=>n.x=Number(v));field('Y','number',o.y,(n,v)=>n.y=Number(v));target=box;
  }
  function choice(text,value,options,fn){const l=document.createElement('label'),i=document.createElement('select');l.textContent=text;i.setAttribute('aria-label',text);for(const [v,t]of options)i.add(new Option(t,v));i.value=value;i.disabled=o.locked;i.onchange=()=>commit(d=>fn(d.artwork.stops.find(n=>n.id===o.id),i.value));l.append(i);target.append(l);}
  if(isLine(o)){
   const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Parallelle linjekopier';details.append(summary);
   const count=document.createElement('input'),spacing=document.createElement('input');count.type=spacing.type='number';count.value=1;count.min=1;count.max=8;spacing.value=14;spacing.min=2;spacing.max=200;
   for(const [text,input]of [['Antall ekstra linjer',count],['Avstand i kartet',spacing]]){const l=document.createElement('label');l.textContent=text;l.append(input);details.append(l);}
   const b=document.createElement('button');b.textContent='Lag parallelle kopier';b.disabled=o.locked;b.onclick=()=>{try{const n=Number(count.value);if(!Number.isInteger(n)||n<1||n>8)throw Error('Velg 1–8 kopier');commit(d=>D.parallel(d,o.id,n,Number(spacing.value),Array.from({length:n},()=>id('line'))));}catch(e){status(e.message);}};details.append(b);const p=document.createElement('p');p.textContent='Kopiene får egne farger og kan velges og redigeres separat. Avstanden gjelder når kopiene lages. Felles stopp tegnes én gang med symbolet «Felles stopp».';details.append(p);box.append(details);
  }
  const p=document.createElement('p');p.textContent=o.locked?'Laget er låst. Lås det opp i laglisten.':isLine(o)?'Dra punktene for å forme linjen. Dra linjen for å flytte hele laget.':'Dra stoppet for å flytte det. Dra navnet separat.';box.append(p);
  const del=document.createElement('button');del.textContent='Slett '+(isLine(o)?'linje':'stopp');del.disabled=o.locked;del.onclick=remove;box.append(del);
 }
 function layers(){const box=$('layers');box.replaceChildren();$('count').textContent=all().length;for(const o of all().slice().reverse()){
  const row=document.createElement('div');row.dataset.selected=String(o.id===selected);
  const pick=document.createElement('button');pick.className='pick';pick.textContent=(isLine(o)?'━ ':'○ ')+o.name;pick.title=o.name;pick.onclick=()=>{selected=o.id;tool='select';draft=[];render();};row.append(pick);
  for(const [prop,label,on,off]of [['visible','Synlighet','◉','○'],['locked','Lås','🔒','◇']]){const b=document.createElement('button');b.className='toggle';b.textContent=o[prop]?on:off;b.setAttribute('aria-label',label+' '+o.name);b.setAttribute('aria-pressed',String(o[prop]));b.onclick=()=>commit(d=>{d.artwork[isLine(o)?'lines':'stops'].find(v=>v.id===o.id)[prop]=!o[prop];});row.append(b);}box.append(row);
 }}
 function render(){draw();properties();layers();$('title').value=doc.title;canvas.dataset.tool=tool;document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));$('undo').disabled=!history.canUndo();$('redo').disabled=!history.canRedo();$('finish').hidden=tool!=='pen';$('finish').disabled=draft.length<2;$('cancel').hidden=tool!=='pen';$('hint').textContent=tool==='pen'?'Klikk punkter → Enter fullfører · Esc avbryter':tool==='stop'?'Klikk for å plassere stopp → gi det navn i Egenskaper':tool==='hand'?'Dra for å panorere · hjul zoomer rundt pekeren':'Velg og dra · mellomrom panorerer · hjul zoomer';const b=doc.bindings[selected];$('binding').textContent=b?'Kopiert fra Trondheim. Kilde: '+b.sourceId+'. '+b.quayIds.length+' plattformkoblinger beholdt. Grafisk flytting endrer ikke kilden.':'Ingen sanntidskobling. Dette er et fritt grafisk objekt.';view();}
 function remove(){const o=object();if(!o||o.locked)return;commit(d=>{d.artwork[isLine(o)?'lines':'stops']=d.artwork[isLine(o)?'lines':'stops'].filter(v=>v.id!==o.id);delete d.bindings[o.id];if(isLine(o))d.artwork.stops.forEach(s=>s.lineIds=s.lineIds.filter(id=>id!==o.id));});selected=null;render();}
 function finish(){if(draft.length<2)return;const line={id:id('line'),name:'Linje '+(doc.artwork.lines.length+1),color:['#218967','#e08a3b','#6e68bb','#cc5271'][doc.artwork.lines.length%4],width:6,visible:true,locked:false,points:structuredClone(draft)};draft=[];selected=line.id;tool='select';commit(d=>d.artwork.lines.push(line));document.querySelector('#properties input').focus({preventScroll:true});}
 function nearest(p,line){let best=null;line.points.slice(1).forEach((b,i)=>{const a=line.points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))),q={x:a.x+t*dx,y:a.y+t*dy},dist=Math.hypot(q.x-p.x,q.y-p.y);if(!best||dist<best.dist)best={...q,dist,index:i+1};});return best;}
 canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==1)return;e.preventDefault();canvas.focus({preventScroll:true});const p=point(e),hit=e.target.closest('[data-id]');
  if(tool==='hand'||space||e.button===1){gesture={kind:'pan',start:{x:e.clientX,y:e.clientY},camera:{...camera}};}
  else if(tool==='pen'){const q=snap(p,draft.at(-1));if(!draft.length||Math.hypot(q.x-draft.at(-1).x,q.y-draft.at(-1).y)>1)draft.push(q);hover=null;render();return;}
  else if(tool==='stop'){let q=snap(p),line=doc.artwork.lines.filter(l=>l.visible&&!l.locked).map(l=>({l,p:nearest(q,l)})).sort((a,b)=>a.p.dist-b.p.dist)[0];const attached=line&&line.p.dist<14/camera.k;if(attached)q={x:line.p.x,y:line.p.y};const s={id:id('stop'),name:'Nytt stopp',...q,labelDx:12,labelDy:-12,lineIds:attached?[line.l.id]:[],visible:true,locked:false};selected=s.id;tool='select';commit(d=>d.artwork.stops.push(s));const input=document.querySelector('#properties input');input.focus({preventScroll:true});input.select();return;}
  else{selected=hit?.dataset.id||null;const o=object();if(o&&!o.locked)gesture={kind:e.target.hasAttribute('data-label')?'label':isLine(o)?e.target.hasAttribute('data-vertex')?'vertex':'line':'stop',start:p,original:structuredClone(o),vertex:Number(e.target.dataset.vertex),before:doc};render();}
  if(gesture)canvas.setPointerCapture(e.pointerId);
 });
 canvas.addEventListener('pointermove',e=>{
  if(!gesture){if(tool==='pen'&&draft.length){hover=snap(point(e),draft.at(-1));draw();}return;}
  if(gesture.kind==='pan'){camera.x=gesture.camera.x-(e.clientX-gesture.start.x)/camera.k;camera.y=gesture.camera.y-(e.clientY-gesture.start.y)/camera.k;view();return;}
  const p=point(e),g=gesture,o=g.original;let dx=p.x-g.start.x,dy=p.y-g.start.y;
  if(g.kind==='stop'||g.kind==='vertex'){const origin=g.kind==='vertex'?o.points[g.vertex]:o,q=snap({x:origin.x+dx,y:origin.y+dy});dx=q.x-origin.x;dy=q.y-origin.y;}
  doc=structuredClone(g.before);const n=all().find(v=>v.id===o.id);
  if(g.kind==='label'){n.labelDx=o.labelDx+dx;n.labelDy=o.labelDy+dy;}
  else if(g.kind==='line'){dx=Math.max(-Math.min(...o.points.map(p=>p.x)),Math.min(doc.width-Math.max(...o.points.map(p=>p.x)),dx));dy=Math.max(-Math.min(...o.points.map(p=>p.y)),Math.min(doc.height-Math.max(...o.points.map(p=>p.y)),dy));n.points=o.points.map(p=>({x:p.x+dx,y:p.y+dy}));}
  else if(g.kind==='vertex')n.points[g.vertex]=bounded({x:o.points[g.vertex].x+dx,y:o.points[g.vertex].y+dy});
  else Object.assign(n,bounded({x:o.x+dx,y:o.y+dy}));draw();
 });
 function end(e,cancel=false){if(!gesture)return;const g=gesture;gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(g.kind==='pan')return;const result=doc;doc=g.before;if(!cancel){try{commit(d=>Object.assign(d,result));}catch(err){status(err.message);doc=history.get();render();}}else render();}
 canvas.addEventListener('pointerup',e=>end(e));canvas.addEventListener('pointercancel',e=>end(e,true));
 canvas.addEventListener('dblclick',e=>{if(space||tool!=='select')return;const o=object();if(!isLine(o)||o.locked||e.target.dataset.id!==o.id||e.target.hasAttribute('data-vertex'))return;const p=nearest(point(e),o);commit(d=>d.artwork.lines.find(l=>l.id===o.id).points.splice(p.index,0,{x:p.x,y:p.y}));});
 canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
 document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('start').onclick=()=>setTool('pen');$('finish').onclick=finish;$('cancel').onclick=()=>{draft=[];setTool('select');};
 function travel(redo){draft=[];history[redo?'redo':'undo']();doc=history.get();if(!object())selected=null;persist();render();}
 $('undo').onclick=()=>travel(false);$('redo').onclick=()=>travel(true);$('fit').onclick=fit;$('in').onclick=()=>zoom(1.25);$('out').onclick=()=>zoom(.8);$('snap').onchange=draw;
 $('title').onchange=e=>commit(d=>d.title=e.target.value);
 document.addEventListener('keydown',e=>{
  if(e.target.closest('input,select,textarea')||e.target.isContentEditable||$('newDialog').open)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();travel(e.shiftKey);return;}
  if(e.code==='Space'){e.preventDefault();if(!gesture){space=true;canvas.style.cursor='grab';canvas.dataset.tool='hand';}return;}
  if(e.key==='Escape'){draft=[];selected=null;tool='select';render();}else if(e.key==='Enter'&&tool==='pen')finish();else if(e.key==='Backspace'&&tool==='pen'){e.preventDefault();draft.pop();render();}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}else if(!e.ctrlKey&&!e.metaKey&&({v:'select',h:'hand',p:'pen',s:'stop'})[e.key.toLowerCase()])setTool(({v:'select',h:'hand',p:'pen',s:'stop'})[e.key.toLowerCase()]);
 });document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;canvas.style.cursor='';canvas.dataset.tool=tool;}});window.addEventListener('blur',()=>{space=false;canvas.style.cursor='';});
 function replace(next){history=D.history(D.validate(next));doc=history.get();selected=null;draft=[];tool='select';persist();render();fit();}
 $('new').onclick=()=>$('newDialog').showModal();$('newDialog').addEventListener('close',()=>{if($('newDialog').returnValue==='create'){const d=D.blank();d.title=$('newTitle').value||'Nytt kart';[d.width,d.height]=$('newSize').value.split(',').map(Number);replace(d);}});
 $('template').onclick=async()=>{if(!confirm('Erstatt arbeidsflaten med en kopi av Trondheim? Lagre prosjektet først hvis du vil beholde en egen fil.'))return;try{const r=await fetch('network/trondheim-layout.json');if(!r.ok)throw Error('Kartet kunne ikke lastes');replace(D.fromTrondheim(await r.json()));}catch(e){status(e.message);}};
 function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 $('save').onclick=()=>{download('intransit-prosjekt.json',JSON.stringify(doc,null,2),'application/json');status('Prosjektfil lastet ned');};$('export').onclick=()=>download('intransit-kart.svg',D.svg(doc),'image/svg+xml');$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{const f=$('file').files[0];if(!f)return;try{if(f.size>5e6)throw Error('Prosjektfilen er for stor');const next=D.validate(JSON.parse(await f.text()));replace(next);status('Prosjekt åpnet');}catch(e){status('Kunne ikke åpne prosjekt: '+e.message);}$('file').value='';};
 new ResizeObserver(()=>view()).observe(stage);render();fit();if(warning)status(warning);
 // Read-only state for browser regressions; mutations always use the UI.
 window.InTransitStudio={snapshot:()=>structuredClone({doc,camera,selected,tool,draft})};
})();

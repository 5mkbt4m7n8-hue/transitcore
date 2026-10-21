(function(root){
 'use strict';
 const NS='http://www.w3.org/2000/svg',M=root.InTransitMapModel,S=root.TransitCoreSignals;
 const el=(tag,attrs={})=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 function download(name,text){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 root.InTransitNetwork={async create(host){
  const response=await fetch('network/trondheim-layout.json');if(!response.ok)throw Error('Kartlayout HTTP '+response.status);
  const initial=await response.json();const errors=M.validate(initial);if(errors.length)throw Error(errors.join(', '));
  host.innerHTML=`<div class="map-shell"><div class="map-toolbar"><button data-act="in" aria-label="Zoom inn">+</button><button data-act="out" aria-label="Zoom ut">−</button><button data-act="fit">Tilpass hele kartet</button><label class="map-toggle"><input type="checkbox" data-role="reference"> Vis originaltegningen</label><label class="map-toggle"><input type="checkbox" data-role="routeColors" checked> Vis dokumenterte rutefarger</label><label class="map-toggle"><input type="checkbox" data-role="largeLabels"> Større navn</label><label class="map-review-label">Gjennomgå linje <select data-role="reviewPath" aria-label="Velg kartlinje for kvalitetssjekk"></select></label><select data-role="focus" aria-label="Fokus på holdeplass"></select><button data-act="edit" aria-pressed="false">Rediger kart</button><button data-act="export">Eksporter JSON</button><label>Importer JSON <input data-role="import" type="file" accept="application/json,.json"></label></div><p class="map-warning" data-role="notice"></p><div class="map-editor" id="networkEditor" hidden><button data-act="undo">Angre</button><button data-act="discard">Forkast endringer</button><button data-act="save">Lagre arbeidskopi</button><button data-act="restore">Hent arbeidskopi</button><div data-role="fields"></div></div><svg class="map-viewport" aria-label="InTransit Trondheim nettverkskart" role="img"></svg><p data-role="summary"></p><pre class="map-details" data-role="details" aria-live="polite"></pre><details><summary>Stoppmapping og datavalidering</summary><pre class="map-details" data-role="report"></pre><button data-act="report">Eksporter valideringsrapport</button></details></div>`;
  const q=r=>host.querySelector(`[data-role="${r}"]`),svg=host.querySelector('svg'),editorPanel=host.querySelector('#networkEditor');
  let layout=initial,context={},editing=false,selection=null,drag=null,box=[0,0,913,1280],phase=0,report={},frame=null;
  const routeReview=q('reviewPath'),reference=q('reference'),routeColors=q('routeColors'),largeLabels=q('largeLabels');
  const editor=root.InTransitMapEditor(initial,next=>{layout=next;draw();fields();});
  const setBox=()=>svg.setAttribute('viewBox',box.join(' '));
  function zoom(f,cx=box[0]+box[2]/2,cy=box[1]+box[3]/2){const w=Math.min(1826,Math.max(40,box[2]*f)),h=w*1280/913;box=[cx-(cx-box[0])*w/box[2],cy-(cy-box[1])*h/box[3],w,h];setBox();}
  function coords(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
  function details(stop){const values=M.signals(stop,context.board,context.hardware,frame,context.all?null:context.line),age=(Date.now()-Date.parse(frame?.generatedAt))/1000;
   q('details').textContent=stop.name+'\n'+(stop.verification!=='confirmed'?'Uavklart navn / ID. Ingen live-kobling.':values.length?values.map(v=>`Linje ${v.line||'?'} · ${v.destination||'Ukjent destinasjon'} · buss ${v.id||'ikke oppgitt'} · ${v.state}\nKilde: ${v.source||'ikke oppgitt'} · observasjonsalder: ${v.ageSeconds??'ukjent'} s`).join('\n'):'OFF · ingen aktiv gyldig observasjon; bekrefter ikke tom holdeplass.')+`\nFrame-alder: ${Number.isFinite(age)?Math.floor(age)+' s':'ingen frame'}`;
  }
  function draw(){
   svg.replaceChildren();setBox();svg.classList.toggle('map-big-labels',largeLabels.checked);
   // Only a repository-relative, supplied reference image can be displayed.
   if(layout.reference?.available&&/^\.\/assets\/[\w.-]+\.(png|jpg|svg|webp)$/.test(layout.reference.path||''))svg.append(el('image',{href:layout.reference.path,x:0,y:0,width:913,height:1280,opacity:reference.checked?.55:editing?.28:.08}));
   for(const path of layout.paths){if(path.routes.length&&!context.all&&!path.routes.includes(context.route))continue;
    const p=el('polyline',{points:path.points.map(p=>p.x+','+p.y).join(' '),stroke:path.color,'stroke-width':path.width,class:'map-route',tabindex:0,'aria-label':path.id});
    p.onclick=()=>{selection={type:'path',id:path.id};fields();q('details').textContent=path.id+'\n'+(path.routes.join(', ')||'Linjetilknytning uavklart');};p.dataset.routePath=path.id;svg.append(p);
    if(editing)path.points.forEach((v,i)=>{const h=el('circle',{cx:v.x,cy:v.y,r:4,class:'map-handle'});h.dataset.path=path.id;h.dataset.index=i;svg.append(h);});
   }
   // Overlay only edges with direct Quay-to-Quay adjacency in loaded profiles.
   // This does not establish the route of an entire polyline or live coverage.
   const edges=M.verifiedSegments(layout,context.profiles||[]);
   let drawn=0;
   for(const edge of edges){
    const routes=context.all?edge.routes:edge.routes.filter(r=>r.id===context.route);
    if(!routes.length||!routeColors.checked)continue;
    const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,len=Math.hypot(dx,dy);if(len<0.1)continue;
    drawn++;
    routes.forEach((route,i)=>{
     const offset=(i-(routes.length-1)/2)*2,ox=-dy/len*offset,oy=dx/len*offset;
     const stroke=el('line',{x1:edge.a.x+ox,y1:edge.a.y+oy,x2:edge.b.x+ox,y2:edge.b.y+oy,stroke:route.color,'stroke-width':1.8,class:'map-route-confirmed','data-route':route.id,'data-path':edge.pathId,'data-edge':edge.edgeIndex,'aria-label':'Linje '+route.line+' · nabostopp i ruteprofil'});
     stroke.dataset.routeEvidence='consecutive-quays';svg.append(stroke);
    });
   }
   for(const stop of layout.stops){
    const resolved=M.resolve(stop,context.board,context.hardware);
    if(stop.verification==='confirmed'&&!context.all&&!resolved.some(b=>b.node.routes.includes(context.route)))continue;
    const directions=stop.diodeMode==='split'?['0','1']:[null];
    directions.forEach((id,i)=>{const group=el('g',{class:'map-stop',transform:`translate(${stop.x+(id===null?0:(i?1:-1)*(stop.radius+2))} ${stop.y})`,tabindex:0,role:'button','aria-label':stop.name});if(stop.verification!=='confirmed')group.setAttribute('data-unresolved','true');group.dataset.stop=stop.id;if(id!==null)group.dataset.direction=id;group.append(el('circle',{r:stop.radius}));group.append(el('text',{y:2}));group.onclick=()=>{selection={type:'stop',id:stop.id};fields();details(stop);};group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();group.onclick();}};svg.append(group);});
    if(stop.label.visible){const label=el('text',{x:stop.label.x,y:stop.label.y,class:'map-label'});label.textContent=stop.name;label.dataset.label=stop.id;svg.append(label);}
   }
   q('focus').replaceChildren(new Option('Fokus på punkt …',''),...layout.stops.map(s=>new Option(s.name,s.id)));
   const currentPath=routeReview.value;
   routeReview.replaceChildren(new Option('Gjennomgå kartlinje …',''),...layout.paths.map(p=>new Option(p.id+' · '+edges.filter(e=>e.pathId===p.id).length+'/'+(p.points.length-1)+' nabokoblinger',p.id)));
   routeReview.value=layout.paths.some(p=>p.id===currentPath)?currentPath:'';
   report=M.report(layout,context.boards||[]);
    report.routeEvidence={method:'consecutive exact Quay IDs in route profiles',drawn,possibleEdges:layout.paths.reduce((count,p)=>count+Math.max(0,p.points.length-1),0),edges:edges.map(e=>({path:e.pathId,edge:e.edgeIndex,from:e.from,to:e.to,routes:e.routes.map(r=>r.id)})),byPath:layout.paths.map(p=>({id:p.id,documented:edges.filter(e=>e.pathId===p.id).length,segments:Math.max(0,p.points.length-1),fullRouteVerified:false}))};
    q('report').textContent=JSON.stringify(report,null,2);
   q('notice').textContent='Kartet er delvis verifisert: '+report.unconfirmed.length+' stopp uten datakobling, '+report.unconfirmedNames.length+' uten navn. '+edges.length+'/'+report.routeEvidence.possibleEdges+' naboforbindelser dokumentert i rutekonfigurasjon; '+drawn+' vist med farge for valgte ruter. Andre segmenter er nøytrale. Ingen av de 18 hele linjeføringene eller full live-dekning er bekreftet.';
   paint();
  }
  function paint(){
   let all=[];
   for(const group of svg.querySelectorAll('.map-stop')){const stop=layout.stops.find(s=>s.id===group.dataset.stop),values=M.signals(stop,context.board,context.hardware,frame,context.all?null:context.line,Date.now(),group.dataset.direction?{route:context.all?null:context.route,routesByLine:context.routesByLine,id:group.dataset.direction}:null);all.push(...values);
    const max=Math.max(0,...values.map(v=>S.priority(v.state))),choices=values.filter(v=>S.priority(v.state)===max),v=choices.length?choices[phase%choices.length]:null;
    group.dataset.state=v?.state||'OFF';const rgb=v?.rgb;group.style.color=Array.isArray(rgb)&&rgb.length===3&&rgb.every(n=>Number.isInteger(n)&&n>=0&&n<=255)?`rgb(${rgb.join(',')})`:'#70839a';group.querySelector('text').textContent=context.numbers&&v?String(v.line||'?'):'';
   }
   const active=all.filter(v=>v.state!=='PASSED'),known=active.every(v=>v.id),count=new Set(active.map(v=>v.id)).size;
   q('summary').textContent=`${layout.stops.length} kartpunkter · ${report.unmapped?.length||0} uten kobling · `+(known&&active.length?`${count} identifiserte aktive busser i kartets tilgjengelige feed`:'Aktivt bussantall ikke bekreftet')+' · Linjevalg bruker eksisterende Linear-feed; dekning av alle kartlinjer er ikke bekreftet.';
   if(selection?.type==='stop')details(layout.stops.find(s=>s.id===selection.id));
  }

  function reviewPath(id){
   const p=layout.paths.find(p=>p.id===id);if(!p)return;
   selection={type:'path',id};fields();
   const known=M.verifiedSegments(layout,context.profiles||[]).filter(e=>e.pathId===id);
   q('details').textContent=p.id+' · '+known.length+' av '+(p.points.length-1)+' delstrekninger med dokumentert naboskap i ruteprofil.\n'+
    (known.length?known.map(e=>'Del '+(e.edgeIndex+1)+': '+(layout.stops.find(s=>s.id===e.from)?.name||e.from)+' → '+(layout.stops.find(s=>s.id===e.to)?.name||e.to)+' · buss '+e.routes.map(r=>r.line).join(', ')).join('\n'):'Ingen dokumenterte Quay-nabostopp.')+
    '\nDette bekrefter ikke komplett trasé eller live-GPS.';
   const vs=p.points,xs=vs.map(v=>v.x),ys=vs.map(v=>v.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
   const w=Math.min(913,Math.max(110,Math.max(...xs)-Math.min(...xs)+45,(Math.max(...ys)-Math.min(...ys)+45)*913/1280));
   box=[cx-w/2,cy-w*1280/913/2,w,w*1280/913];setBox();
  }
  function fields(){
   const area=q('fields');area.replaceChildren();if(!editing||!selection)return;
   const item=(selection.type==='stop'?layout.stops:layout.paths).find(s=>s.id===selection.id);if(!item)return;
   function input(title,value,type,change){const label=document.createElement('label');label.textContent=title;const control=document.createElement('input');control.type=type;if(type==='checkbox')control.checked=value;else control.value=value;control.onchange=()=>{try{editor.change(next=>change(next,type==='checkbox'?control.checked:type==='number'?Number(control.value):control.value));}catch(e){q('details').textContent=e.message;fields();}};label.append(control);area.append(label);}
   const pick=next=>(selection.type==='stop'?next.stops:next.paths).find(s=>s.id===selection.id);
   if(selection.type==='path'){input('Farge',item.color,'color',(n,v)=>pick(n).color=v);input('Linjetykkelse',item.width,'number',(n,v)=>pick(n).width=v);return;}
   input('Kartetikett',item.name,'text',(n,v)=>pick(n).name=v);input('Punktstørrelse',item.radius,'number',(n,v)=>pick(n).radius=v);input('Vis etikett',item.label.visible,'checkbox',(n,v)=>pick(n).label.visible=v);input('To dioder',item.diodeMode==='split','checkbox',(n,v)=>pick(n).diodeMode=v?'split':'shared');
   const label=document.createElement('label');label.textContent='Godkjent stasjon fra eksisterende konfigurasjon';const select=document.createElement('select');select.append(new Option('Velg bekreftet kartpunkt …',''));
   for(const board of context.boards||[]){const seen=new Set;for(const node of board.nodes){if(seen.has(node.stationId))continue;seen.add(node.stationId);select.append(new Option(board.id+' · '+node.name,board.id+'|'+node.stationId));}}
   select.onchange=()=>{if(!select.value)return;const [bid,sid]=select.value.split('|'),b=context.boards.find(b=>b.id===bid);editor.change(next=>{const s=pick(next),nodes=b.nodes.filter(n=>n.stationId===sid);if(!s.nameConfirmed){s.name=nodes[0].name;s.nameConfirmed=true;}s.verification='confirmed';s.bindings=s.bindings.filter(b=>b.boardId!==bid).concat(nodes.flatMap(n=>(n.stopIds||[]).map(stopId=>({boardId:bid,nodeId:n.id,stationId:sid,stopId}))));});};label.append(select);area.append(label);
   // Individual quays stay editable even when several markers share one StopPlace.
   const activeBoard=context.board,stationIds=new Set(item.bindings.filter(b=>b.boardId===activeBoard?.id).map(b=>b.stationId));
   for(const node of activeBoard?.nodes||[]){if(!stationIds.has(node.stationId))continue;
    const row=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=item.bindings.some(b=>b.boardId===activeBoard.id&&b.nodeId===node.id);row.append(check,document.createTextNode('Plattform '+(node.quayId||node.id)));
    check.onchange=()=>editor.change(next=>{const stop=pick(next);stop.bindings=stop.bindings.filter(b=>b.boardId!==activeBoard.id||b.nodeId!==node.id);if(check.checked)stop.bindings.push(...(node.stopIds||[]).map(stopId=>({boardId:activeBoard.id,nodeId:node.id,stationId:node.stationId,stopId})));stop.verification=stop.bindings.length?'confirmed':'unresolved';});area.append(row);
   }
  }
  host.querySelectorAll('[data-act]').forEach(button=>button.onclick=()=>{try{switch(button.dataset.act){
   case'in':zoom(.75);break;case'out':zoom(1.33);break;case'fit':box=[0,0,913,1280];setBox();break;
   case'edit':editing=!editing;editorPanel.hidden=!editing;button.setAttribute('aria-pressed',editing);draw();fields();break;
   case'undo':editor.undo();break;case'discard':editor.discard();break;case'export':download('trondheim-layout.json',editor.export());break;
   case'report':download('trondheim-mapping-report.json',JSON.stringify(report,null,2));break;
   case'save':localStorage.setItem('intransit-map-draft-v1',editor.export());break;
   case'restore':{const data=localStorage.getItem('intransit-map-draft-v1');if(data)editor.import(JSON.parse(data));break;}
  }}catch(e){q('details').textContent=e.message;}});
  q('import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2000000)throw Error('JSON er for stor');editor.import(JSON.parse(await file.text()));}catch(error){q('details').textContent=error.message;}finally{e.target.value='';}};
  q('focus').onchange=()=>{const s=layout.stops.find(s=>s.id===q('focus').value);if(s){box=[s.x-80,s.y-112,160,224];setBox();details(s);}};
  routeReview.onchange=()=>{if(routeReview.value)reviewPath(routeReview.value);};
  reference.onchange=()=>draw();
  routeColors.onchange=()=>draw();
  largeLabels.onchange=()=>draw();
  svg.onwheel=e=>{e.preventDefault();const p=coords(e);zoom(e.deltaY<0?.85:1.18,p.x,p.y);};
  const pointers=new Map;
  svg.onpointerdown=e=>{svg.setPointerCapture(e.pointerId);const p=coords(e);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const target=e.target.closest('[data-stop],[data-label],[data-path],[data-route-path]');if(target?.dataset.routePath){selection={type:'path',id:target.dataset.routePath};fields();const path=layout.paths.find(p=>p.id===selection.id);q('details').textContent=path.id+'\n'+(path.routes.join(', ')||'Linjetilknytning uavklart');}if(target&&(target.dataset.stop||target.dataset.label)){const id=target.dataset.stop||target.dataset.label;selection={type:'stop',id};fields();details(layout.stops.find(s=>s.id===id));}drag={id:e.pointerId,start:p,box:[...box],target:editing&&target&&!target.dataset.routePath?target:null,before:editor.get(),next:null};};
  svg.onpointermove=e=>{if(!pointers.has(e.pointerId)||!drag)return;
   const prev=[...pointers.values()];pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const next=[...pointers.values()],dist=a=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);zoom(dist(prev)/Math.max(1,dist(next)));drag.target=null;drag.start=coords(e);drag.box=[...box];return;}
   const p=coords(e),t=drag.target;if(!t){box=[box[0]+drag.start.x-p.x,box[1]+drag.start.y-p.y,box[2],box[3]];setBox();return;}
   const next=structuredClone(drag.before),x=Math.max(0,Math.min(913,p.x)),y=Math.max(0,Math.min(1280,p.y));
   if(t.dataset.path){const path=next.paths.find(v=>v.id===t.dataset.path);path.points[Number(t.dataset.index)]={x,y};}
   else{const s=next.stops.find(s=>s.id===(t.dataset.stop||t.dataset.label));Object.assign(t.dataset.label?s.label:s,{x,y});}
   drag.next=next;layout=next;draw();
  };
  function end(e){pointers.delete(e.pointerId);if(drag?.next)editor.import(drag.next);drag=null;}
  svg.onpointerup=end;svg.onpointercancel=()=>{pointers.clear();drag=null;layout=editor.get();draw();};
  setInterval(()=>{if(!host.hidden&&!document.hidden){phase++;paint();}},1200);draw();
  return {update(next){context=next;frame=next.frame;draw();},clear(){frame=null;paint();}};
 }};
})(globalThis);

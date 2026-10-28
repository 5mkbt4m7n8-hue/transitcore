(function(root){
 'use strict';
 const NS='http://www.w3.org/2000/svg',M=root.InTransitMapModel,S=root.TransitCoreSignals,L=root.InTransitMapLayoutOps,N=root.InTransitStopLinks;
 const el=(tag,attrs={})=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const fingerprint=value=>{
  const json=JSON.stringify(value);let hash=2166136261;
  for(let i=0;i<json.length;i++){hash^=json.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16)+'-'+json.length;
 };
 function download(name,text){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 root.InTransitNetwork={async create(host){
  const response=await fetch('network/trondheim-layout.json');if(!response.ok)throw Error('Kartlayout HTTP '+response.status);
  const canonical=await response.json();const errors=M.validate(canonical);if(errors.length)throw Error(errors.join(', '));
  const baseFingerprint=fingerprint(canonical);
  let initial=canonical,publishedNames={},publishedWarning='';
  // Publicly approved geometry is an overlay; the original traced image map
  // and its stable draft fingerprint remain unchanged across publications.
  try{
   const published=await fetch('network/published-edits.json',{cache:'no-store'});
   if(published.ok){
    const value=await published.json();
    if(value.version!==1||value.baseFingerprint!==baseFingerprint||M.validate(value.layout).length||
       !value.names||typeof value.names!=='object'||Array.isArray(value.names))
     throw Error('Den publiserte arbeidskopien har feil versjon eller kartformat.');
    initial=value.layout;publishedNames=value.names;
   }else if(published.status!==404)throw Error('Kunne ikke hente publisert kart (HTTP '+published.status+').');
  }catch(error){publishedWarning='Publisert kart kunne ikke lastes: '+error.message+'. Originalkartet vises.';}

  host.innerHTML=`<div class="map-shell"><div class="map-toolbar"><button data-act="in" aria-label="Zoom inn">+</button><button data-act="out" aria-label="Zoom ut">−</button><button data-act="fit">Tilpass hele kartet</button><label class="map-toggle"><input type="checkbox" data-role="reference"> Vis originaltegningen</label><label class="map-toggle"><input type="checkbox" data-role="routeColors" checked> Vis dokumenterte rutefarger</label><label class="map-toggle"><input type="checkbox" data-role="largeLabels"> Større navn</label><label class="map-review-label">Gjennomgå linje <select data-role="reviewPath" aria-label="Velg kartlinje for kvalitetssjekk"></select></label><select data-role="focus" aria-label="Fokus på holdeplass"></select><a data-role="geoLink" href="./geo/" class="map-geo-link">Åpne stopp i geografisk kart</a><button data-act="edit" aria-pressed="false">Rediger kart</button><button data-act="export">Eksporter JSON</button><label>Importer JSON <input data-role="import" type="file" accept="application/json,.json"></label></div><p class="map-warning" data-role="notice"></p><div class="map-editor" id="networkEditor" hidden><button data-act="addStop">+ Ny holdeplass</button><button data-act="addPath">+ Ny kartlinje</button><button data-act="undo">Angre</button><button data-act="nextPlatformReview" type="button">Neste uavklarte plattform</button><span class="map-platform-progress" data-role="platformProgress">Plattformkontroll lastes …</span><button data-act="discard">Forkast endringer</button><button data-act="save">Lagre arbeidskopi</button><button data-act="restore">Hent arbeidskopi</button><span class="map-draft-status" data-role="draftStatus" aria-live="polite">Ingen nye endringer</span><section class="map-cloud"><strong>Permanent skylagring</strong><small>Alle endringer lagres lokalt. Koble til skyen med administratornøkkelen for lagring på tvers av enheter. Nøkkelen beholdes kun mens siden er åpen.</small><label>Administratornøkkel <input type="password" autocomplete="off" data-role="cloudKey" placeholder="Administratornøkkel"></label><button type="button" data-act="cloudConnect">Koble til skylagring</button><button type="button" data-act="cloudDisconnect" hidden>Koble fra</button><button type="button" data-act="cloudUseRemote" hidden>Hent fra skyen</button><button type="button" data-act="cloudUseLocal" hidden>Bruk lokal versjon i skyen</button><span data-role="cloudStatus" role="status" aria-live="polite">Kun lokal lagring – ikke synkronisert til skyen.</span><div class="map-publish-actions"><button type="button" data-act="publishMap" disabled>Publiser kart til GitHub</button><span data-role="publishStatus" aria-live="polite">Før publisering må skyen vise «Lagret permanent i skyen».</span><a data-role="publishLink" hidden target="_blank" rel="noopener noreferrer">Åpne publiseringsforslag på GitHub</a></div></section><div class="map-sketch-controls" data-role="sketchControls" hidden><strong data-role="sketchHelp" aria-live="polite"></strong><button data-act="finishSketch">Fullfør linjen</button><button data-act="sketchUndo">Fjern siste punkt</button><button data-act="sketchCancel">Avbryt tegning</button></div><div data-role="fields"></div></div><svg class="map-viewport" aria-label="InTransit Trondheim nettverkskart" role="img"></svg><p data-role="summary"></p><pre class="map-details" data-role="details" aria-live="polite"></pre><details><summary>Stoppmapping og datavalidering</summary><pre class="map-details" data-role="report"></pre><button data-act="report">Eksporter valideringsrapport</button></details></div>`;
  const q=r=>host.querySelector(`[data-role="${r}"]`),svg=host.querySelector('svg'),editorPanel=host.querySelector('#networkEditor');
  let localNames={...publishedNames,...N.names(initial)};let layout=initial,context={},editing=false,selection=null,selectedSegmentIndex=0,drag=null,box=[0,0,913,1280],phase=0,report={},frame=null;
  let placementMode=null,moveStopId=null,routeSketch=null,placementGestureMoved=false,suppressAutoSave=false,cloud=null,selectedSide=null;
  const autoDraftKey='intransit-map-autodraft-v1',manualDraftKey='intransit-map-draft-v1';
  // Stable reference is the traced source file; published edits are overlaid.
  const draftStatus=q('draftStatus');
  function setDraftStatus(message){draftStatus.textContent=message;}
   const displayName=stop=>localNames[stop.id]||stop.name;
   const geoHref=id=>id&&initial.stops.some(stop=>stop.id===id)?N.geographicUrl(id):'./geo/';
   function syncGeoLink(id){q('geoLink').href=geoHref(id);}
  function persistDraft(value){
   if(suppressAutoSave)return;
   try{
    localStorage.setItem(autoDraftKey,JSON.stringify({version:1,baseFingerprint,layout:value,savedAt:Date.now()}));
    setDraftStatus('Endringer lagret automatisk på denne enheten');
    cloud?.changed();
   }catch{
    setDraftStatus('Automatisk lagring er ikke tilgjengelig. Bruk Eksporter JSON.');
   }
  }
  function clearAutoDraft(){
   try{localStorage.removeItem(autoDraftKey);setDraftStatus('Arbeidskopien er forkastet');}
   catch{setDraftStatus('Kunne ikke slette lokal arbeidskopi');}
  }
  function restoreAutoDraft(){
   try{
    const raw=localStorage.getItem(autoDraftKey);if(!raw)return;
    if(raw.length>2000000)throw Error('Lagret kartutkast er for stort');
    const value=JSON.parse(raw);
    if(value?.version!==1||value.baseFingerprint!==baseFingerprint){
     setDraftStatus('Gammelt kartutkast finnes. Eksporter det før du overskriver.');
     return;
    }
    suppressAutoSave=true;
    try{editor.import(value.layout);}finally{suppressAutoSave=false;}
    setDraftStatus('Tidligere arbeidskopi hentet automatisk');
   }catch{
    suppressAutoSave=false;
    setDraftStatus('Kunne ikke hente arbeidskopi. Originalkartet vises.');
   }
  }
  const routeReview=q('reviewPath'),reference=q('reference'),routeColors=q('routeColors'),largeLabels=q('largeLabels');
  const editor=root.InTransitMapEditor(initial,next=>{layout=next;draw();fields();persistDraft(next);});
  function applyCloudSnapshot(snapshot){
   const errors=M.validate(snapshot.layout);
   if(errors.length)throw Error('Skyutgaven har ugyldig layout: '+errors.join(', '));
   N.replaceNames(initial,snapshot.names);
   localNames={...snapshot.names};
   suppressAutoSave=true;
   try{editor.import(snapshot.layout);}finally{suppressAutoSave=false;}
   try{localStorage.setItem(autoDraftKey,JSON.stringify({
    version:1,baseFingerprint,layout:snapshot.layout,savedAt:Date.now()
   }));}catch{setDraftStatus('Skyversjon lastet, men lokal lagring er ikke tilgjengelig.');}
  }
  function updateCloudStatus(state){
   q('cloudStatus').textContent=state.message;
   q('cloudStatus').dataset.kind=state.kind;
   host.querySelector('[data-act="publishMap"]').disabled=!(state.mode==='ready'&&state.revision>0&&!state.dirty&&!state.busy);
   const conflict=state.mode==='conflict';
   host.querySelector('[data-act="cloudUseRemote"]').hidden=!conflict;
   host.querySelector('[data-act="cloudUseLocal"]').hidden=!conflict;
   host.querySelector('[data-act="cloudDisconnect"]').hidden=state.mode==='disconnected';
   host.querySelector('[data-act="cloudConnect"]').textContent=state.mode==='disconnected'?'Koble til skylagring':'Koble til på nytt';
  }
  cloud=root.InTransitCloudDraft.create({
   baseFingerprint,
   getLocal:()=>({layout:editor.get(),names:{...localNames}}),
   hasLocal:()=>Boolean(localStorage.getItem(autoDraftKey))||Object.keys(N.names(initial)).length>0,
   applyRemote:applyCloudSnapshot,
   status:updateCloudStatus
  });
  const setBox=()=>svg.setAttribute('viewBox',box.join(' '));
  const viewportCenter=()=>({x:box[0]+box[2]/2,y:box[1]+box[3]/2});
  function zoom(f,cx=box[0]+box[2]/2,cy=box[1]+box[3]/2){const w=Math.min(1826,Math.max(40,box[2]*f)),h=w*1280/913;box=[cx-(cx-box[0])*w/box[2],cy-(cy-box[1])*h/box[3],w,h];setBox();}
  function coords(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
  function syncSketchControls(){
   const controls=q('sketchControls'),active=!!routeSketch;
   controls.hidden=!active;
   svg.classList.toggle('map-drawing',active);
   svg.classList.toggle('map-placing',!!placementMode);
   if(!active)return;
   const n=routeSketch.points.length,continued=!!routeSketch.pathId;
   q('sketchHelp').textContent=continued
    ?'Forleng eksisterende linje: '+n+' nye punkt. Trykk flere steder på kartet.'
    :'Ny linje: '+n+' av minst 2 punkt. Trykk langs traseen.';
   const done=controls.querySelector('[data-act="finishSketch"]');
   done.disabled=n<(continued?1:2);
   controls.querySelector('[data-act="sketchUndo"]').disabled=n===0;
  }
  function showSketchPreview(){
   svg.querySelector('.map-sketch-preview')?.remove();
   if(!routeSketch)return;
   const parent=el('g',{class:'map-sketch-preview','aria-hidden':'true'});
   const anchor=routeSketch.pathId?layout.paths.find(p=>p.id===routeSketch.pathId)?.points.at(-1):null;
   const points=[...(anchor?[anchor]:[]),...routeSketch.points];
   const future=routeSketch.cursor&&points.length?[...points,routeSketch.cursor]:points;
   if(future.length>1)parent.append(el('polyline',{
    class:'map-sketch-line',points:future.map(v=>v.x+','+v.y).join(' ')
   }));
   for(const p of routeSketch.points)parent.append(el('circle',{
    class:'map-sketch-vertex',cx:p.x,cy:p.y,r:3.3
   }));
   svg.append(parent);
  }
  function cancelSketch(){
   routeSketch=null;syncSketchControls();showSketchPreview();
  }
  function startSketch(pathId=null){
   if(pathId&&!layout.paths.some(p=>p.id===pathId))throw Error('Fant ikke kartlinjen');
   placementMode=null;moveStopId=null;
   routeSketch={pathId,points:[],cursor:null};
   placementGestureMoved=false;
   syncSketchControls();showSketchPreview();
   q('details').textContent=pathId
    ?'Trykk på kartet for hvert nytt knekkpunkt. Fullfør når forlengelsen er ferdig.'
    :'Tegn trasé: trykk på startpunktet og deretter langs traséen. Minst to punkt kreves.';
  }
  function sketchTap(p){
   if(!routeSketch)return;
   if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>913||p.y<0||p.y>1280){
    q('details').textContent='Velg et punkt innenfor kartflaten.';return;
   }
   const last=routeSketch.points.at(-1)||(routeSketch.pathId?layout.paths.find(v=>v.id===routeSketch.pathId)?.points.at(-1):null);
   if(last&&Math.hypot(p.x-last.x,p.y-last.y)<1){
    q('details').textContent='Velg et punkt litt lenger unna det forrige.';return;
   }
   if(routeSketch.points.length>997){q('details').textContent='Linjen kan ikke ha flere punkter';return;}
   routeSketch.points.push({x:p.x,y:p.y});routeSketch.cursor=null;
   syncSketchControls();showSketchPreview();
  }
  function undoSketchPoint(){
   if(!routeSketch)return;
   routeSketch.points.pop();routeSketch.cursor=null;syncSketchControls();showSketchPreview();
  }
  function finishSketch(){
   if(!routeSketch)return;
   const sketch=routeSketch;
   if(sketch.points.length<(sketch.pathId?1:2)){q('details').textContent='Legg til flere punkter før linjen fullføres.';return;}
   let id=sketch.pathId;
   editor.change(next=>{
    if(id)L.appendPath(next,id,sketch.points);
    else id=L.drawPath(next,sketch.points);
   });
   routeSketch=null;selection={type:'path',id};
   selectedSegmentIndex=0;syncSketchControls();draw();fields();
   q('details').textContent='Kartlinjen '+id+' er lagret med '+sketch.points.length+' nye punkt. Du kan redigere og angre endringen.';
  }

  function details(stop){syncGeoLink(stop.id);
   const quayIds=selectedSide&&stop.diodeMode==='split'
    ?Object.entries(stop.platformSides||{}).filter(([,r])=>r.side===selectedSide&&r.verification==='user-reviewed').map(([id])=>id)
    :null;
   const values=M.signals(stop,context.board,context.hardware,frame,context.all?null:context.line,Date.now(),null,quayIds);
   const age=(Date.now()-Date.parse(frame?.generatedAt))/1000;
   q('details').textContent=displayName(stop)+(localNames[stop.id]?' (lokalt navn; original: '+stop.name+')':'')+(selectedSide?' · '+(selectedSide==='left'?'VENSTRE':'HØYRE')+' på tegningen (Quay '+(quayIds?.join(', ')||'ikke kartlagt')+')':'')+'\n'+(stop.verification!=='confirmed'?'Uavklart navn / ID. Ingen live-kobling.':values.length?values.map(v=>`Linje ${v.line||'?'} · ${v.destination||'Ukjent destinasjon'} · buss ${v.id||'ikke oppgitt'} · ${v.state}\nKilde: ${v.source||'ikke oppgitt'} · observasjonsalder: ${v.ageSeconds??'ukjent'} s`).join('\n'):'OFF · ingen aktiv gyldig observasjon; bekrefter ikke tom holdeplass.')+`\nFrame-alder: ${Number.isFinite(age)?Math.floor(age)+' s':'ingen frame'}`;
  }
  function draw(){
   svg.replaceChildren();setBox();svg.classList.toggle('map-big-labels',largeLabels.checked);
   // Only a repository-relative, supplied reference image can be displayed.
   if(layout.reference?.available&&/^\.\/assets\/[\w.-]+\.(png|jpg|svg|webp)$/.test(layout.reference.path||''))svg.append(el('image',{href:layout.reference.path,x:0,y:0,width:913,height:1280,opacity:reference.checked?.55:editing?.28:.08}));
   for(const path of layout.paths){if(path.routes.length&&!context.all&&!path.routes.includes(context.route))continue;
    const p=el('polyline',{points:path.points.map(p=>p.x+','+p.y).join(' '),stroke:path.color,'stroke-width':path.width,class:'map-route',tabindex:0,'aria-label':path.id});
    p.onclick=()=>{selection={type:'path',id:path.id};selectedSegmentIndex=0;fields();q('details').textContent=path.id+'\n'+(path.routes.join(', ')||'Linjetilknytning uavklart');};p.dataset.routePath=path.id;svg.append(p);
    if(editing)path.points.forEach((v,i)=>{const h=el('circle',{cx:v.x,cy:v.y,r:4,class:'map-handle'});h.dataset.path=path.id;h.dataset.index=i;svg.append(h);});
   }
   // Overlay only edges with direct Quay-to-Quay adjacency in loaded profiles.
   // This does not establish the route of an entire polyline or live coverage.
   const edges=M.verifiedSegments(layout,context.profiles||[],context.boards||[]);
   const reviewed=layout.paths.flatMap(path=>Object.entries(path.reviewedSegments||{}).map(([index,item])=>({path,index:Number(index),item})));
   let drawn=0;
   for(const edge of edges){
    const routes=context.all?edge.routes:edge.routes.filter(r=>r.id===context.route);
    if(!routes.length||!routeColors.checked)continue;
    const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,len=Math.hypot(dx,dy);if(len<0.1)continue;
    drawn++;
    routes.forEach((route,i)=>{
     const offset=(i-(routes.length-1)/2)*2,ox=-dy/len*offset,oy=dx/len*offset;
     const stroke=el('line',{x1:edge.a.x+ox,y1:edge.a.y+oy,x2:edge.b.x+ox,y2:edge.b.y+oy,stroke:route.color,'stroke-width':1.8,class:'map-route-confirmed','data-route':route.id,'data-path':edge.pathId,'data-edge':edge.edgeIndex,'aria-label':'Linje '+route.line+' · nabostopp i ruteprofil'});
     stroke.dataset.routeEvidence=route.evidence;svg.append(stroke);
    });
   }
   // Explicitly reviewed route assignments are always labeled separately
   // from catalog evidence. They change only visual paths, never live frames.
   for(const record of reviewed){
    if(!routeColors.checked)continue;
    const {path,index,item}=record,a=path.points[index],b=path.points[index+1];
    if(!a||!b)continue;
    const seen=edges.find(e=>e.pathId===path.id&&e.edgeIndex===index)?.routes||[];
    const routes=(context.profiles||[]).filter(p=>item.routes.includes(p.id)&&!seen.some(r=>r.id===p.id)&&(context.all||p.id===context.route));
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<0.1)continue;
    routes.forEach((route,i)=>{
     const offset=(i-(routes.length-1)/2)*2,ox=-dy/len*offset,oy=dx/len*offset;
     const stroke=el('line',{x1:a.x+ox,y1:a.y+oy,x2:b.x+ox,y2:b.y+oy,stroke:route.line.color,'stroke-width':2.3,class:'map-route-reviewed','data-path':path.id,'data-edge':index,'data-route':route.id,'aria-label':'Manuelt bekreftet buss '+route.line.publicCode});
     stroke.dataset.routeEvidence='manual-review';svg.append(stroke);
    });
   }
   for(const stop of layout.stops){
    const resolved=M.resolve(stop,context.board,context.hardware);
    if(stop.verification==='confirmed'&&!context.all&&!resolved.some(b=>b.node.routes.includes(context.route))&&selection?.id!==stop.id)continue;
    const sides=stop.diodeMode==='split'?['left','right']:[null];
    sides.forEach((side,i)=>{
     const mapped=side===null?[]:Object.entries(stop.platformSides||{}).filter(([,r])=>r.verification==='user-reviewed'&&r.side===side).map(([id])=>id);
     const label=displayName(stop)+(side?' · '+(side==='left'?'venstre':'høyre')+' på tegningen':'')+
      (side?' · '+(mapped.length?mapped.join(', '):'Quay ikke kontrollert'):'');
     const group=el('g',{class:'map-stop',transform:`translate(${stop.x+(side===null?0:(i?1:-1)*(stop.radius+2))} ${stop.y})`,tabindex:0,role:'button','aria-label':label});
     if(stop.verification!=='confirmed'||(side!==null&&!mapped.length))group.dataset.unresolved='true';
     if(side!==null){group.dataset.direction=side;group.dataset.side=side;group.dataset.review=mapped.length?'user-reviewed':'pending';}
     group.dataset.stop=stop.id;
     if(selection?.type==='stop'&&selection.id===stop.id)group.dataset.selected='true';
     group.append(el('circle',{r:stop.radius}));
     group.append(el('text',{y:2}));
     group.onclick=()=>{selection={type:'stop',id:stop.id};selectedSide=side;fields();details(stop);};
     group.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();group.onclick();}};
     svg.append(group);
    });
    if(stop.label.visible){const label=el('text',{x:stop.label.x,y:stop.label.y,class:'map-label'});label.textContent=displayName(stop);label.dataset.label=stop.id;if(selection?.type==='stop'&&selection.id===stop.id)label.dataset.selected='true';svg.append(label);}
   }
   showSketchPreview();
   q('focus').replaceChildren(new Option('Fokus på punkt …',''),...layout.stops.map(s=>new Option(displayName(s),s.id)));
    q('focus').value=selection?.type==='stop'?selection.id:'';syncGeoLink(selection?.type==='stop'?selection.id:null);
   const currentPath=routeReview.value;
   routeReview.replaceChildren(new Option('Gjennomgå kartlinje …',''),...layout.paths.map(p=>new Option(p.id+' · '+edges.filter(e=>e.pathId===p.id).length+'/'+(p.points.length-1)+' nabokoblinger',p.id)));
   routeReview.value=layout.paths.some(p=>p.id===currentPath)?currentPath:'';
   report=M.report(layout,context.boards||[]);
   const platformProgress=M.platformAudit(layout);
   q('platformProgress').textContent=platformProgress.reviewed+'/'+platformProgress.total+' holdeplasser med flere plattformer gjennomgått · '+platformProgress.pending.length+' gjenstår';
    report.routeEvidence={method:'consecutive Quays or catalog-verified, uniquely mapped StopPlaces',manualApproved:reviewed.length,drawn,possibleEdges:layout.paths.reduce((count,p)=>count+Math.max(0,p.points.length-1),0),exactOnly:edges.filter(e=>e.routes.every(r=>r.evidence==='exact-quay')).length,withStopPlace:edges.filter(e=>e.routes.some(r=>r.evidence==='unique-stopplace')).length,edges:edges.map(e=>({path:e.pathId,edge:e.edgeIndex,from:e.from,to:e.to,routes:e.routes.map(r=>({id:r.id,evidence:r.evidence}))})),byPath:layout.paths.map(p=>({id:p.id,documented:edges.filter(e=>e.pathId===p.id).length,segments:Math.max(0,p.points.length-1),fullRouteVerified:false}))};
    q('report').textContent=JSON.stringify(report,null,2);
   q('notice').textContent=(report.coverage.scope==='selected-corridors'?'Kartet viser et bevisst utvalg av strekninger; bussrutene trenger ikke være komplette fra ende til ende. Flere kan legges til senere. ':'')+'Datakoblinger som gjenstår: '+report.unconfirmed.length+' stopp; '+report.unconfirmedNames.length+' uten navn. '+edges.length+'/'+report.routeEvidence.possibleEdges+' naboforbindelser dokumentert i rutekonfigurasjonen; '+drawn+' fargevises for valgte ruter. '+reviewed.length+' delstrekninger er manuelt godkjent. Uavklarte delstrekninger er nøytrale. Full samtidig live-dekning er ikke bekreftet.';
   paint();
  }
  function paint(){
   let all=[];
   for(const group of svg.querySelectorAll('.map-stop')){
    const stop=layout.stops.find(s=>s.id===group.dataset.stop);
    // On split markers, ONLY manually assigned Quays can trigger that side.
    // Missing reviews show OFF, never a guessed direction or a merged LED.
    const side=group.dataset.side||null;
    const quayIds=side?Object.entries(stop.platformSides||{}).filter(([,r])=>r.side===side&&r.verification==='user-reviewed').map(([id])=>id):null;
    const values=M.signals(stop,context.board,context.hardware,frame,context.all?null:context.line,Date.now(),null,quayIds);
    all.push(...values);
    const max=Math.max(0,...values.map(v=>S.priority(v.state))),choices=values.filter(v=>S.priority(v.state)===max),v=choices.length?choices[phase%choices.length]:null;
    group.dataset.state=v?.state||'OFF';const rgb=v?.rgb;group.style.color=Array.isArray(rgb)&&rgb.length===3&&rgb.every(n=>Number.isInteger(n)&&n>=0&&n<=255)?`rgb(${rgb.join(',')})`:'#70839a';group.querySelector('text').textContent=context.numbers&&v?String(v.line||'?'):side?(side==='left'?'V':'H'):'';
   }
   const active=all.filter(v=>v.state!=='PASSED'),known=active.every(v=>v.id),count=new Set(active.map(v=>v.id)).size;
   q('summary').textContent=`${layout.stops.length} kartpunkter · ${report.unmapped?.length||0} uten kobling · `+(known&&active.length?`${count} identifiserte aktive busser i kartets tilgjengelige feed`:'Aktivt bussantall ikke bekreftet')+' · Viser bare tegnede strekninger og data fra eksisterende Linear-feed; ikke nødvendigvis komplette bussruter.';
   if(selection?.type==='stop'){const selected=layout.stops.find(s=>s.id===selection.id);if(selected)details(selected);else selection=null;}
  }

  function reviewPath(id){
   const p=layout.paths.find(p=>p.id===id);if(!p)return;
   selection={type:'path',id};selectedSegmentIndex=0;fields();
   const known=M.verifiedSegments(layout,context.profiles||[],context.boards||[]).filter(e=>e.pathId===id);
   q('details').textContent=p.id+' · '+known.length+' av '+(p.points.length-1)+' delstrekninger med verifisert Quay-/holdeplassnaboskap i ruteprofil. '+Object.keys(p.reviewedSegments||{}).length+' manuelt gjennomgåtte.\n'+
    (known.length?known.map(e=>'Del '+(e.edgeIndex+1)+': '+(layout.stops.find(s=>s.id===e.from)?.name||e.from)+' → '+(layout.stops.find(s=>s.id===e.to)?.name||e.to)+' · buss '+e.routes.map(r=>r.line).join(', ')).join('\n'):'Ingen dokumenterte Quay-nabostopp.')+
    '\nHoldplasskoblinger via StopPlace er bare tillatt når holdeplassen har én unik kartmarkør. Dette bekrefter ikke komplett trasé eller live-GPS.';
   const vs=p.points,xs=vs.map(v=>v.x),ys=vs.map(v=>v.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
   const w=Math.min(913,Math.max(110,Math.max(...xs)-Math.min(...xs)+45,(Math.max(...ys)-Math.min(...ys)+45)*913/1280));
   box=[cx-w/2,cy-w*1280/913/2,w,w*1280/913];setBox();
  }
  function fields(){
   const area=q('fields');area.replaceChildren();if(!editing||!selection)return;
   const item=(selection.type==='stop'?layout.stops:layout.paths).find(s=>s.id===selection.id);if(!item)return;
   function input(title,value,type,change){const label=document.createElement('label');label.textContent=title;const control=document.createElement('input');control.type=type;if(type==='checkbox')control.checked=value;else control.value=value;control.onchange=()=>{try{editor.change(next=>change(next,type==='checkbox'?control.checked:type==='number'?Number(control.value):control.value));}catch(e){q('details').textContent=e.message;fields();}};label.append(control);area.append(label);}
   const pick=next=>(selection.type==='stop'?next.stops:next.paths).find(s=>s.id===selection.id);
   if(selection.type==='path'){
     input('Nøytral linjefarge',item.color,'color',(n,v)=>pick(n).color=v);
     input('Linjetykkelse',item.width,'number',(n,v)=>pick(n).width=v);
     const review=document.createElement('section');review.className='map-segment-editor';
     const heading=document.createElement('strong');heading.textContent='Rutetilknytning per delstrekning – manuell godkjenning';review.append(heading);
     const segment=document.createElement('select');segment.setAttribute('aria-label','Velg delstrekning');
     for(let i=0;i<item.points.length-1;i++){const manual=item.reviewedSegments?.[i]?.routes||[];segment.append(new Option('Del '+(i+1)+(manual.length?' · bekreftet '+manual.length+' linje(r)':''),String(i)));}
     segment.value=String(Math.min(selectedSegmentIndex,item.points.length-2));
     const route=document.createElement('select');route.setAttribute('aria-label','Busslinje for delstrekning');
     for(const p of context.profiles||[])if(/^atb-bus-\d+-live$/.test(p.id))route.append(new Option('Linje '+p.line.publicCode,p.id));
     const note=document.createElement('small');note.className='map-segment-note';
     const refresh=()=>{const i=Number(segment.value),r=item.reviewedSegments?.[i]?.routes||[];
      note.textContent=r.length?'Manuelt godkjent: '+r.map(id=>(context.profiles||[]).find(p=>p.id===id)?.line.publicCode||id).join(', '):'Ingen manuell godkjenning for denne delstrekningen. Eksisterende ruteprofilbevis vises uavhengig.';
     };
     segment.onchange=()=>{selectedSegmentIndex=Number(segment.value);refresh();};
     const approve=document.createElement('button');approve.type='button';approve.textContent='Godkjenn valgt linje på delstrekningen';
     approve.onclick=()=>{if(!route.value)return;try{editor.change(next=>{const p=pick(next),id=segment.value;p.reviewedSegments||={};const old=p.reviewedSegments[id]?.routes||[];
       p.reviewedSegments[id]={verification:'user-reviewed',routes:[...new Set([...old,route.value])]};});}catch(e){q('details').textContent=e.message;}};
     const clear=document.createElement('button');clear.type='button';clear.textContent='Fjern godkjenning for denne delstrekningen';
     clear.onclick=()=>{try{editor.change(next=>{const p=pick(next);if(p.reviewedSegments)delete p.reviewedSegments[segment.value];});}catch(e){q('details').textContent=e.message;}};
     const geometry=document.createElement('section');geometry.className='map-geometry-editor';
     const label=document.createElement('strong');label.textContent='Tegn og endre kartlinjen';geometry.append(label);
     const help=document.createElement('small');help.textContent='Ny endepunkt eller knekkpunkt kan dras i kartet etterpå. Berørte manuelle rutegodkjenninger fjernes ved innsetting.';geometry.append(help);
     const addEnd=document.createElement('button');addEnd.type='button';addEnd.textContent='+ Forleng linjen';
     addEnd.onclick=()=>{try{editor.change(next=>L.extendPath(next,item.id));selectedSegmentIndex=Math.max(0,layout.paths.find(p=>p.id===item.id).points.length-2);fields();}catch(e){q('details').textContent=e.message;}};
     const insert=document.createElement('button');insert.type='button';insert.textContent='+ Knekkpunkt i valgt delstrekning';
     insert.onclick=()=>{try{const idx=Number(segment.value);editor.change(next=>L.insertVertex(next,item.id,idx));selectedSegmentIndex=idx;fields();}catch(e){q('details').textContent=e.message;}};
     const removeEnd=document.createElement('button');removeEnd.type='button';removeEnd.textContent='Fjern siste knekkpunkt';
     removeEnd.onclick=()=>{try{editor.change(next=>L.removeLastVertex(next,item.id));selectedSegmentIndex=Math.max(0,selectedSegmentIndex-1);fields();}catch(e){q('details').textContent=e.message;}};
     const continueDraw=document.createElement('button');continueDraw.type='button';
     continueDraw.textContent='Fortsett å tegne fra siste punkt';
     continueDraw.onclick=()=>startSketch(item.id);
     geometry.append(addEnd,insert,removeEnd,continueDraw);
     if(item.id.startsWith('custom-path-')){
      const del=document.createElement('button');del.type='button';del.textContent='Slett ny linje';
      del.onclick=()=>{try{editor.change(next=>L.deleteNewPath(next,item.id));selection=null;fields();}catch(e){q('details').textContent=e.message;}};
      geometry.append(del);
     }
     review.append(segment,route,approve,clear,note);area.append(review,geometry);refresh();return;
    }
   // Every original stop (including already named stops) can be renamed
   // locally without changing the canonical name, NSR IDs or validation.
   if(initial.stops.some(s=>s.id===item.id)){
    const originalName=initial.stops.find(s=>s.id===item.id).name;
    const nameLabel=document.createElement('label');nameLabel.textContent='Navn på holdeplassen (lokalt visningsnavn)';
    const nameInput=document.createElement('input');nameInput.type='text';nameInput.maxLength=80;
    nameInput.value=displayName(item);nameInput.setAttribute('aria-label','Navn på holdeplassen (lokalt visningsnavn)');nameLabel.append(nameInput);
    const saveName=document.createElement('button');saveName.type='button';saveName.textContent='Lagre visningsnavn';
    saveName.onclick=()=>{try{
     const changedName=nameInput.value.trim()===originalName?'':nameInput.value.trim();
     N.rename(initial,item.id,changedName);
     if(changedName)localNames[item.id]=changedName;else delete localNames[item.id];
     cloud?.changed();draw();fields();details(item);
     q('details').textContent+='\nVisningsnavnet er lagret på denne enheten og delt med geografisk kart. Originalnavn og NSR-ID er uendret.';
    }catch(e){q('details').textContent=e.message;}};
    const resetName=document.createElement('button');resetName.type='button';resetName.textContent='Bruk originalnavn';
    resetName.onclick=()=>{try{N.rename(initial,item.id,'');delete localNames[item.id];cloud?.changed();draw();fields();details(item);}catch(e){q('details').textContent=e.message;}};
    const info=document.createElement('small');info.className='map-stop-name-note';
    info.textContent='Originalnavn: '+originalName+'. Endringen vises i begge kart og i holdeplassadministrasjonen på denne enheten. Kildeverifisering og rutekoblinger endres ikke.';
    const link=document.createElement('a');link.className='map-geo-link';link.href=geoHref(item.id);
    link.textContent='Åpne samme stopp i geografisk kart';
    area.append(nameLabel,saveName,resetName,info,link);
   }
   const moveHelp=document.createElement('small');moveHelp.className='map-stop-name-note';
   moveHelp.textContent='Dra stoppunktet for å flytte punkt, navneetikett og tilknyttede linjepunkter. Dra navnet for å flytte bare teksten. Du kan også plassere stoppet på nytt med ett trykk.';
   const moveButton=document.createElement('button');moveButton.type='button';
   moveButton.textContent=placementMode==='move'&&moveStopId===item.id?'Avbryt flytting':'Flytt valgt holdeplass';
   moveButton.onclick=()=>{
    if(placementMode==='move'&&moveStopId===item.id){
     placementMode=null;moveStopId=null;q('details').textContent='Flytting avbrutt.';
    }else{
     cancelSketch();placementMode='move';moveStopId=item.id;
     q('details').textContent='Trykk på ønsket ny plassering i kartet for '+displayName(item)+'. Trykk Escape eller Avbryt flytting for å avbryte.';
    }
    syncSketchControls();fields();
   };
   area.append(moveHelp,moveButton);
   if(item.id.startsWith('custom-stop-')){
    const del=document.createElement('button');del.type='button';del.textContent='Slett ny holdeplass';
    del.onclick=()=>{try{editor.change(next=>L.deleteNewStop(next,item.id));selection=null;fields();}catch(e){q('details').textContent=e.message;}};
    area.append(del);
   }
   if(item.id.startsWith('custom-stop-'))input('Navn på nytt kartpunkt',item.name,'text',(n,v)=>{pick(n).name=v;});
   input('Punktstørrelse',item.radius,'number',(n,v)=>pick(n).radius=v);input('Vis etikett',item.label.visible,'checkbox',(n,v)=>pick(n).label.visible=v);input('To dioder',item.diodeMode==='split','checkbox',(n,v)=>pick(n).diodeMode=v?'split':'shared');
   const knownQuays=[...new Set(item.bindings.map(b=>b.stopId).filter(id=>typeof id==='string'&&/^NSR:Quay:\d+$/.test(id)))].sort();
   if(knownQuays.length){
    const panel=document.createElement('section');panel.className='map-platform-review';
    const heading=document.createElement('strong');heading.textContent='Kontroller plattformside · '+knownQuays.length+' Quay';panel.append(heading);
    const help=document.createElement('small');help.textContent='Venstre og høyre betyr plassering på selve karttegningen, ikke automatisk retning 0/1 eller fysisk side av veien. Velg siden manuelt for hver Entur Quay. Ubekreftede sider viser ingen sanntidslys.';panel.append(help);
    for(const quayId of knownQuays){
     const row=document.createElement('label');row.className='map-platform-row';
     const id=document.createElement('span');id.textContent=quayId;
     const side=document.createElement('select');side.setAttribute('aria-label','Kartside for '+quayId);
     side.append(new Option('Ikke gjennomgått',''),new Option('Venstre på tegningen','left'),new Option('Høyre på tegningen','right'));
     side.value=item.platformSides?.[quayId]?.side||'';
     const nodeDescriptions=[];
     for(const board of context.boards||[])for(const node of board.nodes||[]){
      if(!node.stopIds?.includes(quayId))continue;
      for(const route of node.routes||[]){
       const info=node.routeDirections?.[route];
       const line=(context.profiles||[]).find(p=>p.id===route)?.line?.publicCode||route;
       const direction=(info?.directionIds||[]).join('/');
       nodeDescriptions.push('Linje '+line+(direction?' · retning '+direction:'')+(info?.headsigns?.length?' · mot '+info.headsigns.slice(0,2).join(' / '):''));
      }
     }
     const contextLabel=document.createElement('small');contextLabel.textContent=[...new Set(nodeDescriptions)].slice(0,5).join(' | ')||'Ingen dokumentert rute-/retningstilknytning i innlastet datagrunnlag';
     side.onchange=()=>{try{
      editor.change(next=>{
       const stop=pick(next);stop.platformSides||={};
       if(side.value){stop.platformSides[quayId]={side:side.value,verification:'user-reviewed'};stop.diodeMode='split';}
       else{delete stop.platformSides[quayId];if(!Object.keys(stop.platformSides).length)delete stop.platformSides;}
      });
      q('details').textContent='Lagret manuell kartside for '+quayId+'. Offisiell Quay-ID og rutedata er uendret.';
     }catch(error){q('details').textContent=error.message;fields();}
     };
     row.append(id,side,contextLabel);panel.append(row);
    }
    const review=M.platformAudit(layout).stops.find(s=>s.stopId===item.id);
    const note=document.createElement('small');note.className='map-platform-progress';
    note.textContent=review?(review.done?'Begge sider ferdig gjennomgått.':review.assigned+'/'+review.quays.length+' Quay gjennomgått · begge sider må representeres.'):'En plattform – ingen parvis sidekontroll påkrevd.';
    panel.append(note);area.append(panel);
   }
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
   case'edit':editing=!editing;
    if(!editing){placementMode=null;moveStopId=null;cancelSketch();}
    editorPanel.hidden=!editing;button.setAttribute('aria-pressed',editing);draw();fields();break;
   case'nextPlatformReview':{
    const pending=M.platformAudit(layout).pending;
    if(!pending.length){q('details').textContent='Alle holdeplasser med flere Quay-plattformer er gjennomgått.';break;}
    const pos=pending.findIndex(s=>s.stopId===selection?.id);
    const next=pending[(pos+1)%pending.length],stop=layout.stops.find(s=>s.id===next.stopId);
    selection={type:'stop',id:stop.id};selectedSide=null;
    box=[stop.x-80,stop.y-112,160,224];setBox();fields();draw();details(stop);
    q('details').textContent+='\nPlattformkontroll: '+next.assigned+'/'+next.quays.length+' Quay manuelt plassert. Velg side for hver.';
    break;
   }
   case'addStop':{
    if(!editing)break;
    cancelSketch();moveStopId=null;placementMode=placementMode==='stop'?null:'stop';
    syncSketchControls();
    q('details').textContent=placementMode
     ?'Trykk på kartet for å plassere en ny holdeplass. Trykk på knappen igjen for å avbryte.'
     :'Plasseringen er avbrutt.';
    break;
   }
   case'addPath':{
    if(!editing)break;
    if(routeSketch&&!routeSketch.pathId)cancelSketch();
    else startSketch();
    break;
   }
   case'finishSketch':finishSketch();break;
   case'sketchUndo':undoSketchPoint();break;
   case'sketchCancel':cancelSketch();break;
   case'undo':if(routeSketch)undoSketchPoint();else editor.undo();break;
   case'discard':
    if(cloud?.buttons().mode==='ready'&&!confirm('Tilbakestille hele kartet til originalversjonen? Dette oppdaterer også skyutgaven.'))break;
    cancelSketch();placementMode=null;moveStopId=null;syncSketchControls();suppressAutoSave=true;
    try{editor.discard();}finally{suppressAutoSave=false;}
    clearAutoDraft();selection=null;fields();cloud?.changed();break;
   case'export':download('trondheim-layout.json',editor.export());break;
   case'report':download('trondheim-mapping-report.json',JSON.stringify(report,null,2));break;
   case'save':localStorage.setItem(manualDraftKey,editor.export());setDraftStatus('Arbeidskopi lagret manuelt');break;
   case'restore':{const data=localStorage.getItem(manualDraftKey);if(data)editor.import(JSON.parse(data));else setDraftStatus('Ingen manuelt lagret arbeidskopi');break;}
   case'cloudConnect':{const input=q('cloudKey'),key=input.value;input.value='';void cloud.connect(key);break;}
   case'cloudDisconnect':cloud.disconnect();break;
   case'cloudUseRemote':void cloud.chooseRemote();break;
   case'cloudUseLocal':void cloud.chooseLocal();break;
   case'publishMap':{
    if(!confirm('Opprette et publiseringsforslag på GitHub fra sist lagrede skyversjon? Originalkart og Entur-koblinger endres ikke. Forslaget må godkjennes på GitHub.'))break;
    const button=host.querySelector('[data-act="publishMap"]'),target=q('publishStatus'),link=q('publishLink');
    button.disabled=true;link.hidden=true;target.textContent='Oppretter publiseringsforslag …';
    void cloud.publishDraft().then(result=>{
     if(result.noChanges){target.textContent=result.message||'Kartet er allerede publisert.';return;}
     if(!/^https:\/\/github\.com\/5mkbt4m7n8-hue\/transitcore\/pull\/\d+$/.test(result.pullRequestUrl||''))throw Error('Ukjent GitHub-lenke');
     target.textContent='Publiseringsforslag #'+result.pullRequestNumber+' er opprettet. Gjennomgå og godkjenn det på GitHub.';
     link.href=result.pullRequestUrl;link.hidden=false;
    }).catch(error=>{target.textContent='Kunne ikke publisere: '+error.message;})
      .finally(()=>{const state=cloud.buttons();button.disabled=!(state.mode==='ready'&&state.revision>0&&!state.dirty&&!state.busy);});
    break;
   }
  }}catch(e){q('details').textContent=e.message;}});
  q('import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2000000)throw Error('JSON er for stor');editor.import(JSON.parse(await file.text()));}catch(error){q('details').textContent=error.message;}finally{e.target.value='';}};
  q('focus').onchange=()=>{const s=layout.stops.find(s=>s.id===q('focus').value);if(s){selection={type:'stop',id:s.id};selectedSide=null;box=[s.x-80,s.y-112,160,224];setBox();syncGeoLink(s.id);fields();details(s);}};
  routeReview.onchange=()=>{if(routeReview.value)reviewPath(routeReview.value);};
  reference.onchange=()=>draw();
  routeColors.onchange=()=>draw();
  largeLabels.onchange=()=>draw();
  svg.onwheel=e=>{e.preventDefault();const p=coords(e);zoom(e.deltaY<0?.85:1.18,p.x,p.y);};
  const pointers=new Map;
  svg.onpointerdown=e=>{svg.setPointerCapture(e.pointerId);const p=coords(e);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(editing&&(placementMode||routeSketch)){placementGestureMoved=pointers.size>1;return;}
   const target=e.target.closest('[data-stop],[data-label],[data-path],[data-route-path]');if(target?.dataset.routePath){selection={type:'path',id:target.dataset.routePath};fields();const path=layout.paths.find(p=>p.id===selection.id);q('details').textContent=path.id+'\n'+(path.routes.join(', ')||'Linjetilknytning uavklart');}if(target&&(target.dataset.stop||target.dataset.label)){const id=target.dataset.stop||target.dataset.label;selection={type:'stop',id};fields();details(layout.stops.find(s=>s.id===id));}drag={id:e.pointerId,start:p,box:[...box],target:editing&&target&&!target.dataset.routePath?target:null,before:editor.get(),next:null};};
  svg.onpointermove=e=>{
   if(editing&&(placementMode||routeSketch)){
    const origin=pointers.get(e.pointerId);
    if(origin&&Math.hypot(origin.x-e.clientX,origin.y-e.clientY)>10)placementGestureMoved=true;
    if(routeSketch&&e.pointerType!=='touch'&&pointers.size===0){
     try{routeSketch.cursor=coords(e);showSketchPreview();}catch{}
    }
    return;
   }
   if(!pointers.has(e.pointerId)||!drag)return;
   const prev=[...pointers.values()];pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const next=[...pointers.values()],dist=a=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);zoom(dist(prev)/Math.max(1,dist(next)));drag.target=null;drag.start=coords(e);drag.box=[...box];return;}
   const p=coords(e),t=drag.target;if(!t){box=[box[0]+drag.start.x-p.x,box[1]+drag.start.y-p.y,box[2],box[3]];setBox();return;}
   const next=structuredClone(drag.before),x=Math.max(0,Math.min(913,p.x)),y=Math.max(0,Math.min(1280,p.y));
   if(t.dataset.path){const path=next.paths.find(v=>v.id===t.dataset.path),i=Number(t.dataset.index);path.points[i]={x,y};if(path.reviewedSegments){delete path.reviewedSegments[i];delete path.reviewedSegments[i-1];}}
   else if(t.dataset.label){
    const stop=next.stops.find(s=>s.id===t.dataset.label),old=drag.before.stops.find(s=>s.id===t.dataset.label);
    stop.label.x=Math.max(0,Math.min(913,old.label.x+p.x-drag.start.x));
    stop.label.y=Math.max(0,Math.min(1280,old.label.y+p.y-drag.start.y));
   }else if(t.dataset.stop){
    const old=drag.before.stops.find(s=>s.id===t.dataset.stop);
    L.moveStop(next,t.dataset.stop,old.x+p.x-drag.start.x,old.y+p.y-drag.start.y);
   }
   drag.next=next;layout=next;draw();
  };
  function end(e){pointers.delete(e.pointerId);if(editing&&(placementMode||routeSketch))return;if(drag?.next)editor.import(drag.next);drag=null;}
  svg.onpointerup=end;svg.onpointercancel=()=>{pointers.clear();drag=null;placementGestureMoved=true;layout=editor.get();draw();};
  // Capture click before the old map line/stop selection handlers, so an
  // insertion works even when the chosen pixel overlaps existing geometry.
  svg.addEventListener('click',e=>{
   if(!editing||(!placementMode&&!routeSketch)||placementGestureMoved||pointers.size)return;
   e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
   const p=coords(e);
   try{
    if(routeSketch){sketchTap(p);return;}
    if(placementMode==='move'){
     const id=moveStopId;
     editor.change(next=>L.moveStop(next,id,p.x,p.y));
     placementMode=null;moveStopId=null;selection={type:'stop',id};
     syncSketchControls();fields();draw();
     q('details').textContent='Holdeplassen er flyttet. Navneetiketten og tilknyttede linjepunkter ble flyttet sammen med stoppet. Bruk Angre for å gå tilbake.';
     return;
    }
    let id;
    editor.change(next=>{id=L.addStop(next,p.x,p.y);});
    selection={type:'stop',id};selectedSegmentIndex=0;
    placementMode=null;syncSketchControls();fields();draw();
    q('details').textContent='Ny holdeplass lagt til. Dra punktet eller rediger feltene.';
   }catch(error){q('details').textContent=error.message;}
  },true);
  document.addEventListener('keydown',e=>{
   if(!editing||(!routeSketch&&placementMode!=='move')||/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName||''))return;
   if(e.key==='Escape'){e.preventDefault();cancelSketch();placementMode=null;moveStopId=null;syncSketchControls();fields();}
   else if(e.key==='Backspace'){e.preventDefault();undoSketchPoint();}
   else if(e.key==='Enter'){e.preventDefault();finishSketch();}
  });
  root.addEventListener('storage',e=>{
    if(e.key!==N.KEY)return;
    localNames={...publishedNames,...N.names(initial)};cloud?.changed();draw();fields();
    if(selection?.type==='stop'){const stop=layout.stops.find(s=>s.id===selection.id);if(stop)details(stop);}
   });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cloud.beforeLeaving();});
  window.addEventListener('pagehide',()=>cloud.beforeLeaving());
  setInterval(()=>{if(!host.hidden&&!document.hidden){phase++;paint();}},1200);draw();restoreAutoDraft();
  if(publishedWarning)q('cloudStatus').textContent=publishedWarning;
  return {update(next){context=next;frame=next.frame;draw();},clear(){frame=null;paint();},
   focusStop(id){const stop=layout.stops.find(s=>s.id===id);if(!stop)return false;
    selection={type:'stop',id:stop.id};box=[stop.x-80,stop.y-112,160,224];setBox();draw();fields();details(stop);return true;}};
 }};
})(globalThis);

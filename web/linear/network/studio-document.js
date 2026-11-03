(function(root){
 'use strict';
 const clone=v=>structuredClone(v),color=/^#[0-9a-f]{6}$/i;
 function blank(){return {schema:'intransit-artwork',version:1,title:'Nytt kart',width:1000,height:1400,artwork:{lines:[],stops:[]},bindings:{}};}
 function validate(d){
  if(!d||d.schema!=='intransit-artwork'||d.version!==1||typeof d.title!=='string'||d.title.length>200)throw Error('Ukjent prosjektformat');
  if(![d.width,d.height].every(n=>Number.isFinite(n)&&n>=100&&n<=10000))throw Error('Ugyldig kartstørrelse');
  if(!Array.isArray(d.artwork?.lines)||!Array.isArray(d.artwork?.stops)||d.artwork.lines.length>500||d.artwork.stops.length>5000)throw Error('Ugyldige lag');
  const ids=new Set(),point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=d.width&&p.y<=d.height;
  for(const o of [...d.artwork.lines,...d.artwork.stops]){
   if(typeof o.id!=='string'||ids.has(o.id)||typeof o.name!=='string'||o.name.length>200)throw Error('Ugyldig objektnavn eller identitet');ids.add(o.id);
   if(typeof o.visible!=='boolean'||typeof o.locked!=='boolean')throw Error('Ugyldig lagstatus');
  }
  for(const l of d.artwork.lines)if(!color.test(l.color)||!Number.isFinite(l.width)||l.width<1||l.width>40||!Array.isArray(l.points)||l.points.length<2||l.points.length>5000||!l.points.every(point))throw Error('Ugyldig linje');
  for(const s of d.artwork.stops)if(!point(s)||!Number.isFinite(s.labelDx)||!Number.isFinite(s.labelDy)||Math.abs(s.labelDx)>1000||Math.abs(s.labelDy)>1000||!Array.isArray(s.lineIds)||s.lineIds.some(id=>!d.artwork.lines.some(l=>l.id===id)))throw Error('Ugyldig stopp');
  for(const s of d.artwork.stops){
   if(s.labelAngle!==undefined&&(!Number.isFinite(s.labelAngle)||s.labelAngle<0||s.labelAngle>360))throw Error('Navnevinkel må være mellom 0 og 360');
   if(s.labelSide!==undefined&&!['left','right'].includes(s.labelSide))throw Error('Ugyldig navneside');
   if(s.symbol!==undefined&&!['circle','ring','double','capsule','leds'].includes(s.symbol))throw Error('Ugyldig stoppsymbol');
   if(s.span!==undefined&&(!Number.isFinite(s.span)||s.span<10||s.span>500))throw Error('Ugyldig symbolbredde');
   if(s.symbolAngle!==undefined&&(!Number.isFinite(s.symbolAngle)||s.symbolAngle<0||s.symbolAngle>360))throw Error('Ugyldig symbolvinkel');
  }
  if(!d.bindings||typeof d.bindings!=='object'||Array.isArray(d.bindings))throw Error('Ugyldige kildekoblinger');
  for(const [id,b] of Object.entries(d.bindings))if(!ids.has(id)||!b||b.source!=='trondheim'||typeof b.sourceId!=='string'||!Array.isArray(b.quayIds)||!b.quayIds.every(q=>typeof q==='string'))throw Error('Ugyldig kildekobling');
  validateGroups(d,point);
  validateStations(d);
  return d;
 }
 function fromTrondheim(source){
  const d=blank();d.title='Trondheim · arbeidskopi';d.width=source.viewBox[2];d.height=source.viewBox[3];
  d.artwork.lines=source.paths.map((l,i)=>({id:'line-'+i,name:l.name||'Linje '+(i+1),color:color.test(l.color)?l.color:'#249e83',width:6,points:clone(l.points),visible:true,locked:false}));
  d.artwork.stops=source.stops.map((s,i)=>{const id='stop-'+i;d.bindings[id]={source:'trondheim',sourceId:s.id,quayIds:[...new Set((s.bindings||[]).map(b=>b.stopId).filter(id=>id?.startsWith('NSR:Quay:')))],sourceBindings:clone(s.bindings||[])};return {id,name:s.name||'Stopp '+(i+1),x:s.x,y:s.y,labelDx:(s.label?.x??s.x+12)-s.x,labelDy:(s.label?.y??s.y-12)-s.y,lineIds:[],visible:true,locked:false};});
  return validate(d);
 }
 function history(initial){let d=clone(validate(initial)),past=[],future=[];return {get:()=>clone(d),change(fn){const n=clone(d);fn(n);validate(n);if(JSON.stringify(n)===JSON.stringify(d))return;past.push(d);if(past.length>100)past.shift();d=n;future=[];},undo(){if(past.length){future.push(d);d=past.pop();}},redo(){if(future.length){past.push(d);d=future.pop();}},canUndo:()=>past.length>0,canRedo:()=>future.length>0};}
 function resize(d,width,height){d.width=width;d.height=height;validate(d);}
 function label(s){return {x:s.x+s.labelDx,y:s.y+s.labelDy,angle:s.labelAngle||0,anchor:s.labelSide==='left'?'end':'start'};}
 // A conservative rotated text box gives useful suggestions without changing names or angles.
 function arrangeLabels(d){const used=[],overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  for(const s of d.artwork.stops.filter(s=>s.visible)){
   const candidates=[{dx:s.labelDx,dy:s.labelDy,side:s.labelSide||'right'}];for(const dy of (s.locked?[]:[-12,18,-30,36,-48,54]))for(const side of ['right','left'])candidates.push({dx:side==='left'?-12:12,dy,side});
   let best=null;for(const c of candidates){const t={...s,labelDx:c.dx,labelDy:c.dy,labelSide:c.side},l=label(t),a=l.angle*Math.PI/180,w=Math.max(12,s.name.length*8),xs=[],ys=[];for(const x of [l.anchor==='end'?-w:0,l.anchor==='end'?0:w])for(const y of [-12,3]){xs.push(l.x+x*Math.cos(a)-y*Math.sin(a));ys.push(l.y+x*Math.sin(a)+y*Math.cos(a));}const box={x:Math.min(...xs)-3,y:Math.min(...ys)-3,w:Math.max(...xs)-Math.min(...xs)+6,h:Math.max(...ys)-Math.min(...ys)+6},score=used.filter(b=>overlap(box,b)).length+(box.x<0||box.y<0||box.x+box.w>d.width||box.y+box.h>d.height?100:0);if(!best||score<best.score)best={c,box,score};if(!score)break;}
   if(!s.locked){s.labelDx=best.c.dx;s.labelDy=best.c.dy;s.labelSide=best.c.side;}used.push(best.box);
  }
 }
 function symbol(s){return {width:['capsule','leds','double'].includes(s.symbol)?(s.span||(s.symbol==='double'?24:30)):10,height:10,angle:s.symbolAngle||0,ring:s.symbol==='ring'};}
 // Copies are artwork only: they receive neither source bindings nor new stop identities.
 function parallel(d,sourceId,count,spacing,ids){
  const source=d.artwork.lines.find(l=>l.id===sourceId);if(!source||source.locked||!Number.isInteger(count)||count<1||count>8||!Number.isFinite(spacing)||spacing<2||spacing>200||ids.length!==count)throw Error('Velg 1–8 kopier og avstand 2–200');
  const colors=['#e08a3b','#6e68bb','#cc5271','#218967'].filter(c=>c!==source.color);
  for(let lane=1;lane<=count;lane++){
   const points=offsetPoints(source.points,spacing*lane);
   d.artwork.lines.push({...clone(source),id:ids[lane-1],name:source.name+' · '+lane,color:colors[(lane-1)%colors.length],points});
  }validate(d);
 }

 function editableLines(d,ids){const lines=ids.map(id=>d.artwork.lines.find(l=>l.id===id));if(!ids.length||new Set(ids).size!==ids.length||lines.some(l=>!l||l.locked))throw Error('Velg ulåste linjer');return lines;}
 function extend(d,id,end,points){const [line]=editableLines(d,[id]);if(!['start','end'].includes(end)||!Array.isArray(points)||!points.length)throw Error('Velg et endepunkt og tegn videre');const g=groupFor(d,id);if(g?.kind==='joined'&&g.joins.some(j=>j.a===id&&j.aEnd===end||j.b===id&&j.bEnd===end))throw Error('Dette endepunktet er koblet. Løsne koblingen først.');const anchor=end==='start'?line.points[0]:line.points.at(-1);let last=anchor;for(const p of points){if(p.x===last.x&&p.y===last.y)throw Error('To linjepunkter kan ikke ligge oppå hverandre');last=p;}setLinePoints(d,id,end==='start'?[...clone(points).reverse(),...line.points]:[...line.points,...clone(points)],{preserveStations:true});}
 function styleLines(d,ids,patch){const lines=editableLines(d,ids);if(Object.keys(patch).some(k=>!['color','width'].includes(k)))throw Error('Ugyldig linjeegenskap');for(const l of lines)Object.assign(l,patch);validate(d);}
 function removeObjects(d,ids){const objects=[...d.artwork.lines,...d.artwork.stops];if(!ids.length||ids.some(id=>{const o=objects.find(o=>o.id===id);return !o||o.locked;}))throw Error('Lås opp de markerte lagene før sletting');const set=new Set(ids);for(const g of d.artwork.groups||[])if(g.memberIds.some(id=>set.has(id)))detachGroup(d,g.id);d.artwork.lines=d.artwork.lines.filter(l=>!set.has(l.id));d.artwork.stops=d.artwork.stops.filter(s=>!set.has(s.id));for(const s of d.artwork.stops){s.lineIds=s.lineIds.filter(id=>!set.has(id));if(s.anchor&&set.has(s.anchor.lineId))delete s.anchor;if(s.anchor?.fixedPoints)s.anchor.fixedPoints=s.anchor.fixedPoints.filter(p=>s.lineIds.includes(p.lineId));if(s.leds){s.leds=s.leds.filter(l=>!set.has(l.lineId));for(const led of s.leds)if(set.has(led.sourceStopId)){delete led.sourceStopId;delete led.quayId;}}}for(const id of set)delete d.bindings[id];refreshStations(d);validate(d);}
 function offsetPoints(points,distance){
  const normals=points.slice(1).map((p,i)=>{const a=points[i],dx=p.x-a.x,dy=p.y-a.y,len=Math.hypot(dx,dy);if(!len)throw Error('Fjern doble linjepunkter først');return {x:-dy/len,y:dx/len};});
  const result=points.map((p,i)=>{const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)],den=1+a.x*b.x+a.y*b.y;if(den<.125)throw Error('For skarp sving for felles avstand');return {x:p.x+(a.x+b.x)/den*distance,y:p.y+(a.y+b.y)/den*distance};});
  for(let i=1;i<points.length;i++)if((result[i].x-result[i-1].x)*(points[i].x-points[i-1].x)+(result[i].y-result[i-1].y)*(points[i].y-points[i-1].y)<=1e-8)throw Error('For stor avstand ved en kort sving. Reduser avstanden.');return result;
 }
 function spaceLines(d,ids,spacing){const lines=editableLines(d,ids);if(ids.some(id=>groupFor(d,id)))throw Error('Juster den koblede traséen eller løsne gruppen først');if(lines.length<2||!Number.isFinite(spacing)||spacing<2||spacing>200)throw Error('Velg minst to linjer og avstand 2–200');const points=clone(lines[0].points);lines.slice(1).forEach((l,i)=>l.points=offsetPoints(points,spacing*(i+1)));refreshStations(d);validate(d);}
 // Optional groups extend v1 documents without changing route or source identities.
 const groupFor=(d,id)=>(d.artwork.groups||[]).find(g=>g.memberIds.includes(id));
 const endPoint=(l,end)=>end==='start'?l.points[0]:l.points.at(-1);
 const samePoint=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-7;
 const laneOffset=(g,i)=>g.spacing*(g.side==='left'?-i:g.side==='center'?i-(g.memberIds.length-1)/2:i);
 function validateGroups(d,point){
  const groups=d.artwork.groups;if(groups===undefined)return;if(!Array.isArray(groups)||groups.length>250)throw Error('Ugyldige linjegrupper');
  const used=new Set(),groupIds=new Set();
  for(const g of groups){
   if(!g||typeof g.id!=='string'||!g.id||g.id.length>200||groupIds.has(g.id)||!['parallel','shared','visual','joined'].includes(g.kind)||!Array.isArray(g.memberIds)||g.memberIds.length<2||g.memberIds.length>500)throw Error('Ugyldig linjegruppe');groupIds.add(g.id);
   for(const id of g.memberIds){if(used.has(id)||!d.artwork.lines.some(l=>l.id===id))throw Error('En linje kan bare tilhøre én gruppe');used.add(id);}
   if(g.kind==='parallel'||g.kind==='shared'){
    if(g.memberIds.length>9||!Number.isFinite(g.spacing)||g.spacing<2||g.spacing>200||!['left','right','center'].includes(g.side)||!Array.isArray(g.spine)||g.spine.length<2||g.spine.length>5000||!g.spine.every(point)||!Array.isArray(g.generatedIds)||new Set(g.generatedIds).size!==g.generatedIds.length||g.generatedIds.some(id=>!g.memberIds.includes(id))||g.generatedIds.includes(g.memberIds[0]))throw Error('Ugyldig felles trasé');
    if(g.vertexOffsets&&(!Array.isArray(g.vertexOffsets)||g.vertexOffsets.length!==g.memberIds.length||g.vertexOffsets.some(a=>!Array.isArray(a)||a.length!==g.spine.length||a.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))))throw Error('Ugyldige parallelle punktforskyvninger');g.memberIds.forEach((id,i)=>{const expected=g.vertexOffsets?g.spine.map((p,j)=>({x:p.x+g.vertexOffsets[i][j].x,y:p.y+g.vertexOffsets[i][j].y})):offsetPoints(g.spine,laneOffset(g,i)),actual=d.artwork.lines.find(l=>l.id===id).points;if(actual.length!==expected.length||actual.some((p,i)=>!samePoint(p,expected[i])))throw Error('Linjen avviker fra felles trasé');});
   }
   if(g.kind==='joined'){
    if(g.memberIds.some(id=>{const l=d.artwork.lines.find(l=>l.id===id);return samePoint(l.points[0],l.points.at(-1));}))throw Error('Lukkede linjer kan ikke kobles til en åpen kjede');
    if(!Array.isArray(g.joins)||g.joins.length!==g.memberIds.length-1)throw Error('Ugyldig endepunktkobling');
    const endpoints=new Set(),edges=new Map(g.memberIds.map(id=>[id,[]]));
    for(const j of g.joins){if(!g.memberIds.includes(j.a)||!g.memberIds.includes(j.b)||j.a===j.b||!['start','end'].includes(j.aEnd)||!['start','end'].includes(j.bEnd)||endpoints.has(j.a+':'+j.aEnd)||endpoints.has(j.b+':'+j.bEnd))throw Error('Forgrenet endepunktkobling');endpoints.add(j.a+':'+j.aEnd);endpoints.add(j.b+':'+j.bEnd);edges.get(j.a).push(j.b);edges.get(j.b).push(j.a);if(!samePoint(endPoint(d.artwork.lines.find(l=>l.id===j.a),j.aEnd),endPoint(d.artwork.lines.find(l=>l.id===j.b),j.bEnd)))throw Error('Endepunktene møtes ikke');}
    const seen=new Set(),visit=id=>{if(seen.has(id))return;seen.add(id);for(const next of edges.get(id))visit(next);};visit(g.memberIds[0]);if(seen.size!==g.memberIds.length)throw Error('Traséen må være sammenhengende');
   }
  }
 }
 function freeLines(d,ids){const lines=editableLines(d,ids);if(lines.length<2||ids.some(id=>groupFor(d,id)))throw Error('Velg minst to separate linjer. Løsne eksisterende grupper først.');return lines;}
 function addGroup(d,g){if((d.artwork.groups||[]).some(v=>v.id===g.id))throw Error('Gruppen finnes allerede');(d.artwork.groups??=[]).push(g);}
 function reflow(d,g,updateStations=true){stabilizeAnchors(d);if(updateStations)clearFixedStations(d,g.memberIds);g.memberIds.forEach((id,i)=>{d.artwork.lines.find(l=>l.id===id).points=g.vertexOffsets?g.spine.map((p,j)=>({x:p.x+g.vertexOffsets[i][j].x,y:p.y+g.vertexOffsets[i][j].y})):offsetPoints(g.spine,laneOffset(g,i));});if(updateStations)refreshStations(d);}
 function groupLines(d,ids,groupId){freeLines(d,ids);addGroup(d,{id:groupId,kind:'visual',memberIds:[...ids]});validate(d);}
 function shareRoute(d,ids,spacing,side,groupId){const lines=freeLines(d,ids);const g={id:groupId,kind:'shared',memberIds:[...ids],generatedIds:[],spine:clone(lines[0].points),spacing,side};addGroup(d,g);reflow(d,g);validate(d);}
 function linkedParallel(d,sourceId,count,spacing,side,groupId,newIds){
  const [source]=editableLines(d,[sourceId]);if(groupFor(d,sourceId)||!Number.isInteger(count)||count<2||count>9||newIds.length!==count-1)throw Error('Velg en separat linje og totalt 2–9 linjer');
  const colors=['#218967','#e08a3b','#6e68bb','#cc5271'].filter(c=>c!==source.color);
  newIds.forEach((id,i)=>d.artwork.lines.push({...clone(source),id,name:source.name+' · '+(i+2),color:colors[i%colors.length]}));
  const g={id:groupId,kind:'parallel',memberIds:[sourceId,...newIds],generatedIds:[...newIds],spine:clone(source.points),spacing,side};addGroup(d,g);reflow(d,g);validate(d);
 }
 function updateParallel(d,groupId,count,spacing,side,newIds=[]){
  const g=(d.artwork.groups||[]).find(g=>g.id===groupId);if(!g||!['parallel','shared'].includes(g.kind))throw Error('Velg en felles trasé');editableLines(d,g.memberIds);
  const min=g.memberIds.length-g.generatedIds.length;if(!Number.isInteger(count)||count<Math.max(2,min)||count>9||newIds.length!==Math.max(0,count-g.memberIds.length))throw Error('Behold originalene og velg totalt 2–9 linjer');
  if(count===g.memberIds.length&&spacing===g.spacing&&side===g.side)return;const scaledOffsets=g.vertexOffsets&&count===g.memberIds.length&&side===g.side?g.vertexOffsets.map(a=>a.map(p=>({x:p.x*spacing/g.spacing,y:p.y*spacing/g.spacing}))):null;
  const removed=g.memberIds.slice(count);if(removed.some(id=>!g.generatedIds.includes(id)||d.bindings[id]||d.artwork.stops.some(s=>s.lineIds.includes(id)||s.leds?.some(l=>l.lineId===id))))throw Error('Linjer med stopp eller kildekobling kan ikke fjernes her. Løsne først.');
  d.artwork.lines=d.artwork.lines.filter(l=>!removed.includes(l.id));g.memberIds=g.memberIds.slice(0,count);g.generatedIds=g.generatedIds.filter(id=>!removed.includes(id));
  const source=d.artwork.lines.find(l=>l.id===g.memberIds[0]),colors=['#e08a3b','#6e68bb','#cc5271','#218967'];
  newIds.forEach((id,i)=>{d.artwork.lines.push({...clone(source),id,name:source.name+' · '+(g.memberIds.length+1),color:colors[(g.memberIds.length-1)%colors.length]});g.memberIds.push(id);g.generatedIds.push(id);});
  if(scaledOffsets)g.vertexOffsets=scaledOffsets;else delete g.vertexOffsets;Object.assign(g,{spacing,side});reflow(d,g);validate(d);
 }
 function joinPlan(d,ids){
  const lines=freeLines(d,ids),joins=[];
  for(let i=0;i<lines.length;i++)for(let k=i+1;k<lines.length;k++)for(const aEnd of ['start','end'])for(const bEnd of ['start','end'])if(samePoint(endPoint(lines[i],aEnd),endPoint(lines[k],bEnd)))joins.push({a:lines[i].id,aEnd,b:lines[k].id,bEnd});
  const candidate=clone(d);addGroup(candidate,{id:'join-preview',kind:'joined',memberIds:[...ids],joins});try{validate(candidate);}catch{throw Error('Endepunktene må møtes i én åpen kjede uten forgrening eller løkke.');}return joins;
 }
 function joinLines(d,ids,groupId){const joins=joinPlan(d,ids);addGroup(d,{id:groupId,kind:'joined',memberIds:[...ids],joins});validate(d);}
 function detachGroup(d,groupId){const g=(d.artwork.groups||[]).find(g=>g.id===groupId);if(!g)throw Error('Gruppen finnes ikke');editableLines(d,g.memberIds);for(const stop of d.artwork.stops)if(stop.anchor?.kind==='route'&&g.memberIds.includes(stop.anchor.lineId))stop.anchor.kind='station';d.artwork.groups=d.artwork.groups.filter(g=>g.id!==groupId);if(!d.artwork.groups.length)delete d.artwork.groups;validate(d);}
 function transformIds(d,ids){return [...new Set(ids.flatMap(id=>groupFor(d,id)?.memberIds||[id]))];}
 function setLinePoints(d,id,points,{preserveStations=false}={}){
  const [line]=editableLines(d,[id]),g=groupFor(d,id);preserveStations ||= points.length!==line.points.length;if(g)editableLines(d,g.memberIds);stabilizeAnchors(d);const affected=g?.memberIds||[id],frozen=preserveStations?d.artwork.stops.filter(s=>s.anchor&&s.lineIds.some(id=>affected.includes(id))).map(s=>({id:s.id,layout:stationLayout(d,s)})):[];if(!preserveStations)clearFixedStations(d,affected);
  if(g&&['parallel','shared'].includes(g.kind)){if(g.vertexOffsets&&points.length===g.spine.length){const offsets=g.vertexOffsets[g.memberIds.indexOf(id)];g.spine=points.map((p,i)=>({x:p.x-offsets[i].x,y:p.y-offsets[i].y}));}else{delete g.vertexOffsets;g.spine=offsetPoints(points,-laneOffset(g,g.memberIds.indexOf(id)));}reflow(d,g,false);}
  else{line.points=clone(points);if(g?.kind==='joined')for(const j of g.joins){if(j.a===id){const l=d.artwork.lines.find(l=>l.id===j.b);Object.assign(endPoint(l,j.bEnd),endPoint(line,j.aEnd));}if(j.b===id){const l=d.artwork.lines.find(l=>l.id===j.a);Object.assign(endPoint(l,j.aEnd),endPoint(line,j.bEnd));}}}
  for(const saved of frozen){const stop=d.artwork.stops.find(s=>s.id===saved.id),a=stop.anchor,primary=d.artwork.lines.find(l=>l.id===a.lineId),oldPoint=saved.layout.points.find(p=>p.lineId===a.lineId),p=project(oldPoint,primary);a.segment=p.segment;a.t=p.t;a.fixedPoints=clone(saved.layout.points);a.fixedAngle=saved.layout.angle;}refreshStations(d);validate(d);
 }
 function translate(d,ids,dx,dy){
  stabilizeAnchors(d);const targets=transformIds(d,ids);clearFixedStations(d,targets);const objects=[...d.artwork.lines,...d.artwork.stops].filter(o=>targets.includes(o.id));if(!Number.isFinite(dx)||!Number.isFinite(dy)||objects.length!==targets.length||objects.some(o=>o.locked))throw Error('Lås opp hele gruppen før flytting');
  for(const o of objects){if(o.points)o.points=o.points.map(p=>({x:p.x+dx,y:p.y+dy}));else{o.x+=dx;o.y+=dy;if(o.anchor&&!targets.includes(o.anchor.lineId))delete o.anchor;}}
  for(const g of d.artwork.groups||[])if(g.spine&&g.memberIds.some(id=>targets.includes(id)))g.spine=g.spine.map(p=>({x:p.x+dx,y:p.y+dy}));refreshStations(d);validate(d);
 }
 // Station snapping uses raw drawing coordinates and a tolerance in screen pixels.
 function project(p,line){let best=null,total=0;const lengths=line.points.slice(1).map((b,i)=>Math.hypot(b.x-line.points[i].x,b.y-line.points[i].y)),length=lengths.reduce((a,b)=>a+b,0);line.points.slice(1).forEach((b,i)=>{const a=line.points[i],dx=b.x-a.x,dy=b.y-a.y,len=lengths[i],t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(len*len||1))),q={x:a.x+t*dx,y:a.y+t*dy},dist=Math.hypot(q.x-p.x,q.y-p.y);if(!best||dist<best.dist)best={...q,dist,segment:i,t,progress:length?(total+t*len)/length:0,angle:Math.atan2(dy,dx)*180/Math.PI};total+=len;});return best;}
 function along(line,progress){const lengths=line.points.slice(1).map((b,i)=>Math.hypot(b.x-line.points[i].x,b.y-line.points[i].y));let distance=lengths.reduce((a,b)=>a+b,0)*progress;for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1){const a=line.points[i],b=line.points[i+1],t=lengths[i]?distance/lengths[i]:0;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI};}distance-=lengths[i];}}
 function stationCandidates(d,p,zoom,tolerance=14){if(!Number.isFinite(zoom)||zoom<=0||!Number.isFinite(tolerance)||tolerance<0)throw Error('Ugyldig snap-toleranse');return d.artwork.lines.filter(l=>l.visible).map(l=>({lineId:l.id,...project(p,l)})).filter(c=>c.dist*zoom<=tolerance).sort((a,b)=>a.dist-b.dist||a.lineId.localeCompare(b.lineId));}
 function anchorPoint(line,a){if(a.segment===undefined)return along(line,a.progress);const p=line.points[a.segment],q=line.points[a.segment+1];return {x:p.x+(q.x-p.x)*a.t,y:p.y+(q.y-p.y)*a.t,angle:Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI};}
 function stabilizeAnchors(d){for(const s of d.artwork.stops)if(s.anchor&&s.anchor.segment===undefined){const a=s.anchor,line=d.artwork.lines.find(l=>l.id===a.lineId),p=project(along(line,a.progress),line);a.segment=p.segment;a.t=p.t;}}
 function clearFixedStations(d,ids){for(const s of d.artwork.stops)if(s.anchor&&s.lineIds.some(id=>ids.includes(id))){delete s.anchor.fixedPoints;delete s.anchor.fixedAngle;}}
 function stationLayout(d,s){
  const primary=d.artwork.lines.find(l=>l.id===s.anchor.lineId),p=anchorPoint(primary,s.anchor),points=s.anchor.fixedPoints||s.lineIds.map(lineId=>({lineId,...project(p,d.artwork.lines.find(l=>l.id===lineId))}));
  let a=points[0],b=a,distance=0;for(const x of points)for(const y of points){const dist=Math.hypot(y.x-x.x,y.y-x.y);if(dist>distance){a=x;b=y;distance=dist;}}
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,span:Math.max(10,distance+12),angle:s.anchor.fixedPoints?s.anchor.fixedAngle:distance?Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI:p.angle+90,points};
 }
 function refreshStations(d){for(const s of d.artwork.stops.filter(s=>s.anchor)){const layout=stationLayout(d,s);if(s.locked&&(!samePoint(s,layout)||s.autoSymbol&&(Math.abs(s.span-layout.span)>1e-7||Math.abs(s.symbolAngle-(layout.angle+360)%360)>1e-7)))throw Error('Et tilknyttet stopp er låst. Lås opp stoppet før traséen endres.');s.x=layout.x;s.y=layout.y;if(s.autoSymbol){s.span=layout.span;s.symbolAngle=(layout.angle+360)%360;}}}
 function ensureLeds(s){s.leds??=[];for(const lineId of s.lineIds)if(!s.leds.some(l=>l.lineId===lineId)){let n=1;while(s.leds.some(l=>l.id===s.id+'-led-'+n))n++;s.leds.push({id:s.id+'-led-'+n,lineId});}}
 function placeStation(d,id,p,lineIds=[],kind='line'){
  const s=d.artwork.stops.find(s=>s.id===id);if(!s||s.locked||!['line','route','station','free'].includes(kind)||new Set(lineIds).size!==lineIds.length||lineIds.some(id=>!d.artwork.lines.some(l=>l.id===id&&l.visible)))throw Error('Velg et ulåst stopp og synlige linjer');
  if(!lineIds.length){Object.assign(s,{x:p.x,y:p.y});delete s.anchor;}
  else{
   if(kind==='free'||kind==='line'&&lineIds.length!==1)throw Error('Velg én linje eller en felles stasjon');
   if(kind==='route'){const g=groupFor(d,lineIds[0]);if(!g?.spine||lineIds.some(id=>!g.memberIds.includes(id)))throw Error('Velg linjer i en felles trasé');}
   s.lineIds=[...lineIds];const projected=project(p,d.artwork.lines.find(l=>l.id===lineIds[0]));s.anchor={kind,lineId:lineIds[0],segment:projected.segment,t:projected.t};s.autoSymbol=true;ensureLeds(s);
   if(kind==='station'&&!['double','capsule','leds'].includes(s.symbol))s.symbol=lineIds.length===2?'double':'capsule';refreshStations(d);
  }validate(d);
 }
 function detachStation(d,id){const s=d.artwork.stops.find(s=>s.id===id);if(!s||s.locked)throw Error('Velg et ulåst stopp');delete s.anchor;s.lineIds=[];validate(d);}
 function setStationSymbol(d,id,value){const s=d.artwork.stops.find(s=>s.id===id);if(!s||s.locked)throw Error('Velg et ulåst stopp');s.symbol=value;ensureLeds(s);validate(d);}
 function setLedSource(d,stopId,ledId,sourceStopId,quayId){const s=d.artwork.stops.find(s=>s.id===stopId),led=s?.leds?.find(l=>l.id===ledId);if(!led||s.locked)throw Error('Velg et ulåst LED-punkt');if(sourceStopId){led.sourceStopId=sourceStopId;led.quayId=quayId;}else{delete led.sourceStopId;delete led.quayId;}validate(d);}
 function validateStations(d){
  const ledIds=new Set();for(const s of d.artwork.stops){
   if(new Set(s.lineIds).size!==s.lineIds.length)throw Error('Doble linjekoblinger');
   if(s.autoSymbol!==undefined&&typeof s.autoSymbol!=='boolean')throw Error('Ugyldig symboltilpasning');
   if(s.anchor&&(!['line','route','station'].includes(s.anchor.kind)||!s.lineIds.includes(s.anchor.lineId)||s.anchor.progress!==undefined&&(!Number.isFinite(s.anchor.progress)||s.anchor.progress<0||s.anchor.progress>1)||s.anchor.segment===undefined&&s.anchor.progress===undefined||s.anchor.segment!==undefined&&(!Number.isInteger(s.anchor.segment)||s.anchor.segment<0||s.anchor.segment>=d.artwork.lines.find(l=>l.id===s.anchor.lineId).points.length-1||!Number.isFinite(s.anchor.t)||s.anchor.t<0||s.anchor.t>1)||s.anchor.kind==='line'&&s.lineIds.length!==1))throw Error('Ugyldig stasjonsanker');
   if(s.anchor?.fixedPoints){if(!Array.isArray(s.anchor.fixedPoints)||s.anchor.fixedPoints.length!==s.lineIds.length||!Number.isFinite(s.anchor.fixedAngle)||s.anchor.fixedPoints.some((p,i)=>p.lineId!==s.lineIds[i]||![p.x,p.y].every(Number.isFinite)||p.x<0||p.y<0||p.x>d.width||p.y>d.height))throw Error('Ugyldig stabil stasjonsreferanse');}
   if(s.anchor?.kind==='route'){const g=groupFor(d,s.anchor.lineId);if(!g?.spine||s.lineIds.some(id=>!g.memberIds.includes(id)))throw Error('Ugyldig felles trasé for stopp');}
   if(s.anchor){const layout=stationLayout(d,s);if(!samePoint(s,layout))throw Error('Stoppet avviker fra linjeankeret');if(s.autoSymbol&&(Math.abs(s.span-layout.span)>1e-7||Math.abs(s.symbolAngle-(layout.angle+360)%360)>1e-7))throw Error('Stoppsymbolet avviker fra linjene');}
   if(s.leds!==undefined){if(!Array.isArray(s.leds)||s.leds.length>500)throw Error('Ugyldige LED-punkter');const routes=new Set();for(const l of s.leds){if(!l||typeof l.id!=='string'||!l.id||l.id.length>250||ledIds.has(l.id)||routes.has(l.lineId)||!d.artwork.lines.some(line=>line.id===l.lineId))throw Error('Ugyldig LED-identitet');ledIds.add(l.id);routes.add(l.lineId);if(l.sourceStopId!==undefined||l.quayId!==undefined){const b=d.bindings[l.sourceStopId];if(!d.artwork.stops.some(stop=>stop.id===l.sourceStopId)||!b?.quayIds.includes(l.quayId))throw Error('LED-kilden må være en eksisterende Quay-kobling');}}}
  }
 }
 function stationShapes(d,s){
  const shape=symbol(s),angle=shape.angle*Math.PI/180,at=x=>({x:s.x+x*Math.cos(angle),y:s.y+x*Math.sin(angle)}),parts=[];
  if(s.symbol==='double'){const a=at(-Math.max(0,shape.width/2-5)),b=at(Math.max(0,shape.width/2-5));parts.push({tag:'line',attrs:{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#203c32','stroke-width':3}});for(const p of [a,b])parts.push({tag:'circle',attrs:{cx:p.x,cy:p.y,r:5,fill:'white',stroke:'#203c32','stroke-width':2}});}
  else parts.push({tag:'rect',attrs:{x:s.x-shape.width/2,y:s.y-5,width:shape.width,height:10,rx:5,fill:shape.ring?'#203c32':'white',stroke:'#203c32','stroke-width':2,transform:'rotate('+shape.angle+' '+s.x+' '+s.y+')'}});
  if(s.symbol==='leds'){
   const points=s.anchor?stationLayout(d,s).points:s.lineIds.map((lineId,i)=>({lineId,...at(s.lineIds.length>1?(i/(s.lineIds.length-1)-.5)*Math.max(0,shape.width-12):0)}));
   for(const p of points){const led=s.leds?.find(l=>l.lineId===p.lineId);if(led)parts.push({tag:'circle',attrs:{cx:p.x,cy:p.y,r:3.5,fill:d.artwork.lines.find(l=>l.id===p.lineId).color,stroke:'#203c32','stroke-width':1,'data-led-id':led.id,'data-line-id':p.lineId,...(led.quayId?{'data-quay-id':led.quayId}:{})}});}
  }return parts;
 }
 function labelPreset(s,preset){const angles={'horizontal':0,'up':315,'down':45,'vertical':90,'right':0,'left':0};if(!(preset in angles))throw Error('Ukjent navneretning');s.labelAngle=angles[preset];if(preset==='right'||preset==='left'){s.labelSide=preset;s.labelDx=(preset==='left'?-1:1)*Math.abs(s.labelDx||12);}}
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 function svg(d){validate(d);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}"><rect width="100%" height="100%" fill="white"/>`+d.artwork.lines.filter(l=>l.visible).map(l=>`<polyline points="${l.points.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="${l.color}" stroke-width="${l.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')+d.artwork.stops.filter(s=>s.visible).map(s=>stationShapes(d,s).map(part=>'<'+part.tag+' '+Object.entries(part.attrs).map(([k,v])=>k+'="'+escape(v)+'"').join(' ')+'/>' ).join('')+`<text x="${label(s).x}" y="${label(s).y}" text-anchor="${label(s).anchor}" transform="rotate(${label(s).angle} ${label(s).x} ${label(s).y})" font-family="sans-serif" font-size="12">${escape(s.name)}</text>`).join('')+'</svg>';}
 const api={blank,validate,fromTrondheim,history,svg,resize,label,symbol,parallel,arrangeLabels,extend,styleLines,removeObjects,spaceLines,labelPreset,groupFor,groupLines,shareRoute,linkedParallel,updateParallel,joinPlan,joinLines,detachGroup,transformIds,setLinePoints,translate,project,stationCandidates,stationLayout,refreshStations,placeStation,detachStation,setStationSymbol,setLedSource,stationShapes};root.InTransitStudioDocument=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitMapLayoutOps=api;
})(globalThis,function(){
 'use strict';
 const W=913,H=1280;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 const clampPos=(x,y)=>({x:clamp(Number.isFinite(x)?x:W/2,0,W),y:clamp(Number.isFinite(y)?y:H/2,0,H)});
 function availableId(items,prefix){
  const used=new Set(items.map(item=>item.id));
  for(let n=1;n<10000;n++){const id=prefix+String(n).padStart(3,'0');if(!used.has(id))return id;}
  throw Error('Ingen ledige kart-ID-er');
 }
 function addStop(layout,x,y){
  const pos=clampPos(x,y),id=availableId(layout.stops,'custom-stop-');
  const label=clampPos(pos.x+8,pos.y-8);
  layout.stops.push({id,name:'Uavklart nytt stopp',nameConfirmed:false,verification:'unresolved',
   x:pos.x,y:pos.y,radius:4,diodeMode:'shared',label:{...label,visible:true},
   bindings:[],reviewNote:'Ny holdeplass: navn og Entur-/Quay-ID avklares senere'});
  return id;
 }
 // Move the existing physical stop and its label as one visual unit.
 // Preserve ID, official name, Quay/StopPlace bindings and all route geometry.
 function moveStop(layout,id,x,y){
  const stop=layout.stops.find(s=>s.id===id);
  if(!stop)throw Error('Ukjent holdeplass');
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>W||y>H)
   throw Error('Plassering må være innenfor kartet');
  const dx=x-stop.x,dy=y-stop.y;
  stop.x=x;stop.y=y;
  stop.label.x=clamp(stop.label.x+dx,0,W);
  stop.label.y=clamp(stop.label.y+dy,0,H);
  return stop;
 }
 function moveLabel(layout,id,x,y){
  const stop=layout.stops.find(s=>s.id===id);
  if(!stop)throw Error('Ukjent holdeplass');
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>W||y>H)
   throw Error('Etiketten må plasseres innenfor kartet');
  stop.label.x=x;stop.label.y=y;
  return stop;
 }
 function addPath(layout,x,y){
  const a=clampPos(x,y),end=clampPos(a.x+34<=W?a.x+34:a.x-34,a.y);
  const id=availableId(layout.paths,'custom-path-');
  layout.paths.push({id,color:'#60758c',width:1.5,routes:[],verification:'unresolved',
   points:[a,end]});
  return id;
 }
 function pathById(layout,id){
  const p=layout.paths.find(p=>p.id===id);
  if(!p)throw Error('Kartlinjen finnes ikke');
  return p;
 }
 function extendPath(layout,id){
  const path=pathById(layout,id),points=path.points,last=points[points.length-1],prior=points[points.length-2];
  if(points.length>=1000)throw Error('For mange knekkpunkter');
  let dx=last.x-prior.x,dy=last.y-prior.y,len=Math.hypot(dx,dy);
  if(len<.5){dx=25;dy=0;len=25;}
  const norm=25/len;
  let x=last.x+dx*norm,y=last.y+dy*norm;
  if(x<0||x>W||y<0||y>H){x=last.x-dx*norm;y=last.y-dy*norm;}
  const pos=clampPos(x,y);
  if(Math.hypot(pos.x-last.x,pos.y-last.y)<1)throw Error('Ikke plass til nytt linjepunkt');
  path.points.push(pos);
  return points.length-1;
 }
 function insertVertex(layout,id,edgeIndex){
  const path=pathById(layout,id),i=Number(edgeIndex);
  if(!Number.isInteger(i)||i<0||i>=path.points.length-1)throw Error('Ugyldig delstrekning');
  if(path.points.length>=1000)throw Error('For mange knekkpunkter');
  const a=path.points[i],b=path.points[i+1],mid=clampPos((a.x+b.x)/2,(a.y+b.y)/2);
  if(Math.hypot(a.x-b.x,a.y-b.y)<1)throw Error('Delstrekningen er for kort');
  path.points.splice(i+1,0,mid);
  // A manually reviewed edge must not be inherited by two new edges.
  // Keep reviewed edges elsewhere in the path by shifting their indices.
  if(path.reviewedSegments){
   const next={};
   for(const [raw,value] of Object.entries(path.reviewedSegments)){
    const k=Number(raw);
    if(k<i)next[k]=value;
    else if(k>i)next[k+1]=value;
   }
   path.reviewedSegments=next;
  }
  return i+1;
 }
 function removeLastVertex(layout,id){
  const path=pathById(layout,id);
  if(path.points.length<=2)throw Error('Kartlinjen må ha minst to punkter');
  const edge=path.points.length-2;
  path.points.pop();
  if(path.reviewedSegments)delete path.reviewedSegments[edge];
 }
 // Drawing is stored as a complete validated transaction, never as
 // half-finished geometry in the persistent JSON draft.
 function validateVertices(vertices,previous=null){
  if(!Array.isArray(vertices)||!vertices.length||vertices.length>1000)throw Error('Ugyldig antall linjepunkter');
  let last=previous,points=[];
  for(const v of vertices){
   if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y)||v.x<0||v.y<0||v.x>W||v.y>H)
    throw Error('Linjepunkt må være innenfor kartet');
   if(last&&Math.hypot(v.x-last.x,v.y-last.y)<1)throw Error('To linjepunkter er for nær hverandre');
   const at={x:v.x,y:v.y};
   points.push(at);last=at;
  }
  return points;
 }
 function drawPath(layout,vertices){
  if(!Array.isArray(vertices)||vertices.length<2)throw Error('Minst to punkter kreves for en ny linje');
  const points=validateVertices(vertices),id=availableId(layout.paths,'custom-path-');
  layout.paths.push({id,color:'#60758c',width:1.5,routes:[],verification:'unresolved',points});
  return id;
 }
 function appendPath(layout,id,vertices){
  const path=pathById(layout,id),added=validateVertices(vertices,path.points[path.points.length-1]);
  if(path.points.length+added.length>1000)throw Error('For mange linjepunkter');
  path.points.push(...added);
  // Existing reviewedSegments are edge-indexed. Appending to the tail
  // preserves all reviewed old edges; new edges start without approvals.
  return path.points.length;
 }
 function deleteNewStop(layout,id){
  if(!/^custom-stop-\d+$/.test(id))throw Error('Opprinnelige holdeplasser kan ikke slettes');
  const index=layout.stops.findIndex(s=>s.id===id);
  if(index<0)throw Error('Ukjent holdeplass');
  layout.stops.splice(index,1);
 }
 function deleteNewPath(layout,id){
  if(!/^custom-path-\d+$/.test(id))throw Error('Opprinnelige linjer kan ikke slettes');
  const index=layout.paths.findIndex(p=>p.id===id);
  if(index<0)throw Error('Ukjent kartlinje');
  layout.paths.splice(index,1);
 }
 return {addStop,moveStop,moveLabel,addPath,extendPath,insertVertex,removeLastVertex,drawPath,appendPath,deleteNewStop,deleteNewPath};
});

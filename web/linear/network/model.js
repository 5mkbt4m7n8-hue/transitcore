(function(root,factory){const api=factory(typeof module==='object'?require('../../shared/signal-policy.js'):root.TransitCoreSignals);if(typeof module==='object')module.exports=api;root.InTransitMapModel=api;})(globalThis,function(Signals){
 'use strict';
 const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=913&&p.y>=0&&p.y<=1280;
 function validate(layout){
  const errors=[],ids=new Set;
  if(layout?.schemaVersion!==1||layout?.viewBox?.join(' ')!=='0 0 913 1280')errors.push('Ukjent kartformat / viewBox');
  if(!Array.isArray(layout?.stops)||!Array.isArray(layout?.paths))return [...errors,'Mangler stopp eller linjer'];
  if(layout.stops.length>3000||layout.paths.length>1000)errors.push('For stort kart');
  for(const s of layout.stops){
   if(!s||typeof s!=='object'){errors.push('Ugyldig stopp');continue;}
   if(typeof s.id!=='string'||!s.id||ids.has(s.id))errors.push('Duplisert / ugyldig kart-ID');ids.add(s.id);
   if(!point(s)||!point(s.label)||typeof s.name!=='string'||typeof s.label.visible!=='boolean'||!['shared','split'].includes(s.diodeMode)||!Number.isFinite(s.radius)||s.radius<2||s.radius>20||!Array.isArray(s.bindings))errors.push('Ugyldig stopp '+s.id);
   for(const b of Array.isArray(s.bindings)?s.bindings:[])if(!b||typeof b.boardId!=='string'||typeof b.nodeId!=='string')errors.push('Ugyldig kobling '+s.id);
  }
  for(const p of layout.paths)if(!p||typeof p.id!=='string'||ids.has(p.id)||!/^#[a-f\d]{6}$/i.test(p.color)||!Number.isFinite(p.width)||p.width<.5||p.width>15||!Array.isArray(p.points)||p.points.length<2||!p.points.every(point)||!Array.isArray(p.routes))errors.push('Ugyldig linje '+p.id);else ids.add(p.id);
  return errors;
 }
 function resolve(stop,board,hardware){
  if(stop.verification!=='confirmed')return [];
  return stop.bindings.filter(b=>b.boardId===board?.id).flatMap(b=>{
   const node=board.nodes.find(n=>n.id===b.nodeId&&n.stationId===b.stationId);
   if(!node||!node.stopIds?.includes(b.stopId))return [];
   const a=hardware.assignments.find(a=>a.logicalLed===node.led);
   return a?[{...b,node,physicalLed:a.physicalLed}]:[];
  });
 }
 function signals(stop,board,hardware,frame,line,now=Date.now(),direction=null){
  const age=(now-Date.parse(frame?.generatedAt))/1000;
  if(!Number.isFinite(age)||age<0||age>Number(frame.ttlSeconds||30))return [];
  const bindings=resolve(stop,board,hardware);
  const ids=new Set(bindings.map(b=>b.physicalLed));
  return (frame.leds||[]).filter(l=>ids.has(l.id)).flatMap(l=>{
   const source=l.occupants?.length?l.occupants:l.vehicle?[l.vehicle]:[];
   return source.filter(v=>line===null||String(v.line)===String(line)).filter(v=>{if(direction===null)return true;const route=direction.route||direction.routesByLine?.[String(v.line)];return !!route&&bindings.some(b=>b.physicalLed===l.id&&b.node.routeDirections?.[route]?.directionIds?.includes(direction.id));}).map(v=>({...v,rgb:v.rgb||l.rgb,state:Signals.normalize(l.lifecycle==='PASSED'||l.lifecycle==='PARKED'?l.lifecycle:v.state||l.lifecycle||l.state),physicalLed:l.id}));
  }).filter(v=>v.state!=='OFF');
 }
 function report(layout,boards){
  const result={complete:false,unmapped:[],feedStopsMissing:[],unclearDirections:[],multiLine:[],duplicates:[],unconfirmed:[],unconfirmedNames:[],invalidBindings:[],unresolvedPaths:layout.paths.filter(p=>p.verification!=='confirmed').map(p=>p.id)},seen=new Map;
  for(const s of layout.stops){
   if(s.verification!=='confirmed')result.unconfirmed.push(s.id);
   if(!s.nameConfirmed)result.unconfirmedNames.push(s.id);
   if(s.reviewNote)result.unclearDirections.push({stop:s.id,note:s.reviewNote});
   if(!s.bindings.length)result.unmapped.push(s.id);
   const routes=new Set;
   for(const b of s.bindings){
    const node=boards.find(x=>x.id===b.boardId)?.nodes.find(n=>n.id===b.nodeId&&n.stationId===b.stationId&&n.stopIds?.includes(b.stopId));
    const key=b.boardId+':'+b.nodeId;
    if(!node){result.invalidBindings.push({stop:s.id,binding:b});continue;}
    if(seen.has(key)&&seen.get(key)!==s.id)result.duplicates.push({node:key,stops:[seen.get(key),s.id]});seen.set(key,s.id);
    node.routes.forEach(r=>routes.add(r));
    if(!node.routeDirections||node.routes.some(r=>!node.routeDirections[r]?.directionIds?.length))result.unclearDirections.push(key);
   }
   if(routes.size>1)result.multiLine.push({stop:s.id,routes:[...routes]});
  }
  for(const board of boards)for(const n of board.nodes)if(!seen.has(board.id+':'+n.id))result.feedStopsMissing.push({board:board.id,node:n.id,name:n.name});
  return result;
 }

 // Only exact, consecutive Quay IDs within the same route profile may color
 // an edge whose *two* vertices uniquely match verified schematic stops.
 // Names, GPS distances, ETA and inferred full-path route membership are insufficient.
 function verifiedSegments(layout,profiles){
  const stops=(layout.stops||[]).filter(s=>s.verification==='confirmed'&&s.bindings?.length);
  const quays=s=>new Set(s.bindings.map(b=>b.stopId).filter(x=>typeof x==='string'&&x.startsWith('NSR:Quay:')));
  const matched=p=>{const found=stops.filter(s=>Math.hypot(s.x-p.x,s.y-p.y)<=0.8);return found.length===1?found[0]:null;};
  const pair=(a,b)=>a<b?a+'|'+b:b+'|'+a,adjacency=new Map;
  for(const profile of profiles||[]){
   if(!profile?.id||!Array.isArray(profile.stops)||!/^#[0-9a-f]{6}$/i.test(profile.line?.color||''))continue;
   for(let i=1;i<profile.stops.length;i++){
    const a=profile.stops[i-1]?.id,b=profile.stops[i]?.id;
    if(typeof a!=='string'||typeof b!=='string'||a===b||!a.startsWith('NSR:Quay:')||!b.startsWith('NSR:Quay:'))continue;
    const key=pair(a,b),hits=adjacency.get(key)||new Map;
    hits.set(profile.id,{id:profile.id,line:String(profile.line.publicCode||'?'),color:profile.line.color});adjacency.set(key,hits);
   }
  }
  const edges=[];
  for(const path of layout.paths||[])for(let i=1;i<path.points.length;i++){
   const a=matched(path.points[i-1]),b=matched(path.points[i]);
   if(!a||!b||a.id===b.id)continue;
   const routes=new Map;
   for(const x of quays(a))for(const y of quays(b))for(const [key,value] of adjacency.get(pair(x,y))||[])routes.set(key,value);
   if(routes.size)edges.push({pathId:path.id,edgeIndex:i-1,a:path.points[i-1],b:path.points[i],from:a.id,to:b.id,routes:[...routes.values()].sort((x,y)=>x.line.localeCompare(y.line,'no',{numeric:true}))});
  }
  return edges;
 }
 return {validate,resolve,signals,report,verifiedSegments};
});

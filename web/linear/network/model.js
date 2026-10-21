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
 return {validate,resolve,signals,report};
});

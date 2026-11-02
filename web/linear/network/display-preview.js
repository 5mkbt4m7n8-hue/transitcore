(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitDisplayPreview=api;
})(globalThis,function(){
 'use strict';
 // Read-only diagnostic: it never guesses a Quay, physical LED or valid frame.
 function inspect(layout,displayStation,board,hardware,frame,line,now,model){
  if(!model||!displayStation||!Array.isArray(displayStation.members))return [];
  const age=frame?.generatedAt?now-Date.parse(frame.generatedAt):NaN;
  const ttl=Number(frame?.ttlSeconds||30)*1000;
  const validFrame=Array.isArray(frame?.leds)&&Number.isFinite(age)&&age>=0&&age<=ttl;
  const allAssignments=hardware?.assignments||[];
  const physicalByLogical=new Map(allAssignments.map(a=>[a.logicalLed,a.physicalLed]));
  const quayByPhysical=new Map;
  for(const node of board?.nodes||[]){
   const physical=physicalByLogical.get(node.led);
   if(!Number.isInteger(physical))continue;
   const quays=quayByPhysical.get(physical)||new Set;
   for(const id of node.stopIds||[])if(/^NSR:Quay:\d+$/.test(id))quays.add(id);
   quayByPhysical.set(physical,quays);
  }
  return displayStation.members.map(member=>{
   const stop=layout.stops.find(item=>item.id===member.mapStopId);
   const confirmed=stop?.verification==='confirmed'&&stop.bindings?.some(binding=>binding.stopId===member.quayId);
   const matching=(confirmed&&board?.nodes||[]).filter(node=>stop.bindings.some(binding=>
    binding.boardId===board.id&&binding.nodeId===node.id&&binding.stationId===node.stationId&&
    binding.stopId===member.quayId&&node.stopIds?.includes(member.quayId)));
   const logicalLeds=[...new Set(matching.map(n=>n.led).filter(Number.isInteger))];
   const physicalLeds=[...new Set(logicalLeds.map(id=>physicalByLogical.get(id)).filter(Number.isInteger))];
   const collision=physicalLeds.some(physical=>{
    const owners=quayByPhysical.get(physical);
    return owners&&[...owners].some(id=>id!==member.quayId);
   })||physicalLeds.length>1||logicalLeds.length>1;
   let status;
   if(!confirmed)status='UNVERIFIED';
   else if(!matching.length)status='UNMAPPED';
   else if(!physicalLeds.length)status='NO_HARDWARE';
   else if(collision)status='SHARED_LED';
   else if(!validFrame)status=frame?.generatedAt?'STALE':'NO_FRAME';
   else status='OFF';
   const readings=status==='OFF'?
    model.signals(stop,board,hardware,frame,line,now,null,[member.quayId]):[];
   if(readings.length)status='ACTIVE';
   return {id:member.id,mapStopId:member.mapStopId,quayId:member.quayId,
    sourceStatus:status,boardNodeIds:matching.map(n=>n.id),
    logicalLeds,physicalLeds,frameAgeSeconds:Number.isFinite(age)?Math.round(age/1000):null,
    state:status==='ACTIVE'?readings[0].state:status==='OFF'?'OFF':null,
    source:readings[0]?.source||null,vehicles:readings.map(v=>v.id).filter(Boolean),
    placementReview:member.placementReview};
  });
 }
 function simulated(mode,memberIndex){
  if(!['a','b','both','off'].includes(mode))return null;
  const on=mode==='both'||mode==='a'&&memberIndex===0||mode==='b'&&memberIndex===1;
  return {state:on?'AT_STOP':'OFF',rgb:on?[45,235,133]:null,source:'SIMULERT'};
 }
 return {inspect,simulated};
});

(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitDisplayStations=api;
})(globalThis,function(){
 'use strict';
 const quayPattern=/^NSR:Quay:\d+$/;
 const uniqueQuays=stop=>[...new Set((stop.bindings||[]).map(b=>b.stopId).filter(id=>quayPattern.test(id||'')))].sort();
 function closestTrack(layout,stop){
  let nearest=null;
  for(const path of layout.paths||[])for(let i=0;i<path.points.length-1;i++){
   const a=path.points[i],b=path.points[i+1],dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
   if(len2<.1)continue;
   const t=Math.max(0,Math.min(1,((stop.x-a.x)*dx+(stop.y-a.y)*dy)/len2));
   const distance=Math.hypot(stop.x-a.x-dx*t,stop.y-a.y-dy*t);
   if(!nearest||distance<nearest.distance)nearest={pathId:path.id,segmentIndex:i,orientation:'follow-tangent',distance};
  }
  return nearest&&nearest.distance<=30?{pathId:nearest.pathId,segmentIndex:nearest.segmentIndex,orientation:nearest.orientation}:null;
 }
 function addDouble(layout,stopId){
  const stop=layout.stops.find(s=>s.id===stopId);
  if(!stop||stop.verification!=='confirmed')throw Error('Stasjonen må ha bekreftet stoppidentitet');
  const quays=uniqueQuays(stop);
  if(quays.length!==2)throw Error('Denne første prototypen støtter nøyaktig to unike Quay-er på samme kartpunkt');
  const used=new Set((layout.displayStations||[]).flatMap(ds=>ds.members.map(m=>m.quayId)));
  if(quays.some(id=>used.has(id)))throw Error('En av disse plattformene er allerede i en visuell stasjon');
  const occupied=new Set((layout.displayStations||[]).map(ds=>ds.id));
  let id='display-'+stopId;
  if(occupied.has(id))throw Error('Stasjonsgruppen finnes allerede');
  const positions=quays.map((quayId,i)=>{
   const review=stop.platformSides?.[quayId],assigned=review?.verification==='user-reviewed'&&['left','right'].includes(review.side);
   const across=assigned?(review.side==='left'?-9:9):(i===0?-9:9);
   return {id:id+'-'+(i+1),mapStopId:stopId,quayId,slot:i===0?'a':'b',
    offset:{along:0,across},placementReview:assigned?'user-reviewed':'unreviewed'};
  });
  // A reviewed side cannot put both distinct Quays onto the same display slot.
  if(positions[0].offset.across===positions[1].offset.across){
   positions.forEach((m,i)=>{m.offset.across=i===0?-9:9;m.placementReview='unreviewed';});
  }
  const ds={id,anchor:{x:stop.x,y:stop.y},style:{type:'double_outer_ring',
   outerShape:'capsule',markerRadius:Math.max(3,stop.radius),ringPadding:4,ringWidth:1.2},
   label:{mode:'shared',sourceMapStopId:stopId},reviewStatus:positions.every(m=>m.placementReview==='user-reviewed')?'user-reviewed':'unreviewed',
   members:positions};
  const track=closestTrack(layout,stop);
  if(track)ds.trackAnchor=track;
  layout.displayStationsVersion=1;
  (layout.displayStations??=[]).push(ds);
  return id;
 }
 function remove(layout,id){
  const before=(layout.displayStations||[]).length;
  layout.displayStations=(layout.displayStations||[]).filter(ds=>ds.id!==id);
  if(layout.displayStations.length===before)throw Error('Ukjent visuell stasjon');
  if(!layout.displayStations.length){delete layout.displayStations;delete layout.displayStationsVersion;}
 }
 function geometry(layout,ds){
  const stop=layout.stops.find(s=>s.id===ds.members[0]?.mapStopId);
  if(!stop)throw Error('Stasjonsreferansen finnes ikke');
  // Initial prototype is attached to its source map marker, not free-floating.
  const anchor={x:stop.x,y:stop.y};
  let tangent={x:0,y:1};
  if(ds.trackAnchor){
   const path=layout.paths.find(p=>p.id===ds.trackAnchor.pathId);
   const a=path?.points[ds.trackAnchor.segmentIndex],b=path?.points[ds.trackAnchor.segmentIndex+1];
   if(a&&b){const length=Math.hypot(b.x-a.x,b.y-a.y);if(length>.1)tangent={x:(b.x-a.x)/length,y:(b.y-a.y)/length};}
  }
  const normal={x:-tangent.y,y:tangent.x};
  const members=ds.members.map(m=>({member:m,point:{
   x:anchor.x+tangent.x*m.offset.along+normal.x*m.offset.across,
   y:anchor.y+tangent.y*m.offset.along+normal.y*m.offset.across
  }}));
  const radius=ds.style.markerRadius,padding=ds.style.ringPadding;
  const lowX=Math.min(...members.map(m=>m.point.x))-radius-padding,highX=Math.max(...members.map(m=>m.point.x))+radius+padding;
  const lowY=Math.min(...members.map(m=>m.point.y))-radius-padding,highY=Math.max(...members.map(m=>m.point.y))+radius+padding;
  return {anchor,members,outline:{x:lowX,y:lowY,width:highX-lowX,height:highY-lowY,radius:radius+padding}};
 }
 return {uniqueQuays,addDouble,remove,geometry};
});

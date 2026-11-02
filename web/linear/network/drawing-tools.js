(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitDrawingTools=api;
})(globalThis,function(){
 'use strict';
 const WIDTH=913,HEIGHT=1280;
 const clamp=(v,max)=>Math.max(0,Math.min(max,v));
 const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
 const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const num=n=>String(Math.round(finite(n)*1000)/1000);
 const color=value=>/^#[0-9a-fA-F]{6}$/.test(value||'')?value:'#60758c';
 function snap(point,options={}){
  const size=[5,10,20].includes(Number(options.gridSize))?Number(options.gridSize):10;
  const grid=options.gridSnap===true;
  const step=options.angleStep===15||options.angleStep===45?options.angleStep:(options.angleSnap===true?45:0);
  const previous=options.previous,x=finite(point?.x),y=finite(point?.y);
  if(step&&previous&&Number.isFinite(previous.x)&&Number.isFinite(previous.y)){
   const dx=x-previous.x,dy=y-previous.y;
   if(Math.hypot(dx,dy)<0.00001)return {x:clamp(previous.x,WIDTH),y:clamp(previous.y,HEIGHT)};
   const theta=Math.round(Math.atan2(dy,dx)/(step*Math.PI/180))*step*Math.PI/180;
   // Angle snapping wins over the Cartesian grid. The grid setting controls
   // distance along the constrained ray, rather than breaking the angle.
   const cos=Math.cos(theta),sin=Math.sin(theta),norm=Math.max(Math.abs(cos),Math.abs(sin));
   const vx=cos/norm,vy=sin/norm;
   let t=Math.max(0,(dx*vx+dy*vy)/(vx*vx+vy*vy));
   if(grid)t=Math.round(t/size)*size;
   return {x:clamp(previous.x+vx*t,WIDTH),y:clamp(previous.y+vy*t,HEIGHT)};
  }
  return {x:clamp(grid?Math.round(x/size)*size:x,WIDTH),
   y:clamp(grid?Math.round(y/size)*size:y,HEIGHT)};
 }
 function visualTracks(path){
  const settings=path.visualTracks||{},tracks=settings.trackCount||1,routes=settings.routeCount||1;
  const count=Math.min(8,tracks*routes),spacing=settings.spacing??5;
  const points=path.points||[];
  return Array.from({length:count},(_,lane)=>{
   const offset=(lane-(count-1)/2)*spacing;
   const translated=points.map((p,i)=>{
    const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    const normal=(a,b)=>{
     const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
     return {x:-dy/length,y:dx/length};
    };
    const a=normal(prev,p),b=normal(p,next),sx=a.x+b.x,sy=a.y+b.y;
    const projected=(sx*a.x+sy*a.y)/2;
    const ratio=Math.abs(projected)>0.1?Math.min(3,1/Math.abs(projected)):1;
    const scale=Math.hypot(sx,sy)>0.1?ratio:1;
    const n=Math.hypot(sx,sy)>0.1?{x:sx/2*scale,y:sy/2*scale}:a;
    return {x:p.x+offset*n.x,y:p.y+offset*n.y};
   });
   return {lane,color:color(settings.colors?.[lane]||path.color),width:path.width,points:translated};
  });
 }
 function selectArea(layout,start,end){
  if(![start?.x,start?.y,end?.x,end?.y].every(Number.isFinite))throw Error('Ugyldig markering');
  const left=Math.min(start.x,end.x),right=Math.max(start.x,end.x);
  const top=Math.min(start.y,end.y),bottom=Math.max(start.y,end.y);
  const inside=p=>p.x>=left&&p.x<=right&&p.y>=top&&p.y<=bottom;
  const stopIds=layout.stops.filter(inside).map(s=>s.id);
  const vertices=layout.paths.flatMap(path=>path.points.flatMap((p,index)=>inside(p)?[{pathId:path.id,index}]:[]));
  if(!stopIds.length&&!vertices.length)return null;
  const points=[
   ...layout.stops.filter(s=>stopIds.includes(s.id)),
   ...vertices.map(v=>layout.paths.find(p=>p.id===v.pathId)?.points[v.index]).filter(Boolean)];
  return {stopIds,vertices,bounds:{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),
   top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}};
 }
 function transformArea(layout,area,op){
  if(!area||!Array.isArray(area.stopIds)||!Array.isArray(area.vertices)||!area.bounds)throw Error('Ingen gyldig markering');
  const dx=finite(op.dx),dy=finite(op.dy),mode=op.mode||'move';
  if(!['move','top','bottom'].includes(mode))throw Error('Ukjent områdemodus');
  const {top,bottom}=area.bounds,span=bottom-top;
  if(mode!=='move'&&span<2)throw Error('Marker et høyere område for å strekke det');
  const factor=mode==='top'?(span-dy)/span:mode==='bottom'?(span+dy)/span:1;
  if(factor<.25||factor>5)throw Error('Strekket er utenfor tillatt område');
  const target=p=>{
   const point=mode==='move'?{x:p.x+dx,y:p.y+dy}:{x:p.x,y:mode==='top'?bottom+(p.y-bottom)*factor:top+(p.y-top)*factor};
   if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>WIDTH||point.y<0||point.y>HEIGHT)
    throw Error('Markerte punkter må forbli inne på kartflaten');
   return point;
  };
  // Plan all updates first, so callers can safely preview failed operations.
  const changedStops=area.stopIds.map(id=>{
   const s=layout.stops.find(s=>s.id===id);if(!s)throw Error('Stoppet finnes ikke lenger');
   const newPoint=target(s),label=target({x:s.label.x,y:s.label.y});
   return {id,newPoint,label};
  });
  const changedVertices=area.vertices.map(({pathId,index})=>{
   const path=layout.paths.find(p=>p.id===pathId);if(!path?.points[index])throw Error('Kartpunktet finnes ikke lenger');
   return {pathId,index,point:target(path.points[index])};
  });
  for(const {id,newPoint,label} of changedStops){
   const stop=layout.stops.find(s=>s.id===id);
   Object.assign(stop,newPoint);stop.label={...stop.label,...label};
  }
  for(const {pathId,index,point} of changedVertices){
   const path=layout.paths.find(p=>p.id===pathId);
   path.points[index]=point;
   // Geometry review may not be reused blindly after a transformation.
   if(path.reviewedSegments){delete path.reviewedSegments[index-1];delete path.reviewedSegments[index];}
  }
  return {stops:changedStops.length,vertices:changedVertices.length};
 }
 function exportSVG(layout){
  const lines=(layout.paths||[]).flatMap(path=>visualTracks(path).map(track=>
   '<polyline data-path-id="'+xml(path.id)+'" data-lane="'+track.lane+
   '" points="'+track.points.map(p=>num(p.x)+','+num(p.y)).join(' ')+
   '" fill="none" stroke="'+track.color+'" stroke-width="'+num(track.width)+
   '" stroke-linecap="round" stroke-linejoin="round"/>')).join('\n  ');
  const stops=(layout.stops||[]).map(stop=>{
   const platforms=stop.stationStyle==='double'?[-1,1].map(side=>
    '<rect x="'+num(stop.x+side*(stop.radius+3)-2)+'" y="'+num(stop.y-stop.radius-3)+
    '" width="4" height="'+num(stop.radius*2+6)+'" rx="2" fill="none" stroke="#8dbde1" stroke-width="1.2"/>').join(''):'';
   const markers=stop.diodeMode==='split'?
    [-1,1].map(side=>'<circle cx="'+num(stop.x+side*(stop.radius+2))+'" cy="'+num(stop.y)+'" r="'+num(stop.radius)+'"/>').join(''):
    '<circle cx="'+num(stop.x)+'" cy="'+num(stop.y)+'" r="'+num(stop.radius)+'"/>';
   const label=stop.label?.visible?'<text x="'+num(stop.label.x)+'" y="'+num(stop.label.y)+'" fill="#dce8f8" stroke="#080f1d" stroke-width="2.5" paint-order="stroke" font-family="sans-serif" font-size="9">'+xml(stop.name)+'</text>':'';
   return '<g data-stop-id="'+xml(stop.id)+'" fill="#273449" stroke="#9eb9d2" stroke-width="1.3">'+platforms+markers+'</g>'+label;
  }).join('\n  ');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
   '<svg xmlns="http://www.w3.org/2000/svg" width="913" height="1280" viewBox="0 0 913 1280">\n'+
   ' <title>InTransit Trondheim – skjematisk kart</title>\n'+
   ' <desc>Visuell tegning. Eksporter JSON fra InTransit for å bevare rutekoblinger og holdeplassdata.</desc>\n'+
   ' <rect width="913" height="1280" fill="#080f1d"/>\n'+
   ' <g id="intransit-lines">\n  '+lines+'\n </g>\n'+
   ' <g id="intransit-stops">\n  '+stops+'\n </g>\n'+
   '</svg>\n';
 }
 return {snap,visualTracks,selectArea,transformArea,exportSVG};
});

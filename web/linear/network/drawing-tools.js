(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitDrawingTools=api;
})(globalThis,function(){
 'use strict';
 const WIDTH=913,HEIGHT=1280;
 const directions=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
 const clamp=(v,max)=>Math.max(0,Math.min(max,v));
 const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
 const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const num=n=>String(Math.round(finite(n)*1000)/1000);
 // Snapping changes only new/dragged positions. No stored geometry is ever
 // rounded on load, when a toggle changes, or during SVG export.
 function snap(point,options={}){
  const size=[5,10,20].includes(Number(options.gridSize))?Number(options.gridSize):10;
  const grid=options.gridSnap===true,angles=options.angleSnap===true;
  const previous=options.previous;
  const x=finite(point?.x),y=finite(point?.y);
  if(angles&&previous&&Number.isFinite(previous.x)&&Number.isFinite(previous.y)){
   const dx=x-previous.x,dy=y-previous.y;
   if(Math.hypot(dx,dy)<0.00001)return {x:clamp(previous.x,WIDTH),y:clamp(previous.y,HEIGHT)};
   const sector=((Math.round(Math.atan2(dy,dx)*4/Math.PI)%8)+8)%8;
   const [vx,vy]=directions[sector];
   let t=Math.max(0,(dx*vx+dy*vy)/(vx*vx+vy*vy));
   if(grid)t=Math.round(t/size)*size;
   return {x:clamp(previous.x+vx*t,WIDTH),y:clamp(previous.y+vy*t,HEIGHT)};
  }
  return {x:clamp(grid?Math.round(x/size)*size:x,WIDTH),
   y:clamp(grid?Math.round(y/size)*size:y,HEIGHT)};
 }
 // A standalone visual/vector export for Inkscape. The validated JSON remains
 // authoritative for stop IDs, route bindings, direction and LED metadata.
 function exportSVG(layout){
  const lines=(layout.paths||[]).map(path=>
   '<polyline data-path-id="'+xml(path.id)+'" points="'+(path.points||[]).map(p=>num(p.x)+','+num(p.y)).join(' ')+
   '" fill="none" stroke="'+xml(path.color)+'" stroke-width="'+num(path.width)+
   '" stroke-linecap="round" stroke-linejoin="round"/>').join('\n  ');
  const stops=(layout.stops||[]).map(stop=>{
   const markers=stop.diodeMode==='split'?
    [-1,1].map((side)=>'<circle cx="'+num(stop.x+side*(stop.radius+2))+'" cy="'+num(stop.y)+'" r="'+num(stop.radius)+'"/>').join(''):
    '<circle cx="'+num(stop.x)+'" cy="'+num(stop.y)+'" r="'+num(stop.radius)+'"/>';
   const label=stop.label?.visible?'<text x="'+num(stop.label.x)+'" y="'+num(stop.label.y)+'" fill="#dce8f8" stroke="#080f1d" stroke-width="2.5" paint-order="stroke" font-family="sans-serif" font-size="9">'+xml(stop.name)+'</text>':'';
   return '<g data-stop-id="'+xml(stop.id)+'" fill="#273449" stroke="#9eb9d2" stroke-width="1.3">'+markers+'</g>'+label;
  }).join('\n  ');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
   '<svg xmlns="http://www.w3.org/2000/svg" width="913" height="1280" viewBox="0 0 913 1280">\n'+
   ' <title>InTransit Trondheim – skjematisk kart</title>\n'+
   ' <desc>Visuell tegning. Eksporter JSON fra InTransit for å bevare redigerbare rutekoblinger og holdeplassdata.</desc>\n'+
   ' <rect width="913" height="1280" fill="#080f1d"/>\n'+
   ' <g id="intransit-lines">\n  '+lines+'\n </g>\n'+
   ' <g id="intransit-stops">\n  '+stops+'\n </g>\n'+
   '</svg>\n';
 }
 return {snap,exportSVG};
});

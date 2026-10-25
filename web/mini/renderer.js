// Pixel-accurate frame renderer. Canvas bitmap dimensions match chosen hardware.
(function(root,factory){
 const api=factory(typeof module==='object'?require('./model.js'):root.InTransitMiniModel);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitMiniRenderer=api;
})(globalThis,function(M){
 'use strict';
 function shorten(ctx,text,maxWidth){
  let value=String(text??'');
  if(ctx.measureText(value).width<=maxWidth)return value;
  while(value.length&&ctx.measureText(value+'…').width>maxWidth)value=value.slice(0,-1);
  return value?value+'…':'';
 }
 function fillText(ctx,value,x,y,maxWidth,color){
  if(maxWidth<=1)return;
  const text=shorten(ctx,value,maxWidth);
  ctx.fillStyle=color;ctx.fillText(text,Math.round(x),Math.round(y));
 }
 function draw(frame,profile,board,opts={}){
  if(!frame||frame.width!==profile.width||frame.height!==profile.height)
   throw Error('Canvas-oppløsning avviker fra skjermprofil');
  const ctx=frame.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Canvas 2D er utilgjengelig');
  const now=opts.now??Date.now(),demo=opts.demo===true;
  const palette=M.palettes[opts.palette]||M.palettes.rgb;
  const color=profile.kind==='mono'?M.palettes.mono:palette;
  const g=M.geometry(profile),w=profile.width,h=profile.height;
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle=color.bg;ctx.fillRect(0,0,w,h);
  ctx.textBaseline='top';ctx.textAlign='left';ctx.font='bold '+g.fontSize+'px monospace';
  const pad=w<=48?1:Math.max(2,Math.floor(w*.04));
  const gap=Math.max(1,Math.floor(w*.025)),statusWidth=Math.min(w*.35,Math.max(15,w*.28));
  if(g.header){
   ctx.fillStyle=color.accent;ctx.fillRect(0,g.header-1,w,1);
   const topFont=Math.max(6,Math.min(g.fontSize+1,g.header-2));
   ctx.font='bold '+topFont+'px monospace';
   fillText(ctx,board.stopName||'HOLDEPLASS',pad,Math.max(0,Math.floor((g.header-topFont)/2)),
    w-pad*2-(demo?Math.max(15,Math.floor(w*.23)):0),color.fg);
   if(demo){
    ctx.textAlign='right';ctx.fillStyle=color.alert;
    ctx.fillText('DEMO',w-pad,Math.max(0,Math.floor((g.header-topFont)/2)));
    ctx.textAlign='left';
   }
  }
  const departures=(board.departures||[]).filter(x=>x&&!x.cancelled).slice(0,g.rows);
  const start=g.header;
  for(let i=0;i<g.rows;i++){
   const d=departures[i],y=start+i*g.rowHeight,baseline=y+Math.max(1,Math.floor((g.rowHeight-g.fontSize)/2));
   if(y+g.rowHeight>h-g.footer+1)break;
   if(i%2===1&&profile.kind==='lcd'){
    ctx.fillStyle='#182838';ctx.fillRect(0,y,w,g.rowHeight);
   }
   if(!d)continue;
   const time=M.labelTime(d,now);
   const lineWidth=Math.max(g.compact?7:12,Math.round(w*(w<=64?.21:.14)));
   const timeW=Math.max(g.compact?10:15,Math.round(w*(w<=64?.22:.18)));
   const destX=pad+lineWidth+gap,destW=w-pad-timeW-gap-destX;
   ctx.font='bold '+g.fontSize+'px monospace';
   fillText(ctx,d.line,pad,baseline,lineWidth,color.accent);
   if(destW>g.fontSize*1.4)
    fillText(ctx,d.destination,destX,baseline,destW,color.fg);
   ctx.textAlign='right';
   const rightText=g.compact?String(M.mins(d.at,now)??'--'):time;
   ctx.fillStyle=d.realtime?color.ok:color.accent;
   ctx.fillText(shorten(ctx,rightText,timeW),w-pad,baseline);
   ctx.textAlign='left';
  }
  if(!departures.length){
   ctx.font='bold '+Math.max(6,g.fontSize)+'px monospace';
   fillText(ctx,demo?'DEMO · INGEN AVGANGER':'INGEN AVGANGER',
    pad,Math.min(h-g.fontSize-1,start+3),w-pad*2,color.dim);
  }
  if(g.footer){
   ctx.fillStyle=color.accent;ctx.fillRect(0,h-g.footer,w,1);
   ctx.font='bold '+Math.max(6,Math.min(g.fontSize,Math.floor(g.footer*.75)))+'px monospace';
   fillText(ctx,demo?'SIMULERT':'TIDER '+(board.departures?.some(d=>d.realtime)?'LIVE':'PLANLAGT'),
    pad,h-g.footer+2,w-pad*2-(w>130?38:0),color.dim);
   if(w>130){
    ctx.textAlign='right';ctx.fillStyle=color.fg;
    ctx.fillText(M.formatClock(now),w-pad,h-g.footer+2);ctx.textAlign='left';
   }
  }
  return {width:w,height:h,rows:g.rows,visible:departures.length,mode:profile.kind};
 }
 function preview(frame,canvas,profile,opts={}){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Forhåndsvisning mangler 2D-context');
  const led=profile.kind==='led',dots=led&&profile.width*profile.height<=20000;
  const scale=dots?7:Math.min(3,Math.max(1,Math.floor(820/profile.width)));
  canvas.width=profile.width*scale;canvas.height=profile.height*scale;
  ctx.fillStyle='#03070a';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(dots){
   const src=frame.getContext('2d').getImageData(0,0,profile.width,profile.height).data;
   for(let y=0;y<profile.height;y++)for(let x=0;x<profile.width;x++){
    const i=(y*profile.width+x)*4;
    const r=src[i],g=src[i+1],b=src[i+2];
    const lit=Math.max(r,g,b)>20;
    ctx.fillStyle=lit?'rgb('+r+','+g+','+b+')':'#0c1419';
    ctx.beginPath();
    ctx.arc(x*scale+scale/2,y*scale+scale/2,lit?scale*.37:scale*.20,0,Math.PI*2);
    ctx.fill();
   }
  }else{
   ctx.imageSmoothingEnabled=false;ctx.drawImage(frame,0,0,canvas.width,canvas.height);
  }
  return {dots,scale};
 }
 return {draw,preview,shorten};
});

// Physical-pixel layouts for tiny InTransit LED panels; no route or data mutation.
(function(root,factory){
 const api=factory(typeof module==='object'?require('./pixel-font.js'):root.InTransitMiniFont);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitMiniColumns=api;
})(globalThis,function(F){
 'use strict';
 function destination(value,maxWidth,scale=1){
  const source=F.normalize(value).replace(/\s+/g,' ').trim();
  if(maxWidth<=0)return '';
  if(F.width(source,scale)<=maxWidth)return source;
  // Routing clauses are usually less useful than the destination itself.
  let short=source.split(/ VIA /)[0].trim();
  if(F.width(short,scale)<=maxWidth)return short;
  short=short.replace(/\bGATE\b/g,'GT.').replace(/\bSTASJON\b/g,'ST.')
   .replace(/\bSENTRALSTASJON\b/g,'SENTRALST.').replace(/\bTERMINALEN\b/g,'TERM.');
  if(F.width(short,scale)<=maxWidth)return short;
  // Prefer a complete meaningful destination word over a misleading
  // clipped multiword label (e.g. "TRONDHEIM" over "TRONDHEIM SP.").
  const words=short.split(' ').filter(Boolean);
  if(words.length>1){
   const first=words[0];
   if(F.width(first,scale)<=maxWidth)return first;
  }
  return F.fit(short,maxWidth,scale);
 }
 function columns(width,pad,line,time,scale=1){
  const w=Math.max(0,Math.floor(width)),p=Math.max(0,Math.floor(pad));
  const left=p,right=Math.max(p,w-p);
  const gap=w<48?1*scale:2*scale;
  // Reserve only the pixels actually occupied by each line and countdown.
  // Avoid the old proportional columns that wasted 8–12 pixels at 64×64.
  const room=Math.max(0,right-left);
  const maxLine=Math.max(3*scale,Math.floor(room*.32));
  const maxTime=Math.max(3*scale,Math.floor(room*.34));
  const lineText=F.fit(line,maxLine,scale);
  const timeText=F.fit(time,maxTime,scale);
  const lineWidth=F.width(lineText,scale),timeWidth=F.width(timeText,scale);
  const lineX=left,timeX=right-timeWidth;
  const destX=lineX+lineWidth+gap;
  const destWidth=Math.max(0,timeX-gap-destX);
  return {lineText,timeText,lineX,timeX,destX,destWidth,
   lineWidth,timeWidth,gap,scale,left,right};
 }
 // Scroll one physical pixel per 120ms, pausing 1.2s at each end.
 // Restart directly at the first character after the end pause; never scroll back.
 function scrollOffset(contentWidth,windowWidth,elapsedMs,stepMs=120,pauseMs=1200){
  const distance=Math.max(0,Math.ceil(contentWidth-windowWidth));
  if(!distance||!Number.isFinite(elapsedMs))return 0;
  const time=Math.max(0,elapsedMs);
  const travel=distance*stepMs,period=2*pauseMs+travel,phase=time%period;
  if(phase<pauseMs)return 0;
  if(phase<pauseMs+travel)return Math.min(distance,Math.floor((phase-pauseMs)/stepMs));
  return distance;
 }
 return {destination,columns,scrollOffset};
});

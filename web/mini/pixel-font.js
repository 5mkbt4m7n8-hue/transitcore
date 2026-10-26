// Original InTransit 3x5 bitmap font. Canonical source for generated ESP32 header.
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitMiniFont=api;
})(globalThis,function(){
 'use strict';
 const glyphs={"0":[7,5,5,5,7],"1":[2,6,2,2,7],"2":[6,1,2,4,7],"3":[6,1,2,1,6],"4":[5,5,7,1,1],"5":[7,4,6,1,6],"6":[3,4,7,5,7],"7":[7,1,2,2,2],"8":[7,5,7,5,7],"9":[7,5,7,1,6]," ":[0,0,0,0,0],"?":[6,1,2,0,2],"A":[2,5,7,5,5],"B":[6,5,6,5,6],"C":[3,4,4,4,3],"D":[6,5,5,5,6],"E":[7,4,6,4,7],"F":[7,4,6,4,4],"G":[3,4,5,5,3],"H":[5,5,7,5,5],"I":[7,2,2,2,7],"J":[1,1,1,5,2],"K":[5,5,6,5,5],"L":[4,4,4,4,7],"M":[5,7,7,5,5],"N":[5,7,7,7,5],"O":[2,5,5,5,2],"P":[6,5,6,4,4],"Q":[2,5,5,7,3],"R":[6,5,6,5,5],"S":[3,4,2,1,6],"T":[7,2,2,2,2],"U":[5,5,5,5,7],"V":[5,5,5,5,2],"W":[5,5,7,7,5],"X":[5,5,2,5,5],"Y":[5,5,2,2,2],"Z":[7,1,2,4,7],".":[0,0,0,0,2],":":[0,2,0,2,0],"-":[0,0,7,0,0],"/":[1,1,2,4,4],"+":[0,2,7,2,0],"Æ":[3,6,7,6,7],"Ø":[3,5,7,5,6],"Å":[2,0,7,5,5]};
 const normalize=value=>String(value??'').normalize('NFC').toUpperCase()
  .replace(/…/g,'.').replace(/[·]/g,'-');
 function scale(font){return Math.max(1,Math.floor((parseInt(String(font).match(/(\d+)px/)?.[1]||'6',10))/6));}
 function width(text,s=1){return Math.max(0,Array.from(normalize(text)).length*4*s-s);}
 function fit(text,max,s=1){
  let value=normalize(text);
  if(width(value,s)<=max)return value;
  // Drop routing suffix before shortening the actual destination.
  value=value.split(/ VIA /)[0].replace(/ GATE\b/g,' GT.').replace(/ STASJON\b/g,' ST.');
  if(width(value,s)<=max)return value;
  const count=Math.max(0,Math.floor((max+s)/(4*s)));
  return count>1?Array.from(value).slice(0,count-1).join('')+'.':count?' ':'';
 }
 function draw(ctx,text,x,y,s=1){
  x=Math.round(x);y=Math.round(y);
  for(const c of normalize(text)){
   const rows=glyphs[c]||glyphs['?'];
   for(let row=0;row<5;row++)for(let col=0;col<3;col++)
    if(rows[row]&(4>>col))ctx.fillRect(x+col*s,y+row*s,s,s);
   x+=4*s;
  }
 }
 // Keep the established designs and alignment, substituting only LED text rasterization.
 function context(ctx){
  let font='6px monospace',align='left';
  return new Proxy(ctx,{
   get(target,key){
    if(key==='font')return font;
    if(key==='textAlign')return align;
    if(key==='measureText')return text=>({width:width(text,scale(font))});
    if(key==='fillText')return (text,x,y)=>{
     const s=scale(font),w=width(text,s);
     draw(target,text,x-(align==='right'?w:align==='center'?w/2:0),y,s);
    };
    const value=target[key];return typeof value==='function'?value.bind(target):value;
   },
   set(target,key,value){
    if(key==='font')font=value;else if(key==='textAlign')align=value;else target[key]=value;
    return true;
   }
  });
 }
 return {glyphs,normalize,scale,width,fit,draw,context};
});

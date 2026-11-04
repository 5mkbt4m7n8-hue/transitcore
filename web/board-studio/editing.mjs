import {holeCenters,sub,add,mul,unit,length} from './geometry.mjs';
export function gridSpec(step,major,contrast,zoom){
 let minor=step;while(minor*zoom<7)minor*=2;major=Math.max(major,minor*2);while(major*zoom<35)major*=2;
 const opacity={faint:.16,normal:.3,strong:.52}[contrast]??.3;
 return {minor,major,minorOpacity:opacity*.5,majorOpacity:opacity};
}
// Guides are transient UI. Disabled snapping returns the exact input point.
export function snapPoint(p,pt,{enabled=false,gridStep=5,zoom=1,excludeIds=[],anchor=null}={}){
 const threshold=7/zoom,targets=[];
 for(const s of p.layout.stations)if(!excludeIds.includes(s.id)){targets.push({x:s.x,y:s.y,kind:'station'});for(const h of holeCenters(p,s))targets.push({...h,kind:'hole'});}
 for(const r of p.layout.routes)for(const b of Object.values(r.bends))targets.push({...b,kind:'bend'});
 const guides=[],point=enabled?{x:Math.round(pt.x/gridStep)*gridStep,y:Math.round(pt.y/gridStep)*gridStep}:{...pt};
 for(const axis of ['x','y']){const near=targets.filter(t=>Math.abs(t[axis]-pt[axis])<threshold).sort((a,b)=>Math.abs(a[axis]-pt[axis])-Math.abs(b[axis]-pt[axis])||(a.kind==='hole'?-1:1))[0];if(near){guides.push({kind:near.kind,axis,value:near[axis]});if(enabled)point[axis]=near[axis];}
 const explicit=p.layout.guides.filter(g=>g.axis===axis&&Math.abs(g.value-pt[axis])<threshold).sort((a,b)=>Math.abs(a.value-pt[axis])-Math.abs(b.value-pt[axis]))[0];if(explicit){guides.push({kind:'guide',...explicit});if(enabled)point[axis]=explicit.value;}}
 if(anchor&&length(sub(pt,anchor))>threshold*2){const vectors=[{x:1,y:0,kind:'axis'},{x:0,y:1,kind:'axis'},{x:Math.SQRT1_2,y:Math.SQRT1_2,kind:'45'},{x:Math.SQRT1_2,y:-Math.SQRT1_2,kind:'45'}];for(const r of p.layout.routes)for(let i=0;i<r.stationIds.length-1;i++){const a=p.layout.stations.find(s=>s.id===r.stationIds[i]),b=p.layout.stations.find(s=>s.id===r.stationIds[i+1]);vectors.push({...unit(sub(b,a)),kind:'parallel'});}
 let nearest=null;for(const v of vectors){const delta=sub(pt,anchor),t=delta.x*v.x+delta.y*v.y,projection=add(anchor,mul(v,t)),error=length(sub(pt,projection));if(error<threshold&&(!nearest||error<nearest.error))nearest={...v,point:projection,error};}if(nearest){guides.push({kind:nearest.kind,a:anchor,b:nearest.point,label:nearest.kind==='parallel'?'∥':nearest.kind==='45'?'45°':'0° / 90°'});if(enabled&&!guides.some(g=>g.axis)){const d=sub(point,anchor),projection=add(anchor,mul(nearest,d.x*nearest.x+d.y*nearest.y));point.x=+projection.x.toFixed(9);point.y=+projection.y.toFixed(9);}}}
 const close=targets.filter(t=>t.kind==='station').sort((a,b)=>length(sub(pt,a))-length(sub(pt,b)))[0];if(close)guides.push({kind:'distance',a:pt,b:close,label:`${length(sub(pt,close)).toFixed(2)} mm`});
 return {point,guides};
}

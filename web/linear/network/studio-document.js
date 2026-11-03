(function(root){
 'use strict';
 const clone=v=>structuredClone(v),color=/^#[0-9a-f]{6}$/i;
 function blank(){return {schema:'intransit-artwork',version:1,title:'Nytt kart',width:1000,height:1400,artwork:{lines:[],stops:[]},bindings:{}};}
 function validate(d){
  if(!d||d.schema!=='intransit-artwork'||d.version!==1||typeof d.title!=='string'||d.title.length>200)throw Error('Ukjent prosjektformat');
  if(![d.width,d.height].every(n=>Number.isFinite(n)&&n>=100&&n<=10000))throw Error('Ugyldig kartstørrelse');
  if(!Array.isArray(d.artwork?.lines)||!Array.isArray(d.artwork?.stops)||d.artwork.lines.length>500||d.artwork.stops.length>5000)throw Error('Ugyldige lag');
  const ids=new Set(),point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=d.width&&p.y<=d.height;
  for(const o of [...d.artwork.lines,...d.artwork.stops]){
   if(typeof o.id!=='string'||ids.has(o.id)||typeof o.name!=='string'||o.name.length>200)throw Error('Ugyldig objektnavn eller identitet');ids.add(o.id);
   if(typeof o.visible!=='boolean'||typeof o.locked!=='boolean')throw Error('Ugyldig lagstatus');
  }
  for(const l of d.artwork.lines)if(!color.test(l.color)||!Number.isFinite(l.width)||l.width<1||l.width>40||!Array.isArray(l.points)||l.points.length<2||l.points.length>5000||!l.points.every(point))throw Error('Ugyldig linje');
  for(const s of d.artwork.stops)if(!point(s)||!Number.isFinite(s.labelDx)||!Number.isFinite(s.labelDy)||Math.abs(s.labelDx)>1000||Math.abs(s.labelDy)>1000||!Array.isArray(s.lineIds)||s.lineIds.some(id=>!d.artwork.lines.some(l=>l.id===id)))throw Error('Ugyldig stopp');
  for(const s of d.artwork.stops){
   if(s.labelAngle!==undefined&&(!Number.isFinite(s.labelAngle)||s.labelAngle<0||s.labelAngle>360))throw Error('Navnevinkel må være mellom 0 og 360');
   if(s.labelSide!==undefined&&!['left','right'].includes(s.labelSide))throw Error('Ugyldig navneside');
   if(s.symbol!==undefined&&!['circle','ring','capsule'].includes(s.symbol))throw Error('Ugyldig stoppsymbol');
   if(s.span!==undefined&&(!Number.isFinite(s.span)||s.span<10||s.span>500))throw Error('Ugyldig symbolbredde');
   if(s.symbolAngle!==undefined&&(!Number.isFinite(s.symbolAngle)||s.symbolAngle<0||s.symbolAngle>360))throw Error('Ugyldig symbolvinkel');
  }
  if(!d.bindings||typeof d.bindings!=='object'||Array.isArray(d.bindings))throw Error('Ugyldige kildekoblinger');
  for(const [id,b] of Object.entries(d.bindings))if(!ids.has(id)||!b||b.source!=='trondheim'||typeof b.sourceId!=='string'||!Array.isArray(b.quayIds)||!b.quayIds.every(q=>typeof q==='string'))throw Error('Ugyldig kildekobling');
  return d;
 }
 function fromTrondheim(source){
  const d=blank();d.title='Trondheim · arbeidskopi';d.width=source.viewBox[2];d.height=source.viewBox[3];
  d.artwork.lines=source.paths.map((l,i)=>({id:'line-'+i,name:l.name||'Linje '+(i+1),color:color.test(l.color)?l.color:'#249e83',width:6,points:clone(l.points),visible:true,locked:false}));
  d.artwork.stops=source.stops.map((s,i)=>{const id='stop-'+i;d.bindings[id]={source:'trondheim',sourceId:s.id,quayIds:[...new Set((s.bindings||[]).map(b=>b.stopId).filter(id=>id?.startsWith('NSR:Quay:')))],sourceBindings:clone(s.bindings||[])};return {id,name:s.name||'Stopp '+(i+1),x:s.x,y:s.y,labelDx:(s.label?.x??s.x+12)-s.x,labelDy:(s.label?.y??s.y-12)-s.y,lineIds:[],visible:true,locked:false};});
  return validate(d);
 }
 function history(initial){let d=clone(validate(initial)),past=[],future=[];return {get:()=>clone(d),change(fn){const n=clone(d);fn(n);validate(n);if(JSON.stringify(n)===JSON.stringify(d))return;past.push(d);if(past.length>100)past.shift();d=n;future=[];},undo(){if(past.length){future.push(d);d=past.pop();}},redo(){if(future.length){past.push(d);d=future.pop();}},canUndo:()=>past.length>0,canRedo:()=>future.length>0};}
 function resize(d,width,height){d.width=width;d.height=height;validate(d);}
 function label(s){return {x:s.x+s.labelDx,y:s.y+s.labelDy,angle:s.labelAngle||0,anchor:s.labelSide==='left'?'end':'start'};}
 // A conservative rotated text box gives useful suggestions without changing names or angles.
 function arrangeLabels(d){const used=[],overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  for(const s of d.artwork.stops.filter(s=>s.visible)){
   const candidates=[{dx:s.labelDx,dy:s.labelDy,side:s.labelSide||'right'}];for(const dy of (s.locked?[]:[-12,18,-30,36,-48,54]))for(const side of ['right','left'])candidates.push({dx:side==='left'?-12:12,dy,side});
   let best=null;for(const c of candidates){const t={...s,labelDx:c.dx,labelDy:c.dy,labelSide:c.side},l=label(t),a=l.angle*Math.PI/180,w=Math.max(12,s.name.length*8),xs=[],ys=[];for(const x of [l.anchor==='end'?-w:0,l.anchor==='end'?0:w])for(const y of [-12,3]){xs.push(l.x+x*Math.cos(a)-y*Math.sin(a));ys.push(l.y+x*Math.sin(a)+y*Math.cos(a));}const box={x:Math.min(...xs)-3,y:Math.min(...ys)-3,w:Math.max(...xs)-Math.min(...xs)+6,h:Math.max(...ys)-Math.min(...ys)+6},score=used.filter(b=>overlap(box,b)).length+(box.x<0||box.y<0||box.x+box.w>d.width||box.y+box.h>d.height?100:0);if(!best||score<best.score)best={c,box,score};if(!score)break;}
   if(!s.locked){s.labelDx=best.c.dx;s.labelDy=best.c.dy;s.labelSide=best.c.side;}used.push(best.box);
  }
 }
 function symbol(s){return {width:s.symbol==='capsule'?(s.span||30):10,height:10,angle:s.symbolAngle||0,ring:s.symbol==='ring'};}
 // Copies are artwork only: they receive neither source bindings nor new stop identities.
 function parallel(d,sourceId,count,spacing,ids){
  const source=d.artwork.lines.find(l=>l.id===sourceId);if(!source||source.locked||!Number.isInteger(count)||count<1||count>8||!Number.isFinite(spacing)||spacing<2||spacing>200||ids.length!==count)throw Error('Velg 1–8 kopier og avstand 2–200');
  const colors=['#e08a3b','#6e68bb','#cc5271','#218967'].filter(c=>c!==source.color);
  for(let lane=1;lane<=count;lane++){
   const normals=source.points.slice(1).map((p,i)=>{const a=source.points[i],dx=p.x-a.x,dy=p.y-a.y,len=Math.hypot(dx,dy);if(!len)throw Error('Fjern doble linjepunkter før kopiering');return {x:-dy/len,y:dx/len};});
   const points=source.points.map((p,i)=>{const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)],den=1+a.x*b.x+a.y*b.y;if(den<.125)throw Error('For skarp sving for parallelle kopier');return {x:p.x+(a.x+b.x)/den*spacing*lane,y:p.y+(a.y+b.y)/den*spacing*lane};});
   d.artwork.lines.push({...clone(source),id:ids[lane-1],name:source.name+' · '+lane,color:colors[(lane-1)%colors.length],points});
  }validate(d);
 }
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 function svg(d){validate(d);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}"><rect width="100%" height="100%" fill="white"/>`+d.artwork.lines.filter(l=>l.visible).map(l=>`<polyline points="${l.points.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="${l.color}" stroke-width="${l.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')+d.artwork.stops.filter(s=>s.visible).map(s=>`<rect x="${s.x-symbol(s).width/2}" y="${s.y-5}" width="${symbol(s).width}" height="10" rx="5" fill="${symbol(s).ring?'#16312d':'white'}" stroke="#16312d" stroke-width="2" transform="rotate(${symbol(s).angle} ${s.x} ${s.y})"/><text x="${label(s).x}" y="${label(s).y}" text-anchor="${label(s).anchor}" transform="rotate(${label(s).angle} ${label(s).x} ${label(s).y})" font-family="sans-serif" font-size="12">${escape(s.name)}</text>`).join('')+'</svg>';}
 const api={blank,validate,fromTrondheim,history,svg,resize,label,symbol,parallel,arrangeLabels};root.InTransitStudioDocument=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

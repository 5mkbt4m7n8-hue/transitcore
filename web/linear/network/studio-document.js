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
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 function svg(d){validate(d);return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}"><rect width="100%" height="100%" fill="white"/>`+d.artwork.lines.filter(l=>l.visible).map(l=>`<polyline points="${l.points.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="${l.color}" stroke-width="${l.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')+d.artwork.stops.filter(s=>s.visible).map(s=>`<circle cx="${s.x}" cy="${s.y}" r="5" fill="white" stroke="#16312d" stroke-width="2"/><text x="${s.x+s.labelDx}" y="${s.y+s.labelDy}" font-family="sans-serif" font-size="12">${escape(s.name)}</text>`).join('')+'</svg>';}
 const api={blank,validate,fromTrondheim,history,svg};root.InTransitStudioDocument=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

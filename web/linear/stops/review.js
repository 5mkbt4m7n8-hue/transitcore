// Separate local review notes for source-unnamed original map stops.
// "looked-at" records local review only; never upgrades the canonical name or source.
(function(root,factory){
 const api=factory(typeof module==='object'?require('../geo/stop-links.js'):root.InTransitStopLinks);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitNameReview=api;
})(globalThis,function(Links){
 'use strict';
 const KEY='intransit-stop-name-review-v1';
 const STATUS=['pending','looked-at','needs-research'],MAX_BYTES=160000;
 const queue=layout=>(layout?.stops||[]).filter(s=>s.nameConfirmed!==true);
 function empty(layout){return {schemaVersion:1,fingerprint:Links.fingerprint(layout),entries:{}};}
 function validate(doc,layout){
  if(!doc||doc.schemaVersion!==1||doc.fingerprint!==Links.fingerprint(layout)||!doc.entries||
    Array.isArray(doc.entries)||typeof doc.entries!=='object')throw Error('Gjennomgangsdata passer ikke til originalkartet. Eksporter før du overskriver.');
  const ids=new Set(queue(layout).map(s=>s.id));
  if(Object.keys(doc.entries).length>ids.size)throw Error('For mange gjennomgangsoppføringer');
  for(const [id,item] of Object.entries(doc.entries)){
   if(!ids.has(id)||!item||typeof item!=='object'||!STATUS.includes(item.status)||
     typeof item.note!=='string'||item.note.length>800)throw Error('Ugyldige gjennomgangsdata for '+id);
  }
  return doc;
 }
 function load(layout,store){
  const storage=store||localStorage,raw=storage.getItem(KEY);
  if(!raw)return empty(layout);
  if(raw.length>MAX_BYTES)throw Error('Gjennomgangsfilen er for stor. Eksporter den før endringer.');
  return validate(JSON.parse(raw),layout);
 }
 function save(layout,id,status,note,store){
  const storage=store||localStorage;
  const text=String(note||'').trim();
  if(!queue(layout).some(s=>s.id===id)||!STATUS.includes(status)||text.length>800)
   throw Error('Ugyldig stopp, status eller notat (maks 800 tegn)');
  const state=load(layout,storage);
  if(status==='pending'&&!text)delete state.entries[id];
  else state.entries[id]={status,note:text};
  validate(state,layout);storage.setItem(KEY,JSON.stringify(state));return state;
 }
 function progress(layout,state){
  validate(state,layout);
  const items=queue(layout),total=items.length;
  const looked=items.filter(s=>state.entries[s.id]?.status==='looked-at').length;
  const research=items.filter(s=>state.entries[s.id]?.status==='needs-research').length;
  return {total,looked,research,pending:total-looked-research,visited:looked+research};
 }
 function crop(layout,stop,zoom=2,ratio=620/390){
  const ref=layout?.reference,center=stop?.source?.centerPixels;
  if(!ref?.available||!Number.isFinite(ref.width)||!Number.isFinite(ref.height)||
    !Number.isFinite(center?.x)||!Number.isFinite(center?.y)||
    center.x<0||center.x>ref.width||center.y<0||center.y>ref.height)throw Error('Ukjent posisjon i originaltegningen');
  const widths={1:1700,2:980,4:520},w=Math.min(ref.width,widths[zoom]||widths[2],ref.height*ratio),h=w/ratio;
  const x=Math.max(0,Math.min(ref.width-w,center.x-w/2));
  const y=Math.max(0,Math.min(ref.height-h,center.y-h/2));
  return {x,y,width:w,height:h,markerX:(center.x-x)/w,markerY:(center.y-y)/h};
 }
 return {KEY,queue,empty,validate,load,save,progress,crop};
});

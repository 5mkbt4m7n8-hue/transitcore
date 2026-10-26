// Mini 4.0 auto-rotation settings. No background jobs, network queries,
// departure samples or device credentials are stored in this namespace.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitMiniRotation=api;
})(globalThis,function(){
 'use strict';
 const KEY='intransit-mini:v4:rotation';
 const INTERVALS=Object.freeze([5,10,15,30,60]);
 function normalize(raw,ids){
  const existing=Array.isArray(ids)?ids:[];
  if(!raw||typeof raw!=='object'||!INTERVALS.includes(raw.seconds)||
     !Array.isArray(raw.ids)||raw.ids.length>12||
     raw.ids.some(x=>typeof x!=='string'||!existing.includes(x)))
   throw Error('Ugyldige rotasjonsinnstillinger');
  const wanted=new Set(raw.ids);
  return {seconds:raw.seconds,ids:existing.filter(x=>wanted.has(x))};
 }
 function defaults(ids){return {seconds:10,ids:[...(ids||[])]};}
 function read(storage,ids){
  let raw;
  try{raw=storage?.getItem(KEY);}catch{return {value:defaults(ids),error:'Lokal lagring er utilgjengelig.'};}
  if(!raw)return {value:defaults(ids),error:null};
  try{
   const parsed=JSON.parse(raw);
   if(parsed?.version!==1||!INTERVALS.includes(parsed.seconds)||
      !Array.isArray(parsed.ids)||parsed.ids.length>12||
      parsed.ids.some(x=>typeof x!=='string'))throw Error('Ugyldig oppsett');
   // Deleted profiles are dropped; newly added profiles are opt-in.
   return {value:normalize(parsed,ids),error:null};
  }catch{return {value:defaults(ids),error:'Lagret rotasjon kan ikke leses. Standardinnstilling brukes.'};}
 }
 function save(storage,value,ids){
  const cleaned=normalize(value,ids);
  storage.setItem(KEY,JSON.stringify({version:1,...cleaned}));
  return cleaned;
 }
 function advance(ids,current,delta=1){
  if(!Array.isArray(ids)||!ids.length)return null;
  const at=ids.indexOf(current);
  const index=at<0?(delta>=0?-1:0):at;
  return ids[((index+delta)%ids.length+ids.length)%ids.length];
 }
 function remaining(durationMs,elapsedMs){
  return Math.max(0,Math.ceil((durationMs-Math.max(0,elapsedMs))/1000));
 }
 return {KEY,INTERVALS,normalize,defaults,read,save,advance,remaining};
});

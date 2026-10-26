// Mini 3.0 saved-display configuration only. Never persists actual departures,
// provider responses, vehicle IDs, passwords, coordinates or global TransitCore state.
(function(root,factory){
 const api=factory(typeof module==='object'?require('./model.js'):root.InTransitMiniModel);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitMiniPresets=api;
})(globalThis,function(M){
 'use strict';
 const KEY='intransit-mini:v3:presets';
 const MAX=12;
 const DESIGNS=Object.freeze([
  {id:'classic',name:'Klassisk avgangstavle'},
  {id:'compact',name:'Kompakt liste'},
  {id:'bold',name:'Stor neste avgang'},
  {id:'clock',name:'Klokke og neste avgang'}
 ]);
 const designOk=x=>DESIGNS.some(p=>p.id===x);
 function config(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Ugyldig Mini-profil');
  const hw=raw.hardware||{},datasource=raw.datasource||{},filters=datasource.filters||{};
  const display=raw.display||{};
  let p;
  if(typeof hw.profileId==='string'&&hw.profileId!=='custom'){
   p=M.profile(hw.profileId);
   if(p.width!==hw.width||p.height!==hw.height||p.kind!==hw.type)
    throw Error('Skjermprofil samsvarer ikke med dimensjonene');
  }else{
   p=M.profile('custom',hw.width,hw.height);
   if(!['led','mono','lcd'].includes(hw.type))throw Error('Ugyldig skjermtype');
   p.kind=hw.type;
  }
  if(!M.validStopId(datasource.stopId)||!['live','demo'].includes(datasource.mode))
   throw Error('Ugyldig holdeplass eller datakilde');
  const stopName=datasource.stopName;
  if(typeof stopName!=='string'||!stopName.trim()||stopName.length>150)
   throw Error('Ugyldig holdeplassnavn');
  const lines=filters.lines;
  if(lines!==null&&(!Array.isArray(lines)||lines.length>32||
     lines.some(x=>typeof x!=='string'||!/^[-\w]{1,10}$/.test(x))))
   throw Error('Ugyldig linjefilter');
  const direction=filters.destination;
  if(direction!==null&&(typeof direction!=='string'||direction.length>120))
   throw Error('Ugyldig destinasjon');
  const brightness=display.brightnessPercent;
  if(!Number.isInteger(brightness)||brightness<15||brightness>100||
    !Object.hasOwn(M.palettes,display.palette)||!designOk(display.design))
    throw Error('Ugyldige visningsvalg');
  const destinationMode=display.destinationMode??'shorten';
  if(!['shorten','scroll'].includes(destinationMode))
   throw Error('Ugyldig visning av lange destinasjoner');
  return {schemaVersion:3,product:'intransit-mini',
   hardware:{profileId:p.id,width:p.width,height:p.height,type:p.kind,pixelCount:p.width*p.height},
   display:{palette:display.palette,brightnessPercent:brightness,design:display.design,
    destinationMode},
   datasource:{mode:datasource.mode,stopId:datasource.stopId,stopName:stopName.trim(),
    filters:{lines:lines===null?null:[...new Set(lines)].sort(),destination:direction||null}}};
 }
 function savedItem(raw){
  if(typeof raw?.id!=='string'||!/^[a-z0-9-]{3,64}$/.test(raw.id)||
     typeof raw.name!=='string'||raw.name.trim().length<2||raw.name.trim().length>45)
    throw Error('Ugyldig profilnavn eller ID');
  return {id:raw.id,name:raw.name.trim(),value:config(raw.value)};
 }
 function decode(text){
  if(!text)return [];
  const v=JSON.parse(text);
  if(v?.version!==3||!Array.isArray(v.items)||v.items.length>MAX)
   throw Error('Ugyldig eller for gammel profilfil');
  const items=v.items.map(savedItem);
  if(new Set(items.map(x=>x.id)).size!==items.length)
   throw Error('Dupliserte profil-ID-er');
  return items;
 }
 function load(storage){
  try{return {items:decode(storage.getItem(KEY)),error:null};}
  catch{return {items:[],error:'Kunne ikke lese lokale Mini-profiler. Eksisterende data er ikke overskrevet.'};}
 }
 function persist(storage,items){
  if(!Array.isArray(items)||items.length>MAX)throw Error('Maks 12 skjermprofiler');
  const cleaned=items.map(savedItem);
  if(new Set(cleaned.map(x=>x.id)).size!==cleaned.length)
   throw Error('Dupliserte profil-ID-er');
  storage.setItem(KEY,JSON.stringify({version:3,items:cleaned}));
  return cleaned;
 }
 function upsert(storage,items,item){
  const valid=savedItem(item);
  const index=items.findIndex(x=>x.id===valid.id);
  const next=[...items];
  if(index>=0)next[index]=valid;else next.push(valid);
  return persist(storage,next);
 }
 function remove(storage,items,id){
  return persist(storage,items.filter(item=>item.id!==id));
 }
 function exportOne(item){
  return JSON.stringify({version:3,kind:'intransit-mini-saved-profile',
   ...savedItem(item)},null,2)+'\n';
 }
 function importOne(text){
  if(typeof text!=='string'||text.length>20000)throw Error('Profilfilen er for stor');
  const obj=JSON.parse(text);
  if(obj?.version!==3||obj?.kind!=='intransit-mini-saved-profile')
   throw Error('Ukjent profilformat');
  return savedItem(obj);
 }
 return {KEY,MAX,DESIGNS,config,savedItem,decode,load,persist,upsert,remove,exportOne,importOne};
});

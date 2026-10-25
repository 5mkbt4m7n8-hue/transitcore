// Shared client validator for real measured AtB line 1, 2 and 3 positions.
// No ETA, inferred route location, or cross-line fallbacks.
(function(root,factory){
 const api=factory(typeof module==='object'?require('../geo/line1-gps.js'):root.InTransitLine1Gps);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitLiveGps=api;
})(globalThis,function(Line1){
 'use strict';
 function parse(feed,code,now=Date.now()){
  if(!['1','2','3'].includes(code))throw Error('Ukjent AtB-linje');
  // Reuse existing validated behavior for original geographic line 1.
  if(code==='1')return Line1.parse(feed,now);
  if(feed?.schemaVersion!==1||feed?.lineId!=='ATB:Line:2_'+code||
     feed?.codespace!=='ATB'||feed?.publicCode!==code||
     feed?.observationType!=='measured-vehicle-position'||
     !Array.isArray(feed?.vehicles)||feed.vehicles.length>200)
   throw Error('GPS-responsen gjelder feil linje eller har uventet format');
  const vehicles=[],ids=new Set();
  for(const item of feed.vehicles){
   if(item?.line!==code||item?.source!=='GPS'||typeof item.id!=='string'||
      !item.id.trim()||item.id.length>120||ids.has(item.id))continue;
   const lat=item.latitude,lon=item.longitude;
   const time=typeof item.lastUpdated==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(item.lastUpdated)?
     Date.parse(item.lastUpdated):NaN;
   if(typeof lat!=='number'||typeof lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||
     lat<63.30||lat>63.51||lon<10.19||lon>10.62||
     !Number.isFinite(time)||now-time>Line1.MAX_AGE_MS||now-time< -10000)continue;
   ids.add(item.id);
   vehicles.push({id:item.id,line:code,source:'GPS',latitude:lat,longitude:lon,
     destination:typeof item.destination==='string'?item.destination.slice(0,90):'',
     lastUpdated:new Date(time).toISOString(),ageSeconds:Math.max(0,Math.round((now-time)/1000))});
  }
  return {vehicles,requestedAt:feed.requestedAt||null,quality:feed.quality||null};
 }
 return {parse,MAX_AGE_MS:Line1.MAX_AGE_MS};
});

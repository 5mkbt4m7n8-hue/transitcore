// Validate the entire 47-profile fleet feed before drawing any vehicle marker.
// Same 90-second measured-GPS policy as the single-line InTransit viewer.
(function(root,factory){
 const api=factory(typeof module==='object'?require('./catalog.js'):root.InTransitAllCatalog);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitFleetGps=api;
})(globalThis,function(Catalog){
 'use strict';
 const MAX_AGE_MS=90000;
 function parse(feed,visibleCodes=Catalog.CODES,now=Date.now()){
  if(feed?.schemaVersion!==1||feed.codespace!=='ATB'||
    feed.scope!=='catalogued-bus-lines'||feed.observationType!=='measured-vehicle-position'||
    !Array.isArray(feed.vehicles)||feed.vehicles.length>600||
    !Array.isArray(feed.includedLines)||feed.includedLines.length!==Catalog.CODES.length||
    !Catalog.CODES.every(code=>feed.includedLines.includes(code)))
    throw Error('GPS-svaret gjelder ikke den registrerte AtB-flåten');
  const chosen=new Set(visibleCodes);
  if([...chosen].some(code=>!Catalog.supports(code)))throw Error('Ukjent linjevalg');
  const vehicles=[],seen=new Set();
  for(const item of feed.vehicles){
   if(!Catalog.supports(item?.line)||!chosen.has(item.line)||item?.source!=='GPS'||
     typeof item.id!=='string'||!item.id.trim()||item.id.length>120)continue;
   const timestamp=typeof item.lastUpdated==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(item.lastUpdated)?
    Date.parse(item.lastUpdated):NaN;
   if(!Number.isFinite(timestamp)||now-timestamp>MAX_AGE_MS||now-timestamp< -10000||
     typeof item.latitude!=='number'||typeof item.longitude!=='number'||
     !Number.isFinite(item.latitude)||!Number.isFinite(item.longitude)||
     item.latitude<63.0||item.latitude>63.75||item.longitude<9.9||item.longitude>11.3)continue;
   const key=item.line+':'+item.id;
   if(seen.has(key))continue;
   seen.add(key);
   vehicles.push({id:key,vehicleId:item.id,line:item.line,source:'GPS',
    latitude:item.latitude,longitude:item.longitude,
    lastUpdated:new Date(timestamp).toISOString(),
    ageSeconds:Math.max(0,Math.floor((now-timestamp)/1000)),
    destination:typeof item.destination==='string'?item.destination.slice(0,90):''});
  }
  return {vehicles,requestedAt:feed.requestedAt||null,quality:feed.quality||null};
 }
 return {parse,MAX_AGE_MS};
});

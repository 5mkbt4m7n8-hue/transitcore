// Validate and expose only fresh measured AtB line 1 points in the browser.
// No ETA interpolation, snapping to lines, extrapolation or local persistence.
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitLine1Gps=api;
})(globalThis,function(){
 'use strict';
 const MAX_AGE_MS=90000;
 function parse(feed,now=Date.now()){
  if(feed?.schemaVersion!==1||feed.lineId!=='ATB:Line:2_1'||
     feed.codespace!=='ATB'||feed.publicCode!=='1'||
     feed.observationType!=='measured-vehicle-position'||!Array.isArray(feed.vehicles)||
     feed.vehicles.length>200)throw Error('GPS-responsen har uventet format eller linje');
  const seen=new Set(),vehicles=[];
  for(const item of feed.vehicles){
   if(item?.source!=='GPS'||item.line!=='1'||typeof item.id!=='string'||!item.id.trim()||
      item.id.length>120)continue;
   const lat=item.latitude,lon=item.longitude,t=Date.parse(item.lastUpdated||'');
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<63.30||lat>63.51||
      lon<10.19||lon>10.62||!Number.isFinite(t)||now-t>MAX_AGE_MS||
      now-t< -10000||seen.has(item.id))continue;
   seen.add(item.id);
   vehicles.push({id:item.id,latitude:lat,longitude:lon,line:'1',source:'GPS',
    lastUpdated:new Date(t).toISOString(),ageSeconds:Math.max(0,Math.round((now-t)/1000)),
    destination:typeof item.destination==='string'?item.destination.slice(0,90):''});
  }
  const quality=feed.quality&&typeof feed.quality==='object'?feed.quality:null;
  return {vehicles,quality,requestedAt:feed.requestedAt||null};
 }
 return {parse,MAX_AGE_MS};
});

// View-only AtB line 1 geographic route and stops.
// This geometry is sourced from the committed route profile, not from GPS.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitLiveLine1=api;
})(globalThis,function(){
 'use strict';
 const LAT=[63.30,63.51],LON=[10.19,10.62];
 const isPoint=p=>p&&typeof p.lat==='number'&&Number.isFinite(p.lat)&&p.lat>=LAT[0]&&p.lat<=LAT[1]&&
  typeof p.lon==='number'&&Number.isFinite(p.lon)&&p.lon>=LON[0]&&p.lon<=LON[1];
 function normalize(profile){
  if(profile?.schemaVersion!==1||profile?.id!=='atb-bus-1-live'||
    profile.line?.id!=='ATB:Line:2_1'||profile.line?.publicCode!=='1'||
    !Array.isArray(profile.shape)||profile.shape.length<2||profile.shape.length>10000||
    !Array.isArray(profile.stops)||profile.stops.length<2||profile.stops.length>500)
   throw Error('Ukjent ruteprofil for AtB linje 1');
  if(!profile.shape.every(isPoint)||!profile.stops.every(p=>isPoint(p)&&
    typeof p.id==='string'&&p.id.startsWith('NSR:Quay:')&&
    typeof p.name==='string'&&p.name.length>0&&p.name.length<=120))
   throw Error('Ugyldige koordinater eller stopp i ruteprofilen');
  const ids=new Set(profile.stops.map(s=>s.id));
  if(ids.size!==profile.stops.length)throw Error('Dupliserte holdeplass-ID-er');
  return {line:'1',name:profile.line.longName||'AtB linje 1',
   color:/^#[0-9a-fA-F]{6}$/.test(profile.line.color)?profile.line.color:'#ef5350',
   route:profile.shape.map(p=>[p.lat,p.lon]),stops:profile.stops.map(s=>({
    id:s.id,name:s.name,lat:s.lat,lon:s.lon
   }))};
 }
 function ageText(ageSeconds){
  return ageSeconds<60?ageSeconds+' sek siden':Math.floor(ageSeconds/60)+' min '+ageSeconds%60+' sek siden';
 }
 function statusForFetch(responseStatus){
  if(responseStatus===404)return 'GPS-endepunktet er ikke aktivt i Cloudflare (HTTP 404). Rute og holdeplasser kan fortsatt vises.';
  if(responseStatus===503)return 'GPS-kilden svarer ikke nå (HTTP 503). Ingen beregnede posisjoner vises.';
  return 'GPS er utilgjengelig (HTTP '+responseStatus+'). Ingen beregnede posisjoner vises.';
 }
 return {normalize,ageText,statusForFetch};
});

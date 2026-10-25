// The 47 original, checked-in AtB geographic route profiles.
// This is a coverage list, NOT a claim of all possible AtB services.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitAllCatalog=api;
})(globalThis,function(){
 'use strict';
 const CODES=Object.freeze(["1","2","3","10","11","12","13","14","15","16","18","20","21","22","23","25","28","40","41","42","43","44","45","46","50","51","52","53","54","70","71","72","73","74","75","76","77","78","79","80","81","82","83","85","86","91","92"]);
 const SET=new Set(CODES);
 function supports(code){return typeof code==='string'&&SET.has(code);}
 function routeUrl(code){
  if(!supports(code))throw Error('Linje uten registrert ruteprofil');
  return '../../../config/routes/atb-bus-'+code+'-live.json';
 }
 function color(code){
  if(!supports(code))throw Error('Ukjent linje');
  const palette=['#f45b69','#54c5ef','#ffd166','#8ce99a','#c29bf5','#f9a66b',
   '#3fd6be','#ed8bc0','#afd960','#7a9efa','#f8ca83','#a9e3eb'];
  const index=CODES.indexOf(code);
  return palette[index%palette.length];
 }
 function normalize(profile,code){
  if(!supports(code)||profile?.schemaVersion!==1||profile?.id!=='atb-bus-'+code+'-live'||
    profile?.provider?.codespaceId!=='ATB'||profile?.line?.id!=='ATB:Line:2_'+code||
    profile?.line?.publicCode!==code||!Array.isArray(profile?.shape)||
    profile.shape.length<2||profile.shape.length>10000||!Array.isArray(profile?.stops)||
    profile.stops.length<2||profile.stops.length>500)
    throw Error('Ruteprofilen mangler, er feil eller gjelder en annen linje: '+code);
  const point=p=>p&&typeof p.lat==='number'&&Number.isFinite(p.lat)&&
    p.lat>=63.0&&p.lat<=63.75&&typeof p.lon==='number'&&Number.isFinite(p.lon)&&
    p.lon>=9.9&&p.lon<=11.3;
  if(!profile.shape.every(point)||!profile.stops.every(s=>point(s)&&
    typeof s.id==='string'&&s.id.startsWith('NSR:Quay:')&&
    typeof s.name==='string'&&s.name.length>0&&s.name.length<=120))
    throw Error('Ugyldige registrerte stopp eller kartkoordinater: '+code);
  const uniq=new Set(profile.stops.map(s=>s.id));
  if(uniq.size!==profile.stops.length)throw Error('Dupliserte stopp-ID-er: '+code);
  return {line:code,name:profile.line.longName||'AtB linje '+code,
   color:color(code),route:profile.shape.map(p=>[p.lat,p.lon]),
   stops:profile.stops.map(s=>({id:s.id,name:s.name,lat:s.lat,lon:s.lon}))};
 }
 return {CODES,supports,routeUrl,color,normalize};
});

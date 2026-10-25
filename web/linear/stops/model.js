// Read-only status model for the 100 original Trondheim map stops.
// Coordinates and local names are separate: neither establishes Quay/GPS evidence.
(function(root,factory){
 const api=factory(typeof module==='object'?require('../geo/model.js'):root.InTransitGeoModel);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitStopAdminModel=api;
})(globalThis,function(Geo){
 'use strict';
 function build(layout,boards,geo){
  if(!layout||!Array.isArray(layout.stops))throw Error('Mangler originalkartets stopp');
  const clean=Geo.validate(structuredClone(geo||Geo.empty()),layout);
  const byBoard=new Map((boards||[]).filter(Boolean).map(board=>[
   board.id,new Map((board.nodes||[]).map(node=>[node.id,node]))]));
  const candidates=Geo.candidates(layout,boards);
  return layout.stops.map((stop,index)=>{
   const links=(stop.bindings||[]).filter(binding=>{
    const node=byBoard.get(binding.boardId)?.get(binding.nodeId);
    return !!node&&node.stationId===binding.stationId&&(node.stopIds||[]).includes(binding.stopId);
   });
   const alias=clean.names[stop.id]||'';
   const manual=clean.stops[stop.id];
   const candidate=candidates[stop.id];
   const geoStatus=manual?'manual':candidate?'candidate':'missing';
   const bound=stop.verification==='confirmed'&&links.length>0;
   return {
    id:stop.id,index,originalName:stop.name,displayName:alias||stop.name,alias,
    nameConfirmed:stop.nameConfirmed===true,
    mappingStatus:bound?'confirmed':stop.verification==='confirmed'?'review':'unresolved',
    verification:stop.verification,
    bindingCount:links.length,totalBindings:(stop.bindings||[]).length,
    quays:[...new Set(links.flatMap(link=>[link.stopId]).filter(v=>typeof v==='string'))],
    stopPlaces:[...new Set(links.flatMap(link=>[link.stopPlaceId||link.stationId]).filter(v=>typeof v==='string'))],
    geoStatus,coordinates:manual?.coordinates||candidate?.coordinates||null,
    geoEvidence:manual?'Brukerplassert, ikke GPS-verifisert':candidate?'Katalogforslag – ikke godkjent':'Ingen dokumentert geografisk plassering',
    originalX:stop.x,originalY:stop.y,
    needsReview:!stop.nameConfirmed||!bound||geoStatus!=='manual'
   };
  });
 }
 function summary(rows){
  return {
   total:rows.length,unconfirmedNames:rows.filter(x=>!x.nameConfirmed).length,
   localAliases:rows.filter(x=>!!x.alias).length,
   confirmedMappings:rows.filter(x=>x.mappingStatus==='confirmed').length,
   unresolvedMappings:rows.filter(x=>x.mappingStatus!=='confirmed').length,
   manualCoordinates:rows.filter(x=>x.geoStatus==='manual').length,
   candidateCoordinates:rows.filter(x=>x.geoStatus==='candidate').length,
   missingCoordinates:rows.filter(x=>x.geoStatus==='missing').length
  };
 }
 function filter(rows,{term='',status='all',sort='id'}={}){
  const needle=String(term).trim().toLocaleLowerCase('nb-NO');
  const subset=rows.filter(row=>{
   if(needle&&!([row.displayName,row.originalName,row.id,...row.quays,...row.stopPlaces].some(v=>String(v).toLocaleLowerCase('nb-NO').includes(needle))))return false;
   switch(status){
    case 'all':return true;
    case 'unnamed':return !row.nameConfirmed;
    case 'unmapped':return row.mappingStatus!=='confirmed';
    case 'geo-missing':return row.geoStatus==='missing';
    case 'geo-candidate':return row.geoStatus==='candidate';
    case 'geo-manual':return row.geoStatus==='manual';
    case 'aliased':return !!row.alias;
    default:throw Error('Ukjent filtervalg');
   }
  });
  return subset.sort((a,b)=>sort==='name'?
   a.displayName.localeCompare(b.displayName,'nb',{numeric:true})||a.index-b.index:
   sort==='id'?a.index-b.index:(()=>{throw Error('Ukjent sortering');})());
 }
 // Spreadsheet-safe CSV: user-editable text must not turn into a formula.
 function csv(rows){
  const safe=value=>{
   let raw=String(value??'');
   if(/^\s*[=+\-@]/.test(raw))raw="'"+raw;
   return '"'+raw.replace(/"/g,'""')+'"';
  };
  const table=[
   ['ID','Visningsnavn','Originalnavn','Lokalt navn','Originalnavn bekreftet','Kobling','Quay-antall','Kartkoordinatstatus','Koordinatkilde','Longitude','Latitude','Quay-ID-er'],
   ...rows.map(r=>[r.id,r.displayName,r.originalName,r.alias,r.nameConfirmed?'ja':'nei',r.mappingStatus,
    r.bindingCount,r.geoStatus,r.geoEvidence,r.coordinates?.[0]??'',r.coordinates?.[1]??'',r.quays.join(' | ')])
  ];
  return '\ufeff'+table.map(row=>row.map(safe).join(',')).join('\r\n')+'\r\n';
 }
 return {build,summary,filter,csv};
});

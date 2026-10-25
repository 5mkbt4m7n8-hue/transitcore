(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitGeoModel=api;
})(globalThis,function(){
 'use strict';
 const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
 const empty=()=>({schemaVersion:1,crs:'EPSG:4326',stops:{},names:{},paths:[]});
 const cleanName=s=>String(s||'').trim().replace(/\s+/g,' ');
 const pathById=(data,id)=>{const path=data.paths.find(p=>p.id===id);if(!path)throw Error('Ukjent geografisk linje');return path;};
 const validatePoints=points=>{
  if(!Array.isArray(points)||points.length<2||points.length>1000||!points.every(valid))throw Error('Minst to gyldige linjepunkter kreves');
  for(let i=1;i<points.length;i++)if(Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])<1e-7)throw Error('To punkter er for nære');
  return points.map(p=>[...p]);
 };
 function candidates(layout,boards){
  const byBoard=new Map((boards||[]).filter(Boolean).map(b=>[b.id,new Map((b.nodes||[]).map(n=>[n.id,n]))])),result={};
  for(const stop of layout.stops||[]){
   if(stop.verification!=='confirmed')continue;
   const points=[];
   for(const binding of stop.bindings||[]){
    const node=byBoard.get(binding.boardId)?.get(binding.nodeId);
    if(!node||(node.stopIds||[]).includes(binding.stopId)===false)continue;
    if(!Number.isFinite(node.lat)||!Number.isFinite(node.lon)||node.lat<60||node.lat>66||node.lon<7||node.lon>14)continue;
    if(!points.some(p=>p[0]===node.lon&&p[1]===node.lat))points.push([node.lon,node.lat]);
   }
   if(!points.length)continue;
   const center=[points.reduce((a,p)=>a+p[0],0)/points.length,points.reduce((a,p)=>a+p[1],0)/points.length];
   const max=points.reduce((d,p)=>Math.max(d,Math.hypot((p[0]-center[0])*111320*Math.cos(center[1]*Math.PI/180),(p[1]-center[1])*111320)),0);
   if(max<=125)result[stop.id]={coordinates:center,source:'catalog-candidate',verification:'pending'};
  }
  return result;
 }
 function validate(data,layout){
  if(data?.schemaVersion!==1||data.crs!=='EPSG:4326'||!data.stops||Array.isArray(data.stops)||typeof data.stops!=='object'||!Array.isArray(data.paths))throw Error('Ugyldig geografisk kart');
  data.names??={}; // Accept older locally saved schema v1 snapshots.
  if(!data.names||typeof data.names!=='object'||Array.isArray(data.names))throw Error('Ugyldige visningsnavn');
  const ids=new Set(layout.stops.map(s=>s.id));
  if(Object.keys(data.names).length>ids.size)throw Error('For mange navn');
  for(const [id,name] of Object.entries(data.names))if(!ids.has(id)||typeof name!=='string'||!name.trim()||name!==cleanName(name)||name.length>80)throw Error('Ugyldig visningsnavn '+id);
  if(Object.keys(data.stops).length>ids.size||data.paths.length>1000)throw Error('For mange geografiske elementer');
  for(const [id,item] of Object.entries(data.stops))if(!ids.has(id)||!valid(item?.coordinates)||item.source!=='manual'||item.verification!=='user-reviewed')throw Error('Ugyldig stopp '+id);
  const known=new Set();
  for(const line of data.paths){
   if(!/^geo-path-\d{3,4}$/.test(line?.id||'')||known.has(line.id)||!Array.isArray(line.coordinates)||line.coordinates.length<2||line.coordinates.length>1000||!line.coordinates.every(valid)|| (line.name!==undefined&&(typeof line.name!=='string'||!line.name.trim()||line.name!==cleanName(line.name)||line.name.length>80)) || (line.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(line.color)))throw Error('Ugyldig kartlinje');
   validatePoints(line.coordinates);
   known.add(line.id);
  }
  return data;
 }
 function place(data,layout,id,p){
  if(!layout.stops.some(s=>s.id===id)||!valid(p))throw Error('Ugyldig posisjon');
  data.stops[id]={coordinates:[...p],source:'manual',verification:'user-reviewed'};
 }
 function draw(data,points){
  validatePoints(points);
  const ids=new Set(data.paths.map(x=>x.id));
  let id;for(let i=1;i<10000;i++){const x='geo-path-'+String(i).padStart(3,'0');if(!ids.has(x)){id=x;break;}}
  if(!id)throw Error('Ingen ledig ID');
  data.paths.push({id,coordinates:validatePoints(points),verification:'manual-geometry-only'});
  return id;
 }

 function renameStop(data,layout,id,name){
  if(!layout.stops.some(s=>s.id===id))throw Error('Ukjent holdeplass');
  const text=cleanName(name);
  if(text.length>80)throw Error('Navnet er for langt (maks 80 tegn)');
  if(text)data.names[id]=text;else delete data.names[id];
 }
 function removeStop(data,id){delete data.stops[id];}
 function appendPath(data,id,points){
  const route=pathById(data,id);
  route.coordinates=validatePoints([...route.coordinates,...points]);
 }
 function insertVertex(data,id,after,p){
  const route=pathById(data,id);
  if(!Number.isInteger(after)||after<0||after>=route.coordinates.length-1||!valid(p))throw Error('Ugyldig delstrekning');
  const copy=route.coordinates.map(c=>[...c]);copy.splice(after+1,0,[...p]);
  route.coordinates=validatePoints(copy);
 }
 function moveVertex(data,id,index,p){
  const route=pathById(data,id);
  if(!Number.isInteger(index)||index<0||index>=route.coordinates.length||!valid(p))throw Error('Ugyldig linjepunkt');
  const copy=route.coordinates.map(c=>[...c]);copy[index]=[...p];
  route.coordinates=validatePoints(copy);
 }
 function removeVertex(data,id,index){
  const route=pathById(data,id);
  if(!Number.isInteger(index)||index<0||index>=route.coordinates.length||route.coordinates.length<=2)throw Error('Minst to punkter må beholdes');
  const copy=route.coordinates.map(c=>[...c]);copy.splice(index,1);
  route.coordinates=validatePoints(copy);
 }
 function deletePath(data,id){
  const at=data.paths.findIndex(p=>p.id===id);
  if(at<0)throw Error('Ukjent geografisk linje');
  data.paths.splice(at,1);
 }
 function renamePath(data,id,name){
  const route=pathById(data,id),s=cleanName(name);
  if(s.length>80)throw Error('Navnet er for langt (maks 80 tegn)');
  if(s)route.name=s;else delete route.name;
 }
 function colorPath(data,id,color){
  if(!/^#[0-9a-fA-F]{6}$/.test(color))throw Error('Ugyldig linjefarge');
  pathById(data,id).color=color.toLowerCase();
 }

 function exportGeo(data,layout){
  validate(data,layout);
  return {type:'FeatureCollection',features:[
   ...Object.entries(data.stops).map(([stopId,p])=>({type:'Feature',properties:{type:'stop',stopId,...(data.names[stopId]?{name:data.names[stopId]}:{})},geometry:{type:'Point',coordinates:p.coordinates}})),
   ...Object.entries(data.names).filter(([id])=>!data.stops[id]).map(([stopId,name])=>({type:'Feature',properties:{type:'stop-name',stopId,name},geometry:null})),
   ...data.paths.map(p=>({type:'Feature',properties:{type:'path',id:p.id,...(p.name?{name:p.name}:{}),...(p.color?{color:p.color}:{})},geometry:{type:'LineString',coordinates:p.coordinates}}))
  ]};
 }
 function importGeo(data,layout){
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length>4000)throw Error('Ugyldig GeoJSON');
  const result=empty(),seen=new Set();
  for(const item of data.features){
   const p=item?.properties,g=item?.geometry;
   if(p?.type==='stop'&&g?.type==='Point'){
    if(seen.has(p.stopId))throw Error('Duplisert holdeplass');
    place(result,layout,p.stopId,g.coordinates);if(p.name!==undefined)renameStop(result,layout,p.stopId,p.name);seen.add(p.stopId);
   }else if(p?.type==='stop-name'&&g===null){
    if(seen.has(p.stopId))throw Error('Duplisert holdeplass');
    renameStop(result,layout,p.stopId,p.name);if(!result.names[p.stopId])throw Error('Tomt navn');seen.add(p.stopId);
   }else if(p?.type==='path'&&g?.type==='LineString'){
    if(!/^geo-path-\d{3,4}$/.test(p.id)||seen.has(p.id))throw Error('Ugyldig eller duplisert trasé');
    const record={id:p.id,coordinates:validatePoints(g.coordinates),verification:'manual-geometry-only'};
    if(p.name!==undefined){const n=cleanName(p.name);if(!n||n.length>80)throw Error('Ugyldig linjenavn');record.name=n;}
    if(p.color!==undefined){if(!/^#[0-9a-fA-F]{6}$/.test(p.color))throw Error('Ugyldig farge');record.color=p.color.toLowerCase();}
    result.paths.push(record);seen.add(p.id);
   }else throw Error('Ukjent GeoJSON-element');
  }
  return validate(result,layout);
 }
 return {valid,empty,candidates,validate,place,draw,renameStop,removeStop,appendPath,insertVertex,moveVertex,removeVertex,deletePath,renamePath,colorPath,exportGeo,importGeo};
});
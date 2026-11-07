(function(root,factory){
 'use strict';
 const api=factory(
  typeof module==='object'&&module.exports?require('./drawing-tools.js'):root.InTransitDrawingTools,
  typeof module==='object'&&module.exports?require('./display-stations.js'):root.InTransitDisplayStations
 );
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitPhysicalBoard=api;
})(globalThis,function(Drawing,Stations){
 'use strict';
 const SOURCE_W=913,SOURCE_H=1280;
 const PRESETS=Object.freeze([{id:'30x40',widthCm:30,heightCm:40},
  {id:'50x70',widthCm:50,heightCm:70},{id:'40x40',widthCm:40,heightCm:40}]);
 const enc=value=>String(value??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[x]));
 const n=value=>Number(value.toFixed(3));
 const hex=value=>/^#[a-f\d]{6}$/i.test(value||'')?value:'#687e94';

 // Physical board placement is an optional display-only overlay, keyed to the
 // exact centimeter size; source stops, track geometry and Quay IDs are untouched.
 function profileKey(settings={}){
  const w=Number(settings.widthCm??30),h=Number(settings.heightCm??40);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<10||w>200||h<10||h>200)throw Error('Ugyldig tavlestørrelse');
  const fmt=v=>String(n(v));
  return fmt(w)+'x'+fmt(h);
 }
 const markerKey=(stopId,quayId,groupId)=>groupId?'quay:'+quayId:'stop:'+stopId;
 function currentProfile(layout,settings={}){
  const result=layout.physicalBoardLayouts?.profiles?.[profileKey(settings)];
  return result||{positions:{},labels:{},routes:{},followStations:false};
 }
 function applyPositions(markers,labels,groups,profile,dims){
  for(const marker of markers){
   const pos=profile.positions?.[marker.key];
   if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)){
    marker.x=n(pos.x*dims.widthMm);marker.y=n(pos.y*dims.heightMm);
    marker.repositioned=true;
   }
  }
  for(const label of labels){
   const pos=profile.labels?.[label.stopId];
   if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)){
    label.x=n(pos.x*dims.widthMm);label.y=n(pos.y*dims.heightMm);
    label.repositioned=true;
   }
  }
  // Recompute the decorative ring after moving any of its real Quay markers.
  for(const group of groups){
   const items=markers.filter(marker=>marker.groupId===group.id);
   if(!items.length)continue;
   const half=dims.ledDiameterMm/2+2.2;
   const x0=Math.min(...items.map(m=>m.x))-half,x1=Math.max(...items.map(m=>m.x))+half,
    y0=Math.min(...items.map(m=>m.y))-half,y1=Math.max(...items.map(m=>m.y))+half;
   Object.assign(group,{x:n(x0),y:n(y0),width:n(x1-x0),height:n(y1-y0)});
  }
 }
 function saveOverrides(layout,settings,changes){
  const key=profileKey(settings),validStop=new Set((layout.stops||[]).map(s=>'stop:'+s.id)),
   validQuay=new Set((layout.displayStations||[]).flatMap(ds=>ds.members.map(m=>'quay:'+m.quayId))),
   validLabels=new Set((layout.stops||[]).map(s=>s.id));
  if(!changes||typeof changes!=='object')throw Error('Ugyldig tavleplassering');
  if(changes.followStations!==undefined&&typeof changes.followStations!=='boolean')throw Error('Ugyldig valg for grafisk linjetilpasning');
  const validatePosition=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&
   p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
  for(const [marker,p] of Object.entries(changes.positions||{}))
   if(!(validStop.has(marker)||validQuay.has(marker))||!validatePosition(p))
    throw Error('Ukjent markør eller ugyldig LED-posisjon '+marker);
  for(const [label,p] of Object.entries(changes.labels||{}))
   if(!validLabels.has(label)||!validatePosition(p))
    throw Error('Ukjent etikett eller ugyldig tekstposisjon '+label);
  const board=layout.physicalBoardLayouts||{version:1,profiles:{}};
  if(board.version!==1)throw Error('Ukjent tavleprofil');
  const existing=board.profiles[key]||{positions:{},labels:{}};
  const profile={
   positions:{...existing.positions,...(changes.positions||{})},
   labels:{...existing.labels,...(changes.labels||{})},
   followStations:changes.followStations===undefined?existing.followStations===true:changes.followStations,
   routes:existing.routes||{}
  };
  if(Object.keys(board.profiles).length>=80&&!board.profiles[key])throw Error('For mange tavleformater');
  board.profiles[key]=profile;layout.physicalBoardLayouts=board;
 }
 function resetOverrides(layout,settings){
  const key=profileKey(settings),board=layout.physicalBoardLayouts;
  if(!board?.profiles?.[key])return false;
  delete board.profiles[key];
  if(!Object.keys(board.profiles).length)delete layout.physicalBoardLayouts;
  return true;
 }


 // An additive, physical-format-only route drawing layer. Coordinates are
 // normalized to the physical board. It never writes source paths[].points.
 const boardPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&
  p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
 const routeFor=(layout,pathId)=>{
  const path=layout.paths?.find(p=>p.id===pathId);
  if(!path)throw Error('Ukjent original linje '+pathId);
  return path;
 };
 function editRoute(layout,settings,pathId,operation){
  const path=routeFor(layout,pathId);
  const old=currentProfile(layout,settings).routes?.[pathId]||{vertices:{},bends:[]};
  const next={vertices:{...old.vertices},bends:(old.bends||[]).map(p=>({...p}))};
  operation(next,path);
  if(Object.keys(next.vertices).length>3000||next.bends.length>1000)
   throw Error('For mange fysiske linjepunkter');
  // Prepare the profile with the existing validated board transaction logic.
  saveOverrides(layout,settings,{});
  layout.physicalBoardLayouts.profiles[profileKey(settings)].routes[pathId]=next;
 }
 function setRoutePoint(layout,settings,pathId,key,position){
  if(!boardPoint(position))throw Error('Linjeknekkpunkt må ligge inne på tavlen');
  editRoute(layout,settings,pathId,(next,path)=>{
   const p={x:n(position.x),y:n(position.y)};
   if(typeof key==='number'){
    if(!Number.isInteger(key)||key<0||key>=path.points.length)
     throw Error('Ukjent linjeknekkpunkt');
    next.vertices[String(key)]=p;
   }else{
    const bend=next.bends.find(b=>b.id===key);
    if(!bend)throw Error('Ukjent ekstra knekkpunkt');
    Object.assign(bend,p);
   }
  });
 }
 function addRouteBend(layout,settings,pathId,afterIndex,position){
  const path=routeFor(layout,pathId);
  if(!Number.isInteger(afterIndex)||afterIndex<0||afterIndex>=path.points.length-1)
   throw Error('Ukjent linjedelstrekning');
  if(!boardPoint(position))throw Error('Nytt knekkpunkt må ligge på tavlen');
  let id;
  editRoute(layout,settings,pathId,next=>{
   if(next.bends.length>=1000)throw Error('For mange ekstra knekkpunkter');
   let index=1;
   const exists=new Set(next.bends.map(b=>b.id));
   while(exists.has('bend-'+index))index++;
   id='bend-'+index;
   next.bends.push({id,afterIndex,x:n(position.x),y:n(position.y)});
  });
  return id;
 }
 function removeRouteBend(layout,settings,pathId,bendId){
  editRoute(layout,settings,pathId,next=>{
   const before=next.bends.length;
   next.bends=next.bends.filter(b=>b.id!==bendId);
   if(next.bends.length===before)throw Error('Knekkpunktet finnes ikke');
  });
 }
 function resetRoute(layout,settings,pathId){
  routeFor(layout,pathId);
  const key=profileKey(settings),entry=layout.physicalBoardLayouts?.profiles?.[key];
  if(!entry?.routes?.[pathId])return false;
  delete entry.routes[pathId];return true;
 }
 function routeGeometry(layout,settings,options={}){
  const dims=dimensions(settings);
  const saved=currentProfile(layout,settings),changes=options.previewOverrides||{};
  const profile={positions:{...saved.positions,...(changes.positions||{})},
   labels:{...saved.labels,...(changes.labels||{})},
   followStations:saved.followStations===true,
   routes:{...saved.routes,...(changes.routes||{})}};
  const {markers}=layoutElements(layout,dims,profile);
  const followed=followVertexPaths(layout,profile,dims,markers);
  return buildPhysicalRoutes(layout,followed.paths,profile,dims);
 }
 function buildPhysicalRoutes(layout,paths,profile,dims){
  const handles=[];
  const processed=paths.map(path=>{
   const route=profile.routes?.[path.id]||{vertices:{},bends:[]};
   const points=[];
   for(let i=0;i<path.points.length;i++){
    const value=route.vertices?.[String(i)];
    const original=path.points[i],pt=value?
     {x:n((value.x*dims.widthMm-dims.offsetX)/dims.scale),
      y:n((value.y*dims.heightMm-dims.offsetY)/dims.scale)}:original;
    points.push(pt);
    const physical=project(pt,dims);
    handles.push({pathId:path.id,key:String(i),type:'vertex',index:i,
     x:physical.x,y:physical.y,overridden:Boolean(value)});
    if(i<path.points.length-1){
     for(const bend of route.bends||[]){
      if(bend.afterIndex!==i)continue;
      const p={x:n((bend.x*dims.widthMm-dims.offsetX)/dims.scale),
       y:n((bend.y*dims.heightMm-dims.offsetY)/dims.scale)};
      points.push(p);
      handles.push({pathId:path.id,key:bend.id,type:'bend',afterIndex:i,
       x:n(bend.x*dims.widthMm),y:n(bend.y*dims.heightMm),overridden:true});
     }
    }
   }
   return {...path,points};
  });
  return {paths:processed,handles};
 }

 function dimensions(settings={}){
  const widthCm=Number(settings.widthCm??30),heightCm=Number(settings.heightCm??40),
   marginMm=Number(settings.marginMm??12),ledDiameterMm=Number(settings.ledDiameterMm??5),
   labelFontMm=Number(settings.labelFontMm??2.4);
  if(![widthCm,heightCm,marginMm,ledDiameterMm,labelFontMm].every(Number.isFinite)||
   widthCm<10||widthCm>200||heightCm<10||heightCm>200||
   marginMm<3||marginMm>50||ledDiameterMm<2||ledDiameterMm>20||
   labelFontMm<1.5||labelFontMm>8)
   throw Error('Ugyldig tavlemål, marg, LED-diameter eller tekststørrelse');
  const widthMm=n(widthCm*10),heightMm=n(heightCm*10);
  if(widthMm-2*marginMm<=ledDiameterMm+5||heightMm-2*marginMm<=ledDiameterMm+5)
   throw Error('Tavlen er for liten for valgt marg og LED-diameter');
  // Reserve the LED radius outside the map geometry, so drilled dots remain
  // within the requested physical border margin even at the very edges.
  const clearance=marginMm+ledDiameterMm/2;
  const scale=Math.min((widthMm-2*clearance)/SOURCE_W,(heightMm-2*clearance)/SOURCE_H);
  const contentWidthMm=SOURCE_W*scale,contentHeightMm=SOURCE_H*scale;
  const offsetX=(widthMm-contentWidthMm)/2,offsetY=(heightMm-contentHeightMm)/2;
  return {widthCm,heightCm,widthMm,heightMm,marginMm,ledDiameterMm,labelFontMm,scale,
   contentWidthMm:n(contentWidthMm),contentHeightMm:n(contentHeightMm),
   offsetX:n(offsetX),offsetY:n(offsetY),
   usagePct:n(contentWidthMm*contentHeightMm/widthMm/heightMm*100)};
 }
 function project(point,dims){return {x:n(dims.offsetX+point.x*dims.scale),y:n(dims.offsetY+point.y*dims.scale)};}
 function layoutElements(layout,dims,profile={positions:{},labels:{}}){
  const usedQuays=new Map;
  for(const ds of layout.displayStations||[])for(const m of ds.members){
   if(!usedQuays.has(m.mapStopId))usedQuays.set(m.mapStopId,new Set);
   usedQuays.get(m.mapStopId).add(m.quayId);
  }
  const markers=[],groupOutlines=[],warnings=[];
  const addMarker=(point,origin,quayId,groupId='',explicit=false)=>{
   const p=project(point,dims);
   markers.push({...p,key:markerKey(origin.id,quayId,groupId),stopId:origin.id,quayId,groupId,explicit});
  };
  for(const stop of layout.stops||[]){
   const known=Stations.uniqueQuays(stop),grouped=usedQuays.get(stop.id)||new Set;
   const left=known.filter(id=>!grouped.has(id));
   if(known.length&&left.length===0)continue;
   if(stop.verification!=='confirmed'){
    warnings.push({code:'UNVERIFIED_STOP',message:'Uavklart kartpunkt: '+stop.id});
    addMarker(stop,stop,null,'',false);
   }else{
    // A legacy marker with several Quays is not one independently verified
    // physical LED. It stays as a single schematic symbol until user groups them.
    if(left.length!==1)warnings.push({code:'MULTI_QUAY_STOP',message:'Flere/ingen Quay-er på samme kartpunkt: '+stop.id});
    addMarker(stop,stop,left.length===1?left[0]:null,'',false);
   }
  }
  for(const ds of layout.displayStations||[]){
   const g=Stations.geometry(layout,ds),members=g.members.map(({member,point})=>({member,point:project(point,dims)}));
   if(!members.length)continue;
   if(members.length===2){
    // Physical LED diameters must never overlap just because the original
    // schematic offsets become smaller on a miniature physical board.
    const a=members[0].point,b=members[1].point,dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),
     safeDistance=dims.ledDiameterMm+1.5;
    if(len<safeDistance){
     const ux=len>0.001?dx/len:1,uy=len>0.001?dy/len:0;
     const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
     members[0].point={x:n(cx-ux*safeDistance/2),y:n(cy-uy*safeDistance/2)};
     members[1].point={x:n(cx+ux*safeDistance/2),y:n(cy+uy*safeDistance/2)};
     warnings.push({code:'LED_SPACING_ADJUSTED',message:'LED-avstanden måtte økes for '+ds.id});
    }
   }
   const radius=dims.ledDiameterMm/2,padding=2.2;
   const lx=Math.min(...members.map(m=>m.point.x))-radius-padding,
    rx=Math.max(...members.map(m=>m.point.x))+radius+padding,
    ty=Math.min(...members.map(m=>m.point.y))-radius-padding,
    by=Math.max(...members.map(m=>m.point.y))+radius+padding;
   if(ds.style.type!=='double'){
    groupOutlines.push({id:ds.id,x:n(lx),y:n(ty),width:n(rx-lx),height:n(by-ty),
     kind:ds.style.type==='double_capsule'||ds.style.outerShape==='capsule'?'capsule':'ellipse'});
   }
   for(const {member,point} of members){
    const origin=layout.stops.find(s=>s.id===member.mapStopId);
    if(origin)markers.push({...point,key:markerKey(origin.id,member.quayId,ds.id),stopId:origin.id,quayId:member.quayId,groupId:ds.id,explicit:true});
   }
  }
  const labels=(layout.stops||[]).filter(s=>s.label?.visible).map(stop=>{
   const p=project(stop.label,dims);
   return {...p,stopId:stop.id,name:stop.name};
  });
  applyPositions(markers,labels,groupOutlines,profile,dims);
  const shifted=markers.filter(m=>m.repositioned).length;
  if(shifted&&!profile.followStations)warnings.push({code:'MOVED_MARKER',message:shifted+
   ' tavlemarkører er flyttet separat; grafiske linjer er ikke koblet til flytting'});
  for(let i=0;i<markers.length;i++)for(let j=i+1;j<markers.length;j++){
   const a=markers[i],b=markers[j];
   if(a.groupId&&a.groupId===b.groupId)continue;
   if(Math.hypot(a.x-b.x,a.y-b.y)<dims.ledDiameterMm+0.7){
    a.overlap=true;b.overlap=true;
    warnings.push({code:'LED_OVERLAP',message:'LED-punkter ligger for tett: '+a.stopId+' / '+b.stopId});
   }
  }
  for(const label of labels)if(label.x<0||label.x>dims.widthMm||label.y<0||label.y>dims.heightMm)
   warnings.push({code:'LABEL_OUTSIDE',message:'Navn utenfor tavleflaten: '+label.stopId});
  // Warnings for text/LED collisions use a conservative width estimate.
  const lh=dims.labelFontMm;
  for(const label of labels){
   const nameWidth=label.name.length*lh*0.54;
   if(label.x+nameWidth>dims.widthMm-dims.marginMm/2)
    warnings.push({code:'LABEL_EDGE',message:'Navn for nært tavlekanten: '+label.stopId});
  }
  return {markers,labels,groupOutlines,warnings};
 }
 // Opt-in rendering of graphic route vertices where an ORIGINAL source stop is
 // geometrically co-located with that vertex. This is NOT an Entur route link.
 // All markers belonging to that map stop must have moved, and the vertex may
 // not represent two distinct schematic map stops.
 function followVertexPaths(layout,profile,dims,markers){
  const untouched={paths:layout.paths,trackedVertices:0,ambiguous:0,unmatched:0};
  if(profile.followStations!==true||!markers.some(m=>m.repositioned))return untouched;
  const changed=new Map;
  for(const stop of layout.stops){
   const items=markers.filter(m=>m.stopId===stop.id);
   if(!items.length||items.some(m=>!m.repositioned))continue;
   const x=items.reduce((v,m)=>v+m.x,0)/items.length;
   const y=items.reduce((v,m)=>v+m.y,0)/items.length;
   changed.set(stop.id,{x:n((x-dims.offsetX)/dims.scale),y:n((y-dims.offsetY)/dims.scale)});
  }
  if(!changed.size)return untouched;
  const result=layout.paths.map(path=>({...path,points:path.points.map(p=>{
   const matches=layout.stops.filter(s=>Math.hypot(s.x-p.x,s.y-p.y)<0.025);
   if(matches.length!==1){
    if(matches.some(s=>changed.has(s.id)))untouched.ambiguous++;
    return p;
   }
   const replacement=changed.get(matches[0].id);
   if(replacement){untouched.trackedVertices++;return replacement;}
   return p;
  })}));
  for(const stopId of changed.keys()){
   if(!layout.paths.some(path=>path.points.some(p=>{
    const stop=layout.stops.find(s=>s.id===stopId);
    return stop&&Math.hypot(stop.x-p.x,stop.y-p.y)<0.025;
   })))untouched.unmatched++;
  }
  return {...untouched,paths:result};
 }

 function build(layout,settings={},options={}){
  if(!Array.isArray(layout?.stops)||!Array.isArray(layout?.paths))
   throw Error('Mangler kartets stasjoner eller linjer');
  const dims=dimensions(settings),base=currentProfile(layout,settings),override=options.previewOverrides||{},
   profile={positions:{...base.positions,...(override.positions||{})},labels:{...base.labels,...(override.labels||{})},followStations:base.followStations===true,
   routes:{...(base.routes||{}),...(override.routes||{})}},
   {markers,labels,groupOutlines,warnings}=layoutElements(layout,dims,profile);
  const adjusted=followVertexPaths(layout,profile,dims,markers);
  if(adjusted.ambiguous)warnings.push({code:'ROUTE_VERTEX_AMBIGUOUS',message:adjusted.ambiguous+' linjeknekkpunkter er tvetydige og ble ikke automatisk flyttet'});
  if(adjusted.unmatched)warnings.push({code:'ROUTE_VERTEX_MISSING',message:adjusted.unmatched+' flyttede stopp mangler eksakt sammenfallende grafisk linjepunkt'});
  const boardRoutes=buildPhysicalRoutes(layout,adjusted.paths,profile,dims);
  const lit=new Set(options.litQuays||[]);
  const frame=options.simulated?'SIMULERT':'VISUELL FORHÅNDSVISNING – IKKE HARDWARE-VALIDERT';
  const pathSvg=(boardRoutes.paths||[]).flatMap(path=>Drawing.visualTracks(path).map(track=>
   '<polyline data-route="'+enc(path.id)+'" points="'+track.points.map(point=>{
    const p=project(point,dims);return p.x+','+p.y;}).join(' ')+
    '" fill="none" stroke="'+hex(track.color)+'" stroke-width="'+n(Math.max(0.45,track.width*dims.scale))+
    '" stroke-linecap="round" stroke-linejoin="round"/>')).join('\n');

  const routeHandleSvg=options.showRouteHandles?boardRoutes.handles.map(handle=>
   '<circle data-board-route-path="'+enc(handle.pathId)+
   '" data-board-route-key="'+enc(handle.key)+
   '" data-board-route-type="'+handle.type+
   '" cx="'+handle.x+'" cy="'+handle.y+'" r="2.7"'+
   ' fill="'+(handle.type==='bend'?'#ffd479':'#70d1fa')+
   '" stroke="#06121e" stroke-width="0.9" tabindex="0" role="button" aria-label="'+
   (handle.type==='bend'?'Flytt ekstra knekkpunkt':'Flytt linjeknekkpunkt')+' '+enc(handle.pathId)+
   ' '+enc(handle.key)+'"/>' ).join('\n'):'';
  const outlineSvg=groupOutlines.map(g=>g.kind==='capsule'?
   '<rect data-display-station="'+enc(g.id)+'" data-board-group="'+enc(g.id)+'" x="'+g.x+'" y="'+g.y+
    '" width="'+g.width+'" height="'+g.height+'" rx="'+n(Math.min(g.width,g.height)/2)+
    '" fill="none" stroke="#dae8f4" stroke-width="0.8"/>' :
   '<ellipse data-display-station="'+enc(g.id)+'" data-board-group="'+enc(g.id)+'" cx="'+n(g.x+g.width/2)+'" cy="'+n(g.y+g.height/2)+
    '" rx="'+n(g.width/2)+'" ry="'+n(g.height/2)+
    '" fill="none" stroke="#dae8f4" stroke-width="0.8"/>').join('\n');
  const ledSvg=markers.map(m=>{
   const active=m.quayId&&lit.has(m.quayId);
   const radius=dims.ledDiameterMm/2;
   return '<circle data-stop="'+enc(m.stopId)+'"'+
    (m.quayId?' data-quay="'+enc(m.quayId)+'"':'')+
    (m.groupId?' data-display-station="'+enc(m.groupId)+'"':'')+
    ' data-board-key="'+enc(m.key)+'" tabindex="0" role="button" aria-label="Flytt tavlestasjon '+enc(m.stopId)+'"'+
    (m.repositioned?' data-board-moved="true"':'')+
    (m.overlap?' data-overlap="true"':'')+
    ' cx="'+m.x+'" cy="'+m.y+'" r="'+n(radius)+
    '" fill="'+(active?'#44e392':'#152a3c')+'" stroke="'+(m.overlap?'#ffad5b':m.explicit?'#bed3e6':'#7794a8')+
    '" stroke-width="'+(m.overlap?'1.2':m.explicit?'0.7':'0.5')+'"/>';
  }).join('\n');
  const labelSvg=(settings.showLabels===false?[]:labels).map(l=>
   '<text data-label-stop="'+enc(l.stopId)+'" data-board-label="'+enc(l.stopId)+'" tabindex="0" role="button" aria-label="Flytt tavlenavn '+enc(l.name)+'" x="'+l.x+'" y="'+l.y+
   '" fill="#dfeaff" font-size="'+dims.labelFontMm+
   '" font-family="sans-serif" stroke="#07121f" stroke-width="0.55" paint-order="stroke">'+enc(l.name)+'</text>').join('\n');
  const svg='<?xml version="1.0" encoding="UTF-8"?>\n'+
   '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'+
   ' width="'+dims.widthMm+'mm" height="'+dims.heightMm+'mm" viewBox="0 0 '+
    dims.widthMm+' '+dims.heightMm+'" role="img" aria-label="InTransit fysisk tavlepreview">\n'+
   '<title>InTransit – '+dims.widthCm+' × '+dims.heightCm+' cm</title>\n'+
   '<desc>Fysiske mål i millimeter. Kart er skjematisk; LED og kabling må verifiseres. '+enc(frame)+'</desc>\n'+
   '<rect width="'+dims.widthMm+'" height="'+dims.heightMm+'" fill="#07121f"/>\n'+
   '<g id="routes">'+pathSvg+'</g>\n'+
   '<g id="display-stations">'+outlineSvg+'</g>\n'+
   '<g id="led-markers">'+ledSvg+'</g>\n'+
   '<g id="labels">'+labelSvg+'</g>\n'+
   '<g id="route-edit-handles">'+routeHandleSvg+'</g>\n'+
   (options.simulated?'<text x="6" y="'+n(dims.heightMm-4)+'" fill="#ffe1a1" font-size="3" font-family="sans-serif">SIMULERT</text>\n':'')+
   '</svg>\n';
  return {svg,dimensions:dims,summary:{
   markers:markers.length,groups:groupOutlines.length,labels:settings.showLabels===false?0:labels.length,
   issues:warnings.length,overlaps:warnings.filter(w=>w.code==='LED_OVERLAP').length,
   adjustedSpacing:warnings.filter(w=>w.code==='LED_SPACING_ADJUSTED').length,
   trackedVertices:adjusted.trackedVertices,followStations:profile.followStations===true,
   editedRouteVertices:boardRoutes.handles.filter(h=>h.overridden).length
  },warnings};
 }
 return {PRESETS,dimensions,project,layoutElements,build,profileKey,currentProfile,saveOverrides,resetOverrides,markerKey,followVertexPaths,routeGeometry,setRoutePoint,addRouteBend,removeRouteBend,resetRoute};
});

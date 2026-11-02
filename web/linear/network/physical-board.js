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
 function layoutElements(layout,dims){
  const usedQuays=new Map;
  for(const ds of layout.displayStations||[])for(const m of ds.members){
   if(!usedQuays.has(m.mapStopId))usedQuays.set(m.mapStopId,new Set);
   usedQuays.get(m.mapStopId).add(m.quayId);
  }
  const markers=[],groupOutlines=[],warnings=[];
  const addMarker=(point,origin,quayId,groupId='',explicit=false)=>{
   const p=project(point,dims);
   markers.push({...p,stopId:origin.id,quayId,groupId,explicit});
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
    if(origin)markers.push({...point,stopId:origin.id,quayId:member.quayId,groupId:ds.id,explicit:true});
   }
  }
  for(let i=0;i<markers.length;i++)for(let j=i+1;j<markers.length;j++){
   const a=markers[i],b=markers[j];
   if(a.groupId&&a.groupId===b.groupId)continue;
   if(Math.hypot(a.x-b.x,a.y-b.y)<dims.ledDiameterMm+0.7){
    a.overlap=true;b.overlap=true;
    warnings.push({code:'LED_OVERLAP',message:'LED-punkter ligger for tett: '+a.stopId+' / '+b.stopId});
   }
  }
  const labels=(layout.stops||[]).filter(s=>s.label?.visible).map(stop=>{
   const p=project(stop.label,dims);
   return {...p,stopId:stop.id,name:stop.name};
  });
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
 function build(layout,settings={},options={}){
  if(!Array.isArray(layout?.stops)||!Array.isArray(layout?.paths))
   throw Error('Mangler kartets stasjoner eller linjer');
  const dims=dimensions(settings),{markers,labels,groupOutlines,warnings}=layoutElements(layout,dims);
  const lit=new Set(options.litQuays||[]);
  const frame=options.simulated?'SIMULERT':'VISUELL FORHÅNDSVISNING – IKKE HARDWARE-VALIDERT';
  const pathSvg=(layout.paths||[]).flatMap(path=>Drawing.visualTracks(path).map(track=>
   '<polyline data-route="'+enc(path.id)+'" points="'+track.points.map(point=>{
    const p=project(point,dims);return p.x+','+p.y;}).join(' ')+
    '" fill="none" stroke="'+hex(track.color)+'" stroke-width="'+n(Math.max(0.45,track.width*dims.scale))+
    '" stroke-linecap="round" stroke-linejoin="round"/>')).join('\n');
  const outlineSvg=groupOutlines.map(g=>g.kind==='capsule'?
   '<rect data-display-station="'+enc(g.id)+'" x="'+g.x+'" y="'+g.y+
    '" width="'+g.width+'" height="'+g.height+'" rx="'+n(Math.min(g.width,g.height)/2)+
    '" fill="none" stroke="#dae8f4" stroke-width="0.8"/>' :
   '<ellipse data-display-station="'+enc(g.id)+'" cx="'+n(g.x+g.width/2)+'" cy="'+n(g.y+g.height/2)+
    '" rx="'+n(g.width/2)+'" ry="'+n(g.height/2)+
    '" fill="none" stroke="#dae8f4" stroke-width="0.8"/>').join('\n');
  const ledSvg=markers.map(m=>{
   const active=m.quayId&&lit.has(m.quayId);
   const radius=dims.ledDiameterMm/2;
   return '<circle data-stop="'+enc(m.stopId)+'"'+
    (m.quayId?' data-quay="'+enc(m.quayId)+'"':'')+
    (m.groupId?' data-display-station="'+enc(m.groupId)+'"':'')+
    (m.overlap?' data-overlap="true"':'')+
    ' cx="'+m.x+'" cy="'+m.y+'" r="'+n(radius)+
    '" fill="'+(active?'#44e392':'#152a3c')+'" stroke="'+(m.overlap?'#ffad5b':m.explicit?'#bed3e6':'#7794a8')+
    '" stroke-width="'+(m.overlap?'1.2':m.explicit?'0.7':'0.5')+'"/>';
  }).join('\n');
  const labelSvg=(settings.showLabels===false?[]:labels).map(l=>
   '<text data-label-stop="'+enc(l.stopId)+'" x="'+l.x+'" y="'+l.y+
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
   (options.simulated?'<text x="6" y="'+n(dims.heightMm-4)+'" fill="#ffe1a1" font-size="3" font-family="sans-serif">SIMULERT</text>\n':'')+
   '</svg>\n';
  return {svg,dimensions:dims,summary:{
   markers:markers.length,groups:groupOutlines.length,labels:settings.showLabels===false?0:labels.length,
   issues:warnings.length,overlaps:warnings.filter(w=>w.code==='LED_OVERLAP').length,
   adjustedSpacing:warnings.filter(w=>w.code==='LED_SPACING_ADJUSTED').length
  },warnings};
 }
 return {PRESETS,dimensions,project,layoutElements,build};
});

// Browser-only V2 GPS route/Quay shadow, NOT a route or LED mapping engine.
// Uses the existing PixelFrame with its strongest vehicle GPS coordinates and
// a checked-in Entur JourneyPattern snapshot. Never requests external data,
// writes a position, or persists vehicle identity. No claim of physical stop.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitGpsV2Shadow=api;
})(globalThis,function(){
 'use strict';
 const QUAY=/^NSR:Quay:\d+$/,TRACK_TTL=180000,MAX_FRESH=30000;
 const validDirection=x=>x==='inbound'||x==='outbound';
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 function metres(a,b){
  const r=Math.PI/180,lat1=a.lat*r,lat2=b.lat*r,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r;
  const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
 }
 function create({board,patterns,lineCodes=['1','11'],radiusMeters=85}={}){
  if(board?.id!=='trondheim-city-lines-catalog'||!Array.isArray(board.nodes)||
     !patterns?.lines||!finite(radiusMeters)||radiusMeters<=0||radiusMeters>100)
   throw Error('invalid-v2-shadow-configuration');
  const lines=new Map(),nodeByQuay=new Map(),tracks=new Map();
  for(const node of board.nodes){
   if(QUAY.test(node?.quayId)&&finite(node.lat)&&finite(node.lon)&&
      Number.isInteger(node.led)){
    if(nodeByQuay.has(node.quayId))nodeByQuay.set(node.quayId,null);
    else nodeByQuay.set(node.quayId,node);
   }
  }
  for(const code of lineCodes){
   if(!['1','11'].includes(String(code)))throw Error('v2-pilot-lines-only');
   const snapshots=patterns.lines[code]?.patterns||[];
   const approved=snapshots.filter(p=>validDirection(p.directionType)&&
    Array.isArray(p.quays)&&p.quays.length>=2&&p.quays.every(x=>QUAY.test(x)));
   const eligible=new Set(approved.flatMap(p=>p.quays));
   const nodes=[...eligible].map(q=>nodeByQuay.get(q)).filter(n=>n&&
    Array.isArray(n.routes)&&n.routes.includes('atb-bus-'+code+'-live'));
   if(!approved.length||!nodes.length)throw Error('source-pattern-or-quay-unavailable-'+code);
   lines.set(String(code),{patterns:approved,nodes});
  }
  let lastSource=null,lastAt=-Infinity,last={status:'NO_FRAMES',frames:0,lines:{}},frames=0;
  const ordered=(patterns,visited)=>patterns.filter(p=>{
   let previous=-1;
   for(const q of visited){
    const next=p.quays.indexOf(q,previous+1);
    if(next<0||previous>=0&&next-previous>6)return false;
    previous=next;
   }
   return true;
  });
  const uniqueDirection=patterns=>{
   const directions=new Set(patterns.map(p=>p.directionType));
   return directions.size===1?[...directions][0]:null;
  };
  // GPS cannot establish a physical side just by being within N metres.
  // An unambiguous source-planned sequence may *support* the direction;
  // neither the sequence nor a GPS-only matched Quay confirms an AT_STOP.
  function advance(track,quay,allowed,at){
   if(!track.last){
    track.last=quay;track.visited=[quay];track.lastEvidenceAt=at;
    return 'SEED_ONLY';
   }
   if(track.last===quay)return 'SAME_QUAY';
   const sequence=[...track.visited,quay].slice(-6);
   const possible=ordered(allowed,sequence);
   if(!possible.length)return 'SEQUENCE_CONFLICT';
   const nextDirection=uniqueDirection(possible);
   if(track.direction&&nextDirection&&nextDirection!==track.direction)
    return 'DIRECTION_CONFLICT';
   if(track.direction&&!possible.some(p=>p.directionType===track.direction))
    return 'DIRECTION_CONFLICT';
   track.visited=sequence;track.last=quay;track.lastEvidenceAt=at;
   if(!track.direction&&sequence.length>=2&&nextDirection){
    track.direction=nextDirection;track.basis='gps-sequence';
    return 'DIRECTION_LOCKED';
   }
   return 'FORWARD_SEQUENCE';
  }
  function ingest(frame,{now=Date.now(),source='production'}={}){
   if(!finite(now)||!frame||frame.boardProfile!==board.id||!Array.isArray(frame.leds))
    return summary();
   const age=now-Date.parse(frame.generatedAt||'');
   if(!finite(age)||age<0||age>MAX_FRESH||
      !finite(frame.ttlSeconds)||age>frame.ttlSeconds*1000)
    return summary();
   const selected=source==='staging'?'staging':'production';
   if(lastSource&&lastSource!==selected){tracks.clear();lastAt=-Infinity;}
   if(Date.parse(frame.generatedAt)<=lastAt)return summary();
   lastSource=selected;lastAt=Date.parse(frame.generatedAt);frames++;
   for(const [key,track] of tracks)
    if(now-track.lastSeen>TRACK_TTL)tracks.delete(key);
   const totals=Object.fromEntries([...lines.keys()].map(code=>[code,{
    comparedGps:0,acceptedBySourceSequence:0,routeDirectionLocked:0,
    sourceDirectionLocked:0,uniqueQuayCandidate:0,unresolved:0,
    competingQuays:0,sourceDirectionConflict:0,sequenceConflict:0,
    differentFromLive:0,sourceReportedStop:0
   }]));
   const seen=new Set();
   for(const led of frame.leds){
    // Only led.vehicle carries actual latitude/longitude from the GPS
    // interpreter. Never attach those coordinates to another occupant.
    const v=led?.vehicle,code=String(v?.line||'');
    if(!lines.has(code)||typeof v?.id!=='string'||!v.id||seen.has(code+'|'+v.id))
     continue;
    const gps=v.positionType==='gps-nearest-stop'&&finite(v.latitude)&&
     finite(v.longitude)&&Math.abs(v.latitude)<=90&&Math.abs(v.longitude)<=180;
    const provider=v.positionType==='entur-siri-provider-stop'&&
     v.providerReportedAtStop===true&&v.state==='AT_STOP'&&
     led.state==='AT_STOP'&&QUAY.test(v.quayId)&&
     validDirection(v.plannedSourceDirection);
    if(!gps&&!provider)continue;
    seen.add(code+'|'+v.id);
    const metrics=totals[code],info=lines.get(code);
    if(!finite(v.ageSeconds)||v.ageSeconds<0||v.ageSeconds>30)continue;
    const key=code+'|'+v.id,prior=tracks.get(key);
    // Only keep a track from the same line, source and recent timeframe.
    const t=prior||{last:null,visited:[],direction:null,basis:'unknown',
     lastSeen:now,lastEvidenceAt:0};
    t.lastSeen=now;
    tracks.set(key,t);
    if(provider){
     metrics.sourceReportedStop++;
     const possible=info.patterns.filter(p=>
      p.directionType===v.plannedSourceDirection&&p.quays.includes(v.quayId));
     if(!possible.length){metrics.sourceDirectionConflict++;continue;}
     if(t.direction&&t.direction!==v.plannedSourceDirection){
      metrics.sourceDirectionConflict++;continue;
     }
     if(t.last&&t.last!==v.quayId&&advance(t,v.quayId,info.patterns,now)==='SEQUENCE_CONFLICT'){
      metrics.sequenceConflict++;continue;
     }
     if(!t.last){t.last=v.quayId;t.visited=[v.quayId];}
     t.direction=v.plannedSourceDirection;t.basis='provider-stop';
     metrics.sourceDirectionLocked++;metrics.acceptedBySourceSequence++;
     continue;
    }
    metrics.comparedGps++;
    const eligible=info.nodes.map(n=>({node:n,meters:metres(
      {lat:v.latitude,lon:v.longitude},{lat:n.lat,lon:n.lon})}))
     .filter(x=>x.meters<=radiusMeters).sort((a,b)=>a.meters-b.meters);
    if(!eligible.length){metrics.unresolved++;continue;}
    // Direction lock only narrows the *source pattern* candidates. Never
    // choose the nearest opposite-side Quay as a fallback.
    let candidates=eligible;
    if(t.direction)candidates=eligible.filter(x=>
     info.patterns.some(p=>p.directionType===t.direction&&p.quays.includes(x.node.quayId)));
    if(!candidates.length){metrics.sourceDirectionConflict++;metrics.unresolved++;continue;}
    // Require unique Quay in this direction; a single GPS point never
    // establishes direction or a platform's physical occupancy.
    if(candidates.length!==1){
     metrics.competingQuays++;metrics.unresolved++;continue;
    }
    metrics.uniqueQuayCandidate++;
    const candidate=candidates[0].node.quayId;
    const result=advance(t,candidate,info.patterns,now);
    if(result==='SEQUENCE_CONFLICT'||result==='DIRECTION_CONFLICT'){
     metrics.sequenceConflict++;metrics.unresolved++;continue;
    }
    if(t.direction){
     metrics.acceptedBySourceSequence++;
     if(t.basis==='gps-sequence')metrics.routeDirectionLocked++;
     if(t.basis==='provider-stop')metrics.sourceDirectionLocked++;
     if(candidate!==board.nodes.find(n=>n.led===led.id)?.quayId)
      metrics.differentFromLive++;
    }else metrics.unresolved++; // Seed = observation, not confirmed side.
   }
   last={status:'ACTIVE_BROWSER_SHADOW',frames,lines:totals,
    caveat:'In-memory sequence from existing frames; neither direction nor GPS proves a stop or physical platform. No production LEDs changed.'};
   return summary();
  }
  function summary(){
   // Only publish anonymized per-line counters. NEVER expose tracks, ID,
   // coordinates, timestamps, or visitedQuay sequences from private state.
   return {status:last.status,frames:last.frames,lines:JSON.parse(JSON.stringify(last.lines)),
    caveat:last.caveat||'No valid fresh GPS frames yet.'};
  }
  return {ingest,summary,clear:()=>{tracks.clear();lastAt=-Infinity;lastSource=null;frames=0;
   last={status:'NO_FRAMES',frames:0,lines:{}};}};
 }
 return {create};
});
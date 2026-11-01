// V2.1, browser-only GPS shadow. Multiple Quay possibilities are kept until
// later *distinct* observations can narrow a source-verified JourneyPattern.
// No Entur requests, LED changes, persisted IDs, asserted physical visits or
// inferred intermediate stops. Only the primary LED vehicle has GPS coords.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitGpsV2Shadow=api;
})(globalThis,function(){
 'use strict';
 const QUAY=/^NSR:Quay:\d+$/;
 const TRACK_TTL=180000,MAX_FRESH=30000,MAX_HYPOTHESES=512;
 const MAX_SKIPPED_QUAYS=6, MAX_CANDIDATES=24;
 const validDirection=x=>x==='inbound'||x==='outbound';
 const finite=n=>typeof n==='number'&&Number.isFinite(n);
 function metres(a,b){
  const r=Math.PI/180,lat1=a.lat*r,lat2=b.lat*r,dlat=(b.lat-a.lat)*r,dlon=(b.lon-a.lon)*r;
  const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
 }
 const empty=()=>({
  comparedGps:0,acceptedBySourceSequence:0,routeDirectionLocked:0,
  sourceDirectionLocked:0,uniqueQuayCandidate:0,unresolved:0,
  competingQuays:0,sourceDirectionConflict:0,sequenceConflict:0,
  differentFromLive:0,sourceReportedStop:0,
  ambiguousCandidatesRetained:0,ambiguityNarrowed:0,
  ambiguityResolvedAfterFollowup:0,hypothesisLimit:0,
  duplicateVehicleIdentity:0
 });
 function create({board,patterns,lineCodes=['1','11'],radiusMeters=85}={}){
  if(board?.id!=='trondheim-city-lines-catalog'||!Array.isArray(board.nodes)||
     !patterns?.lines||!finite(radiusMeters)||radiusMeters<=0||radiusMeters>100)
   throw Error('invalid-v21-shadow-configuration');
  const lines=new Map(),nodeByQuay=new Map(),tracks=new Map();
  for(const node of board.nodes){
   if(!QUAY.test(node?.quayId)||!finite(node.lat)||!finite(node.lon)||
      !Number.isInteger(node.led))continue;
   if(nodeByQuay.has(node.quayId))nodeByQuay.set(node.quayId,null);
   else nodeByQuay.set(node.quayId,node);
  }
  for(const codeValue of lineCodes){
   const code=String(codeValue);
   if(!['1','11'].includes(code)||lines.has(code))
    throw Error('v21-pilot-lines-only');
   const snapshots=patterns.lines[code]?.patterns||[];
   const approved=snapshots.filter(p=>validDirection(p.directionType)&&
    Array.isArray(p.quays)&&p.quays.length>=2&&p.quays.every(q=>QUAY.test(q)));
   const eligible=new Set(approved.flatMap(p=>p.quays));
   const nodes=[...eligible].map(q=>nodeByQuay.get(q)).filter(n=>n&&
    Array.isArray(n.routes)&&n.routes.includes('atb-bus-'+code+'-live'));
   if(!approved.length||!nodes.length)throw Error('source-pattern-or-quay-unavailable-'+code);
   // The pattern index is private, bounded and only used for matching order.
   const positions=new Map();
   approved.forEach((p,patternIndex)=>p.quays.forEach((q,index)=>{
    if(!positions.has(q))positions.set(q,[]);
    positions.get(q).push({pattern:patternIndex,index,quay:q,
     direction:p.directionType,moves:0,origin:q});
   }));
   lines.set(code,{patterns:approved,nodes,positions});
  }
  let lastSource=null,lastAt=-Infinity,frames=0;
  let last={status:'NO_FRAMES',frames:0,lines:{}};
  const seed=(info,quays,direction=null)=>{
   const hypotheses=[];
   for(const q of quays)for(const p of info.positions.get(q)||[]){
    if(!direction||p.direction===direction)hypotheses.push({...p});
    if(hypotheses.length>MAX_HYPOTHESES)return null;
   }
   return hypotheses;
  };
  // Every possible past candidate survives until contradicted by another
  // observation. Same Quay in later frames is NOT progression. Patterns may
  // skip up to six unobserved Quays, but the skips are never considered visits.
  function transition(info,prior,quays,direction=null){
   const possible=new Set(quays),next=[],dedup=new Set();
   for(const h of prior){
    if(direction&&h.direction!==direction)continue;
    const p=info.patterns[h.pattern];
    for(let i=h.index;i<p.quays.length&&i<=h.index+MAX_SKIPPED_QUAYS+1;i++){
     const q=p.quays[i];if(!possible.has(q))continue;
     const candidate={...h,index:i,quay:q,moves:h.moves+(i===h.index?0:1)};
     const key=h.pattern+'|'+i+'|'+h.origin+'|'+candidate.moves;
     if(dedup.has(key))continue;
     dedup.add(key);next.push(candidate);
     if(next.length>MAX_HYPOTHESES)return null;
    }
   }
   return next;
  }
  function distinctQuays(hypotheses){
   return new Set(hypotheses.map(h=>h.quay));
  }
  const uniqueDirection=hypotheses=>{
   const directions=new Set(hypotheses.map(h=>h.direction));
   return directions.size===1?[...directions][0]:null;
  };
  function ingest(frame,{now=Date.now(),source='production'}={}){
   if(!finite(now)||!frame||frame.boardProfile!==board.id||!Array.isArray(frame.leds))
    return summary();
   const generated=Date.parse(frame.generatedAt||''),age=now-generated;
   if(!finite(age)||age<0||age>MAX_FRESH||
      !finite(frame.ttlSeconds)||frame.ttlSeconds<=0||age>frame.ttlSeconds*1000)
    return summary();
   const selected=source==='staging'?'staging':'production';
   if(lastSource&&lastSource!==selected){tracks.clear();lastAt=-Infinity;}
   if(generated<=lastAt)return summary();
   lastSource=selected;lastAt=generated;frames++;
   for(const [key,track] of tracks)
    if(now-track.lastSeen>TRACK_TTL)tracks.delete(key);
   const totals=Object.fromEntries([...lines.keys()].map(code=>[code,empty()]));
   const samples=new Map();
   // A duplicated primary bus ID at different LEDs is conflicting evidence.
   // Never let the arbitrary first LED settle the direction or Quay.
   for(const led of frame.leds){
    const v=led?.vehicle,code=String(v?.line||'');
    if(!lines.has(code)||typeof v?.id!=='string'||!v.id)continue;
    const gps=v.positionType==='gps-nearest-stop'&&finite(v.latitude)&&
     finite(v.longitude)&&Math.abs(v.latitude)<=90&&Math.abs(v.longitude)<=180;
    const provider=v.positionType==='entur-siri-provider-stop'&&
     v.providerReportedAtStop===true&&v.state==='AT_STOP'&&
     led.state==='AT_STOP'&&QUAY.test(v.quayId)&&validDirection(v.plannedSourceDirection);
    if(!gps&&!provider||!finite(v.ageSeconds)||v.ageSeconds<0||v.ageSeconds>30)continue;
    const key=code+'|'+v.id;
    if(!samples.has(key))samples.set(key,{code,v,led,duplicate:false,provider});
    else samples.get(key).duplicate=true;
   }
   for(const [key,sample] of samples){
    const {code,v,led,provider,duplicate}=sample,metrics=totals[code],info=lines.get(code);
    if(duplicate){metrics.duplicateVehicleIdentity++;continue;}
    const t=tracks.get(key)||{hypotheses:[],direction:null,basis:'unknown',lastSeen:now};
    if(provider){
     metrics.sourceReportedStop++;
     if(t.direction&&t.direction!==v.plannedSourceDirection){
      metrics.sourceDirectionConflict++;continue;
     }
     const previous=t.hypotheses;
     const next=previous.length?
      transition(info,previous,[v.quayId],v.plannedSourceDirection):
      seed(info,[v.quayId],v.plannedSourceDirection);
     if(next===null){metrics.hypothesisLimit++;continue;}
     if(!next.length){
      metrics.sourceDirectionConflict++;continue;
     }
     // An exact source-at-stop is stronger directional evidence, but still
     // cannot establish the physical side for prior ambiguous GPS points.
     t.hypotheses=next;t.direction=v.plannedSourceDirection;
     t.basis='provider-stop';t.lastSeen=now;tracks.set(key,t);
     metrics.sourceDirectionLocked++;
     metrics.acceptedBySourceSequence++;
     continue;
    }
    metrics.comparedGps++;
    let eligible=info.nodes.map(n=>({node:n,meters:metres(
      {lat:v.latitude,lon:v.longitude},{lat:n.lat,lon:n.lon})}))
     .filter(x=>x.meters<=radiusMeters).sort((a,b)=>a.meters-b.meters);
    if(!eligible.length){metrics.unresolved++;continue;}
    if(t.direction)eligible=eligible.filter(x=>
     (info.positions.get(x.node.quayId)||[]).some(p=>p.direction===t.direction));
    if(!eligible.length){metrics.sourceDirectionConflict++;metrics.unresolved++;continue;}
    if(eligible.length>MAX_CANDIDATES){
     metrics.hypothesisLimit++;metrics.unresolved++;continue;
    }
    if(eligible.length>1)metrics.competingQuays++;
    const quays=eligible.map(x=>x.node.quayId);
    const prior=t.hypotheses;
    const priorQuays=distinctQuays(prior);
    const next=prior.length?transition(info,prior,quays,t.direction):
     seed(info,quays,t.direction);
    if(next===null){metrics.hypothesisLimit++;metrics.unresolved++;continue;}
    if(!next.length){
     if(t.direction)metrics.sourceDirectionConflict++;
     else metrics.sequenceConflict++;
     metrics.unresolved++;continue;
    }
    const nowQuays=distinctQuays(next);
    if(nowQuays.size===1)metrics.uniqueQuayCandidate++;
    if(priorQuays.size>1&&nowQuays.size<priorQuays.size)metrics.ambiguityNarrowed++;
    if(nowQuays.size>1)metrics.ambiguousCandidatesRetained++;
    if(!t.direction){
     // Require every surviving hypothesis to have moved forward from the
     // first observation; a stationary same-Quay hypothesis cannot prove
     // a two-stop sequence just because a different Quay was nearby.
     const proposed=uniqueDirection(next);
     if(proposed&&next.every(x=>x.moves>=1)){
      t.direction=proposed;t.basis='gps-sequence';
     }
    }
    t.hypotheses=next;t.lastSeen=now;tracks.set(key,t);
    if(t.direction&&nowQuays.size===1){
     metrics.acceptedBySourceSequence++;
     if(t.basis==='gps-sequence')metrics.routeDirectionLocked++;
     if(t.basis==='provider-stop')metrics.sourceDirectionLocked++;
     if(priorQuays.size>1)metrics.ambiguityResolvedAfterFollowup++;
     // Compare only mapped Quay identities, NOT arbitrary LED proximity.
     const live=board.nodes.find(n=>n.led===led.id);
     if(live&&![live.quayId,...(live.stopIds||[])].includes([...nowQuays][0]))
      metrics.differentFromLive++;
    }else metrics.unresolved++;
   }
   last={status:'ACTIVE_BROWSER_SHADOW',frames,lines:totals,
    caveat:'V2.1 source-pattern hypotheses are not confirmed stops, physical platforms or actual bus passages. Existing LEDs unchanged.'};
   return summary();
  }
  function summary(){
   // Never publish vehicle identity, GPS, candidate Quays, source path
   // history, exact event times, or hypotheses from in-memory tracks.
   return {status:last.status,frames:last.frames,
    lines:JSON.parse(JSON.stringify(last.lines)),
    caveat:last.caveat||'No valid fresh GPS frames yet.'};
  }
  // Durable V2.5 SHADOW ONLY: serialize only short-lived HMAC-tokenized
  // hypothesis indexes (no vehicle ID, GPS coordinates or Quay strings).
  // Calls from the browser with raw identifiers export NOTHING.
  function exportSnapshot({now=Date.now()}={}){
   const out=[];
   for(const [key,t] of tracks){
    if(!/^(1|11)\|[a-f0-9]{64}$/.test(key)||
       !finite(t.lastSeen)||now-t.lastSeen<0||now-t.lastSeen>180000)
     continue;
    const info=lines.get(key.split('|')[0]),hypotheses=[];
    for(const h of t.hypotheses){
     const p=info?.patterns[h.pattern],originIndex=p?.quays.indexOf(h.origin);
     if(!p||!Number.isInteger(h.index)||h.index<0||
        h.index>=p.quays.length||p.quays[h.index]!==h.quay||
        originIndex<0||originIndex>h.index||
        !Number.isSafeInteger(h.moves)||h.moves<0||h.moves>24)
      continue;
     hypotheses.push([h.pattern,h.index,originIndex,h.moves]);
     if(hypotheses.length>512)break;
    }
    if(hypotheses.length>512)continue;
    out.push({key,lastSeen:t.lastSeen,
     direction:validDirection(t.direction)?t.direction:null,
     basis:['unknown','gps-sequence','provider-stop'].includes(t.basis)?t.basis:'unknown',
     hypotheses});
    if(out.length>=128)break;
   }
   return out;
  }
  function restoreSnapshot(rows,{now=Date.now()}={}){
   if(!Array.isArray(rows)||rows.length>128||tracks.size)return 0;
   let restored=0;
   for(const row of rows){
    if(!row||!/^(1|11)\|[a-f0-9]{64}$/.test(row.key||'')||
       !finite(row.lastSeen)||now-row.lastSeen<0||
       now-row.lastSeen>180000||!Array.isArray(row.hypotheses)||
       row.hypotheses.length>512||
       !(row.direction===null||validDirection(row.direction))||
       !['unknown','gps-sequence','provider-stop'].includes(row.basis))
     continue;
    const info=lines.get(row.key.split('|')[0]);
    if(!info)continue;
    const hypotheses=[];
    let valid=true;
    for(const value of row.hypotheses){
     if(!Array.isArray(value)||value.length!==4||
        !value.every(Number.isSafeInteger)){valid=false;break;}
     const [pattern,index,originIndex,moves]=value,p=info.patterns[pattern];
     if(!p||index<0||index>=p.quays.length||originIndex<0||
        originIndex>index||moves<0||moves>24){valid=false;break;}
     hypotheses.push({pattern,index,quay:p.quays[index],
      origin:p.quays[originIndex],moves});
    }
    if(!valid||tracks.has(row.key))continue;
    tracks.set(row.key,{hypotheses,direction:row.direction,
     basis:row.basis,lastSeen:row.lastSeen});
    restored++;
   }
   return restored;
  }
  return {ingest,summary,exportSnapshot,restoreSnapshot,clear:()=>{
   tracks.clear();lastAt=-Infinity;lastSource=null;frames=0;
   last={status:'NO_FRAMES',frames:0,lines:{}};}};
 }
 return {create};
});
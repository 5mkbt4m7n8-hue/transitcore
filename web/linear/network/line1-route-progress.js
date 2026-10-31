// Line 1 A -> B -> C observation tracker. Browser-only, no extra Entur calls.
// Source patterns describe scheduled order, NOT proof of passing any stop.
// Never manufacture an intermediate stop or infer an actual arrival from GPS.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitLine1Progress=api;
})(globalThis,function(){
 'use strict';
 const QUAY=/^NSR:Quay:\d+$/,DAY=86400000;
 function create({board,patterns,profile,storage=null,clock=Date.now}={}){
  const allowed=(patterns?.lines?.['1']?.patterns||[]).filter(p=>
   ['inbound','outbound'].includes(p.directionType)&&Array.isArray(p.quays)&&
   p.quays.length>=2&&p.quays.every(q=>QUAY.test(q)));
  if(board?.id!=='trondheim-city-lines-catalog'||!allowed.length)
   throw Error('line1-patterns-unavailable');
  const byLed=new Map(),names=new Map((profile?.stops||[]).map(s=>[s.id,s.name]));
  for(const n of board.nodes||[]){
   if(!n?.quayId||!Number.isInteger(n.led))continue;
   const arr=byLed.get(n.led)||[];arr.push(n.quayId);byLed.set(n.led,arr);
  }
  // The checked-in line 1 profile usually lists one platform side.
  // Name opposite-direction Quays via their shared StopPlace, not by
  // guessing proximity from coordinates or changing the underlying map.
  const nodeByQuay=new Map((board.nodes||[]).map(n=>[n.quayId,n]));
  const stationNames=new Map();
  for(const stop of profile?.stops||[]){
   const stationId=nodeByQuay.get(stop.id)?.stationId;
   if(stationId&&stop.name)stationNames.set(stationId,stop.name);
  }
  for(const node of board.nodes||[])
   if(!names.has(node.quayId)&&stationNames.has(node.stationId))
    names.set(node.quayId,stationNames.get(node.stationId));
  const name=q=>names.get(q)||q;
  const tracks=new Map(),events=[],processedFrames=new Map();
  let lastSource='',serial=0;
  const keyName='intransit-line1-progress-v1';
  try{
   const prior=JSON.parse(storage?.getItem(keyName)||'[]');
   if(Array.isArray(prior))events.push(...prior.filter(x=>x&&
    Number.isFinite(Date.parse(x.at))&&typeof x.type==='string'&&
    typeof x.bus==='string').slice(-100));
  }catch{/* Local storage is optional */}
  const stamp=(at)=>new Date(at).toISOString();
  const prune=at=>{
   for(let i=events.length-1;i>=0;i--){
    const age=at-Date.parse(events[i].at);
    if(!Number.isFinite(age)||age<0||age>DAY)events.splice(i,1);
   }
   if(events.length>100)events.splice(0,events.length-100);
  };
  const save=()=>{try{storage?.setItem(keyName,JSON.stringify(events));}catch{}};
  // Evidence is deliberately structured, bounded and ID-free. Raw vehicle
  // references are only used for ephemeral in-memory linking and never saved.
  const emit=(t,type,at,detail,evidence=null)=>{
   events.push({at:stamp(at),bus:t.label,type,source:t.source,quay:t.quay||null,
    detail:String(detail).slice(0,110),...(evidence?{evidence}:{})});
   prune(at);save();
  };
  const proof=(t,code,at,extra={})=>({
   code,at:stamp(at),lastQuay:t.quay||null,
   lastObservedAt:t.lastObservedAt?stamp(t.lastObservedAt):null,
   lastEvidence:t.lastEvidence||'UNKNOWN',
   direction:t.direction||'unknown',
   directionBasis:t.directionBasis,
   nextPlannedQuay:t.nextQuay||null,
   ...extra
  });
  const possibilities=(visited,limit=200)=>allowed.filter(p=>{
   let last=-1;
   for(const quay of visited){
    const i=p.quays.indexOf(quay,last+1);
    if(i<0||last>=0&&i-last>limit)return false;
    last=i;
   }
   return true;
  });
  const directionFor=list=>{
   const directions=new Set(list.map(p=>p.directionType));
   return directions.size===1?[...directions][0]:null;
  };
  const nextOf=(list,quay)=>{
   const following=[...new Set(list.map(p=>p.quays[p.quays.indexOf(quay)+1]||null))];
   return following.length===1?following[0]:null;
  };
  function observations(frame){
   const unique=new Map();
   for(const led of frame.leds||[]){
    const mapped=byLed.get(led.id)||[];
    const occupants=led.occupants?.length?led.occupants:
     led.vehicle?[{...led.vehicle,state:led.state}]:[];
    for(const v of occupants){
     if(String(v?.line)!=='1'||typeof v.id!=='string'||!v.id||
      Number.isFinite(v.ageSeconds)&&v.ageSeconds>45)continue;
     let quay=null;
     if(QUAY.test(v.quayId)&&mapped.includes(v.quayId))quay=v.quayId;
     else if(v.positionType==='gps-nearest-stop'&&
      v.nearestQuayLed===led.id&&mapped.length===1)quay=mapped[0];
     if(!quay)continue;
     const confirmed=v.quayId===quay&&v.providerReportedAtStop===true&&
      v.positionType==='entur-siri-provider-stop'&&v.state==='AT_STOP'&&led.state==='AT_STOP';
     const ev={id:v.id,quay,confirmed,
      sourceDirection:confirmed&&['inbound','outbound'].includes(v.plannedSourceDirection)
        ?v.plannedSourceDirection:null,
      destination:String(v.destination||'').slice(0,60)};
     const found=unique.get(v.id);
     if(!found)unique.set(v.id,ev);
     else if(found.quay!==quay)unique.set(v.id,{conflict:true,id:v.id});
     else if(confirmed)unique.set(v.id,ev);
    }
   }
   return [...unique.values()];
  }
  function ingest(frame,{source='production',now=clock()}={}){
   if(!Number.isFinite(now)||!frame||frame.boardProfile!==board.id)return summary(now);
   const age=now-Date.parse(frame.generatedAt),ttl=Number(frame.ttlSeconds);
   if(!Number.isFinite(age)||age<0||!Number.isFinite(ttl)||ttl<=0||
    age>ttl*1000||!Array.isArray(frame.leds))return summary(now);
   const selected=source==='staging'?'staging':'production';
   if(lastSource&&lastSource!==selected){
    tracks.clear();processedFrames.clear();
   }
   lastSource=selected;
   // Multiple UI paints or repeated HTTP responses must not masquerade as
   // independently observed missing frames.
   const generated=Date.parse(frame.generatedAt);
   if(processedFrames.has(selected)&&generated<=processedFrames.get(selected))
    return summary(now);
   processedFrames.set(selected,generated);
   const input=observations(frame);
   const present=new Set();
   for(const event of input){
    const k=selected+'|'+event.id;
    if(event.conflict){
     const existing=tracks.get(k);
     if(existing){
      present.add(k);
      emit(existing,'CONFLICT',now,'Samme buss vises ved flere Quays i én frame',
       proof(existing,'DUPLICATE_QUAY_IN_FRAME',now,{frameAt:frame.generatedAt,
        diagnosticsAvailable:Array.isArray(frame.gpsObservations)}));
     }
     continue; // never advance on ambiguous Quay evidence
    }
    present.add(k);
    let t=tracks.get(k);
    if(!t){
     t={label:'Buss '+(++serial),vehicleId:event.id,destination:event.destination,
      lastQuay:null,visited:[],direction:null,directionBasis:'unknown',
      status:'OBSERVED',lastSeen:now,missing:false,missingFrames:0,
      source:selected,nextQuay:null,quay:null,lastEvidence:null,
      lastObservedAt:null};
     tracks.set(k,t);
    }
    if(now<t.lastSeen)continue;
    t.lastSeen=now;t.missing=false;t.missingFrames=0;
    t.destination=event.destination||t.destination;
    const prior=t.lastQuay,changed=event.quay!==prior;
    let sequenceConflict=false;
    if(changed){
     if(t.visited.length){
      let candidates=possibilities([...t.visited,event.quay]);
      if(!candidates.length){
       // Do not infer a reversal or fake an intermediate stop.
       sequenceConflict=true;t.direction=null;t.directionBasis='unknown';
       emit(t,'CONFLICT',now,'Ny '+name(event.quay)+' passer ikke observert stoppsekvens',
        proof(t,'ROUTE_SEQUENCE_CONFLICT',now,{fromQuay:prior,toQuay:event.quay,
         compatiblePatterns:0,frameAt:frame.generatedAt}));
       t.visited=[event.quay];
      }else{
       const skipped=new Set(candidates.map(p=>p.quays.indexOf(event.quay)-
        p.quays.indexOf(prior)-1));
       if([...skipped].some(x=>x>0))
        emit(t,'GAP',now,'Mellomliggende stopp ikke observert, ikke bekreftet passert',
         proof(t,'UNOBSERVED_INTERMEDIATE_QUAYS',now,{fromQuay:prior,toQuay:event.quay,
          skippedStopsMinimum:Math.min(...skipped),skippedStopsMaximum:Math.max(...skipped),
          compatiblePatterns:candidates.length,frameAt:frame.generatedAt}));
       t.visited.push(event.quay);
      }
     }else t.visited=[event.quay];
     t.lastQuay=event.quay;t.quay=event.quay;
     emit(t,event.confirmed?'SOURCE_STOP':'GPS_NEAR',now,
      (event.confirmed?'SIRI ved ':'GPS nær ')+name(event.quay));
    }else if(event.confirmed&&t.status!=='SOURCE_STOP'){
     emit(t,'SOURCE_STOP',now,'SIRI bekrefter '+name(event.quay));
    }
    t.status=sequenceConflict?'CONFLICT':event.confirmed?'SOURCE_STOP':'GPS_NEAR';
    const candidates=possibilities(t.visited);
    if(event.sourceDirection){
     if(t.direction&&t.direction!==event.sourceDirection){
      emit(t,'CONFLICT',now,'SIRI-kilderetning motsier tidligere rute',
       proof(t,'SOURCE_DIRECTION_CONFLICT',now,{reportedDirection:event.sourceDirection,
        frameAt:frame.generatedAt}));
      t.status='CONFLICT';t.direction=null;t.directionBasis='unknown';
     }else{
      t.direction=event.sourceDirection;t.directionBasis='source';
     }
    }else if(!sequenceConflict&&!t.direction&&t.visited.length>=2){
     const d=directionFor(candidates);
     if(d){t.direction=d;t.directionBasis='gps-sequence';
      emit(t,'DIRECTION',now,'Rutefølge tyder på '+d+' (GPS, ikke kildebekreftet)');}
    }
    if(t.direction&&!candidates.some(p=>p.directionType===t.direction)){
     if(t.status!=='CONFLICT')emit(t,'CONFLICT',now,
      'Observasjon passer ikke låst '+t.direction+'-retning',
      proof(t,'LOCKED_DIRECTION_CONFLICT',now,{fromQuay:prior,
       toQuay:event.quay,frameAt:frame.generatedAt}));
     t.status='CONFLICT';
    }
    const compatible=candidates.filter(p=>!t.direction||p.directionType===t.direction);
    t.nextQuay=t.status==='CONFLICT'?null:nextOf(compatible,event.quay);
    t.lastEvidence=event.confirmed?'SIRI_AT_STOP':'GPS_NEAR';
    t.lastObservedAt=now;
   }
   for(const [k,t] of tracks){
    if(t.source!==selected)continue;
    if(!present.has(k)){
     t.missingFrames=(t.missingFrames||0)+1;
    }
    // Two *distinct fresh frames* and 45s are minimum evidence of a lost
    // *rendered observation*, not proof of a missed stop or departed bus.
    if(!present.has(k)&&!t.missing&&t.missingFrames>=2&&now-t.lastSeen>=45000){
     t.missing=true;t.status='NOT_VISIBLE';
     const hasDiagnostics=Array.isArray(frame.gpsObservations);
     const ownDiagnostic=hasDiagnostics?frame.gpsObservations.find(v=>
      String(v?.line)==='1'&&v.status==='unresolved'&&
      (v.id===t.vehicleId||v.vehicleRef===t.vehicleId)):null;
     const sourceReason=ownDiagnostic&&typeof ownDiagnostic.reason==='string'
      ?ownDiagnostic.reason.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64):null;
     emit(t,'NOT_VISIBLE',now,'Bussen er ikke lenger i mottatte frames (ikke bekreftet avreise)',
      proof(t,ownDiagnostic?'UNRESOLVED_GPS_FOR_SAME_BUS':'MISSING_FROM_VALID_FRAMES',
       now,{frameAt:frame.generatedAt,missingFrames:t.missingFrames,
        secondsSinceLastObserved:Math.max(0,Math.floor((now-t.lastSeen)/1000)),
        diagnosticsAvailable:hasDiagnostics,
        ...(sourceReason?{sourceReason}:{}),
        ...(ownDiagnostic&&QUAY.test(ownDiagnostic.nearestQuayId)
         ?{diagnosticNearestQuay:ownDiagnostic.nearestQuayId}:{})}));
    }
    if(now-t.lastSeen>600000)tracks.delete(k);
   }
   return summary(now);
  }
  function summary(now=clock()){
   const active=[...tracks.values()].filter(t=>t.source===lastSource&&now-t.lastSeen<=600000)
    .sort((a,b)=>b.lastSeen-a.lastSeen).map(t=>({
     bus:t.label,destination:t.destination,stop:t.quay?name(t.quay):null,
     quay:t.quay,next:t.nextQuay?name(t.nextQuay):null,
     nextQuay:t.nextQuay,direction:t.direction||'unknown',
     directionBasis:t.directionBasis,status:t.status,
     ageSeconds:Math.max(0,Math.floor((now-t.lastSeen)/1000)),
     sequence:t.visited.slice(-6).map(name)
    }));
   prune(now);
   return {active,events:events.slice(-30).reverse().map(x=>({...x})),
    source:lastSource,observedFrameOnly:true};
  }
  function clear(){events.length=0;tracks.clear();processedFrames.clear();serial=0;save();}
  function exportJson(now=clock()){
   return JSON.stringify({format:'intransit-line1-sequence-v1',
    caveat:'GPS-near is NOT a confirmed physical stop. Gaps are unknown. Browser only.',
    ...summary(now)},null,2);
  }
  return {ingest,summary,clear,exportJson};
 }
 return {create};
});

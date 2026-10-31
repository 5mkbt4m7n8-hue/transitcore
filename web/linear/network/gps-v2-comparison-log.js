// GPS V2.0 / V2.1 / currently rendered GPS comparison, browser-only.
// Stores bounded, per-minute anonymous counters in localStorage. Never stores
// vehicle IDs, GPS coordinates, Quay IDs, destinations, frames, or trajectories.
// A sequence-supported candidate is NOT proven physically correct.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitGpsComparisonLog=api;
})(globalThis,function(){
 'use strict';
 const KEY='intransit-trondheim-gps-v21-anonymous-minutes-v1';
 const MINUTE=60000,MAX_AGE=24*60*MINUTE,MAX_BUCKETS=1500;
 const codes=['1','11'];
 const keys=['livePrimaryGps','liveOtherGpsNoCoordinates','v20Compared',
  'v20Supported','v20Unresolved','v20DifferentLed',
  'v21Compared','v21Supported','v21Unresolved','v21DifferentLed',
  'v21Retained','v21Narrowed','v21Resolved','v21Conflict',
  'v21SiriStop'];
 const blank=()=>Object.fromEntries(keys.map(k=>[k,0]));
 const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000;
 const cleanSource=s=>s==='staging'?'staging':'production';
 const day=x=>new Intl.DateTimeFormat('en-CA',{
  timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'
 }).format(new Date(x));
 const validRow=r=>r&&typeof r==='object'&&
  Number.isSafeInteger(r.minute)&&r.minute>=0&&r.source&&
  ['staging','production'].includes(r.source)&&
  codes.includes(r.line)&&count(r.frames)&&r.frames>0&&
  keys.every(k=>count(r[k]));
 const validated=r=>({
  minute:r.minute,source:r.source,line:r.line,frames:r.frames,
  ...Object.fromEntries(keys.map(k=>[k,r[k]]))
 });
 function create({storage=null,clock=Date.now}={}){
  let buckets=[],lastSource=null,lastFrameTime=-Infinity,lastV20Frames=-1,
   lastV21Frames=-1,sessionFrames=0,sourceChanged=false;
  try{
   const saved=JSON.parse(storage?.getItem(KEY)||'null');
   if(saved?.version===1&&Array.isArray(saved.rows)&&saved.rows.length<=MAX_BUCKETS){
    buckets=saved.rows.filter(validRow).map(validated);
   }
  }catch{buckets=[];}
  function prune(now){
   buckets=buckets.filter(r=>now-r.minute>=0&&now-r.minute<MAX_AGE);
   if(buckets.length>MAX_BUCKETS)buckets=buckets.slice(-MAX_BUCKETS);
  }
  function persist(){
   try{storage?.setItem(KEY,JSON.stringify({version:1,rows:buckets}));}catch{}
  }
  function resetSource(source){
   if(lastSource!==null&&lastSource!==source){
    lastFrameTime=-Infinity;lastV20Frames=-1;lastV21Frames=-1;
    sourceChanged=true;
   }
   lastSource=source;
  }
  function freshPrimary(frame){
   const observed=Object.fromEntries(codes.map(c=>[c,{
    livePrimaryGps:0,liveOtherGpsNoCoordinates:0
   }]));
   for(const led of frame.leds){
    const v=led?.vehicle,code=String(v?.line||'');
    if(codes.includes(code)&&v?.positionType==='gps-nearest-stop'&&
      typeof v?.id==='string'&&v.id&&Number.isFinite(v.latitude)&&
      Number.isFinite(v.longitude)&&Number.isFinite(v.ageSeconds)&&
      v.ageSeconds>=0&&v.ageSeconds<=30)observed[code].livePrimaryGps++;
    const others=Array.isArray(led?.occupants)?led.occupants:[];
    for(const o of others){
     const otherLine=String(o?.line||'');
     if(codes.includes(otherLine)&&o?.positionType==='gps-nearest-stop'&&
       typeof o?.id==='string'&&o.id&&(!v||o.id!==v.id||
         otherLine!==code))observed[otherLine].liveOtherGpsNoCoordinates++;
    }
   }
   return observed;
  }
  function record({frame,v20,v21,source='production',now=clock()}={}){
   if(!Number.isFinite(now)||frame?.boardProfile!=='trondheim-city-lines-catalog'||
     !Array.isArray(frame.leds)||!Number.isFinite(Date.parse(frame.generatedAt))||
     !count(frame.ttlSeconds)||frame.ttlSeconds<1||!v20||!v21)
    return {recorded:false,reason:'INVALID_SAMPLE'};
   const stamp=Date.parse(frame.generatedAt),age=now-stamp,kind=cleanSource(source);
   if(age<0||age>Math.min(30000,frame.ttlSeconds*1000))
    return {recorded:false,reason:'EXPIRED_FRAME'};
   resetSource(kind);
   if(stamp<=lastFrameTime)return {recorded:false,reason:'DUPLICATE_FRAME'};
   // Both independent engines must actually have evaluated this fresh frame.
   if(v20.status!=='ACTIVE_BROWSER_SHADOW'||v21.status!=='ACTIVE_BROWSER_SHADOW'||
     !count(v20.frames)||!count(v21.frames)||
     v20.frames<=lastV20Frames||v21.frames<=lastV21Frames)
    return {recorded:false,reason:'ENGINES_NOT_FRESH'};
   const inputs=Object.fromEntries(codes.map(c=>[c,[v20.lines?.[c],v21.lines?.[c]]]));
   if(Object.values(inputs).some(parts=>parts.some(r=>!r||
     !['comparedGps','acceptedBySourceSequence','unresolved',
       'differentFromLive'].every(k=>count(r[k])))))
    return {recorded:false,reason:'UNTRUSTED_COUNTERS'};
   lastFrameTime=stamp;lastV20Frames=v20.frames;lastV21Frames=v21.frames;
   sessionFrames++;
   const live=freshPrimary(frame),minute=Math.floor(stamp/MINUTE)*MINUTE;
   prune(now);
   for(const code of codes){
    const [old,latest]=inputs[code],delta={
     ...live[code],v20Compared:old.comparedGps,
     v20Supported:old.acceptedBySourceSequence,
     v20Unresolved:old.unresolved,v20DifferentLed:old.differentFromLive,
     v21Compared:latest.comparedGps,
     v21Supported:latest.acceptedBySourceSequence,
     v21Unresolved:latest.unresolved,v21DifferentLed:latest.differentFromLive,
     v21Retained:latest.ambiguousCandidatesRetained||0,
     v21Narrowed:latest.ambiguityNarrowed||0,
     v21Resolved:latest.ambiguityResolvedAfterFollowup||0,
     v21Conflict:(latest.sequenceConflict||0)+(latest.sourceDirectionConflict||0),
     v21SiriStop:latest.sourceReportedStop||0
    };
    const row=buckets.find(r=>r.minute===minute&&r.source===kind&&r.line===code);
    if(row){row.frames++;for(const key of keys)row[key]+=delta[key];}
    else buckets.push({minute,source:kind,line:code,frames:1,...delta});
   }
   buckets.sort((a,b)=>a.minute-b.minute||a.source.localeCompare(b.source)||
     a.line.localeCompare(b.line));
   prune(now);persist();
   return {recorded:true,sessionFrames,sourceChanged,minute};
  }
  function report({now=clock(),source=null}={}){
   prune(now);
   const selected=buckets.filter(r=>source===null||r.source===cleanSource(source));
   const lines=Object.fromEntries(codes.map(c=>{
    const match=selected.filter(r=>r.line===c);
    const sums=blank();
    for(const row of match)for(const key of keys)sums[key]+=row[key];
    return [c,{...sums,frames:match.reduce((s,r)=>s+r.frames,0),
     minutes:match.length}];
   }));
   const last=selected.length?Math.max(...selected.map(r=>r.minute)):null;
   return {version:1,scope:'trondheim-v20-v21-live-anonymous-comparison-v1',
    period:'rolling-24h',source:source===null?'all':cleanSource(source),
    lastMinute:last,lastDay:last===null?null:day(last),
    minutesWithSamples:new Set(selected.map(r=>r.minute)).size,
    sessionFrames,lines,
    caution:'Observations, not unique buses or physical stops. V2 candidates are not truth labels; higher support is not proof of accuracy. Secondary LED occupants have no own GPS coordinates.'};
  }
  function exportJson({now=clock(),source=null}={}){
   const result=report({now,source});
   return JSON.stringify({...result,rows:buckets.filter(r=>
    source===null||r.source===cleanSource(source))},null,2);
  }
  function exportCsv({now=clock(),source=null}={}){
   report({now,source});
   const headings=['minuteUtc','source','line','frames',...keys];
   const rows=buckets.filter(r=>source===null||r.source===cleanSource(source));
   return [headings.join(','),...rows.map(r=>[
    new Date(r.minute).toISOString(),r.source,r.line,r.frames,...keys.map(k=>r[k])
   ].join(','))].join('\n')+'\n';
  }
  function clear(){buckets=[];lastFrameTime=-Infinity;lastV20Frames=-1;
   lastV21Frames=-1;sessionFrames=0;sourceChanged=false;
   try{storage?.removeItem(KEY);}catch{persist();}}
  return {record,report,exportJson,exportCsv,clear};
 }
 return {create,keys};
});
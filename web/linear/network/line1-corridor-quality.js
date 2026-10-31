// Investigative *route-pattern sections*, not measured physical segments.
// Evidence belongs to the endpoint Quays. The source snapshots do NOT
// contain per-bus movement, directional identity or complete stop histories.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitLine1Corridors=api;
})(globalThis,function(){
 'use strict';
 const QUAY=/^NSR:Quay:\d+$/;
 const fields=['unresolved','conflict','lost','gap'];
 const safeCount=x=>Number.isSafeInteger(x)&&x>=0&&x<=100000?x:0;
 function create({patterns,profile}={}){
  const paths=(patterns?.lines?.['1']?.patterns||[]).filter(p=>
   ['inbound','outbound'].includes(p.directionType)&&Array.isArray(p.quays));
  if(!paths.length)throw Error('line1-corridor-patterns-required');
  const names=new Map((profile?.stops||[]).map(s=>[s.id,s.name]));
  const sections=new Map();
  for(const pattern of paths){
   for(let i=0;i<pattern.quays.length-1;i++){
    const from=pattern.quays[i],to=pattern.quays[i+1];
    if(!QUAY.test(from)||!QUAY.test(to)||from===to)continue;
    const id=pattern.directionType+'|'+from+'|'+to;
    if(!sections.has(id))sections.set(id,{
     id,from,to,direction:pattern.directionType,
     patternCount:0
    });
    sections.get(id).patternCount++;
   }
  }
  const ordered=[...sections.values()];
  function analyze(report,{previous=null,limit=10}={}){
   const empty=(status,note)=>({status,note,sections:[],totalSections:ordered.length,
    candidates:0,diagnosticSamples:report?.diagnosticSamples||0,
    frames:report?.samples||0,previousDay:previous?.day||null});
   if(!report||!Array.isArray(report.rows)||!Number.isInteger(report.samples)||report.samples<1)
    return empty('NO_DATA','Ingen gyldige målinger for valgt periode.');
   const supportsGps=report.diagnosticSamples>0;
   const liveEvents=report.mode==='live';
   if(!supportsGps&&!liveEvents)
    return empty('NO_SOURCE_DIAGNOSTICS',
     'Døgnmålingene har ikke GPS-avvisningsdiagnostikk. LED-/GPS-treff alene kan ikke brukes til å utpeke problemstrekninger.');
   const rows=new Map(report.rows.filter(x=>QUAY.test(x.quay)).map(x=>[x.quay,x]));
   const prior=previous&&previous.mode===report.mode&&previous.diagnosticSamples>0&&
      Array.isArray(previous.rows)?new Map(previous.rows.filter(x=>QUAY.test(x.quay)).map(x=>[x.quay,x])):null;
   const totals=(left,right,sourceAvailable,permitEvents)=>{
    const result={unresolved:0,conflict:0,lost:0,gap:0,gps:0,siri:0,ledOnly:0};
    for(const q of new Set([left,right])){
     const r=sourceAvailable.get(q);
     if(!r)continue;
     result.unresolved+=safeCount(r.unresolved);
     if(permitEvents)for(const k of ['conflict','lost','gap'])result[k]+=safeCount(r[k]);
     result.gps+=safeCount(r.gps);result.siri+=safeCount(r.siri);
     result.ledOnly+=safeCount(r.ledOnly);
    }
    return result;
   };
   let candidates=0;
   const scored=ordered.map(section=>{
    const near=totals(section.from,section.to,rows,liveEvents);
    if(!supportsGps)near.unresolved=0;
    const evidence={unresolved:near.unresolved,conflict:near.conflict,
     lost:near.lost,gap:near.gap};
    const signals=fields.reduce((n,k)=>n+evidence[k],0);
    if(signals)candidates++;
    const comparison=prior?totals(section.from,section.to,prior,false):null;
    return {...section,
     fromName:rows.get(section.from)?.name||names.get(section.from)||section.from,
     toName:rows.get(section.to)?.name||names.get(section.to)||section.to,
     signals,evidence,observed:{gps:near.gps,siri:near.siri,ledOnly:near.ledOnly},
     previous:comparison?{unresolved:comparison.unresolved,
      diagnosticSamples:previous.diagnosticSamples,samples:previous.samples,day:previous.day||null}:null,
     diagnosticSamples:supportsGps?report.diagnosticSamples:0,samples:report.samples,
     // Scoring is sorting help, not a probability or a quality percentage.
     score:near.unresolved*2+near.conflict*4+near.lost*3+near.gap
    };
   }).filter(s=>s.signals>0).sort((a,b)=>b.score-a.score||
      b.signals-a.signals||a.id.localeCompare(b.id));
   return {status:scored.length?'OBSERVED_ALERTS':'NO_OBSERVED_ALERTS',
    sections:scored.slice(0,Number.isInteger(limit)?Math.min(10,Math.max(1,limit)):10),
    totalSections:ordered.length,candidates,frames:report.samples,
    diagnosticSamples:report.diagnosticSamples||0,previousDay:prior?previous.day||null:null,
    note:scored.length
     ?'Avvik er observert ved én eller begge endeholdеplasser. Rutemønsterets retning angir ikke hvilken vei bussen faktisk kjørte. Samme Quay-avvik kan vises ved to nabostrekninger.'
     :supportsGps
      ?'Ingen uavklarte GPS-matcher eller dokumenterte ruteavvik ved disse holdeplassene i utvalget. Dette beviser ikke at alle strekninger er feilfrie.'
      :'Ingen rutehendelser registrert mens nettleseren var åpen. GPS-avvisningsdiagnostikk mangler.'};
  }
  return {analyze,sections:ordered.map(v=>({...v}))};
 }
 return {create};
});

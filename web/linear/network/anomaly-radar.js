// Evidence-first multi-line anomaly triage, browser and Node compatible.
// A candidate is NOT a confirmed bad route, stop, vehicle movement or GPS rate.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitAnomalyRadar=api;
})(globalThis,function(){
 'use strict';
 const CODE=/^\d{1,3}$/,QUAY=/^NSR:Quay:\d+$/;
 const count=n=>Number.isSafeInteger(n)&&n>=0?n:0;
 const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'');
 const consecutive=(now,earlier)=>validDay(now)&&validDay(earlier)&&
  Date.parse(now+'T00:00:00Z')-Date.parse(earlier+'T00:00:00Z')===86400000;
 function read(day){
  const d=day?.multiLineQuality;
  return d?.version===1&&d.lines&&typeof d.lines==='object'?d:null;
 }
 function classify(current,previous,hasPrevious){
  return hasPrevious&&previous>=2?'TWO_DAYS':current>=2?'REPEATED':'SINGLE';
 }
 function analyze(days,{day=null,minimumCoverage=6,limit=15}={}){
  const rows=(Array.isArray(days)?days:[]).filter(x=>validDay(x?.day))
   .sort((a,b)=>b.day.localeCompare(a.day));
  const selected=rows.find(x=>x.day===day)||(!day?rows[0]:null);
  const empty=(status,note)=>({status,note,day:selected?.day||null,
   previousDay:null,diagnosticSamples:0,issueCoverageSamples:0,
   lineAlerts:[],quayAlerts:[],watch:[],missingData:[]});
  if(!selected)return empty('NO_DAYS','Ingen lagrede dager er tilgjengelige.');
  const current=read(selected);
  if(!current||count(current.sourceSamples)===0)return empty('NO_SOURCE_DATA',
   'Det finnes ikke kildeklassifiserte målinger for denne datoen.');
  const earlier=rows.find(x=>consecutive(selected.day,x.day))||null;
  const prev=read(earlier);
  const coverage=count(current.diagnosticSamples);
  const issueCoverage=count(current.issueCoverageSamples);
  const sufficient=coverage>=minimumCoverage;
  const previousSufficient=prev&&count(prev.diagnosticSamples)>=minimumCoverage;
  const lineAlerts=[],quayAlerts=[],watch=[],missingData=[];
  for(const [code,values] of Object.entries(current.lines)){
   if(!CODE.test(code)||!values)continue;
   const frames=count(values.unresolvedFrames),hits=count(values.unresolved);
   const prevFrames=previousSufficient?count(prev.lines?.[code]?.unresolvedFrames):0;
   if(!sufficient){
    if(hits)watch.push({type:'line',code,hits,frames,reason:'LOW_COVERAGE'});
    continue;
   }
   if(hits===0)continue;
   if(frames<2){
    watch.push({type:'line',code,hits,frames,reason:'SINGLE_FRAME'});
    continue;
   }
   const status=classify(frames,prevFrames,previousSufficient);
   lineAlerts.push({type:'line',code,hits,frames,status,
    diagnosticSamples:coverage,previousFrames:prevFrames,
    previousDiagnosticSamples:previousSufficient?count(prev.diagnosticSamples):null});
  }
  const quayMap=current.quayIssues&&typeof current.quayIssues==='object'?
   current.quayIssues:{};
  if(issueCoverage<minimumCoverage){
   if(Object.keys(quayMap).length)missingData.push('Quay-diagnostikken har for få fullstendige måleframes.');
  }else{
   const prevQuayCoverage=count(prev?.issueCoverageSamples);
   for(const [key,value] of Object.entries(quayMap)){
    const ix=key.indexOf('|'),code=key.slice(0,ix),quay=key.slice(ix+1);
    if(ix<1||!CODE.test(code)||!QUAY.test(quay)||!value)continue;
    const frames=count(value.frames),hits=count(value.hits);
    const prevFrames=prevQuayCoverage>=minimumCoverage&&earlier?
     count(prev.quayIssues?.[key]?.frames):0;
    if(frames<2){
     if(hits)watch.push({type:'quay',code,quay,hits,frames,reason:'SINGLE_FRAME'});
     continue;
    }
    const status=classify(frames,prevFrames,prevQuayCoverage>=minimumCoverage);
    quayAlerts.push({type:'quay',code,quay,hits,frames,status,
     issueCoverageSamples:issueCoverage,previousFrames:prevFrames,
     previousIssueCoverageSamples:prevQuayCoverage>=minimumCoverage?prevQuayCoverage:null});
   }
  }
  const sort=(a,b)=>(b.status==='TWO_DAYS')-(a.status==='TWO_DAYS')||
   b.frames-a.frames||b.hits-a.hits||
   Number(a.code)-Number(b.code)||(a.quay||'').localeCompare(b.quay||'');
  lineAlerts.sort(sort);quayAlerts.sort(sort);
  watch.sort((a,b)=>b.hits-a.hits||Number(a.code)-Number(b.code));
  if(!sufficient)missingData.push('Minst '+minimumCoverage+' diagnoseframes kreves før linjeavvik prioriteres.');
  if(!earlier)missingData.push('Ingen direkte foregående kalenderdag er lagret. Ingen påstand om gjentakelse over to dager.');
  else if(!previousSufficient)missingData.push('Forrige kalenderdag mangler nok GPS-diagnostikk til å bekrefte gjentakelse.');
  return {status:!sufficient?'INSUFFICIENT_COVERAGE':
   lineAlerts.length||quayAlerts.length?'OBSERVED_ISSUES':'NO_REPEATED_ISSUES',
   note:!sufficient?'Kildediagnostikken er for sparsom til å rangere linjer.':
    lineAlerts.length||quayAlerts.length?
    'Gjentatte uavklarte GPS-observasjoner – undersøk kilden og holdeplasskoblingen.':
    'Ingen gjentatte kildeavvik påvist med de tilgjengelige måleframene.',
   day:selected.day,previousDay:previousSufficient?earlier?.day:null,
   diagnosticSamples:coverage,issueCoverageSamples:issueCoverage,
   lineAlerts:lineAlerts.slice(0,Math.max(1,Math.min(50,limit))),
   quayAlerts:quayAlerts.slice(0,Math.max(1,Math.min(50,limit))),
   watch:watch.slice(0,20),missingData};
 }
 // The route order is a source-derived set of PLANNED neighbors. Evidence
 // is at one Quay, NEVER proof of an actual journey over the section.
 function adjacentSections(alerts,patterns,{limit=12}={}){
  const candidates=new Map();
  for(const alert of alerts||[]){
   if(!CODE.test(alert?.code)||!QUAY.test(alert?.quay))continue;
   const paths=patterns?.lines?.[alert.code]?.patterns||[];
   for(const p of paths){
    if(!['inbound','outbound'].includes(p.directionType)||!Array.isArray(p.quays))continue;
    for(let i=0;i<p.quays.length-1;i++){
     const a=p.quays[i],b=p.quays[i+1];
     if(!QUAY.test(a)||!QUAY.test(b)||a===b||
        a!==alert.quay&&b!==alert.quay)continue;
     const id=alert.code+'|'+p.directionType+'|'+a+'|'+b;
     const item=candidates.get(id)||{id,code:alert.code,from:a,to:b,
      direction:p.directionType,issues:[],frames:0,hitCount:0,status:'REPEATED'};
     if(!item.issues.includes(alert.quay)){
      item.issues.push(alert.quay);item.frames+=alert.frames;
      item.hitCount+=alert.hits;
      if(alert.status==='TWO_DAYS')item.status='TWO_DAYS';
     }
     candidates.set(id,item);
    }
   }
  }
  return [...candidates.values()].sort((a,b)=>
   (b.status==='TWO_DAYS')-(a.status==='TWO_DAYS')||
   b.frames-a.frames||b.hitCount-a.hitCount||a.id.localeCompare(b.id))
   .slice(0,Math.max(1,Math.min(30,limit)));
 }
 return {analyze,adjacentSections};
});

// Source-aware quality diagnostics for Line 1. Browser only, no extra live
// provider requests. "No observation" is NOT a failed physical stop.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitLine1Quality=api;
})(globalThis,function(){
 'use strict';
 const KEY='intransit-line1-quality-v1',DAY=86400000;
 const VALID=/^NSR:Quay:\d+$/;
 const plus=(obj,key)=>{obj[key]=(obj[key]||0)+1;};
 const zero=()=>({siri:0,gps:0,ledOnly:0,unresolved:0,lost:0,conflict:0,gap:0});
 function create({board,profile,patterns,storage=null,clock=Date.now}={}){
  if(board?.id!=='trondheim-city-lines-catalog')throw Error('line1-quality-board-required');
  const quays=new Set((patterns?.lines?.['1']?.patterns||[])
   .flatMap(p=>p.quays||[]).filter(q=>VALID.test(q)));
  if(!quays.size)throw Error('line1-quality-patterns-required');
  const byLed=new Map(),byQuay=new Map();
  for(const node of board.nodes||[]){
   if(!node?.quayId||!VALID.test(node.quayId)||!Number.isInteger(node.led))continue;
   const entries=byLed.get(node.led)||[];
   entries.push(node.quayId);byLed.set(node.led,entries);
   byQuay.set(node.quayId,node);
  }
  const names=new Map((profile?.stops||[]).map(stop=>[stop.id,stop.name]));
  const stations=new Map();
  for(const stop of profile?.stops||[]){
   const sid=byQuay.get(stop.id)?.stationId;
   if(sid)stations.set(sid,stop.name);
  }
  const name=q=>names.get(q)||stations.get(byQuay.get(q)?.stationId)||q;
  const relevant=[...quays].filter(q=>byQuay.has(q))
   .sort((a,b)=>name(a).localeCompare(name(b),'no',{numeric:true}));
  const live=new Map(),transitions=new Map();
  const seenFrame=new Set(),seenEvent=new Set();
  let liveCount=0,invalid=0;
  const nowIso=ms=>new Date(ms).toISOString();
  try{
   const saved=JSON.parse(storage?.getItem(KEY)||'{}');
   if(saved?.version===1){
    for(const item of (saved.samples||[]).slice(-400)){
     if(!item||!Number.isFinite(item.at)||typeof item.source!=='string'||
      !Array.isArray(item.items)||!Array.isArray(item.rows))continue;
     if(clock()-item.at<0||clock()-item.at>DAY)continue;
     const key=item.source+'|'+item.at;
     if(seenFrame.has(key))continue;
     seenFrame.add(key);live.set(key,item);
    }
    for(const event of (saved.events||[]).slice(-200)){
     if(!event||!Number.isFinite(event.at)||!['GAP','CONFLICT','NOT_VISIBLE'].includes(event.type)||
       !VALID.test(event.quay||'')||!quays.has(event.quay))continue;
     if(clock()-event.at<0||clock()-event.at>DAY)continue;
     const key=event.at+'|'+event.bus+'|'+event.type+'|'+event.quay;
     if(!seenEvent.has(key)){seenEvent.add(key);transitions.set(key,event);}
    }
   }
  }catch{/* Storage is optional */}
  function prune(now){
   for(const [key,item] of live)if(now-item.at>DAY||item.at>now)live.delete(key);
   for(const [key,item] of transitions)if(now-item.at>DAY||item.at>now)transitions.delete(key);
   while(live.size>400)live.delete(live.keys().next().value);
   while(transitions.size>200)transitions.delete(transitions.keys().next().value);
   seenFrame.clear();for(const k of live.keys())seenFrame.add(k);
   seenEvent.clear();for(const k of transitions.keys())seenEvent.add(k);
  }
  const save=()=>{try{
   storage?.setItem(KEY,JSON.stringify({
    version:1,samples:[...live.values()],events:[...transitions.values()]
   }));
  }catch{/* private browsing or storage full */}};
  function count(frame,{mode='live'}={}){
   const stats=new Map();
   const inc=(q,field)=>{
    if(!quays.has(q)||!byQuay.has(q))return;
    if(!stats.has(q))stats.set(q,zero());
    plus(stats.get(q),field);
   };
   const diagnostics=mode==='live'&&Array.isArray(frame.gpsObservations)?
    frame.gpsObservations:[];
   for(const observation of diagnostics){
    if(String(observation.line)!=='1'||observation.status!=='unresolved')continue;
    inc(observation.nearestQuayId,'unresolved');
   }
   const perQuay=new Map();
   for(const led of frame.leds||[]){
    const mapped=byLed.get(led.id)||[];
    const people=led.occupants?.length?led.occupants:
     led.vehicle?[{...led.vehicle,state:led.state}]:[];
    for(const v of people){
     if(String(v?.line)!=='1')continue;
     let quay=null,kind='ledOnly';
     if(VALID.test(v.quayId)&&mapped.includes(v.quayId))quay=v.quayId;
     else if(v.positionType==='gps-nearest-stop'&&v.nearestQuayLed===led.id&&mapped.length===1){
      quay=mapped[0];kind='gps';
     }else if(mode==='history'&&mapped.length===1)quay=mapped[0];
     if(!quay||!quays.has(quay))continue;
     if(mode==='live'){
      if(v.quayId===quay&&v.positionType==='entur-siri-provider-stop'&&
       v.providerReportedAtStop===true&&v.state==='AT_STOP'&&led.state==='AT_STOP')
       kind='siri';
      else if(v.positionType==='gps-nearest-stop'||v.positionType==='gps-route-quay')kind='gps';
     }
     if(!perQuay.has(quay))perQuay.set(quay,new Set());
     const vehicle=typeof v.id==='string'&&v.id?v.id:'led-'+led.id;
     const k=vehicle+'|'+kind;
     if(perQuay.get(quay).has(k))continue;
     perQuay.get(quay).add(k);
     inc(quay,kind);
    }
   }
   return [...stats].map(([q,s])=>[q,s]);
  }
  function ingest(frame,{source='production',now=clock()}={}){
   if(!Number.isFinite(now))return false;
   if(!frame||frame.boardProfile!==board.id||!Array.isArray(frame.leds)){
    invalid++;return false;
   }
   const generated=Date.parse(frame.generatedAt),ttl=Number(frame.ttlSeconds);
   if(!Number.isFinite(generated)||!Number.isFinite(ttl)||ttl<=0||
     generated>now+5000||now-generated>ttl*1000){invalid++;return false;}
   const selected=source==='staging'?'staging':'production';
   const key=selected+'|'+generated;
   if(seenFrame.has(key))return false;
   const data={at:generated,source:selected,items:count(frame),rows:[],
    diagnosticsAvailable:Array.isArray(frame.gpsObservations)};
   // Use only aggregate counters in storage: no IDs, raw coordinates or XML.
   live.set(key,data);seenFrame.add(key);liveCount++;prune(now);save();
   return true;
  }
  function ingestEvents(events,{source='production',now=clock()}={}){
   if(!Array.isArray(events)||!Number.isFinite(now))return 0;
   let added=0;
   for(const e of events){
    if(e?.source!==(source==='staging'?'staging':'production'))continue;
    if(!['NOT_VISIBLE','GAP','CONFLICT'].includes(e?.type)||!VALID.test(e.quay||'')||
      !quays.has(e.quay))continue;
    const at=Date.parse(e.at);
    if(!Number.isFinite(at)||at>now||now-at>DAY)continue;
    const bus=typeof e.bus==='string'?e.bus.slice(0,32):'';
    const key=at+'|'+bus+'|'+e.type+'|'+e.quay;
    if(seenEvent.has(key))continue;
    transitions.set(key,{at,quay:e.quay,type:e.type,bus,source:e.source});seenEvent.add(key);added++;
   }
   if(added){prune(now);save();}
   return added;
  }
  function mergeRows(entries,extraEvents=[]){
   const totals=new Map(relevant.map(q=>[q,zero()]));
   for(const item of entries)for(const [q,counters] of item.items||[]){
    const t=totals.get(q);if(!t)continue;
    for(const k of Object.keys(t))t[k]+=Number(counters[k])||0;
   }
   for(const ev of extraEvents){
    const row=totals.get(ev.quay);if(!row)continue;
    if(ev.type==='NOT_VISIBLE')row.lost++;
    if(ev.type==='GAP')row.gap++;
    if(ev.type==='CONFLICT')row.conflict++;
   }
   return [...totals].map(([quay,counts])=>{
    const evidence=counts.siri+counts.gps+counts.ledOnly;
    const status=counts.lost+counts.conflict+counts.unresolved>0?'review':
      counts.siri>0?'source':counts.gps>0?'gps':
      counts.ledOnly>0?'led':'no-sample';
    return {quay,name:name(quay),...counts,evidence,status};
   });
  }
  function liveReport({source='production',now=clock()}={}){
   prune(now);
   const selected=source==='staging'?'staging':'production';
   const frames=[...live.values()].filter(v=>v.source===selected);
   const observations=[...transitions.values()].filter(e=>e.source===selected);
   return {mode:'live',source:selected,samples:frames.length,invalid,
    diagnosticSamples:frames.filter(v=>v.diagnosticsAvailable===true).length,
    first:frames[0]?nowIso(frames[0].at):null,last:frames.at(-1)?nowIso(frames.at(-1).at):null,
    rows:mergeRows(frames,observations),events:observations.length,
    disclaimer:'Counts are observations in sampled frames, not successful/missed real stops.'};
  }
  function historyReport(records,{day=null}={}){
   if(!Array.isArray(records))throw Error('invalid-history-records');
   const selected=records.slice().sort((a,b)=>a.slot-b.slot),frames=[];
   let errors=0,gaps=0,previous=null;
   for(const sample of selected){
    if(!Number.isFinite(sample.slot)||!Number.isFinite(Date.parse(sample.capturedAt)))throw Error('invalid-history-time');
    if(previous!==null&&sample.slot<=previous)throw Error('invalid-history-order');
    if(previous!==null&&sample.slot-previous>450000)gaps+=Math.max(1,Math.round((sample.slot-previous)/300000)-1);
    previous=sample.slot;
    if(sample.status!=='OK'||sample.frame?.boardProfile!==board.id||!Array.isArray(sample.frame?.leds)){
     errors++;continue;
    }
    frames.push({at:Date.parse(sample.capturedAt),source:'recording',
     items:count(sample.frame,{mode:'history'})});
   }
   return {mode:'history',source:'recording',day,samples:frames.length,
    diagnosticSamples:0,
    total:selected.length,errors,gaps,rows:mergeRows(frames),
    first:selected[0]?.capturedAt||null,last:selected.at(-1)?.capturedAt||null,
    disclaimer:'5-minute recordings omit detailed SIRI/GPS proof; LED-only observations are not physical stops.'};
  }
  // Issue-led priorities, never a ranking of "bad stops" from missing data.
  // Historical compact frames lack Quay/source diagnostics; only live
  // observations can identify concrete Quays requiring investigation.
  function priorities(report,{limit=10}={}){
   if(!report||report.mode!=='live')
    return {status:'INSUFFICIENT_DETAIL',rows:[],
     note:'Døgnopptaket har kun LED-observasjoner, ikke Quay-spesifikke avvisninger. Kan ikke rangere feil fra dette.'};
   if(!Number.isInteger(report.samples)||report.samples===0)
    return {status:'NO_SAMPLES',rows:[],
     note:'Ingen gyldige live-frames er mottatt i nettleseren ennå.'};
   const weight={conflict:5,lost:3,gap:2,unresolved:1};
   const rows=(report.rows||[]).map(r=>{
    const issues={
     conflict:Math.max(0,Number(r.conflict)||0),
     lost:Math.max(0,Number(r.lost)||0),
     gap:Math.max(0,Number(r.gap)||0),
     unresolved:report.diagnosticSamples>0?Math.max(0,Number(r.unresolved)||0):0
    };
    const signalCount=Object.values(issues).reduce((n,v)=>n+v,0);
    const score=Object.entries(weight).reduce((n,[k,w])=>n+Math.min(issues[k],10)*w,0);
    return {quay:r.quay,name:r.name,score,signals:signalCount,
     issues,sourceSamples:r.siri,gpsSamples:r.gps,
     diagnosticCoverage:report.diagnosticSamples,
     totalFrames:report.samples,
     issueKinds:Object.keys(issues).filter(k=>issues[k]>0)};
   }).filter(r=>r.signals>0).sort((a,b)=>b.score-a.score||
      b.issueKinds.length-a.issueKinds.length||
      b.signals-a.signals||a.name.localeCompare(b.name,'no'));
   const n=Number.isInteger(limit)?Math.max(1,Math.min(limit,10)):10;
   return {status:rows.length?'OBSERVED_ISSUES':'NO_OBSERVED_ISSUES',
    rows:rows.slice(0,n),totalCandidates:rows.length,
    note:rows.length
      ?'Rangert etter observerte konflikter, tapte spor, hull og uavklart GPS. Samme GPS-avvik kan telle flere ganger – dette er en undersøkelsesliste, ikke en feilprosent.'
      :report.diagnosticSamples===0
       ?'Ingen ruteavvik registrert, men feeden mangler detaljert GPS-diagnostikk. Fravær av avvik er ikke bekreftet.'
       :'Ingen ruteavvik registrert i dette utvalget. Det betyr ikke at alle stopp fungerer feilfritt.'};
  }
  function exportJson(report){
   return JSON.stringify({format:'intransit-line1-quality-v1',exportedAt:nowIso(clock()),
    ...report},null,2);
  }
  function clear(){
   live.clear();transitions.clear();seenFrame.clear();seenEvent.clear();
   liveCount=0;invalid=0;save();
  }
  return {ingest,ingestEvents,liveReport,historyReport,priorities,exportJson,clear};
 }
 return {create};
});

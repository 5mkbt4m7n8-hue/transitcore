// Read-only triage of already-aggregated GPS source-to-render observations.
// No claims of confirmed skipped stops, GPS faults or vehicle passages.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitSourceTriage=api;
})(globalThis,function(){
 'use strict';
 const DAY=/^\d{4}-\d{2}-\d{2}$/,CODE=/^\d{1,3}$/;
 const n=x=>Number.isSafeInteger(x)&&x>=0?x:0;
 const reasonKeys=['rendered','missingPosition','invalidTimestamp',
  'stalePosition','outsideCatalogRadius','unrenderedNearCatalog','unverifiableIdentity'];
 const previousCalendar=(today,day)=>DAY.test(today)&&DAY.test(day)&&
  Date.parse(today+'T00:00:00Z')-Date.parse(day+'T00:00:00Z')===86400000;
 const source=entry=>entry?.multiLineQuality?.sourceReconciliation?.version===1?
  entry.multiLineQuality.sourceReconciliation:null;
 function analyze(days,{day=null,minFrames=6,focus=['1','11'],maxResults=20}={}){
  const entries=(Array.isArray(days)?days:[]).filter(d=>DAY.test(d?.day))
   .sort((a,b)=>b.day.localeCompare(a.day));
  const target=day?entries.find(d=>d.day===day):entries[0];
  const current=source(target);
  const basics={day:target?.day||null,sourceFrames:n(current?.samples),
   candidates:[],focus:[],sourceNotes:[],previousDay:null,previousSourceFrames:0};
  if(!target)return {...basics,status:'NO_DAYS',message:'Ingen lagrede døgn.'};
  if(!current||n(current.samples)===0)return {...basics,status:'NO_SOURCE_DATA',
   message:'Ingen kilde-til-kart-målinger for denne dagen.'};
  const previous=entries.find(d=>previousCalendar(target.day,d.day));
  const prior=source(previous);
  const comparable=prior&&n(prior.samples)>=minFrames;
  const enough=n(current.samples)>=minFrames;
  const rows=[],insufficient=[];
  const frameMap=current.reasonFrames||{};
  for(const [code,totals] of Object.entries(current.lines||{})){
   if(!CODE.test(code)||!totals)continue;
   const counts=Object.fromEntries(reasonKeys.map(k=>[k,n(totals[k])]));
   const observed=frameMap[code];
   const hasFrames=observed&&reasonKeys.every(k=>Number.isSafeInteger(observed[k])&&
     observed[k]>=0&&observed[k]<=n(current.samples));
   const frames=Object.fromEntries(reasonKeys.map(k=>[k,hasFrames?n(observed[k]):null]));
   const previousCounts=prior?.reasonFrames?.[code];
   const previousNearFrames=comparable&&Number.isSafeInteger(previousCounts?.unrenderedNearCatalog)?
    previousCounts.unrenderedNearCatalog:null;
   const recent=counts.unrenderedNearCatalog>0;
   const repeated=hasFrames&&frames.unrenderedNearCatalog>=2;
   const status=!enough?'LOW_COVERAGE':!hasFrames?'NO_FRAME_PROVENANCE':
    repeated&&previousNearFrames>=2?'TWO_DAYS':
    repeated?'REPEATED':'UNCONFIRMED';
   const row={code,counts,frames,observedFrames:n(current.samples),
    previousNearFrames,status,focus:focus.includes(code)};
   rows.push(row);
   if(recent&&status==='NO_FRAME_PROVENANCE')insufficient.push(code);
  }
  const important=rows.filter(x=>['REPEATED','TWO_DAYS'].includes(x.status))
   .sort((a,b)=>(b.status==='TWO_DAYS')-(a.status==='TWO_DAYS')||
     b.frames.unrenderedNearCatalog-a.frames.unrenderedNearCatalog||
     b.counts.unrenderedNearCatalog-a.counts.unrenderedNearCatalog||
     Number(a.code)-Number(b.code));
  const focused=rows.filter(x=>x.focus).sort((a,b)=>Number(a.code)-Number(b.code));
  const notes=[];
  if(!enough)notes.push('Færre enn '+minFrames+' kilde-til-kart-målinger: ingen linjer rangeres som gjentatte avvik.');
  if(!previous)notes.push('Ingen registrert direkte foregående kalenderdag: ingen todagerskonklusjon.');
  else if(!comparable)notes.push('Forrige kalenderdag mangler tilstrekkelig kilde-til-kart-dekning.');
  if(insufficient.length)notes.push('Eldre opptak for '+insufficient.length+
   ' linjer har rå tellinger, men ikke antall forskjellige frames; ingen etterkonstruert gjentakelse.');
  return {...basics,
   status:!enough?'INSUFFICIENT_COVERAGE':important.length?'REPEATED_CANDIDATES':'NO_REPEAT_CONFIRMED',
   message:!enough?'For lite kildegrunnlag for en trygg prioritering.':
    important.length?'Flere separate frames inneholder kildeposisjoner nær katalogen som ikke ble vist. Undersøk – ikke konkluder med GPS-feil.':
    'Ingen gjentatte nær-katalog-men-ikke-vist-kandidater er dokumentert ennå.',
   candidates:important.slice(0,Math.min(50,Math.max(1,maxResults))),
   focus:focused,sourceNotes:notes,previousDay:comparable?previous.day:null,
   previousSourceFrames:comparable?n(prior.samples):0};
 }
 return {analyze};
});

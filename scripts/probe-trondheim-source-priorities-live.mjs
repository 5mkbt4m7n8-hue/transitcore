// Read-only live triage of the existing anonymous Trondheim history aggregates.
// One public GET, zero provider requests, no vehicle IDs, GPS coordinates,
// individual positions, full daily frames or stop-passage guesses.
import {appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {API,inspectIndex} from './probe-trondheim-quality-live.mjs';
const require=createRequire(import.meta.url);
const {analyze}=require('../web/linear/network/source-reconciliation-triage.js');
const isCount=x=>Number.isSafeInteger(x)&&x>=0;
const reasonKeys=['rendered','missingPosition','invalidTimestamp',
 'stalePosition','outsideCatalogRadius','unrenderedNearCatalog','unverifiableIdentity'];
const numbers=x=>Object.fromEntries(reasonKeys.map(k=>[k,isCount(x?.[k])?x[k]:0]));
const line=(x)=>({
 code:x.code,status:x.status,sourceFrames:x.observedFrames,
 nearNotRendered:x.counts.unrenderedNearCatalog,
 separateFrames:x.frames.unrenderedNearCatalog,
 outsideRadius:x.counts.outsideCatalogRadius,
 stale:x.counts.stalePosition,
 missingPosition:x.counts.missingPosition,
 invalidTime:x.counts.invalidTimestamp,
 shown:x.counts.rendered,
 previousNearFrames:x.previousNearFrames
});
export function analyzePublicIndex(index,{now=Date.now(),minFrames=6}={}){
 const inspected=inspectIndex(index,{now});
 if(inspected.state!=='AGGREGATE_PRESENT')
  return {state:'NO_VERIFIED_LIVE_HISTORY',reason:inspected.state};
 const target=index.days.find(x=>x.day===index.currentDay);
 if(!target||target.last!==inspected.lastCapturedAt)
  return {state:'NO_VERIFIED_LIVE_HISTORY',reason:'CURRENT_DAY_MISSING'};
 const daily=target.multiLineQuality?.sourceReconciliation;
 const result=analyze(index.days,{day:target.day,minFrames});
 const totals=Object.fromEntries(reasonKeys.map(k=>[k,0]));
 for(const row of Object.values(daily?.lines||{}))
  for(const key of reasonKeys)totals[key]+=numbers(row)[key];
 // Do not imply that an unrendered source position was a missed stop,
 // that stale GPS is bad GPS, or that outside-radius means an error.
 const safe={
  state:result.status,day:target.day,ageMinutes:inspected.latestAgeMinutes,
  qualityFrames:inspected.enrichedFrames,
  gpsSourceFrames:result.sourceFrames,
  receivedSourceRows:isCount(daily?.sourceRows)?daily.sourceRows:0,
  analyzedIdentities:isCount(daily?.uniqueKnownVehicles)?daily.uniqueKnownVehicles:0,
  nonCatalogSourceRows:isCount(daily?.unlistedCode)?daily.unlistedCode:0,
  linesWithSourceData:Object.keys(daily?.lines||{}).length,
  reasons:totals,
  focus:result.focus.map(line),
  topOtherCandidates:result.candidates.filter(x=>!x.focus).slice(0,8).map(line),
  recurringLineCandidates:result.candidates.length,
  note:result.message,
  coverageNotes:result.sourceNotes
 };
 if(result.sourceFrames<minFrames) return {...safe,state:'INSUFFICIENT_COVERAGE',
  note:'Færre enn '+minFrames+' komplette kilde-til-kart-målinger. Ikke mulig å rangere linjer ennå.'};
 return safe;
}
async function boundedIndex(){
 const response=await fetch(API,{method:'GET',redirect:'error',
  headers:{Accept:'application/json'},signal:AbortSignal.timeout(16000)});
 if(!response.ok)throw new Error('http_'+response.status);
 if(!response.headers.get('content-type')?.includes('application/json'))
  throw new Error('invalid_content_type');
 const chunks=[];let bytes=0;
 for await(const chunk of response.body||[]){
  bytes+=chunk.byteLength;
  if(bytes>524288)throw new Error('response_too_large');
  chunks.push(chunk);
 }
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function run(){
 let report;
 try {report=analyzePublicIndex(await boundedIndex());}
 catch(e){report={state:'PUBLIC_READ_UNAVAILABLE',
  reason:['TimeoutError','AbortError'].includes(e?.name)?e.name:
   /^http_\d{3}$|^invalid_content_type$|^response_too_large$/.test(e?.message||'')?
    e.message:'network_or_schema_error'};}
 console.log('TRONDHEIM_SOURCE_PRIORITY '+JSON.stringify(report));
 if(process.env.GITHUB_STEP_SUMMARY){
  const row=(k,v)=>'| '+k+' | '+String(v??'–').replace(/[|<>\n]/g,' ')+' |';
  const table=[
   row('Status',report.state),row('Dato',report.day),
   row('Alder på siste femminuttersopptak (min)',report.ageMinutes),
   row('Målinger med kilde-til-kart-analyse',report.gpsSourceFrames),
   row('Entur GPS-kildeposter',report.receivedSourceRows),
   row('Unike kildeidentiteter per måling, summert',report.analyzedIdentities),
   row('Nær kartet, men ikke vist – kildeposter',report.reasons?.unrenderedNearCatalog),
   row('Faktisk dokumenterte gjentatte linjekandidater',report.recurringLineCandidates)
  ];
  const focus=(report.focus||[]).map(x=>row('Linje '+x.code,
   'nær/ikke vist '+x.nearNotRendered+' kilderader, '+(x.separateFrames??'ukjent')+
   ' separate frames; '+x.status));
  const top=(report.topOtherCandidates||[]).map(x=>row('Linje '+x.code,
   'nær/ikke vist '+x.nearNotRendered+' kilderader, '+x.separateFrames+
   ' separate frames; '+x.status));
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
   '### Trondheim – kilde-til-kart-prioritering (47 linjer)\n\n'+
   '| Måling | Resultat |\n|---|---|\n'+
   [...table,...focus,...top].join('\n')+'\n\n'+
   (report.note||report.reason||'')+'\n\n'+
   'Gjentakelse krever minst seks komplette femminuttersmålinger og minst '+
   'to ulike frames med fersk posisjon nær katalogen som ikke vises. '+
   'Ingen av tallene er bevis på feil GPS eller et fysisk stopp som ble hoppet over.\n');
 }
 return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])await run();

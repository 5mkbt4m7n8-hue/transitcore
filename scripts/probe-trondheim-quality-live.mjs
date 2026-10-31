// Read-only release proof for unattended Trondheim GPS/Quay quality.
// Only public GETs. No provider calls, no user credentials, no vehicle details,
// no raw frames, coordinates or vehicle identifiers in logs or artifacts.
import {appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export const API='https://transitcore-led-feed.lgb84.workers.dev/v1/trondheim/history';
const BOARD='trondheim-city-lines-catalog';
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const isCount=n=>Number.isSafeInteger(n)&&n>=0;
const ageOf=(s,now)=>typeof s==='string'&&Number.isFinite(Date.parse(s))?
 Math.max(0,Math.floor((now-Date.parse(s))/60000)):null;

function lineQualityOk(value){
 if(!value||value.version!==1||!value.lines||typeof value.lines!=='object'||
    !Object.keys(value.lines).length||Object.keys(value.lines).length>80||
    !isCount(value.sourceSamples)||!isCount(value.diagnosticSamples)||
    !isCount(value.issueCoverageSamples)||value.diagnosticSamples>value.sourceSamples||
    value.issueCoverageSamples>value.diagnosticSamples)return false;
 for(const [code,row] of Object.entries(value.lines)){
  if(!/^\d{1,3}$/.test(code)||!row||
    !['gps','siri','unresolved','gpsFrames','siriFrames','observedFrames','unresolvedFrames']
      .every(key=>isCount(row[key])))return false;
 }
 if(value.quayIssues&&typeof value.quayIssues!=='object')return false;
 return true;
}

export function inspectIndex(index,{now=Date.now()}={}){
 if(!index||index.version!==1||index.boardProfile!==BOARD||
    !Array.isArray(index.days))
  return {state:'INVALID_INDEX',reason:'Unrecognized public history index schema'};
 const days=index.days.filter(d=>DAY.test(d?.day)&&isCount(d.count))
  .sort((a,b)=>b.day.localeCompare(a.day));
 if(!days.length)return {state:'NO_SAMPLES',reason:'No persisted Trondheim days',
  days:0};
 const active=days.find(d=>d.day===index.currentDay)||days[0];
 const latest=active.last;
 const ageMinutes=ageOf(latest,now);
 const multi=active.multiLineQuality;
 const summary={
  day:active.day,daySamples:active.count,dayErrors:isCount(active.errors)?active.errors:null,
  latestAgeMinutes:ageMinutes,lastCapturedAt:latest,days:days.length,
  enrichedFrames:lineQualityOk(multi)?multi.sourceSamples:0,
  diagnosticFrames:lineQualityOk(multi)?multi.diagnosticSamples:0,
  quayCoverageFrames:lineQualityOk(multi)?multi.issueCoverageSamples:0,
  renderedScopeFrames:lineQualityOk(multi)&&isCount(multi.renderedScopeSamples)?multi.renderedScopeSamples:0,
  gpsReconciliationFrames:lineQualityOk(multi)&&isCount(multi.sourceReconciliation?.samples)?multi.sourceReconciliation.samples:0,
  gpsReconciliationRows:lineQualityOk(multi)&&isCount(multi.sourceReconciliation?.sourceRows)?multi.sourceReconciliation.sourceRows:0,
  // Bounded, anonymized counts for the two initially targeted test lines.
  focusSourceLines:lineQualityOk(multi)&&multi.sourceReconciliation?.samples>0?
   Object.fromEntries(['1','11'].map(code=>{
    const total=multi.sourceReconciliation.lines?.[code]||{};
    const observed=multi.sourceReconciliation.reasonFrames?.[code];
    return [code,{
     nearButNotRendered:isCount(total.unrenderedNearCatalog)?total.unrenderedNearCatalog:0,
     separateNearFrames:isCount(observed?.unrenderedNearCatalog)?observed.unrenderedNearCatalog:null,
     outsideDisplayRadius:isCount(total.outsideCatalogRadius)?total.outsideCatalogRadius:0,
     stalePosition:isCount(total.stalePosition)?total.stalePosition:0,
     rendered:isCount(total.rendered)?total.rendered:0
    }];
   })):null,
  lineCount:lineQualityOk(multi)?Object.keys(multi.lines).length:0,
  activeAt:new Date(now).toISOString()
 };
 if(ageMinutes===null)return {state:'INVALID_INDEX',reason:'Missing last timestamp',...summary};
 if(ageMinutes>30)return {state:'STALE',reason:'No recent five-minute sample',...summary};
 if(!multi)return {state:'OLD_WORKER_OR_NOT_YET_ENRICHED',
  reason:'Recent history exists but multiLineQuality is missing',...summary};
 if(!lineQualityOk(multi))return {state:'INVALID_AGGREGATE',
  reason:'Multi-line aggregate is inconsistent',...summary};
 if(!multi.sourceSamples)return {state:'NO_ENRICHED_FRAMES',
  reason:'No source-classified frames in recent history',...summary};
 return {state:'AGGREGATE_PRESENT',reason:'Daily aggregate is structurally valid',...summary};
}

export function inspectLatest(summary,page){
 if(summary.state!=='AGGREGATE_PRESENT')return summary;
 if(page?.version!==1||page.day!==summary.day||!Array.isArray(page.records)||
  page.records.length<1)return {...summary,state:'LATEST_SAMPLE_UNVERIFIED',
    reason:'Could not inspect the latest scheduled slot'};
 const latest=page.records.at(-1);
 if(latest?.status==='ERROR')return {...summary,state:'LATEST_SOURCE_ERROR',
  reason:'Latest stored slot reports upstream failure'};
 if(latest?.status!=='OK'||!latest?.lineQuality){
  return {...summary,state:'RECENT_SLOT_UNENRICHED',
   reason:'Latest stored slot lacks the new lineQuality field'};
 }
 const line=latest.lineQuality;
 if(line.version!==1||line.kind!=='trondheim-multiline-quality-v1'||
  !line.lines||!Object.keys(line.lines).length||line.issuesComplete!==true&&
  line.issuesComplete!==false)return {...summary,state:'LATEST_SAMPLE_UNVERIFIED',
   reason:'Latest source evidence has unexpected shape'};
 const lastAge=ageOf(latest.capturedAt,Date.parse(summary.activeAt));
 if(lastAge===null||lastAge>30)return {...summary,state:'LATEST_SAMPLE_UNVERIFIED',
  reason:'Latest inspected slot is older than 30 minutes'};
 return {...summary,state:'ACTIVE',
  reason:'Recent source-enriched slot and corrected daily rollups verified',
  sampleStatus:'OK',latestSlotAgeMinutes:lastAge,
  recentDiagnosticScope:line.diagnosticScope==='rendered-direction-conflict-only'?
   'rendered-direction-conflict-only':'unspecified-or-upstream',
  recentGpsReconciliation:line.sourceDisposition?.scope===
    'provider-input-render-reconciliation-v1',
  recentQuayCoverage:line.issuesComplete===true,
  recentGpsDiagnostics:line.diagnosticAvailable===true};
}

export function lastSlotQuery(summary){
 if(!DAY.test(summary.day))throw Error('invalid_day');
 const index=Date.parse(summary.lastCapturedAt);
 if(!Number.isFinite(index))throw Error('invalid_time');
 // Start one slot behind the last persisted frame. No broad frame history
 // download; the raw frame in this response is inspected only in memory.
 const slot=Math.floor(index/300000)*300000-300000;
 return API+'?day='+encodeURIComponent(summary.day)+'&limit=2&cursor='+slot;
}

async function getJson(url){
 const response=await fetch(url,{method:'GET',redirect:'error',
  headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)return {http:response.status};
 const chunks=[];let length=0;
 if(response.body)for await(const part of response.body){
  length+=part.byteLength;
  if(length>1048576)throw Error('response_too_large');
  chunks.push(part);
 }
 return {http:response.status,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))};
}
export async function probe(){
 let summary;
 try{
  const response=await getJson(API);
  if(response.http!==200){
   summary={state:'HISTORY_HTTP_ERROR',reason:'Public API not available',
    httpStatus:response.http};
  }else{
   summary=inspectIndex(response.data);
   if(summary.state==='AGGREGATE_PRESENT'){
    try{
     const latest=await getJson(lastSlotQuery(summary));
     summary=latest.http===200?inspectLatest(summary,latest.data):
      {...summary,state:'LATEST_SAMPLE_UNVERIFIED',
       reason:'Latest slot HTTP status unavailable',sampleHttpStatus:latest.http};
    }catch(e){
     summary={...summary,state:'LATEST_SAMPLE_UNVERIFIED',
      reason:'Latest slot request failed',networkErrorName:e?.name||'Error'};
    }
   }
  }
 }catch(e){summary={state:'NETWORK_UNAVAILABLE',
  reason:'Cannot reach production history',networkErrorName:e?.name||'Error'};}
 // Only pre-approved numeric and status fields appear in summary.
 console.log('TRONDHEIM_QUALITY_PROOF '+JSON.stringify(summary));
 if(process.env.GITHUB_STEP_SUMMARY){
  const fields=[
   ['Verdict',summary.state],['Reason',summary.reason],['Last date',summary.day||'–'],
   ['Last sample age, minutes',summary.latestAgeMinutes??'–'],
   ['Five-minute slots',summary.daySamples??'–'],
   ['Errors',summary.dayErrors??'–'],['Enriched frames',summary.enrichedFrames??'–'],
   ['Frames with GPS diagnostic',summary.diagnosticFrames??'–'],
   ['Complete Quay diagnostic frames',summary.quayCoverageFrames??'–'],
   ['Frames with limited rendered GPS conflict scope',summary.renderedScopeFrames??'–'],
   ['Latest diagnostic scope',summary.recentDiagnosticScope??'–'],
   ['GPS source-to-render frames',summary.gpsReconciliationFrames??'–'],
   ['GPS provider rows reconciled',summary.gpsReconciliationRows??'–'],
   ['Latest GPS source reconciliation',summary.recentGpsReconciliation===true?'Active':'Not verified'],
   ['Line 1: near but not rendered',summary.focusSourceLines?.['1']?.nearButNotRendered??'–'],
   ['Line 1: distinct near frames',summary.focusSourceLines?.['1']?.separateNearFrames??'–'],
   ['Line 11: near but not rendered',summary.focusSourceLines?.['11']?.nearButNotRendered??'–'],
   ['Line 11: distinct near frames',summary.focusSourceLines?.['11']?.separateNearFrames??'–'],
   ['Measured lines',summary.lineCount??'–'],
   ['Latest slot enriched',summary.state==='ACTIVE'?'Yes':'Not verified']
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
   '### Trondheim GPS/Quay production evidence (read-only)\n\n'+
   '| Field | Observation |\n|---|---|\n'+
   fields.map(([k,v])=>'| '+k+' | '+String(v).replace(/[|<>\n]/g,' ')+' |').join('\n')+
   '\n\nNo credentials, GPS coordinates, vehicle IDs or private data are logged. '+
   'Missing evidence is *not* a conclusion that a bus skipped a stop.\n');
 }
 return summary;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 await probe();
 // External service availability is evidence, not a reason to break unrelated
 // code CI. The summary explicitly separates ACTIVE from all other states.
}

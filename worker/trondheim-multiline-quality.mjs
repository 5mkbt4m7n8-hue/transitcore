// Server-side, source-aware per-line counters from the EXISTING five-minute
// Trondheim PixelFrame. No new provider requests and no per-vehicle history.
// Quay and route membership come only from the actual catalog board.
import {validatedGpsReconciliation,REASONS} from './trondheim-gps-source-reconciliation.mjs';
const BOARD='trondheim-city-lines-catalog';
const QUAY=/^NSR:Quay:\d+$/;
const ROUTE=/^atb-bus-(\d{1,3})-live$/;
const KINDS=['siri','gps','estimated','ledOnly','unresolved','ambiguous'];
const zero=()=>({siri:0,gps:0,estimated:0,ledOnly:0,unresolved:0,ambiguous:0});
const isCount=v=>Number.isInteger(v)&&v>=0&&v<=5000;
const codeOf=id=>typeof id==='string'?id.match(ROUTE)?.[1]:null;

export function summarizeMultiLineFrame(frame,board){
 if(frame?.boardProfile!==BOARD||board?.id!==BOARD||
    !Array.isArray(frame.leds)||!Array.isArray(board.routes))return null;
 const codes=[...new Set(board.routes.map(codeOf).filter(Boolean))];
 if(!codes.length||codes.length>80)return null;
 const counts=Object.fromEntries(codes.map(code=>[code,zero()]));
 // An LED can represent multiple Quays. Count GPS nearest only when a
 // particular line maps to exactly one candidate Quay on that LED.
 const byLed=new Map(),routeQuays=new Map(codes.map(code=>[code,new Set()]));
 for(const node of board.nodes||[]){
  if(!Number.isInteger(node.led))continue;
  const mapped=byLed.get(node.led)||new Map();
  for(const id of node.routes||[]){
   const code=codeOf(id);
   if(!code||!counts[code])continue;
   const quays=mapped.get(code)||new Set();
   for(const q of [node.quayId,...(Array.isArray(node.stopIds)?node.stopIds:[])]){
    if(QUAY.test(q)){quays.add(q);routeQuays.get(code).add(q);}
   }
   mapped.set(code,quays);
  }
  byLed.set(node.led,mapped);
 }
 // Resolve each vehicle at most once per line and frame. Contradictory
 // Quays cannot be counted as verified observations.
 const seen=new Map();
 for(const led of frame.leds){
  const mapping=byLed.get(led?.id);
  if(!mapping)continue;
  const occupants=Array.isArray(led.occupants)&&led.occupants.length?led.occupants:
   led.vehicle?[{...led.vehicle,state:led.state}]:[];
  for(const v of occupants){
   const code=String(v?.line||'');
   if(!Object.hasOwn(counts,code)||!mapping.has(code)||!v||typeof v.id!=='string'||!v.id||
      Number.isFinite(v.ageSeconds)&&v.ageSeconds>45)continue;
   const quays=[...mapping.get(code)],exact=QUAY.test(v.quayId)&&quays.includes(v.quayId);
   let kind=null,quay=null;
   if(v.positionType==='entur-siri-provider-stop'&&exact&&
      v.providerReportedAtStop===true&&v.state==='AT_STOP'&&led.state==='AT_STOP'){
    kind='siri';quay=v.quayId;
   }else if(v.positionType==='gps-route-quay'&&exact){
    kind='gps';quay=v.quayId;
   }else if(v.positionType==='gps-nearest-stop'&&v.nearestQuayLed===led.id&&
      v.withinStopRadius!==false&&quays.length===1){
    kind='gps';quay=quays[0];
   }else if(v.positionType==='estimated-station-call'){
    kind='estimated';quay='led:'+led.id;
   }else if(v.positionType!=='gps-nearest-stop'&&
     v.positionType!=='gps-route-quay'&&v.positionType!=='entur-siri-provider-stop'){
    kind='ledOnly';quay='led:'+led.id;
   }
   if(!kind)continue;
   const key=code+'|'+v.id,prior=seen.get(key);
   if(!prior)seen.set(key,{code,kind,quay});
   else if(prior.quay!==quay)seen.set(key,{code,kind:'ambiguous',quay:null});
   else if(prior.kind!=='ambiguous'&&kind==='siri')seen.set(key,{code,kind,quay});
  }
 }
 for(const evidence of seen.values())counts[evidence.code][evidence.kind]++;
 const diagnosticAvailable=Array.isArray(frame.gpsObservations);
 const quayIssues=new Map();
 if(diagnosticAvailable){
  const unresolvedSeen=new Set();
  frame.gpsObservations.forEach((v,i)=>{
   const code=String(v?.line||''),q=v?.nearestQuayId;
   if(!Object.hasOwn(counts,code)||v?.status!=='unresolved'||
      !routeQuays.get(code).has(q))return;
   const key=code+'|'+(typeof v.id==='string'&&v.id?v.id:
    typeof v.vehicleRef==='string'&&v.vehicleRef?v.vehicleRef:'entry:'+i);
   if(unresolvedSeen.has(key))return;
   unresolvedSeen.add(key);counts[code].unresolved++;
   const issueKey=code+'|'+q;
   quayIssues.set(issueKey,(quayIssues.get(issueKey)||0)+1);
  });
 }
 // A complete, bounded set is required before per-Quay history is published.
 // In unusually crowded frames the line totals remain, but Quay candidates
 // are withheld rather than silently truncated and presented as complete.
 const issuesComplete=diagnosticAvailable&&quayIssues.size<=200;
 return {version:1,kind:'trondheim-multiline-quality-v1',
  diagnosticAvailable,lines:counts,
  ...(frame.gpsObservationScope==='rendered-direction-conflict-only'?{diagnosticScope:frame.gpsObservationScope}:{}),issuesComplete,
  issues:issuesComplete?[...quayIssues].map(([key,hits])=>{
   const cut=key.indexOf('|');return [key.slice(0,cut),key.slice(cut+1),hits];
  }):[]};
}

// Do not trust arbitrary fields or IDs sent to Durable Object storage.
// The checks intentionally accept empty counts: an empty valid frame is
// measured as no observation, never as proof of a missed bus.
export function validatedMultiLineQuality(value){
 if(!value||value.version!==1||value.kind!=='trondheim-multiline-quality-v1'||
   typeof value.diagnosticAvailable!=='boolean'||!value.lines||
   Array.isArray(value.lines)||typeof value.lines!=='object')return null;
 const lines=Object.entries(value.lines);
 if(!lines.length||lines.length>80)return null;
 const safe=Object.create(null);
 for(const [code,counts] of lines){
  if(!/^\d{1,3}$/.test(code)||!counts||
    !KINDS.every(kind=>isCount(counts[kind])))return null;
  safe[code]=Object.fromEntries(KINDS.map(kind=>[kind,counts[kind]]));
 }
 const issuesComplete=value.issuesComplete===true&&value.diagnosticAvailable;
 const issues=[];
 if(issuesComplete){
  if(!Array.isArray(value.issues)||value.issues.length>200)return null;
  const keys=new Set();
  for(const entry of value.issues){
   if(!Array.isArray(entry)||entry.length!==3)return null;
   const [code,quay,hits]=entry,key=code+'|'+quay;
   if(!Object.hasOwn(safe,code)||!QUAY.test(quay)||!isCount(hits)||
      hits===0||keys.has(key))return null;
   keys.add(key);issues.push([code,quay,hits]);
  }
 }
 const sourceDisposition=value.sourceDisposition==null?null:
  validatedGpsReconciliation(value.sourceDisposition);
 if(value.sourceDisposition!=null&&!sourceDisposition)return null;
 return {version:1,kind:value.kind,diagnosticAvailable:value.diagnosticAvailable,
  ...(value.diagnosticScope==='rendered-direction-conflict-only'?{diagnosticScope:value.diagnosticScope}:{}),
  ...(sourceDisposition?{sourceDisposition}:{}),
  lines:safe,issuesComplete,issues};
}

const emptyLine=()=>({...zero(),gpsFrames:0,siriFrames:0,
 observedFrames:0,unresolvedFrames:0});
export function rollupMultiLineQuality(prior=null,oldSample=null,newSample=null){
 const result=prior?structuredClone(prior):{version:1,sourceSamples:0,
  diagnosticSamples:0,lines:{}};
 if(result.version!==1)throw Error('invalid_multiline_rollup');
 // Existing daily metadata from older versions has no Quay counters.
 result.issueCoverageSamples??=0;result.quayIssues??={};
 result.renderedScopeSamples??=0;
 result.sourceReconciliation??={version:1,samples:0,sourceRows:0,
  unlistedCode:0,uniqueKnownVehicles:0,lines:{},reasonFrames:{}};
 // Old samples predate frame-frequency evidence. They are not backfilled:
 // only new source-enriched slots contribute to the per-reason frame counts.
 result.sourceReconciliation.reasonFrames??={};
 for(const [sample,delta] of [[oldSample,-1],[newSample,1]]){
  if(sample?.status!=='OK')continue;
  const quality=validatedMultiLineQuality(sample.lineQuality);
  if(!quality)continue;
  result.sourceSamples+=delta;
  if(quality.diagnosticAvailable)result.diagnosticSamples+=delta;
  if(quality.diagnosticScope==='rendered-direction-conflict-only')result.renderedScopeSamples+=delta;
  if(quality.sourceDisposition){
   const src=quality.sourceDisposition,aggregate=result.sourceReconciliation;
   aggregate.samples+=delta;
   aggregate.sourceRows+=delta*src.sourceRows;
   aggregate.unlistedCode+=delta*src.unlistedCode;
   aggregate.uniqueKnownVehicles+=delta*src.uniqueKnownVehicles;
   for(const [code,values] of Object.entries(src.lines)){
    const target=aggregate.lines[code]||(aggregate.lines[code]=
     Object.fromEntries(REASONS.map(reason=>[reason,0])));
    const frameCounts=aggregate.reasonFrames[code]||(
     aggregate.reasonFrames[code]=Object.fromEntries(REASONS.map(reason=>[reason,0])));
    for(const reason of REASONS){
     target[reason]+=delta*values[reason];
     if(values[reason]>0)frameCounts[reason]+=delta;
    }
   }
  }
  if(quality.issuesComplete){
   result.issueCoverageSamples+=delta;
   for(const [code,quay,hits] of quality.issues){
    const key=code+'|'+quay,record=result.quayIssues[key]||{hits:0,frames:0};
    record.hits+=delta*hits;record.frames+=delta;
    if(record.hits===0&&record.frames===0)delete result.quayIssues[key];
    else result.quayIssues[key]=record;
   }
  }
  for(const [code,count] of Object.entries(quality.lines)){
   const target=result.lines[code]||(result.lines[code]=emptyLine());
   for(const kind of KINDS)target[kind]+=delta*count[kind];
   if(count.gps>0)target.gpsFrames+=delta;
   if(count.siri>0)target.siriFrames+=delta;
   if(count.gps+count.siri>0)target.observedFrames+=delta;
   if(count.unresolved>0)target.unresolvedFrames+=delta;
  }
 }
 if(result.sourceSamples<0||result.diagnosticSamples<0||
  result.issueCoverageSamples<0||result.renderedScopeSamples<0||
  Object.values(result.lines).some(item=>Object.values(item).some(x=>x<0))||
  Object.values(result.quayIssues).some(item=>item.hits<0||item.frames<0)||
  ['samples','sourceRows','unlistedCode','uniqueKnownVehicles'].some(k=>
   result.sourceReconciliation[k]<0)||
  Object.values(result.sourceReconciliation.lines).some(item=>
   REASONS.some(reason=>item[reason]<0))||
  Object.values(result.sourceReconciliation.reasonFrames).some(item=>
   REASONS.some(reason=>item[reason]<0||item[reason]>result.sourceReconciliation.samples)))
  throw Error('negative_multiline_rollup');
 return result;
}

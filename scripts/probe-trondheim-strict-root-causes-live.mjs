// Production read-only root-cause report for strict 60m GPS comparison.
// Anonymous daily counters only: no provider calls, vehicle IDs, GPS tracks,
// raw frames, live stop positions, or writes.
import {readFileSync} from 'node:fs';
import {appendFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {API,inspectIndex} from './probe-trondheim-quality-live.mjs';
import {distance} from '../core/frame/mapping-support.mjs';
import {LIVE_REJECT_REASONS} from '../worker/trondheim-strict-shadow.mjs';
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
const value=x=>nonnegative(x)?x:0;
const SAFE_CODE=/^\d{1,3}$/;
const radiusMeters=(a,b)=>Math.round(distance({lat:a.lat,lon:a.lon},{lat:b.lat,lon:b.lon}));
const safeName=s=>typeof s==='string'?s.slice(0,80):'';
const configuration=()=>{
 const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
 return {
  board:read('config/boards/trondheim-city-lines-catalog.json'),
  profiles:[read('config/routes/atb-bus-1-live.json'),
   read('config/routes/atb-bus-11-live.json')],
  competitors:read('config/gps/trondheim-quay-competitors-shadow.json')
 };
};

// Static *planned* Quay and direction metadata. Source-backed Quay IDs from
// bundled profile/board only; never infer a real bus visit or traffic side.
export function inspectNamedQuays({board,profiles,competitors}){
 const result=[];
 const names=['Lerkendal','Tonstadkrysset'];
 const lookup=new Map((board?.nodes||[]).filter(n=>typeof n.quayId==='string')
  .map(n=>[n.quayId,n]));
 const all=(board?.nodes||[]).filter(n=>Number.isFinite(n.lat)&&Number.isFinite(n.lon)&&n.quayId)
  .concat((competitors?.quays||[]).map(([quayId,stationId,lat,lon])=>({
   quayId,stationId,lat,lon,competitorOnly:true})).filter(n=>Number.isFinite(n.lat)&&Number.isFinite(n.lon)));
 for(const location of names){
  const focus=location.toLowerCase();
  const sources=[];
  for(const profile of profiles||[])for(const stop of profile.stops||[]){
   const name=String(stop.name||'');
   if(!name.toLowerCase().includes(focus))continue;
   const node=lookup.get(stop.id);
   sources.push({stopName:safeName(name),line:String(profile.line?.publicCode||''),
    quayId:stop.id,node});
  }
  for(const [i,focusStop] of sources.entries()){
   const n=focusStop.node;
   if(!n){result.push({place:location,stopName:focusStop.stopName,
    line:focusStop.line,plannedQuayId:focusStop.quayId,
    state:'PLANNED_QUAY_NOT_IN_LED_CATALOG'});continue;}
   const neighbors=all.filter(other=>other.quayId!==n.quayId&&
    Number.isFinite(other.lat)&&Number.isFinite(other.lon)&&
    radiusMeters(n,other)<=85);
   const different=[...new Set(neighbors.map(n=>n.quayId))];
   const sameStop=neighbors.filter(x=>x.stationId&&x.stationId===n.stationId);
   const competing=neighbors.filter(x=>radiusMeters(n,x)<=60);
   const nearest=neighbors.sort((a,b)=>radiusMeters(n,a)-radiusMeters(n,b));
   result.push({
    place:location,stopName:focusStop.stopName,line:focusStop.line,
    plannedQuayId:focusStop.quayId,stationId:n.stationId||null,
    state:'CONFIGURED',led:Number.isInteger(n.led)?n.led:null,
    directionRule:n.routeDirections?.[profileId(focusStop.line)]?.directionIds||[],
    nearestOtherQuayMeters:nearest.length?radiusMeters(n,nearest[0]):null,
    quaysWithin60:[...new Set(competing.map(x=>x.quayId))].length,
    quaysWithin85:different.length,
    sameStopPlaceWithin85:[...new Set(sameStop.map(x=>x.quayId))].length,
    competitorOnlyWithin85:[...new Set(neighbors.filter(x=>x.competitorOnly).map(x=>x.quayId))].length
   });
  }
 }
 return result.slice(0,30);
}
const profileId=code=>'atb-bus-'+code+'-live';
export function interpretDailyStrictReasons(index,{now=Date.now()}={}){
 const inspect=inspectIndex(index,{now});
 if(inspect.state!=='AGGREGATE_PRESENT')return {status:'NO_CURRENT_EVIDENCE',
  reason:inspect.state};
 const current=index.days.find(d=>d.day===inspect.day);
 const day=current?.multiLineQuality?.sourceReconciliation?.strictShadow;
 if(!day||day.scope!=='trondheim-strict-route-gps-shadow-v1'||!value(day.samples))
  return {status:'NO_SHADOW_DATA',day:inspect.day};
 const results=[];
 for(const [code,c] of Object.entries(day.lines||{})){
  if(!SAFE_CODE.test(code))continue;
  const reasons=c.liveRejectReasons60;
  const reasonBreakdown=reasons&&LIVE_REJECT_REASONS.every(k=>nonnegative(reasons[k]))?
   Object.fromEntries(LIVE_REJECT_REASONS.map(k=>[k,reasons[k]])):null;
  results.push({
   line:code,liveShown:value(c.liveRendered),
   strict60Rejected:value(c.liveRejectedByStrict60),
   strict60DifferentLed:value(c.liveDifferentLedStrict60),
   knownReasons60:reasonBreakdown,
   competingOrDirection:value(c.liveSideUnresolved),
   strict60Matched:value(c.matched),strict85Matched:value(c.strict85Match),
   gainedAt85:value(c.radiusOnlyGain85)
  });
 }
 results.sort((a,b)=>b.strict60Rejected-a.strict60Rejected||
  Number(a.line)-Number(b.line));
 const focus=['1','11'].map(code=>results.find(x=>x.line===code)||
  {line:code,status:'NOT_OBSERVED'});
 const haveReasons=nonnegative(day.liveReasonSamples)&&day.liveReasonSamples>0;
 return {
  status:haveReasons?'LIVE_REJECTION_CAUSES_ACTIVE':'AWAITING_REASON_COVERAGE',
  day:inspect.day,latestAgeMinutes:inspect.latestAgeMinutes,
  shadowFrames:value(day.samples),framesWithLiveReasons:haveReasons?day.liveReasonSamples:0,
  focus,topOthers:results.filter(x=>!['1','11'].includes(x.line)).slice(0,8),
  note:'Counts reflect sampled observations (not unique buses or confirmed physical stops). '+
   'Live reason breakdown covers only newly recorded frames; old frames cannot be reconstructed.'
 };
}
async function boundedIndex(){
 const response=await fetch(API,{method:'GET',redirect:'error',
  headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('public_history_http_'+response.status);
 const chunks=[];let total=0;
 for await(const bytes of response.body||[]){
  total+=bytes.byteLength;if(total>700000)throw Error('oversized_public_history');
  chunks.push(bytes);
 }
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function probe(){
 let live;
 try{live=interpretDailyStrictReasons(await boundedIndex());}
 catch(e){live={status:'PUBLIC_HISTORY_UNAVAILABLE',
  reason:e?.name==='TimeoutError'?'timeout':'public_read_or_schema_unavailable'};}
 const places=inspectNamedQuays(configuration());
 // Print only known public Quay/StopPlace metadata and anonymous counts.
 console.log('TRONDHEIM_STRICT_REASONS '+JSON.stringify(live));
 console.log('TRONDHEIM_STATIC_FOCUS_QUAYS '+JSON.stringify(places));
 if(process.env.GITHUB_STEP_SUMMARY){
  const row=(k,v)=>'| '+k+' | '+String(v??'–').replace(/[|<>\n]/g,' ')+' |';
  const fields=[
   row('Status',live.status),row('Dato',live.day),
   row('60/85 skyggeframes',live.shadowFrames),
   row('Frames med eksakte årsaker for *viste GPS-kjøretøy*',live.framesWithLiveReasons)
  ];
  for(const f of live.focus||[]){
   fields.push(row('Linje '+f.line+' vist/avvist 60m',
    f.liveShown+' / '+f.strict60Rejected));
   if(f.knownReasons60)for(const [reason,n] of Object.entries(f.knownReasons60))
    fields.push(row('Linje '+f.line+': '+reason,n));
   fields.push(row('Linje '+f.line+' godkjent 60m/85m',
    f.strict60Matched+' / '+f.strict85Matched));
  }
  const sites=places.map(p=>row(p.stopName+' ('+p.line+')',
   p.state==='CONFIGURED'?
    p.plannedQuayId+'; '+p.quaysWithin60+' Quays innenfor 60m, nærmeste '+
    (p.nearestOtherQuayMeters??'ukjent')+'m':
    p.state));
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
   '### Trondheim – 60m GPS-skyggeårsak og offentlig Quay-geometri\n\n'+
   '| Kontroll | Observasjon |\n|---|---|\n'+
   [...fields,...sites].join('\n')+'\n\n'+live.note+'\n\n'+
   'Quay-distanser er bare statisk kartgeometri, ikke GPS-kvalitet eller bekreftet riktig veikant.\n');
 }
 return {live,places};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])await probe();

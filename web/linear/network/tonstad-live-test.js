// Read-only Tonstadkrysset test monitor for the EXISTING Linear PixelFrame.
// Never invent a stop, join GPS to a different Quay or draw a new LED.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitTonstadLiveTest=api;
})(globalThis,function(){
 'use strict';
 const QUAY='NSR:Quay:102733',MAP_STOP='original-075',LINE='1';
 const pad=v=>Number.isFinite(v)?v:null;
 const reason=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,80}$/.test(v)?v:'unresolved';
 function inspect({frame,board,now=Date.now(),feedStatus='',feedError=''}={}){
  const nodes=board?.nodes?.filter(n=>n.quayId===QUAY)||[];
  const led=nodes.length===1&&Number.isInteger(nodes[0].led)?nodes[0].led:null;
  const base={quayId:QUAY,stopId:MAP_STOP,line:LINE,led,
   generatedAt:frame?.generatedAt||null,ageSeconds:null,
   state:'NO_FRAME',message:'Venter på bussdata',
   observedVehicles:0,gpsNearby:0,sourceConfirmed:0,sourceDirections:{inbound:0,outbound:0},
   destinations:[],unresolved:[],feedPolicy:frame?.gpsMatchingPolicy||'unknown'};
  if(led===null)return {...base,state:'NO_MAPPING',message:'Quay mangler entydig LED-kobling i tavlekatalogen'};
  if(!frame){
   return {...base,state:'NO_FRAME',
    message:feedError?'Feil ved henting: '+String(feedError).slice(0,120):'Venter på live-data'};
  }
  if(frame.boardProfile!==board.id)return {...base,state:'OTHER_BOARD',message:'Feil tavleprofil i valgt feed'};
  const at=Date.parse(frame.generatedAt||''),ttl=Number(frame.ttlSeconds);
  const age=Number.isFinite(at)?(now-at)/1000:NaN;
  base.ageSeconds=pad(age);
  if(!Number.isFinite(age)||!Number.isFinite(ttl)||ttl<=0||age<0||age>ttl||
   feedStatus==='EXPIRED')return {...base,state:'STALE',message:'Frame er utdatert – ingen aktuell buss kan bekreftes'};
  const item=(frame.leds||[]).find(l=>l.id===led);
  const people=item?.occupants?.length?item.occupants:item?.vehicle?[item.vehicle]:[];
  // Old catalog frames have no quayId at all for GPS-only occupants.
  // nearestQuayLed is measured GPS proximity, NOT an asserted platform.
  const observed=people.filter(v=>String(v.line)===LINE&&(
   v.quayId===QUAY||v.positionType==='gps-nearest-stop'&&
   v.nearestQuayLed===led));
  const confirmed=observed.filter(v=>v.quayId===QUAY&&
   v.providerReportedAtStop===true&&
   v.positionType==='entur-siri-provider-stop'&&v.state==='AT_STOP'&&
   item?.state==='AT_STOP');
  const gpsOnly=observed.filter(v=>v.positionType==='gps-nearest-stop'||
   v.positionType==='gps-route-quay'&&v.quayId===QUAY);
  base.observedVehicles=observed.length;
  base.gpsNearby=gpsOnly.length;
  base.sourceConfirmed=confirmed.length;
  base.sourceDirections={
   inbound:confirmed.filter(v=>v.plannedSourceDirection==='inbound').length,
   outbound:confirmed.filter(v=>v.plannedSourceDirection==='outbound').length
  };
  base.destinations=[...new Set(observed.map(v=>String(v.destination||'').slice(0,64)).filter(Boolean))].slice(0,6);
  // Optional diagnostic-only frame; unavailable when the ordinary 1282-LED
  // feed omits raw positions. Show reasons only, never identities or coords.
  base.unresolved=(frame.gpsObservations||[]).filter(v=>String(v.line)===LINE&&
   v.nearestQuayId===QUAY&&v.status==='unresolved')
   .map(v=>reason(v.reason)).slice(0,12);
  if(confirmed.length)return {...base,state:'AT_STOP',message:'Entur har bekreftet bussen på denne Quay-en'};
  if(observed.length)return {...base,state:'GPS_ONLY',
   message:'GPS nær kartpunktet, men ingen eksplisitt SIRI-stoppbekreftelse'};
  if(base.unresolved.length)return {...base,state:'UNRESOLVED',
   message:'GPS-observasjon finnes, men sikker Quay-matching er ikke godkjent'};
  return {...base,state:'NOT_OBSERVED',
   message:'Ingen bekreftet buss på denne Quay-en i siste frame. Det betyr ikke at gaten er tom.'};
 }
 const HISTORY_KEY='intransit-tonstad-observation-history-v1';
 const VALID_STATES=new Set(['AT_STOP','GPS_ONLY','UNRESOLVED','NOT_OBSERVED']);
 function createHistory({storage=null,clock=Date.now,ttlMs=86400000,limit=50}={}){
  const read=()=>{try{
   const v=JSON.parse(storage?.getItem(HISTORY_KEY)||'[]');
   return Array.isArray(v)?v.filter(x=>x&&Number.isFinite(Date.parse(x.at))&&
    typeof x.source==='string'&&VALID_STATES.has(x.state)&&
    Number.isSafeInteger(x.confirmed)&&Number.isSafeInteger(x.gpsNearby)):[]; 
  }catch{return [];}};
  let history=read().slice(-limit);
  const save=()=>{try{storage?.setItem(HISTORY_KEY,JSON.stringify(history));}catch{/* private mode / quota */}};
  const prune=now=>{
   history=history.filter(x=>now-Date.parse(x.at)>=0&&
    now-Date.parse(x.at)<=ttlMs).slice(-limit);
  };
  function observe({info,source='production',now=clock()}={}){
   if(!info||!VALID_STATES.has(info.state)||!Number.isFinite(now))return null;
   const selectedSource=source==='staging'?'staging':'production';
   prune(now);
   const safeText=v=>String(v||'').replace(/[\u0000-\u001f<>]/g,'').slice(0,64);
   const row={at:new Date(now).toISOString(),source:selectedSource,
    state:info.state,led:Number.isInteger(info.led)?info.led:null,
    confirmed:Math.max(0,Math.min(100,Number(info.sourceConfirmed)||0)),
    gpsNearby:Math.max(0,Math.min(100,Number(info.gpsNearby)||0)),
    inbound:Math.max(0,Math.min(100,Number(info.sourceDirections?.inbound)||0)),
    outbound:Math.max(0,Math.min(100,Number(info.sourceDirections?.outbound)||0)),
    destinations:(info.destinations||[]).slice(0,4).map(safeText),
    reasons:(info.unresolved||[]).slice(0,5).map(safeText)};
   const signature=value=>JSON.stringify({...value,at:undefined});
   const last=history.at(-1);
   if(!last&&row.state==='NOT_OBSERVED')return null;
   if(last&&signature(row)===signature(last))return null;
   history.push(row);prune(now);save();
   return {...row};
  }
  function entries(now=clock()){
   if(Number.isFinite(now))prune(now);
   return history.slice().reverse().map(v=>({...v,
    destinations:[...v.destinations],reasons:[...v.reasons]}));
  }
  function clear(){history=[];save();}
  function exportJson(now=clock()){
   return JSON.stringify({format:'tonstad-observations-v1',quayId:QUAY,
    description:'Browser-observed PixelFrame transitions, not physical bus passage',
    entries:entries(now)},null,2);
  }
  return {observe,entries,clear,exportJson};
 }
 return {inspect,createHistory,QUAY,MAP_STOP,LINE};
});

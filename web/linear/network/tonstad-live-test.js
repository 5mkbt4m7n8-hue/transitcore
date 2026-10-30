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
   observedVehicles:0,sourceConfirmed:0,sourceDirections:{inbound:0,outbound:0},
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
  const observed=people.filter(v=>String(v.line)===LINE&&v.quayId===QUAY);
  const confirmed=observed.filter(v=>v.providerReportedAtStop===true&&
   v.positionType==='entur-siri-provider-stop'&&v.state==='AT_STOP'&&
   item?.state==='AT_STOP');
  base.observedVehicles=observed.length;
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
   message:'Buss er vist ved denne Quay-en, men uten bekreftet stopp'};
  if(base.unresolved.length)return {...base,state:'UNRESOLVED',
   message:'GPS-observasjon finnes, men sikker Quay-matching er ikke godkjent'};
  return {...base,state:'NOT_OBSERVED',
   message:'Ingen bekreftet buss på denne Quay-en i siste frame. Det betyr ikke at gaten er tom.'};
 }
 return {inspect,QUAY,MAP_STOP,LINE};
});

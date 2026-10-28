// Read-only, evidence-first diagnostics for the Trondheim schematic map.
// Never manufactures location, GPS, vehicle presence or route coverage.
(function(root,factory){
 const api=factory(typeof module==="object"?require("./model.js"):root.InTransitMapModel);
 if(typeof module==="object"&&module.exports)module.exports=api;
 root.InTransitLiveMonitor=api;
})(globalThis,function(Model){
 "use strict";
 const unique=values=>[...new Set(values)];
 const time=value=>{const ms=Date.parse(value);return Number.isFinite(ms)?ms:null;};
 const allOccupants=item=>Array.isArray(item?.occupants)&&item.occupants.length?item.occupants:item?.vehicle?[item.vehicle]:[];
 const quayIds=stop=>unique((stop?.bindings||[]).map(b=>b.stopId).filter(id=>typeof id==="string"&&id.startsWith("NSR:Quay:"))).sort();
 function frameHealth(frame,now=Date.now(),feedStatus="",feedError=""){
  if(!frame)return {code:"NO_FRAME",label:feedError?"Feed-feil: "+feedError:feedStatus==="WAITING"?"Venter på feed":"Ingen frame tilgjengelig",ageSeconds:null};
  const generated=time(frame.generatedAt),ttl=Number(frame.ttlSeconds||30);
  if(generated===null||!Number.isFinite(ttl)||ttl<=0)return {code:"INVALID_FRAME",label:"Frame har ugyldig tidsstempel eller TTL",ageSeconds:null};
  const age=(now-generated)/1000;
  if(age<0)return {code:"FUTURE_FRAME",label:"Frame-tidsstempelet ligger i fremtiden",ageSeconds:age};
  if(age>ttl)return {code:"EXPIRED",label:"Frame er utdatert",ageSeconds:age,ttlSeconds:ttl};
  if(feedStatus==="LAST_VALID")return {code:"LAST_VALID",label:"Ny henting feilet; viser siste gyldige frame innenfor TTL",ageSeconds:age,ttlSeconds:ttl};
  return {code:"VALID",label:"Frame er innenfor TTL",ageSeconds:age,ttlSeconds:ttl};
 }
 function vehicles(frame){
  const items=[];
  for(const led of frame?.leds||[])for(const occupant of allOccupants(led)){
   items.push({id:String(occupant.id||""),line:String(occupant.line||""),destination:String(occupant.destination||""),
    source:String(occupant.source||"ukjent"),state:String(occupant.state||led.lifecycle||led.state||"ukjent"),
    ageSeconds:Number.isFinite(occupant.ageSeconds)?occupant.ageSeconds:null,
    distanceMeters:Number.isFinite(occupant.distanceMeters)?occupant.distanceMeters:null,
    physicalLed:led.id});
  }
  return items;
 }
 // Locate an observed bus only within this frame. No observation is not proof
 // that the bus is absent from the street, the city, or another data source.
 function findVehicle(frame,id){
  const value=String(id||"").trim();
  if(!value)return [];
  return vehicles(frame).filter(v=>v.id===value);
 }
 function inspect({stop,board,hardware,frame,line=null,quayId="",now=Date.now(),feedStatus="",feedError=""}){
  const health=frameHealth(frame,now,feedStatus,feedError);
  if(!stop)return {code:"NO_SELECTION",reason:"Velg en holdeplass på kartet.",health,quays:[],observations:[],resolved:[],displayed:[]};
  const quays=quayIds(stop);
  const invalidQuay=Boolean(quayId)&&!quays.includes(quayId);
  const selectedQuays=quayId?[quayId]:quays;
  const bindings=Model.resolve(stop,board,hardware);
  const filtered=bindings.filter(b=>selectedQuays.includes(b.stopId));
  const leds=unique(filtered.map(b=>b.physicalLed));
  // Track ambiguous physical LED mappings: a Quay-only view cannot assert
  // which platform a shared physical LED represents.
  const sharedLedIds=leds.filter(id=>bindings.some(b=>b.physicalLed===id&&!selectedQuays.includes(b.stopId)));
  const acceptedIds=leds.filter(id=>!sharedLedIds.includes(id));
  const observed=vehicles(frame).filter(v=>acceptedIds.includes(v.physicalLed));
  const matched=observed.filter(v=>line===null||v.line===String(line));
  const usable=health.code==="VALID"||health.code==="LAST_VALID";
  const displayed=usable&&!invalidQuay
   ?Model.signals(stop,board,hardware,frame,line,now,null,quayId?[quayId]:null):[];
  const perQuay=quays.map(id=>{
   const entries=bindings.filter(b=>b.stopId===id);
   const ledIds=unique(entries.map(b=>b.physicalLed));
   const raw=vehicles(frame).filter(v=>ledIds.includes(v.physicalLed));
   return {id,side:stop.platformSides?.[id]?.side||null,reviewed:stop.platformSides?.[id]?.verification==="user-reviewed",
    nodes:unique(entries.map(b=>b.nodeId)),ledIds,observations:raw.filter(v=>line===null||v.line===String(line)),
    sourceCount:raw.length};
  });
  let code,reason;
  if(stop.verification!=="confirmed") [code,reason]=["UNVERIFIED_STOP","Holdeplassens Entur-kobling er ikke bekreftet; sanntidsmarkøren kan ikke brukes som bevis."];
  else if(invalidQuay)[code,reason]=["UNKNOWN_QUAY","Valgt Quay finnes ikke i denne holdeplassens kartkoblinger."];
  else if(!quays.length)[code,reason]=["NO_QUAY","Kartpunktet har ingen registrert Entur Quay-ID."];
  else if(!usable)[code,reason]=[health.code,health.label+". Ingen aktuell bussposisjon kan bekreftes."];
  else if(!filtered.length)[code,reason]=["NOT_IN_BOARD","Valgt Quay er ikke koblet til den aktive tavleprofilen. Det sier ikke noe om fysisk busstrafikk."];
  else if(!acceptedIds.length&&sharedLedIds.length)[code,reason]=["AMBIGUOUS_LED","Samme fysiske LED er koblet til flere Quays. Plattformspesifikk posisjon kan ikke bekreftes."];
  else if(displayed.length)[code,reason]=["VISIBLE",health.code==="LAST_VALID"?"Observasjon fra siste gyldige frame matcher Quay og linjefilter, men ny henting feilet.":"Aktiv observasjon i gyldig frame matcher valgt Quay og linjefilter."];
  else if(observed.length&&!matched.length&&line!==null)[code,reason]=["OTHER_LINE","Det finnes observasjoner på tilknyttet LED, men ingen matcher valgt busslinje."];
  else if(matched.length)[code,reason]=["NO_RENDERED_SIGNAL","Observasjoner finnes, men markøren er ikke aktiv i gjeldende visningsregler."];
  else [code,reason]=["NOT_OBSERVED","Ingen matchende observasjon på tilknyttet LED i denne framen. Dette beviser ikke at det ikke kjører buss."];
  return {code,reason,health,stopId:stop.id,name:stop.name,selectedQuay:quayId||null,
   requestedLine:line,activeBoard:board?.id||null,frameBoard:frame?.boardProfile||null,
   frameSequence:frame?.sequence??null,generatedAt:frame?.generatedAt||null,
   quays:perQuay,resolved:filtered.map(b=>({quayId:b.stopId,nodeId:b.nodeId,physicalLed:b.physicalLed,
    routes:b.node?.routes||[],directions:b.node?.routeDirections||{}})),
   sharedLedIds,matched:matched.length,observations:matched,displayed:displayed.map(v=>({
    id:String(v.id||""),line:String(v.line||""),state:v.state,source:v.source||"ukjent",physicalLed:v.physicalLed,
    destination:v.destination||"",ageSeconds:Number.isFinite(v.ageSeconds)?v.ageSeconds:null
   }))};
 }
 return {inspect,frameHealth,vehicles,findVehicle,quayIds};
});

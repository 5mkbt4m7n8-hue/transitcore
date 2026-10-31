// Shadow-only GPS *subset* of PR #279's strict-station rules. No LED output,
// no provider requests, no stops inferred. Two geometric what-ifs (60/85m)
// use the SAME source batch, destination and competition catalog.
import {distance} from '../core/frame/mapping-support.mjs';
import {catalogIndex} from '../core/engines/catalog-index.mjs';
import competitors from '../config/gps/trondheim-quay-competitors-shadow.json' with {type:'json'};

export const SCOPE='trondheim-strict-route-gps-shadow-v1';
export const REASONS=['matched','invalidGps','invalidOrStaleTime','identityConflict',
 'ambiguousOrUnknownRoute','uncertainGps','outsideRadius','outdatedCatalogQuay',
 'missingQuayIdentity','routeOrDirectionUnresolved','competingQuay','quayNotOnBoard'];
export const EXTRA=['liveRendered','liveRejectedByStrict60','liveDifferentLedStrict60',
 'strict60NotLive','strict85Match','radiusOnlyGain85','liveSideUnresolved'];
const zero=()=>Object.fromEntries([...REASONS,...EXTRA].map(k=>[k,0]));
const count=x=>Number.isSafeInteger(x)&&x>=0&&x<=5000;
const aud=new Map([
 ['NSR:Quay:102735',[63.44047,10.1979]], ['NSR:Quay:103687',[63.44005,10.19803]],
 ['NSR:Quay:73377',[63.420029,10.754617]], ['NSR:Quay:73378',[63.419972,10.756136]]
]);
const cached=new WeakMap();
const clean=s=>String(s||'').normalize('NFC').trim().toLowerCase().split(/\s+via\s+/)[0];
const exact=(options,text)=>Array.isArray(options)&&options.some(v=>clean(v)===text&&text!=='');
function direction(node,profile,destination){
 const text=clean(destination),rule=node.routeDirections?.[profile.id];
 if(!text||!node.routes?.includes(profile.id)||!rule||rule.directionIds?.length!==1)return false;
 const alias=Object.entries(profile.destinationDirectionAliases||{}).find(([name])=>clean(name)===text);
 return alias?String(alias[1])===String(rule.directionIds[0]):
  exact(rule.destinationMatches,text)||exact(rule.headsigns,text);
}
function catalog(board){
 let value=cached.get(board.nodes);
 if(value)return value;
 const nodes=board.nodes,quays=new Set(nodes.map(n=>n.quayId));
 const stations=new Set(nodes.map(n=>n.stationId));
 const supplement=(Array.isArray(competitors.quays)?competitors.quays:[])
  .filter(([id,station])=>stations.has(station)&&!quays.has(id))
  .map(([quayId,stationId,lat,lon],i)=>({
   quayId,stationId,lat,lon,stopIds:[quayId],routes:[],led:-1-i,competitorOnly:true
  }));
 const augmented=nodes.map(node=>{
  const coords=aud.get(node.quayId);
  return coords&&(Math.abs(coords[0]-node.lat)>0.00001||Math.abs(coords[1]-node.lon)>0.00001)
   ?{...node,lat:coords[0],lon:coords[1],quarantined:true}:node;
 }).concat(supplement);
 const boardQuays=new Map();
 for(const node of nodes){
  if(!boardQuays.has(node.quayId))boardQuays.set(node.quayId,node);
  else boardQuays.set(node.quayId,null); // multiple LEDs cannot be chosen safely
 }
 value={index:catalogIndex(augmented),boardQuays};
 cached.set(board.nodes,value);
 return value;
}
function nearestPair(index,lat,lon,radius=145){
 const pos={lat,lon},latDelta=radius/110000;
 const lonDelta=radius/(111000*Math.max(.2,Math.cos(lat*Math.PI/180)));
 let first=null,firstMeters=Infinity,secondMeters=Infinity;
 for(const n of index.candidates(lat,lon,latDelta,lonDelta)){
  if(!Number.isFinite(n.lat)||!Number.isFinite(n.lon))continue;
  const meters=distance(pos,n);
  if(meters<firstMeters||meters===firstMeters&&(n.led??0)<(first?.led??Infinity)){
   secondMeters=firstMeters;first=n;firstMeters=meters;
  }else if(meters<secondMeters)secondMeters=meters;
 }
 return {first,meters:firstMeters,runnerUp:secondMeters};
}
function verdict(v,profile,geo,boardQuays,board,now,radius){
 if(!Number.isFinite(v.latitude)||!Number.isFinite(v.longitude)||
   Math.abs(v.latitude)>90||Math.abs(v.longitude)>180)return {reason:'invalidGps'};
 const time=Date.parse(v.timestamp||'');
 if(!Number.isFinite(time)||!/(Z|[+-]\d\d:\d\d)$/.test(v.timestamp||'')||
   time>now||now-time>Math.min(30,board.render?.freshnessSeconds??30)*1000)
  return {reason:'invalidOrStaleTime'};
 if(!v.id||v.conflictingSample)return {reason:'identityConflict'};
 if(!profile)return {reason:'ambiguousOrUnknownRoute'};
 const uncertainty=v.accuracyMeters??25;
 if(!Number.isFinite(uncertainty)||uncertainty<0||uncertainty>25)
  return {reason:'uncertainGps'};
 if(!geo.first||geo.meters>Math.min(radius,board.render?.arrivalRadiusMeters??radius))
  return {reason:'outsideRadius'};
 const nearest=geo.first;
 if(nearest.quarantined)return {reason:'outdatedCatalogQuay'};
 if(!nearest.quayId||!nearest.stationId||!nearest.stopIds?.includes(nearest.quayId))
  return {reason:'missingQuayIdentity'};
 if(!direction(nearest,profile,v.destination))return {reason:'routeOrDirectionUnresolved'};
 if(geo.runnerUp-geo.meters<=2*Math.max(25,uncertainty)+10)
  return {reason:'competingQuay'};
 const n=boardQuays.get(nearest.quayId);
 if(!n||!direction(n,profile,v.destination))
  return {reason:'quayNotOnBoard'};
 return {reason:'matched',led:n.led};
}
// Compare strictly the frame's GPS occupants, not estimated-calls or provider
// stop projections. This cannot verify physical side or an actual A->B->C pass.
export function evaluateStrictShadow({board,profiles,vehicles,frame,now=Date.now()}={}){
 if(board?.id!=='trondheim-city-lines-catalog'||frame?.boardProfile!==board.id||
  !Array.isArray(board.nodes)||!Array.isArray(board.routes)||!Array.isArray(profiles)||
  !Array.isArray(vehicles)||!Array.isArray(frame.leds)||vehicles.length>5000||
  !Number.isFinite(now))return null;
 const routeCodes=new Set(board.routes.map(x=>
  typeof x==='string'?x.match(/^atb-bus-(\d{1,3})-live$/)?.[1]:null).filter(Boolean));
 const byLine=new Map();
 for(const p of profiles){
  const code=String(p?.line?.publicCode||'');
  if(!routeCodes.has(code))continue;
  byLine.set(code,byLine.has(code)?null:p);
 }
 if(!byLine.size)return null;
 const shown=new Map();
 for(const led of frame.leds){
  const occupants=Array.isArray(led.occupants)&&led.occupants.length?
   led.occupants:led.vehicle?[led.vehicle]:[];
  for(const o of occupants)if(typeof o?.id==='string'&&o.id&&o.positionType==='gps-nearest-stop'&&
    byLine.has(String(o.line||''))){
   const key=o.line+'|'+o.id,positions=shown.get(key)||new Set();
   positions.add(led.id);shown.set(key,positions);
  }
 }
 const latest=new Map(),seenCodes=new Set();
 // Deduplicate before eligibility, as in the candidate: old valid source data
 // must not silently win over newer contradictory information.
 let missing=0;
 for(const obs of vehicles){
  const v=obs?.frameCompatibility||obs,code=String(v?.publicCode||'');
  if(!byLine.has(code))continue;
  seenCodes.add(code);
  const id=typeof v.id==='string'&&v.id?v.id:null;
  if(!id){latest.set(Symbol('missing'),{...v,id:null,publicCode:code});missing++;continue}
  const t=Date.parse(v.timestamp||'');
  const p=latest.get(id);
  if(!p||!Number.isFinite(t)||Number.isFinite(Date.parse(p.timestamp||''))&&t>Date.parse(p.timestamp)){
   latest.set(id,{...v,publicCode:code});
  }else if(t===Date.parse(p.timestamp||'')&&['publicCode','destination','latitude','longitude']
    .some(k=>v[k]!==p[k])){
   latest.set(id,{...v,publicCode:code,conflictingSample:true});
  }
 }
 const {index,boardQuays}=catalog(board);
 const lines=Object.fromEntries([...byLine.keys()].map(code=>[code,zero()]));
 for(const v of latest.values()){
  const code=String(v.publicCode),counts=lines[code];
  if(!counts)continue;
  const profile=byLine.get(code);
  const geo=Number.isFinite(v.latitude)&&Number.isFinite(v.longitude)?
   nearestPair(index,v.latitude,v.longitude,150):
   {first:null,meters:Infinity,runnerUp:Infinity};
  const a=verdict(v,profile,geo,boardQuays,board,now,60);
  const b=verdict(v,profile,geo,boardQuays,board,now,85);
  counts[a.reason]++;
  if(b.reason==='matched')counts.strict85Match++;
  if(a.reason!=='matched'&&b.reason==='matched')counts.radiusOnlyGain85++;
  const live=shown.get(code+'|'+v.id);
  if(live?.size){
   counts.liveRendered++;
   if(a.reason!=='matched')counts.liveRejectedByStrict60++;
   else if(!live.has(a.led))counts.liveDifferentLedStrict60++;
   if(['competingQuay','routeOrDirectionUnresolved','quayNotOnBoard'].includes(a.reason))
    counts.liveSideUnresolved++;
  }else if(a.reason==='matched')counts.strict60NotLive++;
 }
 return {version:1,scope:SCOPE,sourceRows:vehicles.length,identified:latest.size,
  missingIdentities:missing,lines};
}
export function validateStrictShadow(input){
 if(input?.version!==1||input.scope!==SCOPE||!count(input.sourceRows)||
  !count(input.identified)||!count(input.missingIdentities)||input.identified>input.sourceRows||
  !input.lines||Array.isArray(input.lines)||typeof input.lines!=='object')return null;
 const rows=Object.entries(input.lines);
 if(!rows.length||rows.length>80)return null;
 const lines=Object.create(null);let total=0;
 for(const [code,values] of rows){
  if(!/^\d{1,3}$/.test(code)||!values||typeof values!=='object'||Array.isArray(values)||
    ![...REASONS,...EXTRA].every(key=>count(values[key])))return null;
  const counts=Object.fromEntries([...REASONS,...EXTRA].map(k=>[k,values[k]]));
  const num=REASONS.reduce((n,k)=>n+counts[k],0);total+=num;
  if(counts.liveRejectedByStrict60+counts.liveDifferentLedStrict60>counts.liveRendered||
   counts.strict85Match>num||counts.radiusOnlyGain85>counts.strict85Match||
   counts.strict60NotLive>counts.matched||counts.liveSideUnresolved>counts.liveRejectedByStrict60)return null;
  lines[code]=counts;
 }
 if(total!==input.identified)return null;
 return {version:1,scope:SCOPE,sourceRows:input.sourceRows,identified:input.identified,
  missingIdentities:input.missingIdentities,lines};
}

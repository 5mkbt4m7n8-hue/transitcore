// Read-only reconciliation of the SAME Entur vehicle batch used to build the
// Trondheim catalog PixelFrame. This is a quality assessment, not a second
// tracking/matching engine: only explain observable source-to-render outcomes.
// Do not persist identities, coordinates, destinations or raw provider records.
import {distance} from '../core/frame/mapping-support.mjs';
import {catalogIndex} from '../core/engines/catalog-index.mjs';

export const SCOPE='provider-input-render-reconciliation-v1';
export const REASONS=Object.freeze([
 'rendered','missingPosition','invalidTimestamp','stalePosition',
 'outsideCatalogRadius','unrenderedNearCatalog','unverifiableIdentity'
]);
const CODE=/^\d{1,3}$/;
const zero=()=>Object.fromEntries(REASONS.map(k=>[k,0]));
const validCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=5000;

export function reconcileTrondheimGpsSource({board,profiles,vehicles,frame,now=Date.now()}={}){
 if(board?.id!=='trondheim-city-lines-catalog'||
    frame?.boardProfile!==board.id||!Array.isArray(board.nodes)||
    !Array.isArray(board.routes)||!Array.isArray(profiles)||
    !Array.isArray(vehicles)||!Array.isArray(frame.leds)||
    !Number.isFinite(now)||vehicles.length>5000)return null;
 const configured=new Set(board.routes.map(id=>id.match(/^atb-bus-(\d{1,3})-live$/)?.[1])
  .filter(Boolean));
 const known=new Map(profiles.filter(p=>configured.has(String(p?.line?.publicCode||'')))
  .map(p=>[String(p.line.publicCode),p]));
 if(!known.size)return null;
 const rendered=new Set();
 for(const led of frame.leds){
  const entries=Array.isArray(led.occupants)&&led.occupants.length?
   led.occupants:led.vehicle?[led.vehicle]:[];
  for(const entry of entries){
   if(typeof entry?.id==='string'&&entry.id&&known.has(String(entry.line||'')))
    rendered.add(String(entry.line)+'|'+entry.id);
  }
 }
 // Same latest-source-record-per-ID rule as interpretStationVehicles.
 // Records with missing IDs are counted separately, not mistaken for known
 // buses. Unknown public codes are outside this catalog comparison.
 const best=new Map();
 let unlistedCode=0;
 for(const original of vehicles){
  const v=original?.frameCompatibility||original;
  const code=String(v?.publicCode||'');
  if(!known.has(code)){unlistedCode++;continue}
  const id=typeof v?.id==='string'?v.id:'';
  if(!id){const key='missing:'+best.size;best.set(key,{v,code,missingId:true});continue}
  const updated=Date.parse(v?.timestamp||'');
  const prior=best.get(id);
  if(!prior||Number.isFinite(updated)&&(!Number.isFinite(prior.updated)||updated>prior.updated))
   best.set(id,{v,code,updated});
 }
 const counts=Object.fromEntries([...known].map(([code])=>[code,zero()]));
 const index=catalogIndex(board.nodes);
 const radius=Math.max(Number(board.render?.approachRadiusMeters)||250,1);
 for(const item of best.values()){
  const {v,code}=item;
  let reason;
  if(item.missingId)reason='unverifiableIdentity';
  else if(v.latitude==null||!Number.isFinite(Number(v.latitude))||
          v.longitude==null||!Number.isFinite(Number(v.longitude)))
   reason='missingPosition';
  else if(!Number.isFinite(item.updated))reason='invalidTimestamp';
  else if((now-item.updated)/1000>Number(board.render?.freshnessSeconds||60))
   reason='stalePosition';
  else if(rendered.has(code+'|'+v.id))reason='rendered';
  else {
   const lat=Number(v.latitude),lon=Number(v.longitude);
   const latLimit=radius/110000;
   const lonLimit=radius/(111000*Math.max(.2,Math.cos(lat*Math.PI/180)));
   const candidates=index.candidates(lat,lon,latLimit,lonLimit);
   const near=candidates.some(node=>Number.isFinite(node.lat)&&Number.isFinite(node.lon)&&
      Math.abs(node.lat-lat)<=latLimit&&Math.abs(node.lon-lon)<=lonLimit&&
      distance({lat,lon},node)<=radius);
   reason=near?'unrenderedNearCatalog':'outsideCatalogRadius';
  }
  counts[code][reason]++;
 }
 return {version:1,scope:SCOPE,sourceRows:vehicles.length,unlistedCode,
  uniqueKnownVehicles:best.size,lines:counts};
}
export function validatedGpsReconciliation(input){
 if(input?.version!==1||input.scope!==SCOPE||!validCount(input.sourceRows)||
    !validCount(input.unlistedCode)||!validCount(input.uniqueKnownVehicles)||
    input.unlistedCode>input.sourceRows||input.uniqueKnownVehicles>input.sourceRows||
    !input.lines||typeof input.lines!=='object'||Array.isArray(input.lines))return null;
 const entries=Object.entries(input.lines);
 if(!entries.length||entries.length>80)return null;
 const clean=Object.create(null);
 let total=0;
 for(const [code,row] of entries){
  if(!CODE.test(code)||!row||Array.isArray(row)||!REASONS.every(k=>validCount(row[k])))return null;
  clean[code]=Object.fromEntries(REASONS.map(k=>[k,row[k]]));
  total+=REASONS.reduce((sum,k)=>sum+row[k],0);
 }
 if(total!==input.uniqueKnownVehicles)return null;
 return {version:1,scope:SCOPE,sourceRows:input.sourceRows,
  unlistedCode:input.unlistedCode,uniqueKnownVehicles:input.uniqueKnownVehicles,
  lines:clean};
}

// Lightweight Line 1 quality evidence from scheduled Trondheim PixelFrames.
// All output is aggregated by public Quay. No raw vehicle IDs, coordinates,
// inferred physical stop passage or independent source/provider requests.
import patternCatalog from '../config/gps/atb-journey-patterns-1-11.json' with {type:'json'};
const QUAY=/^NSR:Quay:\d+$/;
const VALID=new Set((patternCatalog.lines?.['1']?.patterns||[])
 .flatMap(p=>p.quays||[]).filter(q=>QUAY.test(q)));
const blank=()=>({siri:0,gps:0,ledOnly:0,unresolved:0});
const simpleNum=n=>Number.isInteger(n)&&n>=0&&n<=5000;
export function summarizeLine1ScheduledFrame(frame,board){
 if(frame?.boardProfile!=='trondheim-city-lines-catalog'||
    board?.id!==frame.boardProfile||!Array.isArray(frame.leds))return null;
 const mapping=new Map(),mappedByQuay=new Map();
 for(const n of board.nodes||[]){
  if(!VALID.has(n?.quayId)||!Number.isInteger(n.led))continue;
  const quays=mapping.get(n.led)||[];
  quays.push(n.quayId);mapping.set(n.led,quays);mappedByQuay.set(n.quayId,n.led);
 }
 const stats=new Map(),seen=new Map();
 const bump=(quay,key)=>{if(!VALID.has(quay)||!mappedByQuay.has(quay))return;
  if(!stats.has(quay))stats.set(quay,blank());stats.get(quay)[key]++;};
 const diagnosticsAvailable=Array.isArray(frame.gpsObservations);
 if(diagnosticsAvailable)for(const v of frame.gpsObservations){
  if(String(v?.line)!=='1'||v.status!=='unresolved')continue;
  if(VALID.has(v.nearestQuayId))bump(v.nearestQuayId,'unresolved');
 }
 for(const led of frame.leds){
  const quays=mapping.get(led.id)||[];
  const vehicles=Array.isArray(led.occupants)&&led.occupants.length?led.occupants:
   led.vehicle?[{...led.vehicle,state:led.state}]:[];
  for(const v of vehicles){
   if(String(v?.line)!=='1')continue;
   let quay=null,kind='ledOnly';
   if(VALID.has(v.quayId)&&mappedByQuay.get(v.quayId)===led.id)quay=v.quayId;
   else if(v.positionType==='gps-nearest-stop'&&v.nearestQuayLed===led.id&&quays.length===1)
    quay=quays[0];
   else if(quays.length===1)quay=quays[0];
   if(!quay)continue;
   if(v.quayId===quay&&v.positionType==='entur-siri-provider-stop'&&
     v.providerReportedAtStop===true&&v.state==='AT_STOP'&&led.state==='AT_STOP')kind='siri';
   else if(v.positionType==='gps-nearest-stop'&&v.nearestQuayLed===led.id||
     v.positionType==='gps-route-quay'&&v.quayId===quay)kind='gps';
   // Do not count an identical vehicle twice on one Quay in the same frame.
   const key=quay+'|'+kind;
   let identifiers=seen.get(key);
   if(!identifiers){identifiers=new Set();seen.set(key,identifiers);}
   const privateId=typeof v.id==='string'?v.id:'led:'+led.id;
   if(identifiers.has(privateId))continue;
   identifiers.add(privateId);bump(quay,kind);
  }
 }
 return {version:1,kind:'scheduled-line1-quay-snapshot',
  diagnosticsAvailable,
  items:[...stats].sort(([a],[b])=>a.localeCompare(b)).map(([quay,value])=>[quay,value])};
}
export function validatedLine1ScheduledQuality(quality){
 if(quality==null)return null; // historic records predate the source enrichment
 if(quality.version!==1||quality.kind!=='scheduled-line1-quay-snapshot'||
    typeof quality.diagnosticsAvailable!=='boolean'||!Array.isArray(quality.items)||
    quality.items.length>180)return null;
 const unique=new Set(),items=[];
 for(const entry of quality.items){
  if(!Array.isArray(entry)||entry.length!==2||!VALID.has(entry[0])||unique.has(entry[0]))
   return null;
  const counts=entry[1];
  if(!counts||!['siri','gps','ledOnly','unresolved'].every(k=>simpleNum(counts[k])))return null;
  unique.add(entry[0]);
  items.push([entry[0],{siri:counts.siri,gps:counts.gps,
   ledOnly:counts.ledOnly,unresolved:counts.unresolved}]);
 }
 return {version:1,kind:quality.kind,diagnosticsAvailable:quality.diagnosticsAvailable,items};
}

// Quality-only, bounded view of explicitly conflicting catalog GPS *after*
// the existing renderer has classified position and destination evidence.
// These observations are NOT a full feed of rejected provider positions.
// No extra Entur calls, Quay inference or changes to PixelFrame output.
const QUAY=/^NSR:Quay:\d+$/;
const ROUTE=/^atb-bus-(\d{1,3})-live$/;
export const SCOPE='rendered-direction-conflict-only';

export function renderedGpsConflicts(frame,board){
 if(frame?.boardProfile!=='trondheim-city-lines-catalog'||
    board?.id!==frame.boardProfile||!Array.isArray(frame.leds)||
    !Array.isArray(board.nodes))return null;
 const byLed=new Map();
 for(const n of board.nodes){
  if(!Number.isInteger(n.led)||!QUAY.test(n.quayId))continue;
  let entry=byLed.get(n.led);
  if(!entry){entry=new Map();byLed.set(n.led,entry);}
  for(const route of n.routes||[]){
   const code=typeof route==='string'?route.match(ROUTE)?.[1]:null;
   if(!code)continue;
   if(!entry.has(code))entry.set(code,new Set());
   entry.get(code).add(n.quayId);
  }
 }
 const seen=new Set(),out=[];
 for(const led of frame.leds){
  const mapping=byLed.get(led?.id);
  if(!mapping)continue;
  const occupants=Array.isArray(led.occupants)&&led.occupants.length?
   led.occupants:led.vehicle?[{...led.vehicle,state:led.state}]:[];
  for(const v of occupants){
   const code=String(v?.line||'');
   if(v?.positionType!=='gps-nearest-stop'||
      v.platformEvidence!=='direction-conflict'||
      v.routeListedHere!==true||v.withinStopRadius!==true||
      v.nearestQuayLed!==led.id||typeof v.id!=='string'||!v.id||
      !mapping.has(code)||mapping.get(code).size!==1)continue;
   const quay=[...mapping.get(code)][0];
   const key=code+'|'+v.id;
   if(seen.has(key))continue;
   seen.add(key);
   out.push({line:code,nearestQuayId:quay,status:'unresolved',vehicleRef:v.id});
   // Never store a truncated candidate set as a complete diagnostic sample.
   if(out.length>300)return null;
  }
 }
 return out;
}

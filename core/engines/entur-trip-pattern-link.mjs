// Explicit, immutable Entur JourneyPattern and dated trip evidence for AtB
// pilot lines. This module NEVER controls LEDs, confirms a stop, or guesses a
// trip ID from a headsign, GPS distance, or inverse stop order.
import catalogue from '../../config/gps/atb-journey-patterns-1-11.json' with {type:'json'};

const quay=id=>/^NSR:Quay:[0-9]+$/.test(id||'');
const netex=id=>/^[A-Z0-9_]+:(?:Line|JourneyPattern|ServiceJourney|DatedServiceJourney):[^\s]+$/.test(id||'');
const string=value=>typeof value==='string'?value:'';
export function validatePatternCatalogue(source=catalogue) {
  if(source?.schemaVersion!==1||!source?.lines)throw Error('Invalid pattern snapshot');
  const lines=new Map();
  for(const [code,line] of Object.entries(source.lines)){
    if(!/^\d+$/.test(code)||line.lineId!==`ATB:Line:2_${code}`||!Array.isArray(line.patterns)||!line.patterns.length)
      throw Error('Invalid line patterns');
    const ids=new Set(),patterns=[];
    for(const p of line.patterns){
      if(!netex(p.id)||ids.has(p.id)||!['inbound','outbound'].includes(p.directionType)||
        !Array.isArray(p.quays)||p.quays.length<2||p.quays.length>200||
        p.quays.some(q=>!quay(q)))throw Error('Unsafe JourneyPattern');
      ids.add(p.id);
      patterns.push(Object.freeze({id:p.id,directionType:p.directionType,name:string(p.name),
        quays:Object.freeze([...p.quays])}));
    }
    lines.set(code,Object.freeze({lineId:line.lineId,patterns:Object.freeze(patterns)}));
  }
  return lines;
}
const inventory=validatePatternCatalogue();
export function patternInventory(){return inventory;}

// Join by exact source identities. A SIRI DatedVehicleJourneyRef is not
// automatically a Transit Data DatedServiceJourney id; missing exact lookup
// is explicitly unresolved, never fixed by changing a prefix.
export function resolveExactDatedJourney({
 lineCode,datedVehicleJourneyRef,datedJourney,serviceDate,
 vehicleLineRef,expectedServiceJourneyId
}){
 const reject=reason=>({status:'unresolved',reason,quays:[]});
 const record=inventory.get(String(lineCode));
 if(!record)return reject('line-not-in-catalogue');
 if(vehicleLineRef!==record.lineId)return reject('vehicle-line-mismatch');
 if(!netex(datedVehicleJourneyRef)||!datedVehicleJourneyRef.includes(':DatedServiceJourney:'))
   return reject('unverified-siri-trip-id-type');
 if(!datedJourney||datedJourney.id!==datedVehicleJourneyRef)return reject('dated-id-unverified');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate||'')||datedJourney.operatingDay!==serviceDate)
   return reject('operating-day-mismatch');
 if(datedJourney.tripAlteration==='cancellation'||datedJourney.tripAlteration==='replaced')
   return reject('trip-cancelled-or-replaced');
 const service=datedJourney.serviceJourney;
 if(!netex(service?.id)||!service.id.includes(':ServiceJourney:')||
   service?.line?.id!==record.lineId)return reject('service-journey-line-unverified');
 if(expectedServiceJourneyId&&service.id!==expectedServiceJourneyId)
   return reject('service-journey-conflict');
 const fromDated=datedJourney.journeyPattern?.id;
 const fromService=service.journeyPattern?.id;
 if(fromDated&&fromService&&fromDated!==fromService)return reject('journey-pattern-conflict');
 const patternId=fromDated||fromService;
 const p=record.patterns.find(x=>x.id===patternId);
 if(!p)return reject('pattern-not-in-verified-snapshot');
 return {status:'linked',reason:'exact-validated-dated-journey',
  datedServiceJourneyId:datedJourney.id,serviceJourneyId:service.id,
  patternId:p.id,lineId:record.lineId,directionType:p.directionType,
  quays:[...p.quays],source:'entur-transit-data-v1beta',
  providerStopConfirmed:false};
}

// Ordered Quay evidence can identify a common known sequence, but not the
// specific dated bus trip. Identical pattern variants share a sequence.
// Two Quays, in order, on one unique sequence are needed. No reverse fallback.
export function inferSharedQuaySequence({lineCode,visitedQuays}){
 const reject=reason=>({status:'unresolved',reason,quays:[]});
 const record=inventory.get(String(lineCode));
 if(!record)return reject('line-not-in-catalogue');
 if(!Array.isArray(visitedQuays)||visitedQuays.length<2||
   visitedQuays.some(x=>!quay(x)))return reject('insufficient-quay-evidence');
 const candidates=record.patterns.filter(p=>{
  let prev=-1;
  for(const id of visitedQuays){
   const index=p.quays.indexOf(id,prev+1);
   if(index<0)return false;
   prev=index;
  }
  return true;
 });
 if(!candidates.length)return reject('not-on-source-pattern');
 const groups=new Map();
 for(const p of candidates){
  const key=p.quays.join('|');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(p);
 }
 if(groups.size!==1)return reject('multiple-valid-pattern-sequences');
 const group=[...groups.values()][0],first=group[0];
 return {status:'sequence-supported',reason:'ordered-source-quays-only',
  possiblePatternIds:group.map(p=>p.id),lineId:record.lineId,
  directionType:first.directionType,quays:[...first.quays],
  tripIdentityConfirmed:false,providerStopConfirmed:false};
}

/** Only a matching, fresh SIRI vehicle reference can connect GPS to an
 * exact Transit Data DatedServiceJourney; nothing here validates an LED. */
export function joinSiriVehicleToDatedTrip({
 siri,vehicle,datedJourney,operatingDay,now=Date.now()
}){
 const reject=reason=>({status:'unresolved',reason,quays:[]});
 if(siri?.source!=='entur-siri-vm'||!siri.vehicleRef||
   siri.vehicleRef!==vehicle?.id)return reject('vehicle-id-not-exact');
 const lineCode=String(vehicle.publicCode||'');
 if(siri.lineRef!==`ATB:Line:2_${lineCode}`)return reject('vehicle-line-not-exact');
 const at=Date.parse(siri.recordedAt||''),gpsAt=Date.parse(vehicle.timestamp||'');
 if(!Number.isFinite(at)||!Number.isFinite(gpsAt)||at>now+5000||gpsAt>now+5000||
   now-at>30000||now-gpsAt>30000||Math.abs(at-gpsAt)>20000)
   return reject('unsynchronized-siri-gps');
 return resolveExactDatedJourney({
  lineCode,datedVehicleJourneyRef:siri.datedVehicleJourneyRef,
  datedJourney,serviceDate:operatingDay,vehicleLineRef:siri.lineRef
 });
}

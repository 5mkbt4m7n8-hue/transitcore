// Optional exact-provider-stop projection. Never infer a stop from GPS,
// ETA or the next/onward-call list. Caller must supply vetted SIRI VM reports.
// There is deliberately NO network fetch in this module.
import {distance} from '../frame/mapping-support.mjs';
import {evaluateEnturStopEvidence} from './entur-stop-evidence.mjs';

const quarantinedQuays=new Set([
  'NSR:Quay:102735','NSR:Quay:103687',
  'NSR:Quay:73377','NSR:Quay:73378'
]);
export function projectEnturReportedStops({board,profiles,vehicles,now,reports,interpreted}) {
  if(!reports?.length)return interpreted;
  const nodes=new Map(board.nodes.map(n=>[n.quayId,n]));
  const byLine=new Map();
  for(const p of profiles){
    const code=String(p.line.publicCode);
    byLine.set(code,byLine.has(code)?null:p);
  }
  const byVehicle=new Map();
  for(const v of vehicles){
    if(!v.id)continue;
    const key=String(v.publicCode)+':'+String(v.id);
    const previous=byVehicle.get(key);
    if(!previous||Date.parse(v.timestamp)>Date.parse(previous.timestamp))byVehicle.set(key,v);
  }
  const reportsById=new Map();
  for(const r of reports){
    if(r?.source!=='entur-siri-vm'||r.vehicleAtStop!==true||!r.vehicleRef)continue;
    const a=reportsById.get(r.vehicleRef)||[];
    a.push(r);reportsById.set(r.vehicleRef,a);
  }
  const {strongest,occupantsByLed,observations}=interpreted;
  for(const [vehicleRef,matches] of reportsById){
    // Two different provider Quays for one vehicle in a single sample are
    // explicitly ambiguous. No arbitrary first/last winner.
    const candidates=new Set(matches.map(x=>x.quayId));
    if(candidates.size!==1)continue;
    const report=[...matches].sort((a,b)=>Date.parse(b.recordedAt)-Date.parse(a.recordedAt))[0];
    const vehicle=vehicles.find(v=>v.id===vehicleRef&&byVehicle.get(String(v.publicCode)+':'+v.id)===v);
    if(!vehicle)continue;
    const profile=byLine.get(String(vehicle.publicCode));
    const node=nodes.get(report.quayId);
    if(quarantinedQuays.has(report.quayId))continue;
    const accepted=evaluateEnturStopEvidence({report,vehicle,profile,node,now});
    if(!accepted.accepted)continue;
    const meters=distance({lat:vehicle.latitude,lon:vehicle.longitude},node);
    // Remove any weaker GPS-only assignment for this same vehicle before
    // adding a provider-reported position; never light it at two Quays.
    for(const [id,occupants] of occupantsByLed){
      const filtered=occupants.filter(x=>x.vehicleId!==vehicle.id||x.profile.id!==profile.id);
      if(filtered.length===occupants.length)continue;
      if(filtered.length)occupantsByLed.set(id,filtered);
      else occupantsByLed.delete(id);
      const prior=strongest.get(id);
      if(prior?.vehicleId===vehicle.id&&prior.profile.id===profile.id){
        if(filtered.length)strongest.set(id,filtered.sort((a,b)=>(a.state==='AT_STOP'?-1:0)-(b.state==='AT_STOP'?-1:0)||a.meters-b.meters)[0]);
        else strongest.delete(id);
      }
    }
    const item={id:node.led,profile,vehicleId:vehicle.id,updated:Date.parse(vehicle.timestamp),
      destination:vehicle.destination,state:'AT_STOP',meters,lat:vehicle.latitude,lon:vehicle.longitude,
      positionType:'entur-siri-provider-stop',routeListedHere:true,
      platformEvidence:'entur-provider-reported-at-stop',platformConfirmed:true,
      providerReportedAtStop:true,nearestQuayLed:node.led,nearestQuayDistanceMeters:meters,
      withinStopRadius:meters<=(board.render.arrivalRadiusMeters??85),
      quayId:node.quayId,stopPlaceId:node.stationId};
    const group=occupantsByLed.get(item.id)||[];
    group.push(item);occupantsByLed.set(item.id,group);
    const previous=strongest.get(item.id);
    if(!previous||previous.state!=='AT_STOP'||meters<previous.meters)strongest.set(item.id,item);
    for(const obs of observations||[]){
      if(obs.id!==vehicle.id||String(obs.line)!==String(vehicle.publicCode))continue;
      obs.status='matched';obs.reason='entur-provider-reported-at-stop';
      obs.quayId=node.quayId;obs.stopPlaceId=node.stationId;
      obs.providerReportedAtStop=true;
    }
  }
  return interpreted;
}

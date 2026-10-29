// Evidence gate for an Entur SIRI VM MonitoredCall. A *provider-reported*
// stop is stronger than GPS proximity, but is not an independent physical
// sensor. Do not synthesize a stop from ETA or onward/next-call fields.
import {distance} from '../frame/mapping-support.mjs';

export function evaluateEnturStopEvidence({report,vehicle,profile,node,now=Date.now()}) {
  const reject=reason=>({accepted:false,reason});
  if(report?.source!=='entur-siri-vm'||report.vehicleAtStop!==true||
    !/^NSR:Quay:[0-9]+$/.test(report.quayId||''))return reject('not-explicit-stop');
  // Never fuzzy-join vehicle IDs, even if some providers include a prefix.
  if(!vehicle?.id||report.vehicleRef!==vehicle.id)return reject('vehicle-id-mismatch');
  if(!profile?.id||String(profile.line?.publicCode)!==String(vehicle.publicCode))
    return reject('line-mismatch');
  if(report.lineRef!==profile.line.id)return reject('source-line-mismatch');
  if(!node||node.quayId!==report.quayId||!node.routes?.includes(profile.id)||
    !node.stationId||!node.stopIds?.includes(report.quayId))
    return reject('quay-not-on-route');
  const rule=node.routeDirections?.[profile.id];
  if(!rule||rule.directionIds?.length!==1)return reject('ambiguous-quay-direction');
  // Exact terminal or configured alias has to agree with the Quay; do not
  // override destination/route contradictions merely because VM says 'at stop'.
  const text=String(vehicle.destination||'').trim().toLowerCase();
  const normal=value=>String(value||'').normalize('NFC').trim().toLowerCase().split(/\s+via\s+/)[0];
  const alias=Object.entries(profile.destinationDirectionAliases||{})
    .find(([name])=>normal(name)===normal(text));
  const aligns=alias?String(alias[1])===String(rule.directionIds[0]):
    [...(rule.destinationMatches||[]),...(rule.headsigns||[])].some(v=>normal(v)===normal(text)&&normal(text)!=='');
  if(!aligns)return reject('destination-direction-mismatch');
  const reported=Date.parse(report.recordedAt||'');
  const observed=Date.parse(vehicle.timestamp||'');
  if(!Number.isFinite(reported)||!Number.isFinite(observed)||reported>now+5000||
    observed>now+5000||now-reported>30000||now-observed>30000||
    Math.abs(reported-observed)>20000)
    return reject('stale-or-unsynchronized-report');
  if(!Number.isFinite(vehicle.latitude)||!Number.isFinite(vehicle.longitude)||
    !Number.isFinite(node.lat)||!Number.isFinite(node.lon)||
    distance({lat:vehicle.latitude,lon:vehicle.longitude},node)>100)
    return reject('gps-report-spatial-conflict');
  if(report.conflictingQuayIds?.length)return reject('conflicting-provider-quays');
  return {accepted:true,reason:'entur-provider-reported-at-stop',
    quayId:node.quayId,stopPlaceId:node.stationId,
    evidence:'SIRI-VM MonitoredCall.VehicleAtStop=true',
    // This is NOT a GPS inference and NOT proof of a physical door opening.
    providerReportedAtStop:true,physicalStopVerified:false};
}

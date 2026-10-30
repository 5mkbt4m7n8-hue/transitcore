// Evidence gate for an Entur SIRI VM MonitoredCall. A *provider-reported*
// stop is stronger than GPS proximity, but is not an independent physical
// sensor. Do not synthesize a stop from ETA or onward/next-call fields.
import {distance} from '../frame/mapping-support.mjs';
import {joinSiriVehicleToServiceJourney} from './entur-trip-pattern-link.mjs';
import {inspectSharedQuayContext} from './entur-shared-quay-context.mjs';

// The ONLY shared-Quay exception is line 1 Tonstadkrysset. It uses the
// same physical NSR:Quay/LED in both directions, subject to exact, fresh
// SIRI+GPS+ServiceJourney source proof. No fallback to other nearby Quays.
export function evaluateEnturStopEvidence({
 report,vehicle,profile,node,now=Date.now(),sharedQuayJourney=null
}) {
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
  const normal=value=>String(value||'').normalize('NFC').trim().toLowerCase().split(/\s+via\s+/)[0];
  const text=normal(vehicle.destination);
  let sharedContext=null;
  if(!rule||rule.directionIds?.length!==1){
    // A shared Quay is not two physical LED locations. Do not generalize
    // this exception: Østre Lund and all other ambiguous Quays stay blocked.
    if(profile.id!=='atb-bus-1-live'||report.quayId!=='NSR:Quay:102733'||
      !rule||!Array.isArray(rule.directionIds)||rule.directionIds.length!==2||
      new Set(rule.directionIds.map(String)).size!==2||
      !rule.directionIds.map(String).includes('0')||
      !rule.directionIds.map(String).includes('1'))
      return reject('ambiguous-quay-direction');
    const siri=sharedQuayJourney?.siri,serviceJourney=sharedQuayJourney?.serviceJourney;
    if(siri?.vehicleRef!==report.vehicleRef||siri?.lineRef!==report.lineRef||
      siri?.recordedAt!==report.recordedAt||!serviceJourney)
      return reject('shared-quay-source-journey-unverified');
    const joined=joinSiriVehicleToServiceJourney({
      siri,vehicle,serviceJourney,now
    });
    if(joined.status!=='route-pattern-supported'||!joined.vehicleIdentityConfirmed)
      return reject('shared-quay-source-journey-unverified');
    sharedContext=inspectSharedQuayContext({
      lineCode:'1',journeyEvidence:joined,quayId:report.quayId
    });
    if(sharedContext.status!=='source-pattern-context-only'||
      !sharedContext.sharedBetweenSourceDirections||sharedContext.role!=='intermediate')
      return reject('shared-quay-pattern-not-exact');
    // Source direction must be consistent with an actual catalogued
    // terminal, not a numeric GTFS direction guess. Headsign remains a
    // secondary contradiction check (Kattem is a display alias, not a Quay).
    const terminal=joined.quays.at(-1);
    const south=['NSR:Quay:102721','NSR:Quay:75607'].includes(terminal);
    const north=['NSR:Quay:74982','NSR:Quay:73033'].includes(terminal);
    if(south===north||
      (south&&sharedContext.sourceDirection!=='outbound')||
      (north&&sharedContext.sourceDirection!=='inbound'))
      return reject('shared-quay-terminus-conflict');
    const direction=profile.directions?.find(d=>d.reverseShape===(north===true));
    if(!direction||!text||
      !(direction.destinationMatches||[]).some(v=>normal(v)===text))
      return reject('shared-quay-headsign-conflict');
  } else {
    // Normal exclusive-platform gate stays unchanged for all other Quays.
    const alias=Object.entries(profile.destinationDirectionAliases||{})
      .find(([name])=>normal(name)===text);
    const aligns=alias?String(alias[1])===String(rule.directionIds[0]):
      [...(rule.destinationMatches||[]),...(rule.headsigns||[])].some(v=>normal(v)===text&&text!=='');
    if(!aligns)return reject('destination-direction-mismatch');
  }
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
    sharedQuaySameLed:sharedContext!==null,
    plannedSourceDirection:sharedContext?.sourceDirection||null,
    evidence:'SIRI-VM MonitoredCall.VehicleAtStop=true',
    // This is NOT a GPS inference and NOT proof of a physical door opening.
    providerReportedAtStop:true,physicalStopVerified:false};
}

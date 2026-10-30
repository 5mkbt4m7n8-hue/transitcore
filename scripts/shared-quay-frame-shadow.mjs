// Offline-only staging-style frame calculation for Tonstadkrysset.
// No network, Worker binding, Cloudflare deployment, persistence, or hardware IO.
// The actual internal frame contains private vehicle data; never return/log it.
import {interpretStrictStationGps} from '../core/engines/strict-station-gps.mjs';
import {renderStationFrame} from '../core/frame/frame-renderer.mjs';
export const TONSTAD_QUAY='NSR:Quay:102733';

export function evaluateTonstadShadowFrame({
 board,profile,vehicles=[],reports=[],verifiedJourneys=null,now
}={}){
 const target=board?.nodes?.filter(n=>n?.quayId===TONSTAD_QUAY)||[];
 if(board?.id!=='trondheim-city-lines-catalog'||target.length!==1||
  !Number.isInteger(target[0].led)||target[0].led<0||
  profile?.id!=='atb-bus-1-live'||!Array.isArray(vehicles)||
  !Array.isArray(reports)||!(verifiedJourneys instanceof Map)||
  !Number.isFinite(now))throw Error('invalid-shadow-input');
 // Only the explicit Tonstadkrysset reports are allowed into the test frame.
 // Source proof is carried per vehicle, with its exact SIRI report/time.
 const targetReports=reports.filter(r=>r?.source==='entur-siri-vm'&&
  r.quayId===TONSTAD_QUAY&&r.lineRef===profile.line.id&&r.vehicleAtStop===true);
 const evidenceByVehicle=new Map();
 for(const r of targetReports){
  const evidence=verifiedJourneys.get(r.vehicleRef);
  if(!evidence||evidence.siri?.recordedAt!==r.recordedAt||
    evidence.siri?.vehicleRef!==r.vehicleRef||
    evidence.siri?.lineRef!==r.lineRef)continue;
  // Conflicting reports for the same vehicle must not receive a guessed
  // "best" source proof. The projector rejects conflicting provider Quays.
  if(evidenceByVehicle.has(r.vehicleRef)) {
   evidenceByVehicle.delete(r.vehicleRef);
   continue;
  }
  evidenceByVehicle.set(r.vehicleRef,evidence);
 }
 const interpreted=interpretStrictStationGps({
  board,profiles:[profile],vehicles:vehicles.filter(v=>v?.publicCode==='1'),
  now,stopReports:targetReports,sharedQuayJourneys:evidenceByVehicle
 });
 const frame=renderStationFrame({
  board,hardware:{leds:{count:board.leds?.count,brightnessLimit:32}},
  now,signalPolicy:{fullBrightness:32}
 },interpreted);
 const occupants=interpreted.occupantsByLed.get(target[0].led)||[];
 const accepted=occupants.filter(o=>o.state==='AT_STOP'&&
  o.providerReportedAtStop===true&&o.sharedQuaySameLed===true&&
  o.quayId===TONSTAD_QUAY);
 const rendered=frame.leds.filter(led=>led.id===target[0].led);
 if(rendered.length>1)throw Error('duplicate-shadow-led');
 const projected=rendered[0]||null;
 if(accepted.length&&(!projected||projected.state!=='AT_STOP'||
  projected.vehicle?.quayId!==TONSTAD_QUAY||
  projected.vehicle?.providerReportedAtStop!==true))
  throw Error('shadow-frame-inconsistent');
 // Only public Quay / LED and aggregate counters escape this module. Never
 // serialize the frame or its GPS observations, occupant IDs or coordinates.
 return Object.freeze({
  mode:'offline-shadow-no-deploy',quayId:TONSTAD_QUAY,
  targetLedId:target[0].led,
  reportsConsidered:targetReports.length,
  provenAtStopOccupants:accepted.length,
  simulatedLedOn:accepted.length>0,
  simulatedState:accepted.length?'AT_STOP':'UNCONFIRMED',
  physicalStopIndependentlyVerified:false,
  eligibleForProduction:false
 });
}

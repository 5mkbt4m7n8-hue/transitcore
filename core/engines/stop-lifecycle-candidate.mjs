import {distance} from '../frame/mapping-support.mjs';
import {STOP_POLICY} from './stop-evidence.mjs';

/** One shared reducer for GPS and call evidence. Caller owns per-visit history.
 * Explicit opt-in required. Worker gate is BoardConfig.render.stopAccuracy.
 */
export function reduceStop(previous, evidence, now, {enabled=false, policy=STOP_POLICY}={}) {
  if (!enabled) throw new Error('Stop lifecycle candidate is disabled; shadow opt-in required');
  const next = {...previous, lastSeen:now, source:evidence.source, confidence:evidence.confidence};
  const result = (state, reason) => ({...next, state, reason});
  if(policy.mode==='gps-proximity-v1'){
    // Geographic occupancy, not evidence of a physical stop. Never consume ETA.
    if(evidence.source!=='GPS'||evidence.invalid||evidence.cancelled){next.observedAt=previous?.observedAt;return result('OFF',evidence.reason||'GPS required');}
    if(evidence.repeated){next.observedAt=previous?.observedAt;return result(previous?.state||'OFF',evidence.reason);}
    next.observation=evidence.observation;
    next.observedAt=evidence.observedAt;
    if(previous?.departedAt!=null)return result('OFF','geographic exit latched for this visit');
    if(previous?.zoneEntered){
      if(evidence.observation.distanceMeters>policy.exitMeters){next.departedAt=evidence.observedAt;next.zoneEntered=false;return result('OFF','first fresh observation outside exit radius');}
      return result('AT_STOP','within geographic hysteresis zone (not confirmed stop)');
    }
    if(evidence.near){next.zoneEntered=true;return result('AT_STOP','within geographic arrival radius (not confirmed stop)');}
    return result(evidence.approaching?'APPROACHING':'OFF','fresh distance trend toward stop required');
  }
  if(evidence.source==='ESTIMATED_CALL' && evidence.observedAt < previous?.observedAt)
    return {...previous,lastSeen:now,reason:'out-of-order call response ignored'};
  if(Number.isFinite(evidence.observedAt) && evidence.observedAt<=now)next.observedAt=evidence.observedAt;
  if (evidence.invalid || evidence.cancelled) {
    next.nearSince = null; next.outwardCount = 0; next.observation = null;
    return result('OFF', evidence.reason); // No invented departure on data loss.
  }
  if (previous?.departedAt != null) {
    // Forecasts can be revised after their previous departure estimate passed.
    // Do not treat such an estimate as an irreversible physical event.
    if(evidence.source==='ESTIMATED_CALL' && previous.departureConfidence!=='reported' &&
        evidence.observedAt>previous.observedAt && !evidence.departed) {
      next.departedAt=null;
    } else return result(now-previous.departedAt < policy.afterglowMs ? 'PASSED' : 'OFF', 'departure latched for this visit');
  }
  if (evidence.repeated) return result(previous?.state || 'OFF', evidence.reason);
  if (evidence.source === 'GPS') {
    next.observation = evidence.observation;
    if (!evidence.continuous) { next.nearSince = null; next.outwardCount = 0; }
    if (['AT_STOP','PARKED'].includes(previous?.state) && evidence.continuous) {
      next.outwardCount = evidence.outward ? (previous.outwardCount || 0)+1 : 0;
      const anchorMovement = previous.anchor ? distance(previous.anchor,evidence.observation) : 0;
      if (next.outwardCount >= policy.outwardSamples && anchorMovement >= policy.departureMeters) {
        next.departedAt = now;
        return result('PASSED','sustained outward movement from arrival anchor');
      }
      if(anchorMovement>policy.parkedMovementMeters)next.parkedSince=evidence.observedAt;
      const parked=anchorMovement<=policy.parkedMovementMeters && evidence.observedAt-(next.parkedSince??evidence.observedAt)>=policy.parkedMs;
      return result(parked?'PARKED':'AT_STOP',parked?'confirmed stationary duration':'awaiting departure evidence');
    }
    next.nearSince = evidence.near ? (evidence.continuous ? previous?.nearSince ?? evidence.observedAt : evidence.observedAt) : null;
    if (evidence.near && evidence.stationary && evidence.observedAt-next.nearSince >= policy.dwellMs) {
      next.anchor = evidence.observation;
      next.parkedSince=evidence.observedAt;
      return result('AT_STOP','close position and fresh low-motion confirmation');
    }
    return result(evidence.approaching ? 'APPROACHING' : 'OFF','awaiting close low-motion confirmation');
  }
  if (evidence.departed) {
    next.departedAt = evidence.eventAt;
    next.departureConfidence = evidence.confidence;
    return result(now-evidence.eventAt < policy.afterglowMs ? 'PASSED':'OFF',evidence.reason);
  }
  return result(evidence.arrived ? 'AT_STOP' : evidence.approaching ? 'APPROACHING' : 'OFF',evidence.reason);
}

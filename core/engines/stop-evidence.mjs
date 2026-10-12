import {distance} from '../frame/mapping-support.mjs';

// Experimental, provider-neutral evidence adapters. No clock, IO or hidden state.
export const STOP_POLICY = Object.freeze({
  freshnessMs: 30000, arrivalMeters: 25, approachMeters: 250,
  dwellMs: 5000, stationarySpeed: 1, departureMeters: 18,
  departureSpeed: 1.5, outwardMeters: 5, outwardSamples: 2,
  maxSpeed: 45, afterglowMs: 10000, parkedMs: 300000, parkedMovementMeters: 15, etaDwellCapMs: 20000,
  etaApproachMs: 120000, retentionMs: 600000
});
const finite = x => typeof x === 'number' && Number.isFinite(x);

export function gpsEvidence(observation, previous, now, policy = STOP_POLICY) {
  const base = {source:'GPS', observedAt:observation?.observedAt, confidence:'inferred'};
  if (!observation || !finite(observation.observedAt) || observation.observedAt > now ||
      now - observation.observedAt > policy.freshnessMs || !finite(observation.distanceMeters) ||
      !finite(observation.lat) || !finite(observation.lon) || Math.abs(observation.lat)>90 ||
      Math.abs(observation.lon)>180 || observation.directionMatched !== true)
    return {...base, invalid:true, reason:'missing/stale/invalid position or direction'};
  const repeated = previous && observation.observedAt <= previous.observedAt;
  if (repeated) return {...base, repeated:true, reason:'duplicate/out-of-order observation'};
  const dt = previous ? observation.observedAt - previous.observedAt : 0;
  const continuous = dt > 0 && dt <= policy.freshnessMs;
  const movement = continuous ? distance(previous, observation) : null;
  const speed = continuous ? movement / (dt/1000) : null;
  if (speed !== null && speed > policy.maxSpeed)
    return {...base, invalid:true, reason:'implausible GPS jump'};
  return {...base, observation, continuous, speed,
    approaching:observation.distanceMeters <= policy.approachMeters,
    near:observation.distanceMeters <= policy.arrivalMeters,
    stationary:continuous && speed <= policy.stationarySpeed,
    outward:continuous && observation.distanceMeters - previous.distanceMeters >= policy.outwardMeters && speed >= policy.departureSpeed,
    reason:'GPS distance/trend'};
}

/** Calls carry receivedAt, not a fabricated vehicle observation timestamp. */
export function callEvidence(call, now, policy = STOP_POLICY) {
  const base = {source:'ESTIMATED_CALL', observedAt:call?.receivedAt,
    confidence:call?.realtime ? 'forecast' : 'timetable'};
  if (!call || !finite(call.receivedAt) || call.receivedAt > now || now-call.receivedAt > policy.freshnessMs)
    return {...base, invalid:true, reason:'missing/stale call response'};
  if (call.cancelled) return {...base, cancelled:true, reason:'cancelled call'};
  if (call.predictionInaccurate) return {...base, invalid:true, reason:'prediction flagged inaccurate'};
  const actualArrival = finite(call.actualArrival) && call.actualArrival <= now;
  const actualDeparture = finite(call.actualDeparture) && call.actualDeparture <= now;
  if (actualDeparture) return {...base, departed:true, confidence:'reported', eventAt:call.actualDeparture, reason:'reported actual departure'};
  const arrival = actualArrival ? call.actualArrival : call.expectedArrival;
  if (!finite(arrival)) return {...base, invalid:true, reason:'no usable arrival time'};
  // Bounded possible dwell, never a confirmed physical arrival from an ETA.
  const departure = finite(call.expectedDeparture) && call.expectedDeparture >= arrival
    ? call.expectedDeparture : arrival + policy.etaDwellCapMs;
  const until = actualArrival ? departure : Math.min(departure, arrival + policy.etaDwellCapMs);
  return {...base, approaching:now < arrival && arrival-now <= policy.etaApproachMs,
    arrived:now >= arrival && now < until,
    departed:now >= until, eventAt:until,
    confidence:actualArrival && now < until ? 'reported' : base.confidence,
    reason:now >= until ? 'estimated departure/dwell bound (not confirmed)' :
      actualArrival ? 'reported actual arrival' : 'expected arrival (not confirmed)',
    etaSeconds:(arrival-now)/1000};
}

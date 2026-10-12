import {distance, matchesDirection, vehicleAllowedByBoard, validateConfiguration} from './mapping-support.mjs';
import {mapLedStates} from './led-mapper.mjs';
import {renderStationFrame} from './frame-renderer.mjs';
import {assertPixelFrame} from './frame-validator.mjs';
import {gpsEvidence, callEvidence, STOP_POLICY} from '../engines/stop-evidence.mjs';
import {reduceStop} from '../engines/stop-lifecycle-candidate.mjs';

/** Opt-in accuracy engine, originally the local shadow candidate: no IO or config mutation.
 * Same mapper/renderer/protocol; history is owned by shadow caller or gated DO.
 * Calls MUST have exact line, quay, journey and service-date identities.
 */
export function createStopAccuracyShadow(context, {enabled=false, policy=STOP_POLICY, history=[]}={}) {
  if (!enabled) throw new Error('Shadow comparison requires enabled:true');
  if(context.board.layout!=='station-network')throw new Error('This shadow candidate supports station-network only');
  validateConfiguration(context.board, context.profiles, context.hardware);
  const visits = new Map(history);
  const ranks = {OFF:0,PASSED:1,APPROACHING:2,AT_STOP:3,PARKED:4};
  return {
    snapshot() { return structuredClone([...visits]); },
    get historySize() { return visits.size; },
    step({now, vehicles=[], calls=[]}) {
      const {board,profiles} = context;
      for (const [key,value] of visits) if (now-value.lastSeen > policy.retentionMs) visits.delete(key);
      const diagnostics=[], candidates=[], touched=new Set();
      const accept = (key, node, profile, identity, destination, evidence, meters, lat, lon) => {
        const before=visits.get(key);
        const next=reduceStop(before,evidence,now,{enabled:true,policy});
        visits.set(key,{...next,nodeId:node.id}); touched.add(key);
        diagnostics.push({key,vehicleId:identity,lineId:profile.line.id,logicalLed:node.led,
          source:evidence.source,observationTime:evidence.observedAt,distanceMeters:meters,
          etaSeconds:evidence.etaSeconds,speedMetersPerSecond:evidence.speed,
          state:next.state,reason:next.reason,confidence:next.confidence});
        if (next.state !== 'OFF') candidates.push({id:node.led, profile,vehicleId:identity,destination,
          updated:evidence.observedAt,state:next.state,meters:meters ?? 0,lat,lon});
      };
      // Dedupe fresh identity before interpretation; same timestamp cannot confirm dwell.
      const unique=new Map();
      for(const v of vehicles) if(v.id && (!unique.has(v.id) || Date.parse(v.timestamp)>Date.parse(unique.get(v.id).timestamp))) unique.set(v.id,v);
      for(const v of unique.values()) {
        const profile=profiles.find(p=>v.lineId ? p.line.id===v.lineId : String(p.line.publicCode)===String(v.publicCode) && p.provider?.codespaceId===v.providerCodespace);
        if(!profile || !v.destination?.trim() || !vehicleAllowedByBoard(board,profile,v.destination)) continue;
        const nodes=board.nodes.filter(n=>n.routes.includes(profile.id) && matchesDirection(n,profile,v.destination));
        const position={lat:v.latitude,lon:v.longitude};
        if(typeof position.lat!=='number' || typeof position.lon!=='number' || !Number.isFinite(position.lat) || !Number.isFinite(position.lon)) continue;
        nodes.sort((a,b)=>distance(position,a)-distance(position,b));
        let node=nodes[0]; if(!node) continue;
        const key=JSON.stringify(['GPS',profile.line.id,v.id,v.journeyId || '',v.destination]);
        const before=visits.get(key);
        const oldNode=nodes.find(n=>n.id===before?.nodeId);
        // Keep the stop anchor during departure, but release on a clear route advance.
        if(oldNode && distance(position,oldNode)<=policy.approachMeters && ['AT_STOP','PARKED'].includes(before?.state)) node=oldNode;
        if(before && (before.nodeId!==node.id || (before.departedAt!=null && distance(position,node)>policy.approachMeters))) visits.delete(key);
        const observation={...position,observedAt:Date.parse(v.timestamp),distanceMeters:distance(position,node),directionMatched:true};
        accept(key,node,profile,v.id,v.destination,gpsEvidence(observation,visits.get(key)?.observation,now,policy),observation.distanceMeters,position.lat,position.lon);
      }
      const callKeys=new Set();
      for(const call of [...calls].sort((a,b)=>b.receivedAt-a.receivedAt)) {
        const profile=profiles.find(p=>p.line.id===call.lineId);
        if(!profile || !call.id || !/^\d{4}-\d{2}-\d{2}$/.test(call.serviceDate || '') || !call.destination?.trim()) continue;
        const node=board.nodes.find(n=>n.routes.includes(profile.id) && (n.stopIds || []).includes(call.quayId) && matchesDirection(n,profile,call.destination));
        if(!node) continue;
        const key=JSON.stringify(['CALL',call.lineId,call.id,call.serviceDate,call.quayId]);
        if(callKeys.has(key)) continue; callKeys.add(key);
        accept(key,node,profile,call.id,call.destination,callEvidence(call,now,policy),null);
      }
      // A missing record is not a physical departure; history retained for jitter/replays.
      for(const [key,before] of visits) if(!touched.has(key) && before.state!=='OFF') {
        visits.set(key,{...before,state:'OFF',observation:null,nearSince:null,outwardCount:0});
        diagnostics.push({key,state:'OFF',reason:'observation absent; no inferred departure',source:before.source});
      }
      const strongest=new Map(),occupantsByLed=new Map();
      for(const item of candidates) {
        const list=occupantsByLed.get(item.id)||[]; list.push(item); occupantsByLed.set(item.id,list);
        const old=strongest.get(item.id);
        if(!old || ranks[item.state]>ranks[old.state] || ranks[item.state]===ranks[old.state] && item.meters<old.meters) strongest.set(item.id,item);
      }
      const frame=renderStationFrame({...context,now},mapLedStates(context,{strongest,occupantsByLed}));
      // Preserve the existing v1 lifecycle encoding (AT_STOP + lifecycle PASSED).
      for(const led of frame.leds) if(led.state==='PASSED') {
        led.state='AT_STOP'; led.lifecycle='PASSED';
        led.brightness=Math.min(led.brightness,context.signalPolicy.afterglowBrightness);
      }
      for(const led of frame.leds) if(led.state==='PARKED') {
        led.state='AT_STOP';led.lifecycle='PARKED';led.rgb=[...context.signalPolicy.parkedRgb];
      }
      assertPixelFrame(frame,{expectedBoardProfile:board.id,expectedLedCount:context.hardware.leds.count,now});
      return {frame,diagnostics};
    }
  };
}

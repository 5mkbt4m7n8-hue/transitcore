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
  const proximity=policy.mode==='gps-proximity-v1';
  const gpsProfile=v=>context.profiles.find(p=>
    (v.lineId?p.line.id===v.lineId:String(p.line.publicCode)===String(v.publicCode)&&p.provider?.codespaceId===v.providerCodespace)&&
    (!v.providerCodespace||v.providerCodespace===p.provider?.codespaceId));
  // Vehicle identity survives headsign, direction and journey metadata changes.
  // Current GPS adapter has no verified journey identity. Keep stop-visit safety
  // at vehicle scope even when a future adapter supplies a different journeyId.
  const vehicleKey=(v,p)=>JSON.stringify(['GPS_PROXIMITY_V1',p.provider?.vehicleEndpoint||v.provider||'',
    p.provider?.codespaceId||v.providerCodespace||'',p.line.id,v.id]);
  const exitRecord=(at,meters)=>({departedAt:at,...(meters>policy.approachMeters?{outsideAt:at}:{})});
  const ranks = {OFF:0,PASSED:1,APPROACHING:2,AT_STOP:3,PARKED:4};
  return {
    snapshot() { return structuredClone([...visits]); },
    get historySize() { return visits.size; },
    step({now, vehicles=[], calls=[]}) {
      const {board,profiles} = context;
      for (const [key,value] of visits) if (now-value.lastSeen > policy.retentionMs &&
          !(proximity&&(value.zoneEntered||Object.keys(value.departedNodes||{}).length))) visits.delete(key);
      const diagnostics=[], candidates=[], touched=new Set();
      const accept = (key, node, profile, identity, destination, evidence, meters, lat, lon) => {
        const before=visits.get(key);
        const next=reduceStop(before,evidence,now,{enabled:true,policy});
        if(proximity){
          next.stateChangedAt=before?.state===next.state?before.stateChangedAt??now:now;
          next.departedNodes={...before?.departedNodes};
          if(next.departedAt!=null&&!next.departedNodes[node.id])next.departedNodes[node.id]=exitRecord(next.departedAt,meters);
        }
        visits.set(key,{...next,nodeId:node.id}); touched.add(key);
        diagnostics.push({key,vehicleId:identity,lineId:profile.line.id,logicalLed:node.led,
          source:evidence.source,observationTime:evidence.observedAt,distanceMeters:meters,
          etaSeconds:evidence.etaSeconds,speedMetersPerSecond:evidence.speed,
          state:next.state,reason:next.reason,confidence:next.confidence,
          ...(proximity?{mode:policy.mode,observationAgeMs:Number.isFinite(evidence.observedAt)?now-evidence.observedAt:null,
            frameGeneratedAt:now,stateChangedAt:next.stateChangedAt,
            physicalLed:context.hardware.assignments.find(a=>a.logicalLed===node.led)?.physicalLed}: {})});
        if (next.state !== 'OFF') candidates.push({id:node.led, profile,vehicleId:identity,destination,
          updated:evidence.observedAt,state:next.state,meters:meters ?? 0,lat,lon});
      };
      // Dedupe fresh identity before interpretation; same timestamp cannot confirm dwell.
      const unique=new Map();
      for(const v of vehicles) {
        const profile=proximity?gpsProfile(v):null;
        if(proximity&&!profile)continue;
        const identity=proximity?vehicleKey(v,profile):context.unifiedBus?JSON.stringify([v.providerCodespace,v.lineId||v.publicCode,v.id,v.journeyId]):v.id;
        const previous=unique.get(identity),timestamp=Date.parse(v.timestamp);
        if(v.id && (!previous || timestamp>Date.parse(previous.timestamp) ||
            proximity&&Number.isFinite(timestamp)&&!Number.isFinite(Date.parse(previous.timestamp))))unique.set(identity,v);
      }
      for(const v of unique.values()) {
        const profile=proximity?gpsProfile(v):profiles.find(p=>v.lineId ? p.line.id===v.lineId : String(p.line.publicCode)===String(v.publicCode) && p.provider?.codespaceId===v.providerCodespace);
        if(!profile || !v.destination?.trim() || !vehicleAllowedByBoard(board,profile,v.destination)) continue;
        let nodes=board.nodes.filter(n=>n.routes.includes(profile.id) && matchesDirection(n,profile,v.destination));
        if(proximity){
          // A headsign can mention the opposite destination as an intermediate
          // place ("A via B"). Prefer its first configured destination match;
          // adding intermediate text must not switch the physical quay.
          const text=v.destination.toLowerCase();
          const firstMatch=n=>Math.min(...(n.routeDirections?.[profile.id]?.destinationMatches||[])
            .map(value=>text.indexOf(value.toLowerCase())).filter(index=>index>=0));
          const first=Math.min(...nodes.map(firstMatch));
          if(Number.isFinite(first))nodes=nodes.filter(n=>firstMatch(n)===first);
        }
        const position={lat:v.latitude,lon:v.longitude};
        if(typeof position.lat!=='number' || typeof position.lon!=='number' || !Number.isFinite(position.lat) || !Number.isFinite(position.lon)) {
          if(context.unifiedBus)diagnostics.push({vehicleId:v.id,lineId:profile.line.id,source:'GPS',observationTime:Date.parse(v.timestamp),state:'OFF',confidence:'unknown',reason:'missing/invalid GPS coordinates'});
          continue;
        }
        nodes.sort((a,b)=>distance(position,a)-distance(position,b));
        let node=nodes[0]; if(!node) continue;
        const key=proximity?vehicleKey(v,profile):JSON.stringify(['GPS',profile.line.id,v.id,v.journeyId || '',v.destination]);
        let before=visits.get(key);
        const oldNode=(proximity?board.nodes:nodes).find(n=>n.id===before?.nodeId);
        if(proximity){
          const observedAt=Date.parse(v.timestamp);
          const oldDirectionEligible=oldNode&&nodes.some(n=>n.id===oldNode.id);
          // Duplicate timestamps cannot move the anchor. A fresh direction change
          // may select another quay, but cannot clear the previous quay's latch.
          if(oldNode&&(oldDirectionEligible&&before.zoneEntered&&distance(position,oldNode)<=policy.exitMeters||observedAt<=before.observedAt))node=oldNode;
          let observation={...position,observedAt,distanceMeters:distance(position,node),directionMatched:true};
          const prior=before?.observation?{...before.observation,distanceMeters:distance(before.observation,node)}:null;
          let evidence=gpsEvidence(observation,prior,now,policy);
          if(oldNode&&evidence.invalid&&node.id!==oldNode.id){
            node=oldNode;observation={...observation,distanceMeters:distance(position,node)};
            evidence=gpsEvidence(observation,before.observation,now,policy);
          }
          if(before&&!evidence.invalid&&!evidence.repeated){
            const departedNodes={...before.departedNodes};
            for(const id of Object.keys(departedNodes)){
              const departedNode=board.nodes.find(n=>n.id===id);if(!departedNode)continue;
              const meters=distance(position,departedNode);
              const record=typeof departedNodes[id]==='number'?{departedAt:departedNodes[id]}:departedNodes[id];
              if(meters>policy.approachMeters)departedNodes[id]={...record,outsideAt:observedAt};
              // A new visit requires BOTH an observed >250m exit and a later,
              // continuous inward sample. A headsign/trip change is insufficient.
              else if(record.outsideAt!=null&&observedAt>record.outsideAt&&evidence.continuous&&
                  distance(before.observation,departedNode)-meters>1)delete departedNodes[id];
            }
            if(oldNode&&before.nodeId!==node.id&&before.zoneEntered)
              departedNodes[oldNode.id]=exitRecord(observedAt,distance(position,oldNode));
            before={...before,departedNodes,
              ...(before.nodeId!==node.id?{state:'OFF',zoneEntered:false,nodeId:node.id,stateChangedAt:now}:{}),
              departedAt:departedNodes[node.id]?.departedAt??(typeof departedNodes[node.id]==='number'?departedNodes[node.id]:null)};
            visits.set(key,before);
          }
          accept(key,node,profile,v.id,v.destination,evidence,observation.distanceMeters,position.lat,position.lon);
          continue;
        }
        // Keep the stop anchor during departure, but release on a clear route advance.
        if(oldNode && distance(position,oldNode)<=policy.approachMeters && ['AT_STOP','PARKED'].includes(before?.state)) node=oldNode;
        if(before && (before.nodeId!==node.id || (before.departedAt!=null && distance(position,node)>policy.approachMeters))) visits.delete(key);
        const observation={...position,observedAt:Date.parse(v.timestamp),distanceMeters:distance(position,node),directionMatched:true};
        accept(key,node,profile,v.id,v.destination,gpsEvidence(observation,visits.get(key)?.observation,now,policy),observation.distanceMeters,position.lat,position.lon);
      }
      const callKeys=new Set();
      for(const call of (proximity?[]:[...calls]).sort((a,b)=>b.receivedAt-a.receivedAt)) {
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
        visits.set(key,{...before,state:'OFF',observation:proximity?before.observation:null,nearSince:null,outwardCount:0,...(proximity?{stateChangedAt:now}:{})});
        diagnostics.push({key,state:'OFF',reason:'observation absent; no inferred departure',source:before.source,
          ...(proximity?{mode:policy.mode,stateChangedAt:now,frameGeneratedAt:now,observationTime:before.observedAt,
            observationAgeMs:Number.isFinite(before.observedAt)?now-before.observedAt:null}: {})});
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

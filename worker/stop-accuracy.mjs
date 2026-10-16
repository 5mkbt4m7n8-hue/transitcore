import {createStopAccuracyShadow} from '../core/frame/stop-accuracy-shadow.mjs';

export const STOP_ACCURACY_MODE='motion-v1';
export function usesStopAccuracy(board) { return board.render?.stopAccuracy===STOP_ACCURACY_MODE; }

export function eligibleBusBoard(board, profiles) {
  return board.layout==='station-network' && profiles.length>0 && profiles.every(p=>p.line?.mode==='bus');
}
// Explicit IDs only: no wildcard/global enable. Invalid input fails closed.
export function busAllowlist(env={}) {
  const value=env.BUS_LIFECYCLE_BOARDS;
  if(typeof value!=='string'||value.length>4096)return [];
  const ids=value.split(',').map(x=>x.trim()).filter(Boolean);
  return ids.every(id=>/^[a-z0-9-]{3,120}$/.test(id))?[...new Set(ids)]:[];
}
export function usesUnifiedBus(board, profiles, env={}) {
  return busAllowlist(env).includes(board.id) && eligibleBusBoard(board,profiles);
}

export async function stopContextDigest({board,hardware,profiles}) {
  const bytes=new TextEncoder().encode(JSON.stringify([board,hardware,profiles,'unified-bus-v1']));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}

// Durable Object owns both history and the shared frame. Browser/ESP requests
// in the same 10 s window read the same result; extra viewers cannot advance it.
export function buildStopAccuracy(context, saved) {
  const {board,now,profiles}=context;
  const unified=context.unifiedBus===true;
  if(!usesStopAccuracy(board) && !unified)throw Error('Stop accuracy not enabled');
  if(unified && !eligibleBusBoard(board,profiles))throw Error('Unsupported unified bus context');
  if(board.layout!=='station-network' || !unified && profiles.some(p=>p.positioning?.strategy==='estimated-station-calls'))
    throw Error('motion-v1 activation supports GPS station boards only');
  if(unified && !/^[a-f0-9]{64}$/.test(context.bindingDigest||''))throw Error('Missing context digest');
  const binding=unified?context.bindingDigest:JSON.stringify([board.profileFingerprint,board,context.hardware,profiles]);
  const previous=saved?.binding===binding?saved:null;
  if(previous && now>=previous.builtAt && now-previous.builtAt<10000)return {frame:previous.frame,saved:previous,reused:true};
  const vehicles=(context.vehicles||[]).map(v=>{
    const matches=profiles.filter(p=>String(p.line.publicCode)===String(v.publicCode));
    return {...v,providerCodespace:v.providerCodespace || (matches.length===1?matches[0].provider.codespaceId:undefined)};
  });
  const engine=createStopAccuracyShadow(context,{enabled:true,history:previous?.history || []});
  const calls=(context.calls||[]).map(call=> {
    // An expired forecast is not physical arrival/departure evidence. Keep this
    // uncertainty in diagnostics; v1 has no UNKNOWN LED state, so uncertain is OFF.
    const elapsed=call.actualArrival==null
      ? call.expectedArrival==null || call.expectedArrival<=now
      : now>=(call.expectedDeparture??call.actualArrival+20000);
    if(unified && call.actualDeparture==null && elapsed)
      return {...call,uncertainReason:'forecast expired without confirmed physical event'};
    return call;
  });
  const {frame,diagnostics}=engine.step({now,vehicles,calls});
  frame.signalPolicy=context.signalPolicy;
  return {frame,diagnostics,saved:{binding,builtAt:now,history:engine.snapshot(),frame,
    ...(unified?{diagnostics:diagnostics.slice(0,512),diagnosticCount:diagnostics.length}: {})},reused:false};
}

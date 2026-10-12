import {createStopAccuracyShadow} from '../core/frame/stop-accuracy-shadow.mjs';

export const STOP_ACCURACY_MODE='motion-v1';
export function usesStopAccuracy(board) { return board.render?.stopAccuracy===STOP_ACCURACY_MODE; }

// Durable Object owns both history and the shared frame. Browser/ESP requests
// in the same 10 s window read the same result; extra viewers cannot advance it.
export function buildStopAccuracy(context, saved) {
  const {board,now,profiles}=context;
  if(!usesStopAccuracy(board))throw Error('Stop accuracy not enabled');
  if(board.layout!=='station-network' || profiles.some(p=>p.positioning?.strategy==='estimated-station-calls'))
    throw Error('motion-v1 activation supports GPS station boards only');
  const binding=JSON.stringify([board.profileFingerprint,board,context.hardware,profiles]);
  const previous=saved?.binding===binding?saved:null;
  if(previous && now>=previous.builtAt && now-previous.builtAt<10000)return {frame:previous.frame,saved:previous,reused:true};
  const vehicles=context.vehicles.map(v=>{
    const matches=profiles.filter(p=>String(p.line.publicCode)===String(v.publicCode));
    return {...v,providerCodespace:matches.length===1?matches[0].provider.codespaceId:undefined};
  });
  const engine=createStopAccuracyShadow(context,{enabled:true,history:previous?.history || []});
  const {frame}=engine.step({now,vehicles});
  frame.signalPolicy=context.signalPolicy;
  return {frame,saved:{binding,builtAt:now,history:engine.snapshot(),frame},reused:false};
}

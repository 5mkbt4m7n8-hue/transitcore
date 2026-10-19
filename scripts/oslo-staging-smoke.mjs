import assert from 'node:assert/strict';
import {validatePixelFrame} from '../core/models/pixel-frame.mjs';
export const URL_BASE='https://transitcore-oslo-staging.lgb84.workers.dev';
export const FRAME_PATH='/api/v1/frame/oslo-metro-wizard-separate';
export function checkFrame(frame,outcome,now=Date.now()){
 assert(validatePixelFrame(frame,{expectedBoardProfile:'oslo-metro-wizard-separate',expectedLedCount:201,now}).valid,'Invalid Oslo PixelFrame');
 assert(Date.parse(frame.generatedAt)<=now+5000,'Future frame');
 const active=frame.leds.filter(l=>l.state!=='OFF');
 assert(active.length?outcome==='ACTIVE':['VALID_EMPTY','FILTERED_EMPTY'].includes(outcome),'Invalid source outcome');
 for(const led of active){
  for(const value of [led.vehicle,...(led.occupants||[])]){
   assert(value&&typeof value.id==='string'&&value.id.length>0,'Missing journey identity');
   assert(['1','2','3','4','5'].includes(value.line),'Invalid metro line');
   assert(typeof value.destination==='string'&&value.destination.length>0,'Missing destination');
   assert(['realtime-stop-forecast','reported-actual-arrival','reported-actual-departure'].includes(value.positionType),'Invalid evidence');
   if((value.state||led.state)==='PASSED')assert.equal(value.positionType,'reported-actual-departure');
  }
 }
}
export async function smoke(sha,token,{fetchImpl=fetch}={}){
 const headers={authorization:'Bearer '+token};
 const get=(pathname,auth=true)=>fetchImpl(URL_BASE+pathname,{headers:auth?headers:{},signal:AbortSignal.timeout(15000),redirect:'error'});
 const response=await get(FRAME_PATH);
 // No body/error payload is printed. Fail safely rather than redeploying on failure.
 console.log(JSON.stringify({event:'oslo-smoke',status:response.status,environmentMatch:response.headers.get('x-transitcore-environment')==='isolated-oslo-staging',shaMatch:response.headers.get('x-transitcore-source-sha')===sha}));
 assert.equal(response.status,200);assert.equal(response.headers.get('x-transitcore-environment'),'isolated-oslo-staging');
 assert.equal(response.headers.get('x-transitcore-source-sha'),sha);
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
  if(bytes>256*1024){await reader.cancel();throw Error('Frame too large');}chunks.push(Buffer.from(value));}
 const body=Buffer.concat(chunks).toString('utf8');
 let frame;try{frame=JSON.parse(body);}catch{throw Error('Invalid frame JSON');}
 checkFrame(frame,response.headers.get('x-transitcore-source-outcome'));
 assert.equal((await get(FRAME_PATH,false)).status,401);
 for(const route of ['/api/v1/device/status','/api/v1/ota/test','/v1/publish','/api/v1/frame/trondheim-bus-board'])assert.equal((await get(route)).status,404);
}

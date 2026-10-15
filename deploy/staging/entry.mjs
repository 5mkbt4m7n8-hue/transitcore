// STAGING ONLY: bundled candidate profiles, isolated DO namespace, frame-only public surface.
import {DeviceStatus,SIGNAL_POLICY,defaultHardware,validateConfiguration,attachProfileIdentity} from '../../worker/led-feed-worker.mjs';
import {usesUnifiedBus} from '../../worker/stop-accuracy.mjs';
import b0 from '../../config/boards/trondheim-bus-1-visual-test.json' with {type:'json'};
import h0 from '../../config/hardware/trondheim-bus-1-visual-test-hardware.json' with {type:'json'};
import b1 from '../../config/boards/trondheim-bus-board.json' with {type:'json'};
import h1 from '../../config/hardware/trondheim-bus-board-hardware.json' with {type:'json'};
import b2 from '../../config/boards/trondheim-shared-stops-board.json' with {type:'json'};
import h2 from '../../config/hardware/trondheim-shared-stops-board-hardware.json' with {type:'json'};
import b3 from '../../config/boards/trondheim-city-lines-catalog.json' with {type:'json'};
import b4 from '../../config/boards/trondheim-flybuss-live.json' with {type:'json'};
import h4 from '../../config/hardware/trondheim-flybuss-live-hardware.json' with {type:'json'};
import r0 from '../../config/routes/atb-bus-1-live.json' with {type:'json'};
import r1 from '../../config/routes/atb-bus-2-live.json' with {type:'json'};
import r2 from '../../config/routes/atb-bus-3-live.json' with {type:'json'};
import r3 from '../../config/routes/atb-bus-10-live.json' with {type:'json'};
import r4 from '../../config/routes/atb-bus-11-live.json' with {type:'json'};
import r5 from '../../config/routes/atb-bus-12-live.json' with {type:'json'};
import r6 from '../../config/routes/atb-bus-13-live.json' with {type:'json'};
import r7 from '../../config/routes/atb-bus-14-live.json' with {type:'json'};
import r8 from '../../config/routes/atb-bus-15-live.json' with {type:'json'};
import r9 from '../../config/routes/atb-bus-16-live.json' with {type:'json'};
import r10 from '../../config/routes/atb-bus-18-live.json' with {type:'json'};
import r11 from '../../config/routes/atb-bus-20-live.json' with {type:'json'};
import r12 from '../../config/routes/atb-bus-21-live.json' with {type:'json'};
import r13 from '../../config/routes/atb-bus-22-live.json' with {type:'json'};
import r14 from '../../config/routes/atb-bus-23-live.json' with {type:'json'};
import r15 from '../../config/routes/atb-bus-25-live.json' with {type:'json'};
import r16 from '../../config/routes/atb-bus-28-live.json' with {type:'json'};
import r17 from '../../config/routes/atb-bus-40-live.json' with {type:'json'};
import r18 from '../../config/routes/atb-bus-41-live.json' with {type:'json'};
import r19 from '../../config/routes/atb-bus-42-live.json' with {type:'json'};
import r20 from '../../config/routes/atb-bus-43-live.json' with {type:'json'};
import r21 from '../../config/routes/atb-bus-44-live.json' with {type:'json'};
import r22 from '../../config/routes/atb-bus-45-live.json' with {type:'json'};
import r23 from '../../config/routes/atb-bus-46-live.json' with {type:'json'};
import r24 from '../../config/routes/atb-bus-50-live.json' with {type:'json'};
import r25 from '../../config/routes/atb-bus-51-live.json' with {type:'json'};
import r26 from '../../config/routes/atb-bus-52-live.json' with {type:'json'};
import r27 from '../../config/routes/atb-bus-53-live.json' with {type:'json'};
import r28 from '../../config/routes/atb-bus-54-live.json' with {type:'json'};
import r29 from '../../config/routes/atb-bus-70-live.json' with {type:'json'};
import r30 from '../../config/routes/atb-bus-71-live.json' with {type:'json'};
import r31 from '../../config/routes/atb-bus-72-live.json' with {type:'json'};
import r32 from '../../config/routes/atb-bus-73-live.json' with {type:'json'};
import r33 from '../../config/routes/atb-bus-74-live.json' with {type:'json'};
import r34 from '../../config/routes/atb-bus-75-live.json' with {type:'json'};
import r35 from '../../config/routes/atb-bus-76-live.json' with {type:'json'};
import r36 from '../../config/routes/atb-bus-77-live.json' with {type:'json'};
import r37 from '../../config/routes/atb-bus-78-live.json' with {type:'json'};
import r38 from '../../config/routes/atb-bus-79-live.json' with {type:'json'};
import r39 from '../../config/routes/atb-bus-80-live.json' with {type:'json'};
import r40 from '../../config/routes/atb-bus-81-live.json' with {type:'json'};
import r41 from '../../config/routes/atb-bus-82-live.json' with {type:'json'};
import r42 from '../../config/routes/atb-bus-83-live.json' with {type:'json'};
import r43 from '../../config/routes/atb-bus-85-live.json' with {type:'json'};
import r44 from '../../config/routes/atb-bus-86-live.json' with {type:'json'};
import r45 from '../../config/routes/atb-bus-91-live.json' with {type:'json'};
import r46 from '../../config/routes/atb-bus-92-live.json' with {type:'json'};
import r47 from '../../config/routes/flybuss-trondheim-fb73-live.json' with {type:'json'};
const boards=[b0,b1,b2,b3,b4],routes=[r0,r1,r2,r3,r4,r5,r6,r7,r8,r9,r10,r11,r12,r13,r14,r15,r16,r17,r18,r19,r20,r21,r22,r23,r24,r25,r26,r27,r28,r29,r30,r31,r32,r33,r34,r35,r36,r37,r38,r39,r40,r41,r42,r43,r44,r45,r46,r47];
const hardware=new Map([[b0.id,h0],[b1.id,h1],[b2.id,h2],[b4.id,h4]]);
export class UnifiedBusStaging extends DeviceStatus {}
const configurations=new Map();
export async function stagingConfiguration(id){
 if(configurations.has(id))return configurations.get(id);
 const source=boards.find(b=>b.id===id);if(!source)return null;
 const board=structuredClone(source),profiles=board.routes.map(id=>routes.find(p=>p.id===id));
 const hw=structuredClone(hardware.get(id)||defaultHardware(board));
 validateConfiguration(board,profiles,hw);await attachProfileIdentity(board,hw);
 const result={board,profiles,hardware:hw};configurations.set(id,result);return result;
}
export default {async fetch(request,env){
 if(!env.STAGING_ACCESS_TOKEN || request.headers.get('authorization')!==`Bearer ${env.STAGING_ACCESS_TOKEN}`)return new Response('Unauthorized',{status:401});
 const started=Date.now(),url=new URL(request.url);
 const match=url.pathname.match(/^\/api\/v1\/frame\/([a-z0-9-]+)(\/diagnostics)?$/);
 if(request.method!=='GET'||!match)return new Response('Staging frame-only endpoint',{status:404});
 const config=await stagingConfiguration(match[1]);
 if(!config||!usesUnifiedBus(config.board,config.profiles,env))return new Response('Board not enabled in isolated staging',{status:404});
 if(!env.DEVICE_STATUS)return new Response('Staging storage missing',{status:503});
 try{
  const stub=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(config.board.id));
  const response=match[2]
   ? await stub.fetch('https://staging.internal/stop-accuracy-diagnostics?board='+config.board.id)
   : await stub.fetch('https://staging.internal/stop-accuracy',{method:'POST',body:JSON.stringify({...config,now:Date.now(),unifiedBus:true,signalPolicy:SIGNAL_POLICY})});
  const headers=new Headers(response.headers);headers.set('access-control-allow-origin','*');headers.set('x-transitcore-stop-algorithm','unified-bus-v1');headers.set('x-transitcore-environment','isolated-staging');headers.set('x-transitcore-source-sha',env.STAGING_COMMIT_SHA||'local');
  // Wall time is NOT CPU time. Collect CPU/subrequests/storage from Cloudflare observability.
  console.log(JSON.stringify({event:'staging-frame',boardId:config.board.id,status:response.status,wallMs:Date.now()-started}));
  return new Response(response.body,{status:response.status,headers});
 }catch{console.log(JSON.stringify({event:'staging-frame',boardId:config.board.id,status:503,wallMs:Date.now()-started}));return new Response('Staging upstream unavailable',{status:503});}
}};

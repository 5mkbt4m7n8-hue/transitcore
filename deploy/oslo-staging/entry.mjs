// Authenticated frame-only wrapper. No delegation to the production request router.
import {liveMetroStationArrivals, SIGNAL_POLICY, validateConfiguration, attachProfileIdentity} from '../../worker/led-feed-worker.mjs';
import {buildPixelFrame} from '../../core/frame/build-frame.mjs';
import boardSource from '../../config/boards/oslo-metro-wizard-separate.json' with {type:'json'};
import hardwareSource from '../../config/hardware/oslo-metro-wizard-separate-hardware.json' with {type:'json'};
import r1 from '../../config/routes/rut-metro-1-live.json' with {type:'json'};
import r2 from '../../config/routes/rut-metro-2-live.json' with {type:'json'};
import r3 from '../../config/routes/rut-metro-3-live.json' with {type:'json'};
import r4 from '../../config/routes/rut-metro-4-live.json' with {type:'json'};
import r5 from '../../config/routes/rut-metro-5-live.json' with {type:'json'};
const board=structuredClone(boardSource),hardware=structuredClone(hardwareSource),profiles=[r1,r2,r3,r4,r5];
let ready;
export default {async fetch(request,env){
 if(!env.OSLO_STAGING_ACCESS_TOKEN||request.headers.get('authorization')!==`Bearer ${env.OSLO_STAGING_ACCESS_TOKEN}`)
  return new Response('Unauthorized',{status:401,headers:{'cache-control':'no-store'}});
 const url=new URL(request.url);
 if(request.method!=='GET'||url.search||url.pathname!=='/api/v1/frame/oslo-metro-wizard-separate')
  return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
 const diagnostics={},now=Date.now();
 const headers={'content-type':'application/json','cache-control':'no-store',
  'x-transitcore-environment':'isolated-oslo-staging','x-transitcore-source-sha':env.OSLO_STAGING_COMMIT_SHA||'local'};
 try{
  ready??=(async()=>{
   if(profiles.some(p=>p.positioning?.endpoint!=='https://api.entur.io/journey-planner/v3/graphql'))throw Error('Unapproved upstream');
   validateConfiguration(board,profiles,hardware);await attachProfileIdentity(board,hardware);board.hardware=hardware;
  })();
  await ready;
  // No environment/bindings passed into the shared engine. All profiles are bundled.
  const estimatedCalls=await liveMetroStationArrivals(board,profiles,now,diagnostics);
  const frame=buildPixelFrame({board,profiles,hardware,estimatedCalls,now,signalPolicy:SIGNAL_POLICY},{strategy:'estimated-calls',validate:true});
  headers['x-transitcore-source-outcome']=diagnostics.outcome;
  return new Response(JSON.stringify(frame),{headers});
 }catch{
  headers['x-transitcore-source-outcome']=diagnostics.outcome||'FRAME_ERROR';
  return new Response(JSON.stringify({error:'feed_unavailable',generatedAt:new Date(now).toISOString()}),{status:503,headers});
 }
}};

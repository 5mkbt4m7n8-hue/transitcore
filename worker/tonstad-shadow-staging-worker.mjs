// Dedicated staging worker, NEVER a production LED endpoint.
// No cron, device bindings, routes or production DO namespace.
// Requires manually provisioned STAGING_PROBE_TOKEN (>=32 chars).
import {runTonstadStagingProbe} from './tonstad-shadow-probe.mjs';

const COOLDOWN_MS=120000;
const headers={'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff'};
const json=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers});
const denial=(reason,status)=>json({
 mode:'isolated-manual-staging',status:'NO_GO',
 eligibleForProduction:false,reason
},status);
const encoder=new TextEncoder();
async function equalSecret(expected,received) {
 if(typeof expected!=='string'||expected.length<32||
  typeof received!=='string'||received.length<32)return false;
 const [a,b]=await Promise.all([expected,received].map(s=>
  crypto.subtle.digest('SHA-256',encoder.encode(s))));
 const x=new Uint8Array(a),y=new Uint8Array(b);let mismatch=0;
 for(let i=0;i<x.length;i++)mismatch|=x[i]^y[i];
 return mismatch===0;
}

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')
   return denial('staging-no-public-feed',200);
  if(url.pathname!=='/v1/probe'||request.method!=='POST')
   return denial('no-such-route',404);
  if(!await equalSecret(env?.STAGING_PROBE_TOKEN,request.headers.get('x-probe-token')))
   return denial('unauthorized',403);
  if(!env?.TONSTAD_GATE?.idFromName||!env?.TONSTAD_GATE?.get)
   return denial('staging-gate-not-configured',503);
  // This fixed-name DO is the ONLY gate for ALL datacenters/isolates.
  const stub=env.TONSTAD_GATE.get(env.TONSTAD_GATE.idFromName('tonstad-shadow-v1'));
  try{
   return await stub.fetch(new Request('https://internal.invalid/probe',{method:'POST'}));
  }catch{
   // Never log internal errors, identities, headers or source payloads.
   return denial('staging-gate-unavailable',503);
  }
 }
};

export class TonstadStagingGate {
 constructor(state,env){
  this.state=state;this.env=env;
  this.fetcher=fetch; // injected in local tests only
 }
 async fetch(request) {
  if(request.method!=='POST'||new URL(request.url).pathname!=='/probe')
   return denial('no-such-route',404);
  const now=Date.now();
  // Durable, atomic reservation. Denied requests never query Entur.
  // Record timestamp BEFORE calling Entur; network failure still cools down.
  let granted=false;
  try{
   await this.state.storage.transaction(async storage=>{
    const last=await storage.get('lastAttemptAt');
    if(typeof last==='number'&&now-last<COOLDOWN_MS){
     return;
    }
    await storage.put('lastAttemptAt',now);
    granted=true;
   });
  }catch{return denial('staging-gate-storage-unavailable',503);}
  if(!granted)return denial('cooldown-120s',429);
  try{
   return json(await runTonstadStagingProbe({fetcher:this.fetcher,now}));
  }catch{return denial('staging-source-unavailable',503);}
 }
}

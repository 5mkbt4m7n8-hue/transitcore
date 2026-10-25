// Read-only network probe for a deployed line 1 GPS Worker and browser CORS.
// Never log vehicle identities, positions or raw provider responses.
const worker='https://transitcore-led-feed.lgb84.workers.dev/api/v1/vehicles/atb-line-1';
const provider='https://api.entur.io/realtime/v2/vehicles/graphql';
const origin='https://5mkbt4m7n8-hue.github.io';
const probes={};
try{
 const result=await fetch(worker,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 probes.production={status:result.status,passesRoute:result.status===200||result.status===503,
  cors:result.headers.get('access-control-allow-origin')||null};
 // Successful deployment means either live data (200) or explicit source failure (503).
 // 404/405 is missing route, and 403 could be blocked. Do not claim source is absent.
}catch(error){probes.production={unavailable:error?.name||'network_error'};}
try{
 const result=await fetch(provider,{method:'OPTIONS',headers:{
  Origin:origin,
  'Access-Control-Request-Method':'POST',
  'Access-Control-Request-Headers':'content-type,et-client-name'
 },signal:AbortSignal.timeout(12000)});
 const allowOrigin=result.headers.get('access-control-allow-origin');
 const methods=result.headers.get('access-control-allow-methods')||'';
 const headers=result.headers.get('access-control-allow-headers')||'';
 probes.browserDirectEntur={
  preflightStatus:result.status,
  corsAllowed:result.ok&&(allowOrigin==='*'||allowOrigin===origin)&&
   /POST/i.test(methods)&&/et-client-name/i.test(headers)&&/content-type/i.test(headers),
  allowOrigin:allowOrigin||null,
  postAllowed:/POST/i.test(methods),
  clientNameHeaderAllowed:/et-client-name/i.test(headers),
  contentTypeHeaderAllowed:/content-type/i.test(headers)
 };
}catch(error){probes.browserDirectEntur={unavailable:error?.name||'network_error'};}
console.log(JSON.stringify(probes));
// This is diagnostics, not CI-gating an external live service.

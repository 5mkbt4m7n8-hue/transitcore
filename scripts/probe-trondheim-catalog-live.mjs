// Read-only production/staging verification for the unified Trondheim catalog.
// No credentials, POST requests, vehicle IDs, GPS coordinates, or raw frame output.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const boardId='trondheim-city-lines-catalog';
const expectedCount=1282;
const catalog=JSON.parse(await readFile(new URL('../config/boards/'+boardId+'.json',import.meta.url),'utf8'));
assert.equal(catalog.id,boardId);
assert.equal(catalog.leds.count,expectedCount);
assert(catalog.routes.length>=47,'Expected catalog with 47+ route profiles');
const expected=new Map([['NSR:Quay:73414',616],['NSR:Quay:73415',617]]);
const lerkendal={};
for(const [quay,led] of expected) {
 const node=catalog.nodes.find(node=>node.stopIds?.includes(quay));
 assert(node,'Missing Lerkendal gård quay '+quay);
 assert.equal(node.led,led,'Unexpected Lerkendal gård LED mapping for '+quay);
 assert(node.routes.includes('atb-bus-11-live'),'Line 11 missing at Lerkendal gård '+quay);
 lerkendal[quay]=led;
}
console.log('STATIC_CATALOG '+JSON.stringify({boardId,ledCount:expectedCount,routeProfiles:catalog.routes.length,lerkendalGard:lerkendal}));
const routeAudit={byPositioning:{},missingVehicleProvider:[],missingPositioning:[]};
for(const id of catalog.routes) {
 const profile=JSON.parse(await readFile(new URL('../config/routes/'+id+'.json',import.meta.url),'utf8'));
 const strategy=profile.positioning?.strategy||'missing';
 routeAudit.byPositioning[strategy]=(routeAudit.byPositioning[strategy]||0)+1;
 if(strategy==='missing')routeAudit.missingPositioning.push(id);
 if(strategy!=='estimated-station-calls'&&(!profile.provider?.vehicleEndpoint||!profile.provider?.codespaceId))
  routeAudit.missingVehicleProvider.push(id);
}
console.log('ROUTE_SOURCE_AUDIT '+JSON.stringify(routeAudit));

async function fetchBounded(url){
 const response=await fetch(url,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(18000)});
 let bytes=0;const chunks=[];
 if(response.body)for await(const part of response.body){
  bytes+=part.byteLength;
  if(bytes>2_097_152){await response.body.cancel().catch(()=>{});throw Error('payload_exceeds_2MiB');}
  chunks.push(part);
 }
 const body=Buffer.concat(chunks).toString('utf8');
 return {response,bytes,body};
}
async function probe(label,origin){
 const started=Date.now(),result={environment:label,boardId};
 try {
  const {response,bytes,body}=await fetchBounded(origin+'/api/v1/frame/'+boardId);
  result.http=response.status;result.bytes=bytes;
  result.elapsedMs=Date.now()-started;
  result.cors=response.headers.get('access-control-allow-origin')||null;
  result.contentType=response.headers.get('content-type')||null;
  if(response.status!==200){
   try{const error=JSON.parse(body);result.errorStage=typeof error.stage==='string'?error.stage.slice(0,40):null;}catch{}
   result.verdict='UNAVAILABLE';return result;
  }
  if(!result.contentType?.includes('application/json'))throw Error('invalid_content_type');
  const data=JSON.parse(body);
  assert.equal(data.schemaVersion,1);
  assert.equal(data.boardProfile,boardId);
  assert.equal(data.ledCount,expectedCount);
  assert(Number.isInteger(data.sequence)&&data.sequence>=0,'invalid_sequence');
  assert(Number.isInteger(data.ttlSeconds)&&data.ttlSeconds>0,'invalid_ttl');
  const generated=Date.parse(data.generatedAt);
  assert(Number.isFinite(generated)&&Math.abs(Date.now()-generated)<=180_000,'stale_or_future_frame');
  assert(Array.isArray(data.leds),'invalid_led_array');
  const seen=new Set();
  for(const led of data.leds){
   assert(Number.isInteger(led.id)&&led.id>=0&&led.id<expectedCount,'out_of_range_led');
   assert(!seen.has(led.id),'duplicate_led');
   seen.add(led.id);
   assert(['OFF','AT_STOP','APPROACHING','PASSED','PARKED'].includes(led.state),'invalid_state');
  }
  result.verdict='VALID';
  result.frameAgeSeconds=Math.max(0,Math.round((Date.now()-generated)/1000));
  result.ttlSeconds=data.ttlSeconds;
  result.activeLedCount=data.leds.length;
  result.sequence=data.sequence;
 }catch(error){
  result.verdict='INVALID_OR_UNREACHABLE';
  result.reason=(error?.code||error?.name||'error').slice(0,55);
  const safe=String(error?.message||'');
  if(/^(invalid_|stale_or_future_frame|out_of_range_led|duplicate_led|payload_exceeds_2MiB)/.test(safe))result.reason=safe.slice(0,80);
  result.elapsedMs=Date.now()-started;
 }
 return result;
}
const production=await probe('production','https://transitcore-led-feed.lgb84.workers.dev');
const staging=await probe('linear_staging_gateway','https://transitcore-linear-staging.lgb84.workers.dev');
console.log('LIVE_PROBE '+JSON.stringify(production));
console.log('LIVE_PROBE '+JSON.stringify(staging));
// Public Worker board monitoring contains the actual last error stage. Emit only
// coarse, allowlisted diagnostics; never print raw provider responses or IDs.
if(production.verdict!=='VALID') {
 const diag={boardId,environment:'production'};
 try {
  const {response,body}=await fetchBounded('https://transitcore-led-feed.lgb84.workers.dev/v1/boards/'+boardId+'/history');
  diag.http=response.status;
  if(response.ok){
   const latest=JSON.parse(body)?.latest;
   diag.state=['OK','FEED_ERROR','PROFILE_MISMATCH'].includes(latest?.state)?latest.state:'UNKNOWN';
   diag.source=['request','scheduled','history'].includes(latest?.source)?latest.source:'unknown';
   diag.ageSeconds=latest?.checkedAt&&Number.isFinite(Date.parse(latest.checkedAt))
    ?Math.round((Date.now()-Date.parse(latest.checkedAt))/1000):null;
   const detail=String(latest?.detail||'');
   diag.failureStage=/^(configuration|live_data|motion):/.exec(detail)?.[1]||null;
   diag.routeParityMismatch=detail.includes('Route profile count mismatch');
   diag.upstreamHttpCode=/Upstream HTTP ([45][0-9][0-9])/.exec(detail)?.[1]||null;
   diag.timeout=/timed out|timeout|deadline/i.test(detail);
   diag.providerFormat=/Invalid vehicle response/i.test(detail);
   diag.fetchFailed=/fetch failed/i.test(detail);
   diag.graphqlError=/GraphQL|Cannot query field|Unauthorized|Not authorized|syntax error|resource exhausted/i.test(detail);
   diag.sourceFailure=/provider|fetch|HTTP|timeout|deadline/i.test(detail);
   diag.tokenTermPresent=/token/i.test(detail);
   diag.graphqlComplexityTerm=/complexity|query too large|too many.*token|maximum.*token|query size|too many aliases/i.test(detail);
   diag.authenticationTerm=/authorization|unauthorized|credential|secret|password|api.key/i.test(detail);
   diag.missingVehicleProvider=/Vehicle provider missing for ([a-z0-9-]+)/.exec(detail)?.[1]||null;
   // The monitor is publicly readable. Emit a bounded, redacted description,
   // never URLs, long identifiers, tokens, provider responses or coordinates.
   let safe=detail.slice(0,160).replace(/https?:\/\/[^\s]+/g,'[URL]')
    .replace(/(?:Bearer\s+)[A-Za-z0-9._-]+/gi,'Bearer [REDACTED]')
    .replace(/NSR:(?:Quay|StopPlace):\d+/gi,'[STOP_ID]')
    .replace(/[-+]?\d{1,3}\.\d{4,}/g,'[NUMBER]')
    .replace(/latitud(?:e)?/gi,'[LAT_FIELD]')
    .replace(/longitud(?:e)?/gi,'[LON_FIELD]')
    .replace(/[A-Za-z0-9_-]{32,}/g,'[OPAQUE]');
   if(/secret|token|password|authorization|api.key|cookie/i.test(safe))safe='[REDACTED]';
   diag.safeDetail=safe;
  }
 }catch(e){diag.readError=(e?.name||'network_error').slice(0,40);}
 console.log('PUBLIC_MONITOR '+JSON.stringify(diag));
}
if(production.verdict!=='VALID'){
 console.error('BLOCKED: Production has no validated 1282-point PixelFrame. Do not merge or deploy PR #266.');
 process.exitCode=1;
}
if(staging.verdict!=='VALID')console.warn('STAGING_NOT_VERIFIED: Check gateway before relying on staging for catalog testing.');


// Read-only post-release checks. Never print stored occupants, vehicle IDs,
// provider response bodies, or client-side editing drafts.
async function pageReleaseCheck(){
 const result={url:'Linear GitHub Pages'};
 try{
  const {response,body,bytes}=await fetchBounded('https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/index.html');
  result.http=response.status;result.bytes=bytes;
  result.unified=body.includes('boards/trondheim-city-lines-catalog.json')&&
   !body.includes('boards/trondheim-bus-board.json');
  result.verdict=response.status===200&&result.unified?'VALID':'NOT_YET_PUBLISHED';
 }catch(error){result.verdict='UNAVAILABLE';result.reason=(error?.name||'network').slice(0,40)}
 return result;
}
async function historyReleaseCheck(){
 const result={boardId,source:'public_history'};
 const endpoint='https://transitcore-led-feed.lgb84.workers.dev/v1/trondheim/history';
 try{
  const {response,body}=await fetchBounded(endpoint);
  result.http=response.status;
  if(!response.ok){result.verdict='UNAVAILABLE';return result;}
  const index=JSON.parse(body);
  result.recordingProfile=index.boardProfile||null;
  result.cadenceMinutes=index.cadenceMinutes||null;
  result.currentDay=index.currentDay||null;
  result.availableDays=(index.days||[]).length;
  if(index.boardProfile!==boardId){result.verdict='OLD_RECORDER';return result;}
  const today=(index.days||[]).find(entry=>entry.day===index.currentDay);
  result.todaySamples=today?.count||0;
  if(!today){result.verdict='NO_CURRENT_RECORDS';return result;}
  let records=[],cursor=null,pages=0;
  do {
   if(++pages>24)throw Error('history_pagination_limit');
   const args=new URLSearchParams({day:index.currentDay,limit:'20'});
   if(cursor)args.set('cursor',cursor);
   const data=await fetchBounded(endpoint+'?'+args);
   if(!data.response.ok)throw Error('history_records_http_'+data.response.status);
   const page=JSON.parse(data.body);
   if(!Array.isArray(page.records))throw Error('invalid_history_records');
   records.push(...page.records);
   cursor=page.nextCursor||null;
  }while(cursor);
  const activated=Date.parse('2026-10-29T06:19:00Z');
  const afterRelease=records.filter(item=>Date.parse(item.capturedAt)>=activated);
  const catalogFrames=afterRelease.filter(item=>item.status==='OK'&&
   item.frame?.boardProfile===boardId&&item.frame?.ledCount===expectedCount);
  result.postReleaseSamples=afterRelease.length;
  result.postReleaseCatalogSamples=catalogFrames.length;
  result.latestSampleTime=records.at(-1)?.capturedAt||null;
  result.latestSampleStatus=records.at(-1)?.status||null;
  const latestError=String(afterRelease.filter(item=>item.status==='ERROR').at(-1)?.error||'');
  result.recordErrorStage=/^(configuration|live_data|motion):/.exec(latestError)?.[1]||null;
  result.recordErrorSubrequests=/subrequest/i.test(latestError);
  result.recordErrorTimeout=/timed out|timeout/i.test(latestError);
  result.recordErrorInvalidFrame=/invalid_recorded_frame|invalid_recorded_led/.test(latestError);
  result.recordErrorOversize=/frame_too_large/.test(latestError);
  result.verdict=catalogFrames.length?'VALID':'AWAITING_NEW_CATALOG_SAMPLE';
 }catch(error){result.verdict='UNAVAILABLE';result.reason=(error?.message||'unknown').slice(0,70);}
 return result;
}
const site=await pageReleaseCheck(),history=await historyReleaseCheck();
console.log('PUBLISHED_SITE '+JSON.stringify(site));
console.log('HISTORY_RELEASE '+JSON.stringify(history));
if(site.verdict!=='VALID')process.exitCode=1;
// Recording runs every five minutes, not on demand; report missing samples
// without assuming an error until a full monitoring window has elapsed.
if(history.verdict==='OLD_RECORDER'||history.verdict==='UNAVAILABLE')process.exitCode=1;

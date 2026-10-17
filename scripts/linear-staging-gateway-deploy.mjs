// First publication only. Existing names require separate review, never overwrite.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {validatePixelFrame} from '../core/models/pixel-frame.mjs';
export const ACCOUNT='f40d632e8a57c44d9059ed316e22b80d';
export const NAME='transitcore-linear-staging';
export const SHA='fbe5e6ba7edc6427c516f81356081225bc7fb59c';
export const ORIGIN='https://transitcore-linear-staging.lgb84.workers.dev';
export const BOARDS=[['trondheim-bus-board',147],['trondheim-shared-stops-board',147],['trondheim-city-lines-catalog',1282],['trondheim-flybuss-live',46]];
const CONFIG='deploy/linear-staging/wrangler.json';
const EXPECTED={name:NAME,main:'entry.mjs',account_id:ACCOUNT,compatibility_date:'2026-08-11',workers_dev:true,preview_urls:false,ratelimits:[{name:'PUBLIC_READ_LIMIT',namespace_id:'110008',simple:{limit:60,period:60}}]};
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function guard(config,env){
  check(isDeepStrictEqual(config,EXPECTED),'Unexpected gateway configuration or rate-limit binding');
  check(env.GITHUB_REPOSITORY==='5mkbt4m7n8-hue/transitcore'&&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_EVENT_NAME==='workflow_dispatch','Only manual main dispatch is allowed');
  check(env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT,'Wrong Cloudflare account');
  check(Boolean(env.CLOUDFLARE_API_TOKEN)&&Boolean(env.STAGING_ACCESS_TOKEN),'Required staging environment secrets are unavailable');
}
export function requireUnusedName(scripts){
  check(Array.isArray(scripts)&&scripts.every(s=>typeof s.id==='string'),'Unrecognized Cloudflare inventory');
  check(!scripts.some(s=>s.id===NAME),'Gateway already exists; stop for independent identity/version review. No overwrite performed');
}
export async function boundedBody(response){
  const reader=response.body?.getReader();check(reader,'Missing response body');
  const chunks=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
    if(bytes>262144){await reader.cancel();throw new Error('Response exceeds 256 KiB');}chunks.push(value);}
  return {bytes,text:Buffer.concat(chunks).toString('utf8')};
}
export function validateLive(response,body,board,count,diagnostics=false){
  check(response.status===200,'Expected HTTP 200');
  check(response.headers.get('x-transitcore-environment')==='isolated-staging','Wrong environment header');
  check(response.headers.get('x-transitcore-source-sha')===SHA,'Wrong candidate SHA header');
  // Diagnostics declares its algorithm in JSON; only frame responses carry this header.
  if(!diagnostics)check(response.headers.get('x-transitcore-stop-algorithm')==='unified-bus-v1','Unified engine not active');
  let data;try{data=JSON.parse(body);}catch{throw new Error('Invalid JSON');}
  if(!diagnostics)check(validatePixelFrame(data,{expectedBoardProfile:board,expectedLedCount:count,now:Date.now()}).valid,'Invalid or stale PixelFrame');
  else check(data.boardId===board&&data.algorithm==='unified-bus-v1'&&['CURRENT','STALE','NOT_OBSERVED'].includes(data.status)&&Array.isArray(data.observations),'Invalid public diagnostics');
}
export async function smoke(path,board,count,diagnostics=false,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,log=console.log}={}){
  const started=now();
  for(let attempt=1;attempt<=8&&now()-started<120000;attempt++){
    let response,body;
    try{
      response=await fetcher(ORIGIN+path,{redirect:'manual',signal:AbortSignal.timeout(Math.min(15000,120000-(now()-started)))});
      const envOK=response.headers.get('x-transitcore-environment')==='isolated-staging',shaOK=response.headers.get('x-transitcore-source-sha')===SHA;
      log(`${board}${diagnostics?' diagnostics':''}: attempt=${attempt} HTTP=${response.status} elapsedMs=${now()-started} environment=${envOK} sha=${shaOK}`);
      if(response.status===200){body=await boundedBody(response);validateLive(response,body.text,board,count,diagnostics);log(`${board}: PASS bytes=${body.bytes}`);return;}
      await response.body?.cancel();
      check([401,404,429].includes(response.status)||response.status>=500&&response.status<=599,'Non-retryable HTTP status');
    }catch(error){
      // Invalid successful responses are never hidden by retries. Never log body/errors from fetch.
      if(response)throw error;
      log(`${board}: attempt=${attempt} network/timeout elapsedMs=${now()-started}`);
    }
    const remaining=120000-(now()-started);if(attempt===8||remaining<=10000)break;await sleep(10000);
  }
  throw new Error(`Live verification exhausted for ${board}`);
}
async function main(cli){
  guard(JSON.parse(readFileSync(CONFIG,'utf8')),process.env);
  check(cli&&JSON.parse(readFileSync(resolve(cli,'../../package.json'),'utf8')).version==='4.43.0','Pinned Wrangler 4.43.0 required');
  const cf=async path=>{
    let response;try{response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/${path}`,{headers:{authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new Error('Cloudflare inventory network failure');}
    check(response.ok,`Cloudflare access check HTTP ${response.status}`);
    let data;try{data=await response.json();}catch{throw new Error('Invalid Cloudflare inventory response');}
    check(data.success===true,'Cloudflare inventory access denied');return data.result;
  };
  requireUnusedName(await cf('scripts'));
  check((await cf('subdomain')).subdomain==='lgb84','Unexpected workers.dev subdomain');
  const run=(args,input)=>{
    // Never forward CLI output, child environment secrets or raw API bodies to Actions logs.
    const env={PATH:process.env.PATH,HOME:process.env.HOME,CI:'true',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:process.env.CLOUDFLARE_API_TOKEN};
    const result=spawnSync(process.execPath,[cli,...args,'--config',CONFIG],{env,input,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
    check(result.status===0,`Wrangler ${args[0]} failed (exit ${Number.isInteger(result.status)?result.status:'timeout/error'}); no automatic redeploy`);
  };
  run(['deploy','--dry-run']);
  // Recheck immediately before the only Worker publication. No retries of mutation operations.
  requireUnusedName(await cf('scripts'));
  run(['deploy']);
  console.log('Gateway deployed; installing existing staging secret via stdin');
  run(['secret','put','STAGING_ACCESS_TOKEN'],process.env.STAGING_ACCESS_TOKEN+'\n');
  const settings=await cf(`scripts/${NAME}/settings`);
  check(Array.isArray(settings.bindings)&&settings.bindings.length===2&&settings.bindings.some(b=>b.type==='secret_text'&&b.name==='STAGING_ACCESS_TOKEN')&&settings.bindings.some(b=>b.type==='ratelimit'&&b.name==='PUBLIC_READ_LIMIT'&&String(b.namespace_id)==='110008'&&b.simple?.limit===60&&b.simple?.period===60),'Unexpected deployed bindings; gateway requires manual review');
  for(const [board,count] of BOARDS){
    const path=`/api/v1/frame/${board}`;await smoke(path,board,count);await smoke(path+'/diagnostics',board,count,true);
  }
  for(const path of ['/api/v1/device/status','/api/v1/device/config/test','/api/v1/ota/test','/api/admin/devices','/api/v1/frame/grakallbanen-prototype-board','/api/v1/frame/trondheim-bus-1-visual-test']){
    const response=await fetch(ORIGIN+path,{redirect:'manual',signal:AbortSignal.timeout(15000)});await response.body?.cancel();
    check(response.status===404,`Blocked endpoint check failed HTTP ${response.status}`);console.log(`Blocked endpoint PASS ${path}`);
  }
  console.log('LIVE GATEWAY VERIFICATION PASS: four profiles, diagnostics, headers, size and denied endpoints');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main(process.argv[2]).catch(error=>{
    // Only locally constructed errors are printed by helpers; unexpected errors stay private.
    const safe=/^(Unexpected|Wrong|Only |Required |Gateway |Unrecognized |Missing |Response exceeds|Expected |Unified |Invalid |Non-retryable |Live verification|Pinned |Cloudflare |Wrangler |Blocked endpoint)/;
    console.error(safe.test(error.message)?error.message:'Gateway publication/verification failed; no raw error output');process.exitCode=1;
  });
}

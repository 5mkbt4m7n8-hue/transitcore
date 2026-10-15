// Trusted orchestration; candidate code is bundled, never executed here as a build hook.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {checkCandidate,ACCOUNT,TARGET} from './staging-deploy-guard.mjs';
import {fileURLToPath} from 'node:url';
export function deploymentArgs(config,sha){
 return ['deploy','--config',config,'--name',TARGET,'--var','STAGING_COMMIT_SHA:'+sha];
}
export function validateApprovedCandidate(sha,approved){
 if(!/^[a-f0-9]{40}$/.test(approved||'')||sha!==approved)
  throw Error('Candidate SHA does not match staging environment approval pin');
}
export function validateCI(env){
 if(env.GITHUB_REPOSITORY!=='5mkbt4m7n8-hue/transitcore'||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch')
  throw Error('Only a manual workflow from the repository main branch may deploy staging');
 if(env.CLOUDFLARE_ACCOUNT_ID!==ACCOUNT)throw Error('Unexpected Cloudflare account');
 for(const name of ['CLOUDFLARE_API_TOKEN','STAGING_ACCESS_TOKEN'])
  if(!env[name]||env[name].length<32)throw Error('Missing/invalid staging secret: '+name);
 for(const name of ['GITHUB_PUBLISH_TOKEN','PUBLISH_ADMIN_TOKEN','STATUS_INGEST_TOKEN','DEVICE_INGEST_TOKENS','OTA_RELEASE_MANIFEST'])
  if(env[name])throw Error('Production/application credentials must not be supplied');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [candidate,sha,cli]=process.argv.slice(2);
 validateCI(process.env);
 validateApprovedCandidate(sha,process.env.STAGING_APPROVED_CANDIDATE_SHA);
 const config=checkCandidate(candidate,{sha,target:TARGET,account:process.env.CLOUDFLARE_ACCOUNT_ID});
 const runtimeToken=process.env.STAGING_ACCESS_TOKEN;
 const env={
  PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.RUNNER_TEMP,
  CI:'true',WRANGLER_SEND_METRICS:'false',
  CLOUDFLARE_API_TOKEN:process.env.CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID:ACCOUNT
 };
 const run=(args,input)=>{
  const r=spawnSync(process.execPath,[cli,...args],{
   cwd:path.dirname(cli),env,input,encoding:'utf8',timeout:300000,maxBuffer:8*1024*1024});
  // Do not expose either credential even if a tool error echoes its input.
  let output=(r.stdout||'')+(r.stderr||'');
  for(const secret of [runtimeToken,env.CLOUDFLARE_API_TOKEN])output=output.split(secret).join('[REDACTED]');
  process.stdout.write(output);
  if(r.status!==0)throw Error('Staging CLI operation failed; no automatic retry or rollback');
 };
 const args=deploymentArgs(config,sha);
 run([...args,'--dry-run']);
 run(args);
 // Missing token fails closed in the wrapper. A first deploy is inaccessible
 // until this succeeds. Secret bulk can create a further staging deployment.
 run(['secret','bulk','--config',config,'--name',TARGET],
     JSON.stringify({STAGING_ACCESS_TOKEN:runtimeToken}));
 // Token is passed via a header, never the URL, command line or artifact.
 const url='https://transitcore-staging.lgb84.workers.dev/api/v1/frame/trondheim-bus-1-visual-test';
 const response=await fetch(url,{headers:{authorization:'Bearer '+runtimeToken},signal:AbortSignal.timeout(30000)});
 if(!response.ok||response.headers.get('x-transitcore-environment')!=='isolated-staging'||
    response.headers.get('x-transitcore-source-sha')!==sha)throw Error('Staging smoke verification failed');
 const frame=await response.json();
 if(frame.schemaVersion!==1||frame.boardProfile!=='trondheim-bus-1-visual-test'||frame.ledCount!==8||!Array.isArray(frame.leds))
  throw Error('Staging PixelFrame smoke verification failed');
 const anonymous=await fetch(url,{signal:AbortSignal.timeout(10000)});
 if(anonymous.status!==401)throw Error('Staging must reject anonymous requests');
 for(const route of ['/api/v1/device/status','/api/v1/ota/test','/v1/publish']){
  const denied=await fetch(new URL(route,url),{
   headers:{authorization:'Bearer '+runtimeToken},signal:AbortSignal.timeout(10000)});
  if(denied.status!==404)throw Error('Unexpected staging administrative endpoint');
 }
 if(process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   '\nStaging-only deploy and authenticated smoke check PASS.\nSource: '+sha+'\nTarget: '+TARGET+'\n');
}

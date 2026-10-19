import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guard,ACCOUNT,TARGET} from './oslo-staging-policy.mjs';
import {smoke} from './oslo-staging-smoke.mjs';
const [root,sha,cli]=process.argv.slice(2),e=process.env;
if(e.GITHUB_REPOSITORY!=='5mkbt4m7n8-hue/transitcore'||e.GITHUB_REF!=='refs/heads/main'||e.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('Manual main workflow only');
if(!/^[a-f0-9]{40}$/.test(sha||'')||sha!==e.OSLO_STAGING_APPROVED_CANDIDATE_SHA)throw Error('Unapproved candidate');
if(!e.OSLO_STAGING_ACCESS_TOKEN||!e.CLOUDFLARE_API_TOKEN)throw Error('Missing staging credentials');
const config=guard(root,sha,e.CLOUDFLARE_ACCOUNT_ID);
const env={PATH:e.PATH,HOME:e.HOME,TMPDIR:e.RUNNER_TEMP,CI:'true',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_API_TOKEN:e.CLOUDFLARE_API_TOKEN,CLOUDFLARE_ACCOUNT_ID:ACCOUNT};
function run(args,input){
 const result=spawnSync(process.execPath,[cli,...args],{cwd:path.dirname(cli),env,input,encoding:'utf8',timeout:300000,maxBuffer:8*1024*1024});
 // CLI output intentionally suppressed: no credentials, bodies or provider errors in logs.
 if(result.status!==0)throw Error('Oslo staging CLI step failed; no automatic retry/rollback');
}
const args=['deploy','--config',config,'--name',TARGET,'--var','OSLO_STAGING_COMMIT_SHA:'+sha];
run([...args,'--dry-run']);run(args);
run(['secret','bulk','--config',config,'--name',TARGET],JSON.stringify({OSLO_STAGING_ACCESS_TOKEN:e.OSLO_STAGING_ACCESS_TOKEN}));
// Deployment propagation is checked read-only. No automatic second deployment.
await new Promise(resolve=>setTimeout(resolve,10000));
await smoke(sha,e.OSLO_STAGING_ACCESS_TOKEN);

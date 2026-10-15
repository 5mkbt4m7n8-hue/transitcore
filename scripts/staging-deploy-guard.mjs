// Run from the trusted workflow SHA, NOT from the candidate checkout.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
export const ACCOUNT='f40d632e8a57c44d9059ed316e22b80d';
export const TARGET='transitcore-staging';
export const BOARDS='trondheim-bus-1-visual-test,trondheim-bus-board,trondheim-shared-stops-board,trondheim-city-lines-catalog,trondheim-flybuss-live';
export const expectedConfig={
 name:TARGET,main:'entry.mjs',account_id:ACCOUNT,compatibility_date:'2026-08-11',
 workers_dev:true,preview_urls:false,observability:{enabled:true},
 vars:{BUS_LIFECYCLE_BOARDS:BOARDS},
 durable_objects:{bindings:[{name:'DEVICE_STATUS',class_name:'UnifiedBusStaging'}]},
 migrations:[{tag:'unified-bus-staging-v1',new_sqlite_classes:['UnifiedBusStaging']}]
};
export function validateTarget(config,{sha,target,account}){
 assert.match(sha||'',/^[a-f0-9]{40}$/,'A full lowercase commit SHA is mandatory');
 assert.equal(target,TARGET,'Wrong deploy target');
 assert.equal(account,ACCOUNT,'Wrong Cloudflare account');
 // Exact shape rejects hooks, routes, cron, env overrides, service bindings,
 // production script_name, extra storage and extra runtime variables.
 assert(isDeepStrictEqual(config,expectedConfig),'Staging configuration differs from reviewed policy (values omitted)');
 return true;
}
export function checkCandidate(root,options){
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
 assert.equal(git('rev-parse','HEAD'),options.sha,'Checkout does not match approved SHA');
 assert.equal(git('status','--porcelain','--untracked-files=all'),'','Candidate checkout must be pristine');
 const files=git('ls-files').split('\n');
 for(const f of files){
  assert(!/(^|\/)\.dev\.vars($|\.)|(^|\/)\.env($|\.)/.test(f),'Candidate contains local environment files');
 }
 const configPath=path.join(root,'deploy/staging/wrangler.json');
 validateTarget(JSON.parse(fs.readFileSync(configPath,'utf8')),options);
 // Staging boundary is trusted separately from the changing engine.
 // Candidate and workflow copy must have identical wrapper/config.
 const trusted=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 for(const f of ['deploy/staging/wrangler.json','deploy/staging/entry.mjs']){
  assert(!fs.lstatSync(path.join(root,f)).isSymbolicLink(),'Staging files cannot be symlinks');
  assert.equal(fs.readFileSync(path.join(root,f),'utf8'),fs.readFileSync(path.join(trusted,f),'utf8'),'Candidate staging boundary differs from trusted workflow SHA');
 }
 return configPath;
}
// Conservative reproduction of the audited CF include filter. A bootstrap
// PR must also avoid config/ and web/ (they can change production without deploy).
export function triggersProductionBuild(file){
 return /^(worker\/|core\/)/.test(file)||['package.json','package-lock.json','npm-shrinkwrap.json','.npmrc'].includes(file);
}
export function safeBootstrapPath(file){
 return !triggersProductionBuild(file)&&(
  ['.github/workflows/staging-deploy.yml','.github/workflows/staging-config-check.yml'].includes(file)||
  ['deploy/staging/entry.mjs','deploy/staging/wrangler.json'].includes(file)||
  ['scripts/staging-deploy-guard.mjs','scripts/staging-deploy-runner.mjs','scripts/test-staging-deploy.mjs','docs/STAGING_GITHUB_ACTIONS.md'].includes(file));
}
export function validateBootstrapEntries(files,readEntry){
 assert(files.length,'Empty bootstrap diff');
 for(const file of files)assert(safeBootstrapPath(file),'PR contains a non-bootstrap path: '+JSON.stringify(file));
 for(const file of files)assert(/^100644 blob /.test(readEntry(file)),
  'Bootstrap path must be a regular non-executable file: '+JSON.stringify(file));
 return files;
}
export function checkBootstrapDiff(root,base,head,{onlyStaging=false}={}){
 for(const sha of [base,head])assert.match(sha||'',/^[a-f0-9]{40}$/,'Exact base/head SHA required');
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'});
 // No rename detection: both paths are checked. NUL preserves unusual filenames.
 const files=git('diff','--no-ext-diff','--no-textconv','--no-renames','--name-only','-z',base,head,'--').split('\0').filter(Boolean);
 if(onlyStaging&&!files.some(f=>safeBootstrapPath(f)||f.startsWith('deploy/staging/')||f.startsWith('.github/workflows/staging-')||f.startsWith('scripts/staging-deploy-')))return [];
 return validateBootstrapEntries(files,file=>git('ls-tree','-z',head,'--',file));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='--bootstrap-diff'){
  const [,root,base,head,scope]=process.argv.slice(2);
  assert(scope===undefined||scope==='--if-staging','Unknown scope');
  const files=checkBootstrapDiff(root,base,head,{onlyStaging:scope==='--if-staging'});
  console.log(files.length?'Bootstrap PR diff PASS: '+files.length+' paths':'No staging paths changed; bootstrap check not applicable');
 }else{
 const [root,sha,target,account]=process.argv.slice(2);
 checkCandidate(root,{sha,target,account});
 console.log('Staging target, account, fixed SHA, isolated config and trusted boundary PASS');
 }
}

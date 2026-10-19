import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const TARGET='transitcore-oslo-staging',ACCOUNT='f40d632e8a57c44d9059ed316e22b80d';
export const expected={name:TARGET,main:'entry.mjs',account_id:ACCOUNT,compatibility_date:'2026-08-11',workers_dev:true,preview_urls:false,observability:{enabled:true}};
export function validateConfig(config){assert.deepEqual(config,expected,'Unexpected Oslo staging configuration');}
export function guard(root,sha,account){
 assert.match(sha||'',/^[a-f0-9]{40}$/);assert.equal(account,ACCOUNT);
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
 assert.equal(git('rev-parse','HEAD'),sha);assert.equal(git('status','--porcelain','--untracked-files=all'),'');
 for(const f of git('ls-files').split('\n'))assert(!/(^|\/)\.env($|\.)|(^|\/)\.dev\.vars($|\.)/.test(f));
 const trusted=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 for(const f of ['deploy/oslo-staging/entry.mjs','deploy/oslo-staging/wrangler.json']){
  assert(!fs.lstatSync(path.join(root,f)).isSymbolicLink());
  assert.equal(fs.readFileSync(path.join(root,f),'utf8'),fs.readFileSync(path.join(trusted,f),'utf8'));
 }
 const config=path.join(root,'deploy/oslo-staging/wrangler.json');validateConfig(JSON.parse(fs.readFileSync(config)));
 return config;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))guard(...process.argv.slice(2));

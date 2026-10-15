import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTarget,expectedConfig,safeBootstrapPath,triggersProductionBuild,validateBootstrapEntries,checkBootstrapDiff,ACCOUNT,TARGET} from './staging-deploy-guard.mjs';
import {validateCI,deploymentArgs,validateApprovedCandidate} from './staging-deploy-runner.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const opts={sha:'a'.repeat(40),target:TARGET,account:ACCOUNT};
validateApprovedCandidate(opts.sha,opts.sha);
for(const approved of [undefined,'','main','b'.repeat(40),'A'.repeat(40)])
 assert.throws(()=>validateApprovedCandidate(opts.sha,approved),/approval pin/);
const config=JSON.parse(read('deploy/staging/wrangler.json'));
assert(validateTarget(config,opts));
for(const options of [{sha:'main'},{sha:'abc123'},{sha:'a'.repeat(40)+';echo bad'},{target:'transitcore-led-feed'},{account:'wrong'}])
 assert.throws(()=>validateTarget(config,{...opts,...options}));
const mutations=[
 c=>c.name='transitcore-led-feed',
 c=>c.main='../../worker/led-feed-worker.mjs',
 c=>c.durable_objects.bindings[0].script_name='transitcore-led-feed',
 c=>c.durable_objects.bindings[0].class_name='DeviceStatus',
 c=>c.triggers={crons:['*/5 * * * *']},
 c=>c.build={command:'echo unsafe'},
 c=>c.services=[{binding:'PROD',service:'transitcore-led-feed'}],
 c=>c.vars.PUBLISH_ADMIN_TOKEN='forbidden',
 c=>c.vars.OTA_RELEASE_MANIFEST='{}',
 c=>c.routes=['production.example/*'],
 c=>c.env={production:{name:'transitcore-led-feed'}},
 c=>c.kv_namespaces=[{binding:'PROD',id:'production'}]
];
for(const mutate of mutations){const c=structuredClone(expectedConfig);mutate(c);assert.throws(()=>validateTarget(c,opts));}
const env={GITHUB_REPOSITORY:'5mkbt4m7n8-hue/transitcore',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:'x'.repeat(40),STAGING_ACCESS_TOKEN:'y'.repeat(40)};
validateCI(env);
for(const change of [{GITHUB_REF:'refs/heads/agent/test'},{GITHUB_EVENT_NAME:'push'},{GITHUB_REPOSITORY:'fork/transitcore'},{CLOUDFLARE_ACCOUNT_ID:'wrong'},{CLOUDFLARE_API_TOKEN:''},{STAGING_ACCESS_TOKEN:''},{STATUS_INGEST_TOKEN:'do-not-copy'},{OTA_RELEASE_MANIFEST:'{}'}])
 assert.throws(()=>validateCI({...env,...change}));
const args=deploymentArgs('/candidate/deploy/staging/wrangler.json',opts.sha);
assert.equal(args[args.indexOf('--name')+1],TARGET);
assert(!args.includes('--env'));assert(args.includes('STAGING_COMMIT_SHA:'+opts.sha));
const bootstrap=['.github/workflows/staging-deploy.yml','.github/workflows/staging-config-check.yml','deploy/staging/entry.mjs','deploy/staging/wrangler.json','scripts/staging-deploy-guard.mjs','scripts/staging-deploy-runner.mjs','scripts/test-staging-deploy.mjs','docs/STAGING_GITHUB_ACTIONS.md'];
for(const f of bootstrap){assert(safeBootstrapPath(f));assert(!triggersProductionBuild(f));}
const regular=()=> '100644 blob '+ 'a'.repeat(40)+'\tfile\0';
assert.deepEqual(validateBootstrapEntries(bootstrap,regular),bootstrap);
for(const forbidden of ['worker/api/v1.mjs','core/engine.mjs','web/index.html','config/boards/test.json','package.json','.npmrc','README.md','.github/workflows/other.yml','deploy/staging/unreviewed.mjs','scripts/other.mjs','web/space name.html','web/new\nline.html']){
 assert.throws(()=>validateBootstrapEntries([...bootstrap,forbidden],regular),/non-bootstrap path/);
 // A rename out of an unapproved path includes its old path as well.
 assert.throws(()=>validateBootstrapEntries([forbidden,bootstrap[0]],regular));
}
for(const entry of ['', '120000 blob abc\tlink\0','160000 commit abc\tmodule\0','100755 blob abc\texecutable\0'])
 assert.throws(()=>validateBootstrapEntries([bootstrap[0]],()=>entry),/regular non-executable/);
assert.throws(()=>validateBootstrapEntries([],regular),/Empty/);
assert.throws(()=>checkBootstrapDiff('.', 'main','a'.repeat(40)),/Exact base/);
const safety=read('.github/workflows/staging-config-check.yml');
assert(safety.includes('pull_request_target:'));
assert(!safety.includes('paths:'),'Do not allow a path-filtered required check to be skipped');
assert(safety.includes('ref: ${{ github.event.pull_request.base.sha }}'));
assert(safety.includes('--bootstrap-diff "$GITHUB_WORKSPACE" "$BASE_SHA" "$HEAD_SHA" --if-staging'));
assert(safety.includes('test "$(git rev-parse FETCH_HEAD)" = "$HEAD_SHA"'));
assert(!safety.includes('secrets.'));
assert(!safety.includes('node scripts/test-'),'Never execute candidate test code in pull_request_target');
for(const f of ['worker/wrangler.staging.toml','worker/staging-entry.mjs','core/frame/build-frame.mjs','package.json','config/boards/trondheim-bus-board.json','web/board/index.html'])
 assert(!safeBootstrapPath(f),'Do not include runtime/profile/frontend changes in bootstrap');
const workflow=read('.github/workflows/staging-deploy.yml');
assert(workflow.includes('workflow_dispatch:'));assert(!/^\s+(push|pull_request|schedule|workflow_run):/m.test(workflow));
assert(workflow.includes('name: staging'));assert(workflow.includes('needs: preflight'));
assert(workflow.includes('github.workflow_sha'));assert(workflow.includes('inputs.candidate_sha'));
assert(workflow.includes('persist-credentials: false'));assert(workflow.includes('cancel-in-progress: false'));
assert(workflow.includes('wrangler@4.43.0'));assert(workflow.includes('--ignore-scripts'));
assert(!workflow.split('  deploy:')[0].includes('secrets.'),'Preflight has no deploy secrets');
assert(!workflow.includes('worker/wrangler.toml'),'No production deploy config');
for(const match of workflow.matchAll(/uses: ([^\s]+)/g))assert.match(match[1],/@[a-f0-9]{40}$/,'Actions pinned by SHA');
console.log('Manual staging policy: target/account/SHA, isolation, secret gates, bootstrap paths and workflow safety PASS');

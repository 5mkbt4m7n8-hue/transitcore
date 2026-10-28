import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fingerprint,createPublication,publishLinearDraft,PUBLICATION_PATH,handleLinearPublish} from "../worker/linear-publish.mjs";
import worker from "../worker/led-feed-worker.mjs";
const source=JSON.parse(readFileSync(new URL("../web/linear/network/trondheim-layout.json",import.meta.url)));
const snapshot={
 version:1,baseFingerprint:fingerprint(source),revision:4,
 names:{"original-014":"Solsiden rettet"},
 layout:structuredClone(source)
};
const changed=snapshot.layout.stops.find(s=>s.id==="original-014");
changed.x+=8;changed.label.x+=8;
const build=createPublication(snapshot,source,"2026-10-28T04:00:00.000Z");
assert.equal(build.publication.baseFingerprint,fingerprint(source));
assert.equal(build.publication.names["original-014"],"Solsiden rettet");
assert.equal(build.publication.sourceRevision,4);
assert.equal(build.changes.movedOrAddedStops,1);
for(const mutate of [
 x=>{x.layout.stops[0].bindings[0].stopId="NSR:Quay:fake";},
 x=>{x.layout.stops[0].name="Wrong official name";},
 x=>{x.layout.stops[0].verification="unresolved";},
 x=>{x.layout.stops.pop();},
 x=>{x.layout.paths.pop();},
 x=>{x.layout.reference.path="not-the-original";},
 x=>{x.baseFingerprint="abcdef12-12345";}
]){
 const bad=structuredClone(snapshot);mutate(bad);
 assert.throws(()=>createPublication(bad,source,new Date().toISOString()));
}
let revision=4,publicFile=null,commits=0,pulls=0,refs=0;
const encode=value=>Buffer.from(JSON.stringify(value),"utf8").toString("base64");
const githubApi=async(path,opts={})=>{
 if(path.endsWith("/git/ref/heads/main"))return {object:{sha:"base-test-sha"}};
 if(path.includes("/contents/web/linear/network/trondheim-layout.json"))return {encoding:"base64",content:encode(source),sha:"source-sha"};
 if(path.includes("/contents/"+PUBLICATION_PATH+"?")){
  if(publicFile)return {encoding:"base64",content:publicFile.content,sha:"published-file-sha"};
  const err=Error("Not Found");err.status=404;throw err;
 }
 if(path.endsWith("/git/refs")){refs++;assert.equal(opts.method,"POST");return {};}
 if(path.endsWith("/contents/"+PUBLICATION_PATH)){
  const b=JSON.parse(opts.body);assert.equal(opts.method,"PUT");
  assert.match(b.branch,/^publish\/trondheim-linear-4-/);
  publicFile={content:b.content};commits++;return {};
 }
 if(path.endsWith("/pulls")){pulls++;const data=JSON.parse(opts.body);
  assert.equal(data.base,"main");assert.equal(data.draft,true);
  assert.match(data.body,/Originaltegningen/);
  return {number:261,html_url:"https://github.com/5mkbt4m7n8-hue/transitcore/pull/261"};
 }
 throw Error("Unexpected GitHub request "+path);
};
const storage={fetch:async()=>Response.json({revision,snapshot})};
let r=await publishLinearDraft({expectedRevision:3,storage,githubApi});
assert.equal(r.status,409);assert.equal(commits,0);
r=await publishLinearDraft({expectedRevision:4,storage,githubApi});
assert.equal(r.status,201);assert.equal(r.body.pullRequestNumber,261);
assert.equal(commits,1);assert.equal(pulls,1);assert.equal(refs,1);
assert.equal(JSON.parse(Buffer.from(publicFile.content,"base64").toString()).names["original-014"],"Solsiden rettet");
r=await publishLinearDraft({expectedRevision:4,storage,githubApi});
assert.equal(r.body.noChanges,true);assert.equal(pulls,1);
// The public Worker route requires the administrator credential and refuses
// requests from disallowed browser origins.
const namespace={idFromName:name=>name,get:()=>storage};
const env={PUBLISH_ADMIN_TOKEN:"admin-test",GITHUB_PUBLISH_TOKEN:"restricted-token",DEVICE_STATUS:namespace};
const auth=(given,expected)=>Promise.resolve(given===expected);
const request=(method,token="",origin="https://5mkbt4m7n8-hue.github.io")=>
 new Request("https://worker.test/v1/admin/linear-publish",{
  method,headers:{origin,...(token?{authorization:"Bearer "+token}:{})},
  ...(method==="POST"?{body:JSON.stringify({expectedRevision:4})}:{})
 });
assert.equal((await handleLinearPublish(request("OPTIONS"),env,auth,githubApi)).status,204);
assert.equal((await handleLinearPublish(request("POST"),env,auth,githubApi)).status,401);
assert.equal((await handleLinearPublish(request("POST","bad"),env,auth,githubApi)).status,401);
assert.equal((await handleLinearPublish(request("POST","admin-test","https://evil.invalid"),env,auth,githubApi)).status,403);
assert.equal((await handleLinearPublish(request("POST","admin-test"),env,auth,githubApi)).status,200);
assert.equal((await handleLinearPublish(request("POST","admin-test"),{...env,GITHUB_PUBLISH_TOKEN:null},auth,githubApi)).status,503);
const main=readFileSync(new URL("../web/linear/network/map.js",import.meta.url),"utf8");
const client=readFileSync(new URL("../web/linear/network/cloud-draft.js",import.meta.url),"utf8");
assert.match(main,/published-edits\.json/);
assert.match(main,/data-act="publishMap"/);
assert.match(main,/case'publishMap'/);
assert.match(main,/const baseFingerprint=fingerprint\(canonical\)/);
assert.match(client,/expectedRevision:revision/);
assert.match(client,/async function publishDraft/);
console.log("Linear publish: immutable NSR mapping, approved overlay, server-only PR, auth and revisions PASS");

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import worker,{DeviceStatus} from "../worker/led-feed-worker.mjs";
import {validateLinearSnapshot,linearDraftStorage} from "../worker/linear-draft.mjs";
const require=createRequire(import.meta.url);
const client=require("../web/linear/network/cloud-draft.js");
const original=JSON.parse(readFileSync(new URL("../web/linear/network/trondheim-layout.json",import.meta.url)));
const body={version:1,baseFingerprint:"abc123ef-125894",layout:structuredClone(original),names:{"original-014":"Solsiden oppdatert"}};
assert.deepEqual(validateLinearSnapshot(body),body);
const split=structuredClone(body);
split.layout.stops.find(s=>s.id==='original-014').diodeMode='split';
split.layout.stops.find(s=>s.id==='original-014').platformSides={
 'NSR:Quay:73975':{side:'left',verification:'user-reviewed'},
 'NSR:Quay:73976':{side:'right',verification:'user-reviewed'}
};
assert.deepEqual(validateLinearSnapshot(split),split);
const unverified=structuredClone(split);
unverified.layout.stops.find(s=>s.id==='original-014').platformSides['NSR:Quay:73975'].verification='auto';
assert.throws(()=>validateLinearSnapshot(unverified),/invalid_platform_sides/);
const spoofed=structuredClone(split);
spoofed.layout.stops.find(s=>s.id==='original-014').platformSides['NSR:Quay:00000']={side:'right',verification:'user-reviewed'};
assert.throws(()=>validateLinearSnapshot(spoofed),/invalid_platform_sides/);

for(const change of [
 value=>{value.baseFingerprint="invalid";},
 value=>{value.layout.stops[0].x=-1;},
 value=>{value.layout.stops.splice(0,1);},
 value=>{value.layout.paths[0].points=[{x:1,y:2}];},
 value=>{value.names["not-a-stop"]="Falsk";},
 value=>{value.names["original-014"]="<bad> ".repeat(50);}
]){
 const bad=structuredClone(body);change(bad);assert.throws(()=>validateLinearSnapshot(bad));
}
const memory=new Map();
const storage={
 get:async key=>memory.get(key),put:async(key,value)=>memory.set(key,structuredClone(value)),
 delete:async key=>memory.delete(key)
};
let response=await linearDraftStorage(storage,new Request("https://internal/linear-draft"));
assert.equal(response.status,200);assert.equal((await response.json()).revision,0);
response=await linearDraftStorage(storage,new Request("https://internal/linear-draft",{
 method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({...body,expectedRevision:0})
}));
assert.equal(response.status,200);
const saved=await response.json();assert.equal(saved.revision,1);
response=await linearDraftStorage(storage,new Request("https://internal/linear-draft",{
 method:"PUT",body:JSON.stringify({...body,expectedRevision:0})
}));
assert.equal(response.status,409);assert.equal((await response.json()).revision,1);
response=await linearDraftStorage(storage,new Request("https://internal/linear-draft",{
 method:"PUT",body:JSON.stringify({...body,expectedRevision:1})
}));
assert.equal(response.status,200);assert.equal(memory.get("linear:trondheim:backup:1").revision,1);
// The production Worker route refuses unauthenticated editors.
const namespace={idFromName:name=>name,get:()=>({fetch:request=>linearDraftStorage(storage,new Request(request))})};
const env={PUBLISH_ADMIN_TOKEN:"test-only-key",DEVICE_STATUS:namespace};
const call=(method,key,other={})=>worker.fetch(new Request("https://worker.test/v1/admin/linear-draft",{
 method,headers:{"authorization":key?"Bearer "+key:"","origin":"https://5mkbt4m7n8-hue.github.io",...other},
 ...(method==="PUT"?{body:JSON.stringify({...body,expectedRevision:2})}:{})
}),env);
assert.equal((await call("GET","wrong")).status,401);
assert.equal((await call("GET","test-only-key",{"origin":"https://attacker.example"})).status,403);
assert.equal((await call("OPTIONS","")).status,204);
assert.equal((await call("GET","test-only-key")).status,200);
assert.equal((await call("PUT","test-only-key")).status,200);
assert.equal((await worker.fetch(new Request("https://worker.test/v1/admin/linear-draft"),{})).status,503);
// Frontend never saves credentials locally and prevents overwriting a differing
// remote copy without a deliberate choice.
let local={layout:structuredClone(original),names:{}},applied=0,status=[];
const reply=(value,code=200)=>new Response(JSON.stringify(value),{status:code,headers:{"content-type":"application/json"}});
let cloudRevision=0,cloudSnapshot=null,tokenSeen="";
const fetcher=async(url,options)=>{
 tokenSeen=options.headers.authorization;
 if(options.method==="GET")return reply({revision:cloudRevision,snapshot:cloudSnapshot});
 const data=JSON.parse(options.body);
 if(data.expectedRevision!==cloudRevision)return reply({error:"revision_conflict",revision:cloudRevision},409);
 cloudRevision++;cloudSnapshot={...data,revision:cloudRevision,savedAt:new Date().toISOString()};
 return reply({ok:true,revision:cloudRevision,savedAt:cloudSnapshot.savedAt});
};
const make=hasLocal=>client.create({baseFingerprint:body.baseFingerprint,
 getLocal:()=>structuredClone(local),hasLocal:()=>hasLocal,
 applyRemote:remote=>{applied++;local={layout:remote.layout,names:remote.names};},
 status:detail=>status.push(detail),fetcher,endpoint:"https://example.invalid/draft"
});
let sync=make(false);
assert.equal(await sync.connect("session-key"),true);
local.names["original-014"]="Mitt navn";sync.changed();await sync.flush();
assert.equal(cloudRevision,1);assert.equal(cloudSnapshot.names["original-014"],"Mitt navn");
assert.equal(tokenSeen,"Bearer session-key");
sync.disconnect();
assert.equal(sync.buttons().mode,"disconnected");
local.names["original-014"]="Mitt lokale navn";
sync=make(true);
assert.equal(await sync.connect("session-key"),true);
assert.equal(sync.buttons().mode,"conflict","Divergent drafts must not overwrite remote automatically");
assert.equal(cloudRevision,1);
assert.equal(await sync.chooseRemote(),true);
assert.equal(applied,1);assert.equal(local.names["original-014"],"Mitt navn");
sync.disconnect();
local.names["original-014"]="Jeg velger lokalt";
sync=make(true);
await sync.connect("session-key");
assert.equal(sync.buttons().mode,"conflict");
await sync.chooseLocal();await sync.flush();
assert.equal(cloudSnapshot.names["original-014"],"Jeg velger lokalt");
sync.disconnect();
assert(status.some(x=>/Lagret permanent/.test(x.message)));
console.log("Linear cloud drafts: auth, validation, revisions, browser conflict recovery PASS");

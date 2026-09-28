import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {filterDevices,summary,listRows,details,errorRows,historyRows,value,activeErrors} from "../web/fleet/model.mjs";
import {createClient,FleetStore,ApiError,REFRESH_MS} from "../web/fleet/client.mjs";
const d={deviceId:"test-one",label:"Trikk <script>",boardProfile:"grakallbanen",status:"DEGRADED",firmwareVersion:"1.2.13",
 health:{wifiRssi:0,lastFrameAgeSeconds:0,failedPolls:0,errors:[{active:true},{active:false}]}};
const e={deviceId:"test-two",label:"Buss",status:"OFFLINE",boardProfile:"flybussen"};
assert.equal(filterDevices([d,e],{search:"TRIKK",status:"DEGRADED",board:"grakallbanen",firmware:"1.2.13"}).length,1);
assert.equal(filterDevices([d,e],{status:"ONLINE"}).length,0);
assert.equal(summary([d,e]).counts.OFFLINE,1);
assert.equal(summary([]).total,0);assert.equal(listRows([]),"");
assert.match(listRows([d,e]),/DEGRADED/);assert.match(listRows([d,e]),/OFFLINE/);
assert.match(listRows([d]),/Trikk &lt;script&gt;/);assert.doesNotMatch(listRows([d]),/<script>/);
assert.match(listRows([d]),/0 dBm/);assert.equal(value(0),"0");assert.equal(activeErrors(d),1);
assert.equal(activeErrors(e),null);assert.match(details(e),/Ikke rapportert/);
assert.match(details({...e,otaEnabled:false,updateAvailable:true}),/Nei/);
assert.match(errorRows([{code:"FEED",count:2,active:true,message:"<img src=x>"}]),/Gjentatt/);
assert.doesNotMatch(errorRows([{message:"<img src=x>"}]),/<img/);
assert.match(historyRows([{receivedAt:"bad",health:null}]),/UKJENT/);
for(const text of [listRows([{...d,token:"SECRET"}]),details({...d,adminSecret:"SECRET"})])assert.ok(!text.includes("SECRET"));
let calls=[],fail=false;
const client=createClient(async(url,options)=>{
 calls.push({url,options});
 if(fail)return new Response("untrusted secret body",{status:503});
 return Response.json(url.includes("cursor=")?{devices:[e],unavailable:[],nextCursor:null,generatedAt:"2026-09-28T12:00:00Z"}:
 url.includes("?")?{devices:[d],unavailable:[],nextCursor:"test-one",generatedAt:"2026-09-28T12:00:00Z"}:{...d,history:[],errors:[]});
});
await assert.rejects(client.get("/api/v1/devices"),e=>e.status===401);
client.setToken("test-only-credential");
const store=new FleetStore(client);await store.refresh();
assert.equal(calls.length,1);assert.equal(store.pages,1);assert.equal(store.devices.length,1);
await store.more();assert.equal(store.devices.length,2);assert.equal(store.nextCursor,null);assert.equal(store.pages,2);
assert.ok(calls.every(c=>c.url.includes("?")),"No detail prefetch");
await store.detail("test-one");assert.equal(calls.length,3);
assert.equal(calls[0].options.headers.Authorization,"Bearer test-only-credential");
assert.ok(!calls[0].url.includes("credential"));assert.equal(calls[0].options.redirect,"error");
await assert.rejects(store.detail("../secret"));
await store.refresh();assert.equal(calls.length,5);assert.equal(store.pages,2);
fail=true;await assert.rejects(store.refresh(),ApiError);assert.equal(store.devices.length,2,"Keep last good snapshot");
client.clear();await assert.rejects(store.refresh(),e=>e.status===401);
assert.equal(REFRESH_MS,60000);
const controller=new AbortController();controller.abort();
await assert.rejects(new FleetStore({get:async()=>({devices:[d],unavailable:[],nextCursor:null})}).refresh(controller.signal),e=>e.name==="AbortError");
const loop=new FleetStore({get:async()=>({devices:[d],unavailable:[],nextCursor:"test-one"})});await loop.refresh();
await assert.rejects(loop.more(),/Pagineringen/);
const app=await readFile(new URL("../web/fleet/app.mjs",import.meta.url),"utf8");
assert.ok(app.includes('document.hidden'));assert.ok(app.includes('visibilitychange'));
for(const name of ["app.mjs","client.mjs","model.mjs","index.html"]){
 const text=await readFile(new URL("../web/fleet/"+name,import.meta.url),"utf8");
 assert.doesNotMatch(text,/localStorage|sessionStorage|console\.log|\/v1\/devices\/.*\/status/);
}
console.log("Fleet UI: rendering, filters, unknown/zero, errors, history, empty, API error, pagination, detail, abort and secret exclusion passed");


// Optional browser acceptance suite. PLAYWRIGHT_MODULE may point to an installed package.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||"playwright");
const root=new URL("../web/fleet/",import.meta.url);
const server=createServer(async(req,res)=>{
 const name=req.url==="/"?"index.html":req.url.slice(1);
 if(!["index.html","app.mjs","client.mjs","model.mjs","fleet.css"].includes(name)){res.writeHead(404).end();return;}
 res.setHeader("content-type",name.endsWith("mjs")?"text/javascript":name.endsWith("css")?"text/css":"text/html");
 res.end(await readFile(new URL(name,root)));
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const base={deviceId:"tram-one",label:"Gråkallbanen prototype",boardProfile:"grakallbanen-prototype-board",hardwareProfile:"rgb-strip-v1",status:"DEGRADED",firmwareVersion:"1.2.13",lastSeen:"2026-09-28T10:00:00Z",
 health:{freeHeap:240000,wifiRssi:null,lastFrameAgeSeconds:0,errors:[]}};
 const second={...base,deviceId:"bus-two",label:"Flybussen",status:"OFFLINE",boardProfile:"flybussen"};
 let listCalls=0,detailCalls=0,mode="ok";
 await page.route("https://transitcore-led-feed.lgb84.workers.dev/**",async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==="OPTIONS"){await route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"Authorization"}});return;}
  assert.equal(req.headers().authorization,"Bearer TEST-ONLY");
  const list=url.pathname==="/api/v1/devices";if(list)listCalls++;else detailCalls++;
  const payload=list?{devices:mode==="empty"?[]:url.searchParams.has("cursor")?[second]:[base],unavailable:[],nextCursor:mode==="empty"||url.searchParams.has("cursor")?null:"tram-one",generatedAt:"2026-09-28T10:01:00Z"}:
   {...base,otaEnabled:true,errors:[{code:"FRAME_FETCH_FAILED",severity:"warning",firstSeen:base.lastSeen,lastSeen:base.lastSeen,count:3,active:true,message:"Feed unavailable"}],
   history:[{receivedAt:base.lastSeen,status:"DEGRADED",health:base.health}]};
  await route.fulfill({status:mode==="unauthorized"?401:mode==="error"?503:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:JSON.stringify(payload)});
 });
 await page.goto("http://127.0.0.1:"+server.address().port);
 await page.locator("#token").fill("TEST-ONLY");await page.getByRole("button",{name:"Koble til",exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll("#rows tr").length===1);
 assert.equal(detailCalls,0);assert.equal(await page.locator("#token").inputValue(),"");
 assert.ok((await page.locator("#rows").innerText()).includes("Ikke rapportert"));
 await page.getByRole("button",{name:"Last neste 20"}).click();
 await page.waitForFunction(()=>document.querySelectorAll("#rows tr").length===2);
 await page.locator("#status").selectOption("OFFLINE");
 assert.equal(await page.locator("#rows tr").count(),1);
 assert.ok((await page.locator("#rows").innerText()).includes("Flybussen"));
 await page.locator("#status").selectOption("");
 await page.getByRole("button",{name:"Gråkallbanen prototype",exact:true}).click();
 await page.waitForFunction(()=>document.querySelector("#errors").textContent.includes("Gjentatt"));
 assert.equal(detailCalls,1);assert.ok((await page.locator("#detail-body").innerText()).includes("Ikke rapportert"));
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 assert.ok(!(await page.locator("body").innerText()).includes("TEST-ONLY"));
 if(process.env.FLEET_SCREENSHOT)await page.screenshot({path:process.env.FLEET_SCREENSHOT,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"No mobile page overflow");
 // Hidden tabs must make no requests, even with timers advanced by minutes.
 await page.clock.install();
 await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));});
 const before=listCalls+detailCalls;await page.clock.fastForward(180000);
 assert.equal(listCalls+detailCalls,before);
 await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>false});document.dispatchEvent(new Event("visibilitychange"));});
 await page.waitForFunction(()=>!document.querySelector("#refresh").disabled);
 assert.ok(listCalls+detailCalls>before);
 mode="error";await page.locator("#refresh").click();await page.waitForFunction(()=>document.querySelector("#message").textContent.includes("503"));
 assert.equal(await page.locator("#rows tr").count(),2,"Failed refresh retains visibly stale data");
 mode="unauthorized";await page.locator("#refresh").click();await page.waitForFunction(()=>!document.querySelector("#login").hidden);
 assert.equal(await page.locator("#rows tr").count(),0,"Auth failure clears data");
 mode="empty";await page.locator("#token").fill("TEST-ONLY");await page.getByRole("button",{name:"Koble til",exact:true}).click();
 await page.waitForFunction(()=>document.querySelector("#empty").textContent==="Ingen registrerte enheter.");
 await page.locator("#logout").click();const disconnected=listCalls+detailCalls;await page.clock.fastForward(180000);
 assert.equal(listCalls+detailCalls,disconnected);assert.deepEqual(errors,[]);
 console.log("Fleet browser: desktop/mobile, list/filter/detail/errors, no secrets, pagination, hidden tab, stale/API errors, auth failure, empty and logout passed");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}


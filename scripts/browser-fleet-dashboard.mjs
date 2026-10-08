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
console.log('Local mock server ready; launching browser');
const browser=await chromium.launch({headless:true,timeout:15000,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
console.log('Browser launched');
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const base={deviceId:"tram-one",label:"Gråkallbanen prototype",boardProfile:"grakallbanen-prototype-board",hardwareProfile:"rgb-strip-v1",status:"DEGRADED",firmwareVersion:"1.2.13",lastSeen:"2026-09-28T10:00:00Z",
 health:{freeHeap:240000,minimumFreeHeap:218928,wifiRssi:null,wifiConnected:null,wifiOutages:1,wifiRecoveries:1,
 uptimeSeconds:259260,bootCount:5,bootId:'tram-boot-5',resetReason:'POWER_ON',successfulPolls:25926,failedPolls:1,
 frameValid:true,lastFrameAgeSeconds:4,lastFrameSequence:1791400000,profileRevision:1,profileFingerprint:'0123456789abcdef',errors:[]},
 soak:{status:'PASS 72H',restartCount:0,bootChangedSincePrevious:false,current:{observedSeconds:259200,firstSeenAt:'2026-09-25T10:00:00Z',minObservedHeap:218928,heapDropCount:0},history:[]}};
 base.status='ONLINE';base.firmwareVersion='1.3.0';base.hardwareProfile='grakallbanen-prototype-board-hardware';
 const second={...base,deviceId:"bus-two",label:"Bus1 visual-test",status:"OFFLINE",boardProfile:"trondheim-bus-1-visual-test",
 hardwareProfile:'trondheim-bus-1-visual-test-hardware',firmwareVersion:'1.3.1',
 health:{...base.health,uptimeSeconds:120,bootCount:3,bootId:'bus-boot-3',resetReason:'SW',frameValid:false,lastFrameAgeSeconds:120},
 soak:{status:'NOT STARTED',reason:'REPORT_GAP',restartCount:1,bootChangedSincePrevious:true,lastRestartAt:base.lastSeen,
 current:{observedSeconds:60,firstSeenAt:base.lastSeen,minObservedHeap:210000,heapDropCount:1,lastHeapDropAt:base.lastSeen},
 history:[{bootId:'bus-boot-2',firstSeenAt:'2026-09-27T10:00:00Z',endedAt:base.lastSeen,observedSeconds:86400,outcome:'ABORTED',endReason:'REBOOT',milestones:{24:'2026-09-28T09:00:00Z'}}]}};
 let listCalls=0,detailCalls=0,mode="ok";
 await page.route("https://transitcore-led-feed.lgb84.workers.dev/**",async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==="OPTIONS"){await route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"Authorization"}});return;}
  assert.equal(req.headers().authorization,"Bearer TEST-ONLY");
  const list=url.pathname==="/api/v1/devices";if(list)listCalls++;else detailCalls++;
  const payload=list?{devices:mode==="empty"?[]:url.searchParams.has("cursor")?[second]:[base],unavailable:[],nextCursor:mode==="empty"||url.searchParams.has("cursor")?null:"tram-one",generatedAt:"2026-09-28T10:01:00Z"}:
   {...(url.pathname.endsWith('bus-two')?second:base),otaEnabled:false,errors:[{code:"FRAME_FETCH_FAILED",severity:"warning",firstSeen:base.lastSeen,lastSeen:base.lastSeen,count:3,active:false,message:"Feed unavailable"}],
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
 assert.ok((await page.locator("#rows").innerText()).includes("Bus1 visual-test"));
 await page.locator("#status").selectOption("");
 await page.getByRole("button",{name:"Gråkallbanen prototype",exact:true}).click();
 await page.waitForFunction(()=>document.querySelector("#errors").textContent.includes("Gjentatt"));
 assert.equal(detailCalls,1);assert.ok((await page.locator("#detail-body").innerText()).includes("Ikke rapportert"));
 const metric=label=>page.locator('#detail-body .metrics > div').filter({has:page.locator('dt',{hasText:new RegExp('^'+label+'$')})}).locator('dd').innerText();
 for(const [label,expected] of [['Status','ONLINE'],['Firmware','1.3.0'],['Oppetid','3d 0h 1m'],['Oppstarter','5'],
 ['Reset-årsak','POWER_ON'],['Wi-Fi-brudd','1'],['Wi-Fi tilbake','1'],['Vellykkede hentinger','25926'],
 ['Mislykkede hentinger','1'],['Frame gyldig','Ja'],['Frame-alder ved rapport','4 s'],['Ledig heap','240000 byte'],
 ['Laveste heap','218928 byte'],['Profilversjon','1'],['Profilfingeravtrykk','0123456789abcdef'],
 ['Tavle',base.boardProfile],['Hardware',base.hardwareProfile],['Soak','PASS 72H']])assert.equal(await metric(label),expected,label);
 assert.ok((await metric('Sist sett')).includes('2026'));
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 assert.ok(!(await page.locator("body").innerText()).includes("TEST-ONLY"));
 if(process.env.FLEET_SCREENSHOT)await page.screenshot({path:process.env.FLEET_SCREENSHOT,fullPage:true});
 assert.ok((await page.locator('#rows').innerText()).includes('PASS 72H'));
 assert.ok((await page.locator('#detail-body').innerText()).includes('3d 0h 1m'));
 await page.getByRole('button',{name:'Bus1 visual-test',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#detail-body').textContent.includes('bus-boot-3'));
 assert.equal(await metric('Status'),'OFFLINE');assert.equal(await metric('Oppstarter'),'3');
 assert.equal(await metric('Reset siden forrige rapport'),'Ja');assert.equal(await metric('Soak'),'NOT STARTED');
 assert.ok((await page.locator('#detail-body').innerText()).includes('ABORTED / REBOOT'));
 assert.ok((await page.locator('#rows').innerText()).includes('NY BOOT / RESET'));
 if(process.env.FLEET_SCREENSHOT)await page.screenshot({path:process.env.FLEET_SCREENSHOT.replace('.png','-bus1.png'),fullPage:true});
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

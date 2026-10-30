// Optional real-browser suite: PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_PATH=/usr/bin/chromium node scripts/browser-intransit-map.mjs
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url);
let calls=0,live=false;
const board=JSON.parse(await readFile(new URL('config/boards/trondheim-bus-board.json',root))),hardware=JSON.parse(await readFile(new URL('config/hardware/trondheim-bus-board-hardware.json',root)));
const catalog=JSON.parse(await readFile(new URL('config/boards/trondheim-city-lines-catalog.json',root)));
const ranheimLed=catalog.nodes.find(node=>node.stopIds?.includes('NSR:Quay:74982'))?.led;
const tonstadLed=catalog.nodes.find(node=>node.quayId==='NSR:Quay:102733')?.led;
assert(Number.isInteger(tonstadLed),'Tonstad Quay has a known physical LED in the catalog');
assert(Number.isInteger(ranheimLed)&&ranheimLed>=0&&ranheimLed<1282,'Ranheim Quay has a real catalog LED');
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/v1/frame/')){calls++;res.setHeader('content-type','application/json');res.end(JSON.stringify({schemaVersion:1,boardProfile:path.split('/').pop(),ledCount:path.split('/').pop()==='trondheim-city-lines-catalog'?1282:147,sequence:calls,generatedAt:new Date(Date.now()-(live?8000:0)).toISOString(),ttlSeconds:live?10:30,leds:live?[{id:ranheimLed,brightness:32,state:'AT_STOP',rgb:[255,0,0],vehicle:{id:'fixture-bus',line:'1',source:'ETA'},occupants:[{id:'fixture-bus',line:'1',source:'ETA',state:'AT_STOP',rgb:[255,0,0]}]}]:[]}));return;}
 const file=new URL('.'+path,root);if(!file.href.startsWith(root.href)){res.writeHead(403).end();return;}
 res.setHeader('content-type',path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.css')?'text/css':path.endsWith('.jpg')?'image/jpeg':'text/html');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{}),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://transitcore-linear-staging.lgb84.workers.dev/**',r=>r.fulfill({status:503,body:'test staging unavailable'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/web/linear/index.html`);
 await page.waitForFunction(()=>document.querySelectorAll('#rows .row').length>0);
 await page.locator('#tonstadTest summary').click();
 await page.waitForFunction(()=>document.querySelector('#tonstadLed').textContent!=='–');
 assert.equal(await page.locator('#tonstadLed').textContent(),String(tonstadLed),
  'Tonstadkrysset live panel must map to the exact catalog LED');
 assert.match(await page.locator('#tonstadState').textContent(),/Ingen bekreftet buss|Venter på data|Frame er/);
 assert.equal(await page.locator('#tonstadFocus').count(),1,
  'Tester can focus original Tonstadkrysset stop from existing Linear map');
 const rows=await page.locator('#rows').innerHTML(),route=await page.locator('#route').inputValue(),before=calls;
 await page.locator('#networkMode').click();await page.waitForSelector('.map-stop');
 assert.equal(calls,before,'Mode switch must not request another frame');assert.equal(await page.locator('#route').inputValue(),route);
 assert.equal(await page.locator('#linearView').isVisible(),false);
 assert.equal(await page.locator('.map-stop[data-state="OFF"]').count(),await page.locator('.map-stop').count(),'Unresolved points must stay OFF');
 // One-day history is recorded by a server cron; browser only reads samples
 // and switches a replay overlay without altering the live PixelFrame feed.
 const historyDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'})
   .format(new Date(Date.now()-86400000));
 const times=[Date.now()-86400000-601000,Date.now()-86400000-301000,Date.now()-86400000-1000];
 const historyFrames=times.map((ms,i)=>({
  version:1,day:historyDay,slot:Math.floor(ms/300000)*300000,
  capturedAt:new Date(ms).toISOString(),status:i===1?'ERROR':'OK',error:i===1?'fixture HTTP 503':null,
  frame:i===1?null:{schemaVersion:1,boardProfile:i===0?'trondheim-shared-stops-board':'trondheim-city-lines-catalog',
   ledCount:i===0?147:1282,sequence:11+i,ttlSeconds:30,generatedAt:new Date(ms).toISOString(),
   leds:[{id:0,state:'AT_STOP',rgb:[255,0,0],brightness:32,
    vehicle:{id:'history-bus',line:'1',source:'GPS'},
    occupants:[{id:'history-bus',line:'1',state:'AT_STOP',rgb:[255,0,0],source:'GPS'}]}]}
 }));
 let demoPinned=false,historyReads=0;
 await page.route(/https:\/\/transitcore-led-feed\.lgb84\.workers\.dev\/v1\/trondheim\/history(?:\?|$)/,async route=>{
  historyReads++;const url=new URL(route.request().url()),selected=url.searchParams.get('day');
  const data=selected?{version:1,day:historyDay,archived:false,
   records:historyFrames,nextCursor:null}:{version:1,boardProfile:'trondheim-city-lines-catalog',
    cadenceMinutes:5,currentDay:'2026-10-28',previousDay:historyDay,
    archive:demoPinned?{day:historyDay}:null,
    days:[{day:historyDay,count:3,errors:1,savedAsDemo:demoPinned}]};
  await route.fulfill({status:200,contentType:'application/json',
   headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
 });
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/v1/admin/trondheim/history/demo',async route=>{
  if(route.request().method()==='OPTIONS'){
   await route.fulfill({status:204,headers:{'access-control-allow-origin':'*',
    'access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'POST, OPTIONS'}});return;
  }
  assert.equal(route.request().headers().authorization,'Bearer browser-demo-admin');
  assert.equal(route.request().postDataJSON().day,historyDay);
  demoPinned=true;
  await route.fulfill({status:200,contentType:'application/json',
   headers:{'access-control-allow-origin':'*'},
   body:JSON.stringify({ok:true,demo:{day:historyDay,count:3,errors:1}})});
 });
 await page.locator('[data-role=dayHistory] summary').click();
 await page.waitForFunction(()=>document.querySelector('[data-h=day]').options.length>1);
 await page.locator('[data-h=day]').selectOption(historyDay);
 await page.locator('[data-h=load]').click();
 await page.waitForFunction(()=>document.querySelector('[data-h=time]').textContent.includes('1/3'));
 assert.match(await page.locator('[data-role=summary]').innerText(),/HISTORIKK – IKKE LIVE/);
 assert.equal(await page.locator('.map-stop[data-stop="original-004"][data-state="AT_STOP"]').count(),1);
 await page.locator('[data-h=timeline]').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.match(await page.locator('[data-h=time]').innerText(),/MÅLEFEIL/);
 assert.equal(await page.locator('.map-stop[data-state="AT_STOP"]').count(),0,'A failed sample must never copy prior LED state');
 await page.locator('[data-h=timeline]').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.locator('.map-stop[data-stop="original-004"][data-state="AT_STOP"]').count(),0,'New catalog frame must not reuse the old 147-point LED zero');
 const historyDownload=page.waitForEvent('download');
 await page.locator('[data-h=export]').click();
 assert.equal((await historyDownload).suggestedFilename(),'trondheim-historikk-'+historyDay+'.json');
 await page.locator('[data-h=key]').fill('browser-demo-admin');
 await page.locator('[data-h=pin]').click();
 await page.waitForFunction(()=>document.querySelector('[data-h=status]').textContent.includes('Arkivert som demo'));
 assert.equal(demoPinned,true);
 await page.locator('[data-h=live]').click();
 assert.doesNotMatch(await page.locator('[data-role=summary]').innerText(),/HISTORIKK – IKKE LIVE/);
 assert(historyReads>=3,'Index refresh, day records and archive refresh must be loaded separately');
 await page.locator('[data-role=dayHistory] summary').click();
 const screenshotDir=process.env.INTRANSIT_SCREENSHOT_DIR;
 const saveScreenshot=async(name)=>{
  if(!screenshotDir)return;
  await mkdir(screenshotDir,{recursive:true});
  await page.screenshot({path:join(screenshotDir,name),fullPage:true,animations:'disabled'});
 };
 // Screenshots are offline test fixtures; no user data or live third-party calls.
 await saveScreenshot('01-dark-network-desktop.png');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile map must not overflow');
 await saveScreenshot('02-dark-network-mobile.png');
 await page.setViewportSize({width:1280,height:1000});
 const largeLabels=page.locator('[data-role=largeLabels]');
 assert.equal(await largeLabels.isChecked(),false);
 await largeLabels.check();
 assert.equal(await page.locator('svg.map-viewport').evaluate(el=>el.classList.contains('map-big-labels')),true);
 await saveScreenshot('05-large-stop-labels.png');
 await largeLabels.uncheck();
 assert.equal(await page.locator('svg.map-viewport').evaluate(el=>el.classList.contains('map-big-labels')),false);
 const auditRequests=calls;
 const reference=page.locator('[data-role=reference]'),routeColors=page.locator('[data-role=routeColors]');
 assert.equal(await reference.isChecked(),false);
 await reference.check();assert.equal(await page.locator('svg.map-viewport image').getAttribute('opacity'),'0.55');
 await saveScreenshot('03-white-original-overlay.png');
 await reference.uncheck();assert.equal(await page.locator('svg.map-viewport image').getAttribute('opacity'),'0.08');
 assert.equal(await routeColors.isChecked(),true);
 await routeColors.uncheck();assert.equal(await page.locator('.map-route-confirmed').count(),0);
 await routeColors.check();
 assert((await page.locator('.map-route-confirmed').count())>0,'Documented route color overlays must exist for line 1');
 await page.locator('[data-role=reviewPath]').selectOption('trace-04');
 await saveScreenshot('04-route-review-trace-04.png');
 assert.match(await page.locator('[data-role=details]').innerText(),/trace-04/);
 assert.equal(calls,auditRequests,'Map review controls must not fetch live frames');
 // Read-only map diagnostics must load without adding any feed requests.
 const beforeDebug=calls;
 await page.locator('[data-role=liveDebug] summary').click();
 await page.locator('[data-role=debugStop]').selectOption('original-014');
 assert.match(await page.locator('[data-role=debugQuays]').innerText(),/NSR:Quay:73975/);
 assert.match(await page.locator('[data-role=debugMeta]').innerText(),/frame #/);
 await page.locator('[data-role=debugQuay]').selectOption('NSR:Quay:73975');
 assert.match(await page.locator('[data-role=debugReason]').innerText(),/^(VISIBLE|OTHER_LINE|NOT_OBSERVED|NO_FRAME|NOT_IN_BOARD|EXPIRED)$/);
 await page.locator('[data-role=debugVehicle]').fill('bus-not-in-this-frame');
 assert.match(await page.locator('[data-role=debugVehicleResult]').innerText(),/ikke observert|Ingen gyldig frame/);
 const debugDownload=page.waitForEvent('download');
 await page.locator('[data-act=exportLiveDebug]').click();
 assert.equal((await debugDownload).suggestedFilename(),'trondheim-live-diagnose.json');
 assert.equal(calls,beforeDebug,'Live diagnostics must not fetch extra frames');
 await page.locator('[data-role=liveDebug] summary').click();
 await page.locator('[data-act=fit]').click();
 const box=await page.locator('svg.map-viewport').getAttribute('viewBox');await page.locator('[data-act=in]').click();assert.notEqual(await page.locator('svg.map-viewport').getAttribute('viewBox'),box);await page.locator('[data-act=fit]').click();
 await page.locator('[data-act=edit]').click();
 // Unresolved, label-less original marker is selectable and renameable by touch.
 const mobile=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await mobile.goto(`http://127.0.0.1:${server.address().port}/web/linear/index.html?view=network&stop=original-003`);
 await mobile.waitForSelector('.map-stop[data-stop="original-003"]');
 await mobile.locator('[data-act=edit]').click();
 const yellow=mobile.locator('.map-stop[data-stop="original-003"]');
 await yellow.tap();
 await mobile.getByLabel('Navn på holdeplassen (lokalt visningsnavn)').fill('Gult stopp test');
 await mobile.getByRole('button',{name:'Lagre visningsnavn'}).click();
 assert.equal(await mobile.locator('.map-label[data-label="original-003"]').textContent(),'Gult stopp test');
 await mobile.reload();
 await mobile.waitForSelector('.map-label[data-label="original-003"]');
 assert.equal(await mobile.locator('.map-label[data-label="original-003"]').textContent(),'Gult stopp test');
 await mobile.close();
 // Exercise real UI -> authenticated Worker request -> acknowledged cloud save.
 let cloudRevision=0,cloudStored=null,cloudSaves=0,cloudAuthValid=true;
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/v1/admin/linear-draft',async route=>{
  const request=route.request();
  if(request.method()!=='OPTIONS')cloudAuthValid&&=(request.headers().authorization==='Bearer browser-test-secret');
  let result,status=200;
  if(request.method()==='OPTIONS'){
   await route.fulfill({status:204,headers:{
    'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type',
    'access-control-allow-methods':'GET, PUT, OPTIONS'
   }});
   return;
  }
  if(request.method()==='GET')result={revision:cloudRevision,snapshot:cloudStored};
  else if(request.method()==='PUT'){
   const body=request.postDataJSON();
   if(body.expectedRevision!==cloudRevision){status=409;result={error:'revision_conflict',revision:cloudRevision};}
   else{
    cloudRevision++;cloudSaves++;
    cloudStored={...body,revision:cloudRevision,savedAt:new Date().toISOString()};
    result={ok:true,revision:cloudRevision,savedAt:cloudStored.savedAt};
   }
  }else{status=405;result={error:'invalid_method'};}
  await route.fulfill({status,contentType:'application/json',headers:{
   'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type',
   'access-control-allow-methods':'GET, PUT, OPTIONS'
  },body:JSON.stringify(result)});
 });
 let mapPublished=false;
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/v1/admin/linear-publish',async route=>{
  if(route.request().method()==='OPTIONS'){
   await route.fulfill({status:204,headers:{
    'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type',
    'access-control-allow-methods':'POST, OPTIONS'
   }});return;
  }
  const req=route.request(),payload=req.postDataJSON();
  assert.equal(req.headers().authorization,'Bearer browser-test-secret');
  assert.equal(payload.expectedRevision,cloudRevision);
  assert.equal(cloudSaves>0,true,'Publish must use a saved cloud revision');
  mapPublished=true;
  await route.fulfill({status:201,contentType:'application/json',headers:{
   'access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type',
   'access-control-allow-methods':'POST, OPTIONS'
  },body:JSON.stringify({ok:true,pullRequestNumber:261,pullRequestUrl:'https://github.com/5mkbt4m7n8-hue/transitcore/pull/261'})});
 });
 await page.locator('[data-role=cloudKey]').fill('browser-test-secret');
 await page.locator('[data-act=cloudConnect]').click();
 await page.waitForFunction(()=>document.querySelector('[data-role=cloudStatus]').textContent.includes('Skylagring aktiv'));
 await page.locator('[data-role=focus]').selectOption('original-014');
 await page.getByLabel('Navn på holdeplassen (lokalt visningsnavn)').fill('Solsiden skytest');
 await page.getByRole('button',{name:'Lagre visningsnavn'}).click();
 await page.waitForFunction(()=>document.querySelector('[data-role=cloudStatus]').textContent.includes('Lagret permanent i skyen'));
 assert.equal(cloudStored.names['original-014'],'Solsiden skytest');
 assert(cloudSaves>=1&&cloudAuthValid,'Cloud save must use authorized Worker with valid revision');
 assert.equal(await page.locator('[data-act=publishMap]').isEnabled(),true);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-act=publishMap]').click();
 await page.waitForFunction(()=>document.querySelector('[data-role=publishLink]').hidden===false);
 assert.equal(mapPublished,true,'Confirming publication creates a draft PR request');
 assert.match(await page.locator('[data-role=publishLink]').getAttribute('href'),/\/pull\/261$/);
 // Switch back to the normal offline test mode; the same edits stay local.
 await page.locator('[data-act=cloudDisconnect]').click();
 await page.getByRole('button',{name:'Bruk originalnavn'}).click();
 assert.equal(await page.locator('.map-label[data-label="original-014"]').textContent(),'Solsiden');
 // Rename and reposition a pre-existing, already named stop.
 await page.locator('[data-role=focus]').selectOption('original-014');
 await page.getByLabel('Navn på holdeplassen (lokalt visningsnavn)').fill('Solsiden korrigert');
 await page.getByRole('button',{name:'Lagre visningsnavn'}).click();
 assert.equal(await page.locator('.map-label[data-label="original-014"]').textContent(),'Solsiden korrigert');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.names['original-014']),'Solsiden korrigert');
 const pathSnapshot=await page.locator('.map-route').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('points')));
 const originalPoint=await page.evaluate(async()=>{const layout=await fetch('./network/trondheim-layout.json').then(r=>r.json());return layout.stops.find(s=>s.id==='original-014');});
 // Drag and undo must also leave the drawn lines unchanged.
 const marker=page.locator('.map-stop[data-stop="original-014"]').first();
 await marker.scrollIntoViewIfNeeded();
 const markerBox=await marker.boundingBox();
 await page.mouse.move(markerBox.x+markerBox.width/2,markerBox.y+markerBox.height/2);
 await page.mouse.down();
 await page.mouse.move(markerBox.x+markerBox.width/2+25,markerBox.y+markerBox.height/2+20,{steps:5});
 await page.mouse.up();
 const dragged=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-map-autodraft-v1')).layout.stops.find(s=>s.id==='original-014'));
 assert(Math.hypot(dragged.x-originalPoint.x,dragged.y-originalPoint.y)>1,'Drag actually moves marker');
 assert.deepEqual(await page.locator('.map-route').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('points'))),pathSnapshot,'Drag movement preserves all lines');
 await page.locator('[data-act=undo]').click();
 await page.getByRole('button',{name:'Flytt valgt holdeplass'}).click();
 await page.locator('svg.map-viewport').click({position:{x:210,y:205}});
 assert.deepEqual(await page.locator('.map-route').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('points'))),pathSnapshot,'Tap movement preserves all rendered lines');
 const movedDraft=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-map-autodraft-v1')));
 const movedPoint=movedDraft.layout.stops.find(s=>s.id==='original-014');
 assert(movedPoint&&Math.hypot(movedPoint.x-originalPoint.x,movedPoint.y-originalPoint.y)>10,'Tap placement updates existing station coordinates');
 assert.equal(await page.locator('.map-label[data-label="original-014"]').textContent(),'Solsiden korrigert');
 await page.locator('[data-act=undo]').click();
 await page.getByRole('button',{name:'Bruk originalnavn'}).click();
 assert.equal(await page.locator('.map-label[data-label="original-014"]').textContent(),'Solsiden');
 // Restore full-map coordinates before the existing sketch placement tests.
 await page.locator('[data-act=fit]').click();
 // Explicitly selecting a line still exposes independently editable vertices.
 await page.locator('[data-role=reviewPath]').selectOption('trace-04');
 assert((await page.locator('.map-handle[data-path="trace-04"]').count())>0);
 const lineBefore=await page.locator('.map-route[data-route-path="trace-04"]').getAttribute('points');
 await page.locator('.map-handle[data-path="trace-04"]').first().scrollIntoViewIfNeeded();
 const handleBox=await page.locator('.map-handle[data-path="trace-04"]').first().boundingBox();
 await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2);
 await page.mouse.down();
 await page.mouse.move(handleBox.x+handleBox.width/2+20,handleBox.y+handleBox.height/2+20,{steps:4});
 await page.mouse.up();
 assert.notEqual(await page.locator('.map-route[data-route-path="trace-04"]').getAttribute('points'),lineBefore);
 await page.locator('[data-act=undo]').click();
 await page.locator('[data-act=fit]').click();
 // The original white drawing is not modified when adding/removing a new element.
 const initialStops=await page.locator('.map-stop').count(),initialPaths=await page.locator('.map-route').count();
 await page.locator('[data-act=addStop]').click();
 assert.equal(await page.locator('.map-stop').count(),initialStops,'Placement button should not create a point until a map tap');
 await page.locator('svg.map-viewport').click({position:{x:120,y:160}});
 assert.equal(await page.locator('.map-stop').count(),initialStops+1);
 assert.equal(await page.locator('.map-stop[data-stop="custom-stop-001"][data-unresolved="true"][data-state="OFF"]').count(),1,'Unmapped new stop is never displayed as live');
 await page.locator('[data-act=undo]').click();
 assert.equal(await page.locator('.map-stop').count(),initialStops,'Undo removes only the newly added stop');
 // Draw a new line by consecutive taps, without saving an invalid partial route.
 await page.locator('[data-act=addPath]').click();
 assert.equal(await page.locator('[data-role=sketchControls]').isVisible(),true,'Multi-tap sketch controls should open: '+await page.locator('[data-role=details]').innerText());
 assert.equal(await page.locator('.map-route').count(),initialPaths,'Drawing only starts a preview');
 const canvas=page.locator('svg.map-viewport');
 const tapMap=async(x,y)=>{
  const position=await canvas.evaluate((svg,point)=>{
   const p=svg.createSVGPoint();p.x=point.x;p.y=point.y;
   const screen=p.matrixTransform(svg.getScreenCTM()),rect=svg.getBoundingClientRect();
   return {x:screen.x-rect.left,y:screen.y-rect.top};
  },{x,y});
  await canvas.click({position});
 };
 await tapMap(320,370);
 assert.equal(await page.locator('.map-route').count(),initialPaths,'One preview point is not a saved line');
 assert.equal(await page.locator('.map-sketch-vertex').count(),1,'First map coordinate creates a draft vertex');
 assert.equal(await page.locator('[data-act=finishSketch]').isDisabled(),true);
 await tapMap(370,415);
 assert.equal(await page.locator('.map-sketch-vertex').count(),2);
 await tapMap(415,465);
 assert.equal(await page.locator('.map-sketch-vertex').count(),3);
 await page.locator('[data-act=sketchUndo]').click();
 assert.equal(await page.locator('.map-sketch-vertex').count(),2,'Remove last unsaved vertex');
 await tapMap(415,465);
 await page.locator('[data-act=finishSketch]').click();
 assert.equal(await page.locator('.map-sketch-vertex').count(),0,'Preview is cleared on completion');
 assert.equal(await page.locator('.map-route').count(),initialPaths+1,'Completed 3-vertex route is saved');
 assert.equal(await page.locator('[data-route-path="custom-path-001"]').count(),1);
 assert.equal(await page.locator('.map-route[data-route-path="custom-path-001"]').getAttribute('points').then(v=>v.trim().split(' ').length),3);
 // Extend the same route by drawing more vertices; existing points stay fixed.
 await page.getByRole('button',{name:'Fortsett å tegne fra siste punkt'}).click();
 await tapMap(470,520);
 await tapMap(520,560);
 assert.equal(await page.locator('.map-route[data-route-path="custom-path-001"]').getAttribute('points').then(v=>v.trim().split(' ').length),3,'No partial edits while drawing');
 await page.locator('[data-act=finishSketch]').click();
 assert.equal(await page.locator('.map-route[data-route-path="custom-path-001"]').getAttribute('points').then(v=>v.trim().split(' ').length),5,'Extended route includes new drawn vertices');
 await page.locator('[data-act=undo]').click();
 assert.equal(await page.locator('.map-route[data-route-path="custom-path-001"]').getAttribute('points').then(v=>v.trim().split(' ').length),3,'Undo the complete extension');
 // Cancel a sketch without touching existing geometry.
 await page.locator('[data-act=addPath]').click();
 await tapMap(240,230);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('[data-role=sketchControls]').isVisible(),false,'Escape cancels unfinished sketch');
 assert.equal(await page.locator('.map-route').count(),initialPaths+1);
 await page.getByRole('button',{name:'+ Forleng linjen'}).click();
 assert.equal(await page.locator('.map-route[data-route-path="custom-path-001"]').getAttribute('points').then(v=>v.trim().split(' ').length),4);
 await page.getByRole('button',{name:'+ Knekkpunkt i valgt delstrekning'}).click();
 assert.equal(await page.locator('.map-route[data-route-path="custom-path-001"]').getAttribute('points').then(v=>v.trim().split(' ').length),5);
 await page.locator('[data-act=undo]').click();
 await page.locator('[data-act=undo]').click();
 await page.locator('[data-act=undo]').click();
 assert.equal(await page.locator('.map-route').count(),initialPaths,'Undo restores all original 18 paths');
 assert.equal(await page.locator('.map-stop').count(),initialStops,'Original stops are preserved');
 // Review one edge in the offline fixture. Undo restores the untouched layout.
 await page.locator('[data-role=reviewPath]').selectOption('trace-04');
 await page.locator('.map-segment-editor select[aria-label="Velg delstrekning"]').selectOption('0');
 await page.locator('.map-segment-editor select[aria-label="Busslinje for delstrekning"]').selectOption('atb-bus-1-live');
 await page.locator('.map-segment-editor button').first().click();
 assert.equal(await page.locator('.map-route-reviewed[data-path="trace-04"][data-edge="0"]').count(),1,'Manually reviewed route overlay must appear for current line');
 await page.locator('[data-act=undo]').click();
 assert.equal(await page.locator('.map-route-reviewed').count(),0,'Undo must remove reviewed route overlay');
 await page.locator('.map-stop').first().click();
 await page.getByLabel('To dioder',{exact:true}).check();assert.equal(await page.locator('.map-stop[data-direction]').count(),2);
 await page.locator('[data-act=undo]').click();assert.equal(await page.locator('.map-stop[data-direction]').count(),0);
 // The platform-audit workflow must enumerate verified Entur Quays without
 // guessing which side corresponds to route direction 0 or direction 1.
 assert.match(await page.locator('[data-role=platformProgress]').innerText(),/0\/65/);
 await page.locator('[data-act=nextPlatformReview]').click();
 await page.locator('[data-role=focus]').selectOption('original-014');
 await page.getByLabel('Kartside for NSR:Quay:73975').selectOption('left');
 assert.equal(await page.locator('.map-stop[data-stop="original-014"][data-side="left"]').getAttribute('data-review'),'user-reviewed');
 assert.equal(await page.locator('.map-stop[data-stop="original-014"][data-side="right"]').getAttribute('data-review'),'pending');
 await page.getByLabel('Kartside for NSR:Quay:73976').selectOption('right');
 assert.match(await page.locator('[data-role=platformProgress]').innerText(),/1\/65/);
 assert.equal(await page.locator('.map-stop[data-stop="original-014"][data-side="right"]').getAttribute('data-review'),'user-reviewed');
 const savedSides=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-map-autodraft-v1')).layout.stops.find(s=>s.id==='original-014').platformSides);
 assert.deepEqual(savedSides,{'NSR:Quay:73975':{side:'left',verification:'user-reviewed'},'NSR:Quay:73976':{side:'right',verification:'user-reviewed'}});
 await page.locator('[data-act=undo]').click();
 assert.match(await page.locator('[data-role=platformProgress]').innerText(),/0\/65/);
 await page.locator('[data-act=undo]').click();
 assert.equal(await page.locator('.map-stop[data-stop="original-014"][data-side]').count(),0);
 // The audit UI zooms to one stop. Restore the full map before the unrelated
 // Ranheim real-time click test that follows later in this suite.
 await page.locator('[data-act=fit]').click();

 const download=page.waitForEvent('download');await page.locator('[data-act=export]').click();assert.equal((await download).suggestedFilename(),'trondheim-layout.json');
 await page.locator('#linearMode').click();assert.equal(await page.locator('#rows').innerHTML(),rows);assert.equal(await page.locator('#linearView').isVisible(),true);
 // The original Ranheim marker has an exact Quay binding in the 1282-point catalog.
 live=true;await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('VALID'));
 await page.locator('#networkMode').click();await page.waitForSelector('.map-stop[data-state="AT_STOP"]');
 await page.locator('.map-stop[data-state="AT_STOP"]').first().click();assert.match(await page.locator('[data-role=details]').innerText(),/Kilde: ETA/);
 await page.locator('[data-role=liveDebug] summary').click();
 await page.locator('[data-role=debugStop]').selectOption('original-004');
 await page.locator('[data-role=debugVehicle]').fill('fixture-bus');
 assert.match(await page.locator('[data-role=debugVehicleResult]').innerText(),/fixture-bus/);
 assert.match(await page.locator('[data-role=debugVehicleResult]').innerText(),new RegExp('LED '+ranheimLed+'\\b'));
 assert.equal(await page.locator('[data-role=debugHealth]').getAttribute('data-code'),'VALID');
 await page.locator('[data-role=liveDebug] summary').click();
 await page.locator('[data-act=fit]').click();
 assert.doesNotMatch(await page.locator('[data-role=details]').innerText(),/Kilde: GPS/);
 await page.waitForFunction(()=>document.querySelectorAll('.map-stop[data-state="AT_STOP"]').length===0,{timeout:7000});
 live=false;

 await page.locator('#source').selectOption('staging');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('503'));
 await page.locator('#networkMode').click();assert.equal(await page.locator('.map-stop:not([data-state="OFF"])').count(),0);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile must not overflow');
 // A second session confirms that local edits survive reload, and that
 // discarding them restores the shipped version instead of resurrecting a draft.
 const editPage=await browser.newPage({viewport:{width:1100,height:850}});
 const editErrors=[];editPage.on('pageerror',error=>editErrors.push(error.message));
 await editPage.goto(`http://127.0.0.1:${server.address().port}/web/linear/index.html`);
 await editPage.waitForFunction(()=>document.querySelectorAll('#rows .row').length>0);
 await editPage.locator('#networkMode').click();
 await editPage.waitForSelector('.map-stop');
 const baseStopCount=await editPage.locator('.map-stop').count();
 await editPage.locator('[data-act=edit]').click();
 await editPage.locator('[data-act=addStop]').click();
 await editPage.locator('svg.map-viewport').click({position:{x:185,y:225}});
 assert.equal(await editPage.locator('.map-stop').count(),baseStopCount+1,'Tap creates exactly one mapped-position draft stop');
 assert.match(await editPage.locator('[data-role=draftStatus]').innerText(),/lagret automatisk/);
 const draft=await editPage.evaluate(()=>JSON.parse(localStorage.getItem('intransit-map-autodraft-v1')));
 assert.equal(draft.layout.stops.length,101,'Auto-draft contains all 100 original stops and exactly one new stop');
 await editPage.reload();
 await editPage.waitForFunction(()=>document.querySelectorAll('#rows .row').length>0);
 await editPage.locator('#networkMode').click();
 await editPage.waitForSelector('.map-stop[data-stop="custom-stop-001"]');
 assert.equal(await editPage.locator('.map-stop').count(),baseStopCount+1,'Auto-saved point must survive a reload');
 assert.match(await editPage.locator('[data-role=draftStatus]').innerText(),/hentet automatisk/);
 await editPage.locator('[data-act=edit]').click();
 await editPage.locator('[data-act=discard]').click();
 assert.equal(await editPage.locator('.map-stop').count(),baseStopCount,'Discard restores original map geometry');
 assert.equal(await editPage.evaluate(()=>localStorage.getItem('intransit-map-autodraft-v1')),null,'Discard deletes only the autosaved local draft');
 await editPage.reload();
 await editPage.waitForFunction(()=>document.querySelectorAll('#rows .row').length>0);
 await editPage.locator('#networkMode').click();
 await editPage.waitForSelector('.map-stop');
 assert.equal(await editPage.locator('.map-stop').count(),baseStopCount,'Discarded draft must not return');
 assert.deepEqual(editErrors,[]);
 await editPage.close();
 // Approved changes load as a public overlay without replacing original
 // source geometry or depending on a secret / localStorage.
 const publishedPage=await browser.newPage();
 const original=JSON.parse(await readFile(new URL('web/linear/network/trondheim-layout.json',root)));
 const json=JSON.stringify(original);let hash=2166136261;
 for(let i=0;i<json.length;i++){hash^=json.charCodeAt(i);hash=Math.imul(hash,16777619);}
 const fp=(hash>>>0).toString(16)+'-'+json.length;
 const accepted=structuredClone(original),s=accepted.stops.find(s=>s.id==='original-014');
 s.x+=7;s.label.x+=7;
 await publishedPage.route('**/web/linear/network/published-edits.json',r=>r.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({
   version:1,baseFingerprint:fp,sourceRevision:4,
   publishedAt:new Date().toISOString(),layout:accepted,names:{'original-014':'Solsiden publisert'}
  })
 }));
 await publishedPage.goto(`http://127.0.0.1:${server.address().port}/web/linear/index.html`);
 await publishedPage.waitForFunction(()=>document.querySelectorAll('#rows .row').length>0);
 await publishedPage.locator('#networkMode').click();
 await publishedPage.waitForSelector('.map-stop[data-stop="original-014"]');
 assert.equal(await publishedPage.locator('.map-label[data-label="original-014"]').textContent(),'Solsiden publisert');
 const drawn=await publishedPage.locator('.map-stop[data-stop="original-014"]').first().getAttribute('transform');
 assert(drawn.includes(String(s.x)),'Approved position is shown on public map');
 await publishedPage.close();

 assert.deepEqual(errors,[]);console.log('Browser: map editor tap-placement, autosave, reload, discard, original geometry, route overlays, mobile and feed regression PASS');
}finally{await browser.close();await new Promise(r=>server.close(r));}

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
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/v1/frame/')){calls++;res.setHeader('content-type','application/json');res.end(JSON.stringify({schemaVersion:1,boardProfile:path.split('/').pop(),ledCount:147,sequence:calls,generatedAt:new Date(Date.now()-(live?8000:0)).toISOString(),ttlSeconds:live?10:30,leds:live?[{id:0,brightness:32,state:'AT_STOP',rgb:[255,0,0],vehicle:{id:'fixture-bus',line:'1',source:'ETA'},occupants:[{id:'fixture-bus',line:'1',source:'ETA',state:'AT_STOP',rgb:[255,0,0]}]}]:[]}));return;}
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
 const rows=await page.locator('#rows').innerHTML(),route=await page.locator('#route').inputValue(),before=calls;
 await page.locator('#networkMode').click();await page.waitForSelector('.map-stop');
 assert.equal(calls,before,'Mode switch must not request another frame');assert.equal(await page.locator('#route').inputValue(),route);
 assert.equal(await page.locator('#linearView').isVisible(),false);
 assert.equal(await page.locator('.map-stop[data-state="OFF"]').count(),await page.locator('.map-stop').count(),'Unresolved points must stay OFF');
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
 const box=await page.locator('svg.map-viewport').getAttribute('viewBox');await page.locator('[data-act=in]').click();assert.notEqual(await page.locator('svg.map-viewport').getAttribute('viewBox'),box);await page.locator('[data-act=fit]').click();
 await page.locator('[data-act=edit]').click();
 // Exercise real UI -> authenticated Worker request -> acknowledged cloud save.
 let cloudRevision=0,cloudStored=null,cloudSaves=0,cloudAuthValid=true;
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/v1/admin/linear-draft',async route=>{
  const request=route.request();
  cloudAuthValid&&=(request.headers().authorization==='Bearer browser-test-secret');
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
 await page.locator('[data-role=cloudKey]').fill('browser-test-secret');
 await page.locator('[data-act=cloudConnect]').click();
 await page.waitForFunction(()=>document.querySelector('[data-role=cloudStatus]').textContent.includes('Skylagring aktiv'));
 await page.locator('[data-role=focus]').selectOption('original-014');
 await page.getByLabel('Navn på holdeplassen (lokalt visningsnavn)').fill('Solsiden skytest');
 await page.getByRole('button',{name:'Lagre visningsnavn'}).click();
 await page.waitForFunction(()=>document.querySelector('[data-role=cloudStatus]').textContent.includes('Lagret permanent i skyen'));
 assert.equal(cloudStored.names['original-014'],'Solsiden skytest');
 assert(cloudSaves>=1&&cloudAuthValid,'Cloud save must use authorized Worker with valid revision');
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
 const originalPoint=await page.evaluate(async()=>{const layout=await fetch('./network/trondheim-layout.json').then(r=>r.json());return layout.stops.find(s=>s.id==='original-014');});
 await page.getByRole('button',{name:'Flytt valgt holdeplass'}).click();
 await page.locator('svg.map-viewport').click({position:{x:210,y:205}});
 const movedDraft=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-map-autodraft-v1')));
 const movedPoint=movedDraft.layout.stops.find(s=>s.id==='original-014');
 assert(movedPoint&&Math.hypot(movedPoint.x-originalPoint.x,movedPoint.y-originalPoint.y)>10,'Tap placement updates existing station coordinates');
 assert.equal(await page.locator('.map-label[data-label="original-014"]').textContent(),'Solsiden korrigert');
 await page.locator('[data-act=undo]').click();
 await page.getByRole('button',{name:'Bruk originalnavn'}).click();
 assert.equal(await page.locator('.map-label[data-label="original-014"]').textContent(),'Solsiden');
 // Restore full-map coordinates before the existing sketch placement tests.
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
 const download=page.waitForEvent('download');await page.locator('[data-act=export]').click();assert.equal((await download).suggestedFilename(),'trondheim-layout.json');
 await page.locator('#linearMode').click();assert.equal(await page.locator('#rows').innerHTML(),rows);assert.equal(await page.locator('#linearView').isVisible(),true);
 // The supplied source has a confirmed Ranheim binding to physical LED 0.
 live=true;await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('VALID'));
 await page.locator('#networkMode').click();await page.waitForSelector('.map-stop[data-state="AT_STOP"]');
 await page.locator('.map-stop[data-state="AT_STOP"]').first().click();assert.match(await page.locator('[data-role=details]').innerText(),/Kilde: ETA/);
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

 assert.deepEqual(errors,[]);console.log('Browser: map editor tap-placement, autosave, reload, discard, original geometry, route overlays, mobile and feed regression PASS');
}finally{await browser.close();await new Promise(r=>server.close(r));}

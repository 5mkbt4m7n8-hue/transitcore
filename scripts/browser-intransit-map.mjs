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
 // Rename a stop that already has a confirmed name, then reposition the stop
 // and its label in the schematic editor. Original Quay identity stays intact.
 await page.locator('[data-role=focus]').selectOption('original-014');
 const labelInput=page.getByRole('textbox',{name:'Felles lokalt stopnavn'});
 assert((await labelInput.inputValue()).length>1,'Already named stop should prefill editor');
 const originalLabel=await labelInput.inputValue();
 await labelInput.fill('Kontrollnavn for stopp 14');
 await page.getByRole('button',{name:'Lagre visningsnavn'}).click();
 assert.equal(await page.locator('svg .map-label[data-label="original-014"]').innerText(),'Kontrollnavn for stopp 14');
 const initialPosition=await page.locator('svg .map-stop[data-stop="original-014"]').first().getAttribute('transform');
 const initialLabel=await page.locator('svg .map-label[data-label="original-014"]').evaluate(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y'))}));
 const oldX=Number(await page.getByRole('spinbutton',{name:'Stopp X'}).inputValue());
 const oldY=Number(await page.getByRole('spinbutton',{name:'Stopp Y'}).inputValue());
 await page.getByRole('spinbutton',{name:'Stopp X'}).fill(String(oldX+5));
 await page.getByRole('spinbutton',{name:'Stopp Y'}).fill(String(oldY+7));
 await page.getByRole('button',{name:'Lagre stopp-plassering'}).click();
 assert.notEqual(await page.locator('svg .map-stop[data-stop="original-014"]').first().getAttribute('transform'),initialPosition);
 const shifted=await page.locator('svg .map-label[data-label="original-014"]').evaluate(el=>({x:Number(el.getAttribute('x')),y:Number(el.getAttribute('y'))}));
 assert.equal(shifted.x,Math.min(913,initialLabel.x+5));
 assert.equal(shifted.y,Math.min(1280,initialLabel.y+7));
 const movedDraft=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-map-autodraft-v1')));
 const movedStop=movedDraft.layout.stops.find(s=>s.id==='original-014');
 assert.equal(movedStop.x,oldX+5);assert.equal(movedStop.y,oldY+7);
 assert.equal(movedStop.name,originalLabel,'Display alias does not mutate canonical name');
 assert.equal(movedDraft.layout.stops.length,100,'Repositioning must not create an extra stop');
 const beforeTap=movedStop.x, beforeTapY=movedStop.y;
 await page.getByRole('button',{name:'Flytt valgt stopp på kartet'}).click();
 const svgMove=page.locator('svg.map-viewport');
 const tapPosition=await svgMove.evaluate((svg,point)=>{
  const p=svg.createSVGPoint();p.x=point.x;p.y=point.y;
  const screen=p.matrixTransform(svg.getScreenCTM()),rect=svg.getBoundingClientRect();
  return {x:screen.x-rect.left,y:screen.y-rect.top};
 },{x:beforeTap+8,y:beforeTapY+9});
 await svgMove.click({position:tapPosition});
 const tapped=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-map-autodraft-v1')).layout.stops.find(s=>s.id==='original-014'));
 assert(Math.abs(tapped.x-(beforeTap+8))<1);
 assert(Math.abs(tapped.y-(beforeTapY+9))<1);
 assert.equal(await page.getByRole('button',{name:'Flytt valgt stopp på kartet'}).count(),1,'Tap ends relocation mode');
 await page.locator('[data-act=undo]').click();
 const undone=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-map-autodraft-v1')).layout.stops.find(s=>s.id==='original-014'));
 assert.equal(undone.x,beforeTap);
 assert.equal(undone.y,beforeTapY);
 await page.locator('[data-act=undo]').click(); // revert numeric relocation
 await page.getByRole('button',{name:'Bruk originalnavn'}).click();
 assert.equal(await page.locator('svg .map-label[data-label="original-014"]').innerText(),originalLabel);
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

import {smartStations,branchPaint} from './browser-studio-smart-stations.mjs';
import {v012A,v012B,v012C} from './browser-studio-v012.mjs';
import {v011,v011B,v011C} from './browser-studio-v011.mjs';
import {phaseOne} from './browser-studio-phase-one.mjs';
import {selectionRegression} from './browser-studio-selection.mjs';
import {phaseTwo} from './browser-studio-phase-two.mjs';
import {phaseThree} from './browser-studio-phase-three.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url);
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname,file=new URL('.'+path,root);if(!file.href.startsWith(root.href))throw Error('path');res.setHeader('content-type',path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.css')?'text/css':'text/html');
if(process.env.STUDIO_BASELINE&&/network\/(map|board-designer)\.js$/.test(path))res.end(execFileSync('git',['show','HEAD:'+path.slice(1)],{cwd:root}));else res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
const base=process.env.STUDIO_PREVIEW||`http://127.0.0.1:${server.address().port}/web/linear/`;
try{
 await branchPaint(browser,base,process.env.INTRANSIT_SCREENSHOT_DIR);
 await smartStations(browser,base,process.env.INTRANSIT_SCREENSHOT_DIR);
 await v012A(browser,base);
 await v012B(browser,base);
 await v012C(browser,base,process.env.INTRANSIT_SCREENSHOT_DIR);
 await v011(browser,base);
 await v011B(browser,base);
 await v011C(browser,base,process.env.INTRANSIT_SCREENSHOT_DIR);
 await selectionRegression(browser,base);
 await phaseTwo(browser,base,process.env.INTRANSIT_SCREENSHOT_DIR);
 await phaseThree(browser,base,process.env.INTRANSIT_SCREENSHOT_DIR);
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Legacy designer: selection and drag must retain nonzero scroll at 300%.
 await page.goto(base+'index.html?view=designer');await page.locator('[data-role=boardSvgHost] svg').waitFor();await page.locator('[data-zoom]').selectOption('3');
 const viewport=()=>page.locator('[data-role=boardSvgHost]').evaluate(n=>({x:n.scrollLeft,y:n.scrollTop,w:n.querySelector('svg').getBoundingClientRect().width}));
 await page.locator('[data-role=boardSvgHost]').evaluate(n=>{n.scrollTop=300;n.scrollLeft=120;});
 const hit=await page.locator('[data-role=boardSvgHost]').evaluate(n=>{const r=n.getBoundingClientRect();for(const s of n.querySelectorAll('[data-board-key]')){const b=s.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;if(x>r.left+30&&x<r.right-30&&y>r.top+30&&y<Math.min(r.bottom,innerHeight)-30&&document.elementFromPoint(x,y)?.closest('[data-board-key]'))return {x,y};}return null;});
 assert(hit,'zoomed stop is visible without auto-scrolling');const before=await viewport();assert(before.y>0);
 await page.mouse.click(hit.x,hit.y);assert.deepEqual(await viewport(),before,'selection preserves zoom and scroll');
 await page.mouse.move(hit.x,hit.y);await page.mouse.down();await page.mouse.move(hit.x+12,hit.y+12,{steps:4});await page.mouse.up();assert.deepEqual(await viewport(),before,'drag/redraw preserves zoom and scroll');
 await page.keyboard.press('ArrowRight');assert.deepEqual(await viewport(),before,'keyboard editing preserves viewport');
 if(process.env.STUDIO_BASELINE){console.log('baseline unexpectedly passed');process.exitCode=1;}else{
 await page.goto(base+'studio.html');await page.locator('#canvas').waitFor();
 const state=()=>page.evaluate(()=>InTransitStudio.snapshot()),camera=async()=>(await state()).camera;
 const at=async(x,y)=>{const c=await camera(),r=await page.locator('#canvas').boundingBox();return {x:r.x+(x-c.x)*c.k,y:r.y+(y-c.y)*c.k};};
 const click=async(x,y)=>{const p=await at(x,y);await page.mouse.click(p.x,p.y);};
 await page.locator('[data-tool=pen]').click();await click(200,300);await click(400,300);await click(600,500);await page.keyboard.press('Enter');
 assert.equal((await state()).doc.artwork.lines.length,1);await page.locator('#properties input[type=text]').fill('Linje A');await page.locator('#properties input[type=text]').press('Tab');
 await page.locator('[data-tool=stop]').click();await click(200,300);await page.locator('#properties input[type=text]').fill('Havn');await page.locator('#properties input[type=text]').press('Tab');
 assert.equal((await state()).doc.artwork.stops[0].name,'Havn');assert.equal((await state()).doc.artwork.stops[0].lineIds.length,1);
 await page.locator('#in').click();await page.locator('#in').click();await page.locator('[data-tool=hand]').click();
 const p=await at(350,400);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+45,p.y+20);await page.mouse.up();await page.locator('[data-tool=select]').click();
 const stable=await camera();await click(200,300);assert.deepEqual(await camera(),stable,'studio stop selection keeps camera');
 const stop=await at(200,300);await page.mouse.move(stop.x,stop.y);await page.mouse.down();await page.mouse.move(stop.x+25,stop.y+10,{steps:4});await page.mouse.up();assert.deepEqual(await camera(),stable,'studio stop drag keeps camera');
 const moved=(await state()).doc;assert.notEqual(moved.artwork.stops[0].x,200);await page.locator('#undo').click();assert.equal((await state()).doc.artwork.stops[0].x,200);await page.locator('#redo').click();assert.deepEqual((await state()).doc,moved);assert.deepEqual(await camera(),stable,'history keeps camera');
 await page.locator('.layers summary').click();await page.locator('#layers .pick').last().click();assert.equal((await state()).selected,(await state()).doc.artwork.lines[0].id);assert.deepEqual(await camera(),stable,'layer selection keeps camera');
 const handle=page.locator('#handles circle').first(),hb=await handle.boundingBox();await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(hb.x+hb.width/2+20,hb.y+hb.height/2+15,{steps:3});await page.mouse.up();assert.deepEqual(await camera(),stable,'vertex drag keeps camera');

 // Space temporarily pans without changing tool, document, selection or pen draft.
 await page.locator('[data-tool=pen]').click();await click(300,350);const draftState=await state(),panAt=await at(350,400);
 await page.keyboard.down('Space');await page.mouse.move(panAt.x,panAt.y);await page.mouse.down();await page.mouse.move(panAt.x+30,panAt.y+25);await page.mouse.up();await page.keyboard.up('Space');
 const afterPan=await state();assert.equal(afterPan.tool,'pen');assert.deepEqual(afterPan.draft,draftState.draft);assert.deepEqual(afterPan.doc,draftState.doc);assert.equal(afterPan.camera.k,draftState.camera.k);assert.notEqual(afterPan.camera.x,draftState.camera.x);assert.equal(await page.evaluate(()=>scrollY),0);
 await page.keyboard.press('Escape');await page.locator('#title').focus();await page.keyboard.press('End');await page.keyboard.press('Space');assert((await page.locator('#title').inputValue()).endsWith(' '));await page.keyboard.press('Backspace');await page.locator('#canvas').focus();
 await page.evaluate(()=>{const n=document.createElement('div');n.id='typing-test';n.contentEditable='true';n.textContent='Hei';document.body.append(n);n.focus();});const beforeTyping=await state();await page.keyboard.press('Space');assert.deepEqual((await state()).camera,beforeTyping.camera);assert.equal(await page.locator('#canvas').getAttribute('data-tool'),'select');await page.locator('#typing-test').evaluate(n=>n.remove());
 // Artboard edits preserve coordinates and camera, and support history.
 const old=await state();await page.getByText('Tegneområde',{exact:true}).click();await page.locator('#artWidth').fill('1600');await page.locator('#artHeight').fill('1500');await page.getByRole('button',{name:'Endre tegneområde',exact:true}).click();assert.equal((await state()).doc.width,1600);assert.deepEqual((await state()).doc.artwork,old.doc.artwork);assert.deepEqual(await camera(),old.camera);await page.locator('#undo').click();assert.equal((await state()).doc.width,old.doc.width);await page.locator('#redo').click();assert.equal((await state()).doc.width,1600);
 await page.locator('#layers .pick').first().click();await page.getByLabel('Navnevinkel (0–360°)',{exact:true}).fill('315');await page.getByLabel('Navnevinkel (0–360°)',{exact:true}).press('Tab');await page.getByLabel('Navneside',{exact:true}).selectOption('left');
 assert.equal((await state()).doc.artwork.stops[0].labelAngle,315);assert.equal(await page.locator('#art text').first().getAttribute('text-anchor'),'end');assert.match(await page.locator('#art text').first().getAttribute('transform'),/rotate\(315 /);
 await page.getByLabel('Stoppsymbol',{exact:true}).selectOption('capsule');await page.getByLabel('Bredde over linjene',{exact:true}).fill('45');await page.getByLabel('Bredde over linjene',{exact:true}).press('Tab');assert.equal((await state()).doc.artwork.stops[0].span,45);
 await page.locator('#layers .pick').last().click();await page.getByText('Parallelle linjekopier',{exact:true}).click();await page.getByLabel('Antall ekstra linjer',{exact:true}).fill('2');await page.getByLabel('Avstand i kartet',{exact:true}).fill('18');const priorLanes=await state();await page.getByRole('button',{name:'Lag parallelle kopier',exact:true}).click();assert.equal((await state()).doc.artwork.lines.length,3);assert.deepEqual((await state()).doc.bindings,priorLanes.doc.bindings);assert.equal((await state()).doc.artwork.stops.length,1);const laneDoc=(await state()).doc;await page.locator('#undo').click();assert.equal((await state()).doc.artwork.lines.length,1);await page.locator('#redo').click();assert.deepEqual((await state()).doc,laneDoc);
 await page.getByRole('button',{name:'━ '+laneDoc.artwork.lines[2].name,exact:true}).click();assert.equal((await state()).selected,(await state()).doc.artwork.lines[2].id,'parallel copy is separately selectable');
 await page.locator('#canvas').focus();await page.keyboard.press('Escape');await page.getByText('Tegneområde',{exact:true}).click();await page.getByRole('button',{name:'Foreslå navneplassering',exact:true}).click();
 const exportPromise=page.waitForEvent('download');await page.locator('#export').click();const exported=await exportPromise,svg=await readFile(await exported.path(),'utf8');assert.match(svg,/viewBox="0 0 1600 1500"/);assert.match(svg,/rotate\(315 /);assert.match(svg,/width="45"/);
 const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();const download=await downloadPromise;const saved=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(saved.artwork.lines[0].name,'Linje A');
 await page.locator('#new').click();await page.locator('#newTitle').fill('Tomt kart');await page.getByRole('button',{name:'Opprett kart',exact:true}).click();await page.waitForFunction(()=>InTransitStudio.snapshot().doc.title==='Tomt kart');assert.equal((await state()).doc.artwork.lines.length,0);assert.equal((await state()).doc.artwork.stops.length,0);
 await page.locator('#file').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>document.getElementById('status').textContent==='Prosjekt åpnet');assert.deepEqual((await state()).doc,saved);
 await page.locator('#file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"invalid"}')});await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Kunne ikke åpne'));assert.deepEqual((await state()).doc,saved);
 await page.reload();assert.deepEqual((await state()).doc,saved,'reload restores artwork');
 page.once('dialog',d=>d.accept());await page.locator('#template').click();await page.waitForFunction(()=>InTransitStudio.snapshot().doc.artwork.stops.length===100);const copied=await state();assert.equal(Object.keys(copied.doc.bindings).length,100);assert.equal(copied.doc.artwork.lines.length,18);assert.equal(await page.locator('.layers').getAttribute('open'),null,'layers stay collapsed after reload');
 if(process.env.INTRANSIT_SCREENSHOT_DIR){await mkdir(process.env.INTRANSIT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.INTRANSIT_SCREENSHOT_DIR+'/map-studio-desktop.png'});}
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile fits viewport');
 await phaseOne(browser,base,process.env.INTRANSIT_SCREENSHOT_DIR);
 assert.deepEqual(errors,[]);console.log('Studio browser: Space/typing, artboard, rotated labels, shared symbol, parallel copies/export/persistence, legacy viewport, creation, naming, pan/zoom, selection, stop/vertex drag, history, save/open, recovery and canonical copy passed');
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}


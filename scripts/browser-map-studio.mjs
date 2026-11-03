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
 await page.locator('#layers .pick').last().click();assert.equal((await state()).selected,(await state()).doc.artwork.lines[0].id);assert.deepEqual(await camera(),stable,'layer selection keeps camera');
 const handle=page.locator('#handles circle').first(),hb=await handle.boundingBox();await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(hb.x+hb.width/2+20,hb.y+hb.height/2+15,{steps:3});await page.mouse.up();assert.deepEqual(await camera(),stable,'vertex drag keeps camera');
 const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();const download=await downloadPromise;const saved=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(saved.artwork.lines[0].name,'Linje A');
 await page.locator('#new').click();await page.locator('#newTitle').fill('Tomt kart');await page.getByRole('button',{name:'Opprett kart',exact:true}).click();await page.waitForFunction(()=>InTransitStudio.snapshot().doc.title==='Tomt kart');assert.equal((await state()).doc.artwork.lines.length,0);assert.equal((await state()).doc.artwork.stops.length,0);
 await page.locator('#file').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>document.getElementById('status').textContent==='Prosjekt åpnet');assert.deepEqual((await state()).doc,saved);
 await page.locator('#file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":"invalid"}')});await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Kunne ikke åpne'));assert.deepEqual((await state()).doc,saved);
 await page.reload();assert.deepEqual((await state()).doc,saved,'reload restores artwork');
 page.once('dialog',d=>d.accept());await page.locator('#template').click();await page.waitForFunction(()=>InTransitStudio.snapshot().doc.artwork.stops.length===100);const copied=await state();assert.equal(Object.keys(copied.doc.bindings).length,100);
 if(process.env.INTRANSIT_SCREENSHOT_DIR){await mkdir(process.env.INTRANSIT_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.INTRANSIT_SCREENSHOT_DIR+'/map-studio-desktop.png'});}
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile fits viewport');
 assert.deepEqual(errors,[]);console.log('Studio browser: legacy viewport, creation, naming, pan/zoom, selection, stop/vertex drag, history, save/open, recovery and canonical copy passed');
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}

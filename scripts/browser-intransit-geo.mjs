import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=new URL('../',import.meta.url);
const mime=path=>path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.css')?'text/css':'text/html';
const server=createServer(async(req,res)=>{
 try{
  const p=new URL(req.url,'http://localhost').pathname;
  const file=new URL('.'+p,root);
  if(!file.href.startsWith(root.href)){res.writeHead(403).end();return;}
  res.setHeader('content-type',mime(p));res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://unpkg.com/leaflet@1.9.4/dist/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/dist/').at(-1);
  const file=new URL('node_modules/leaflet/dist/'+name,root);
  try{await route.fulfill({status:200,body:await readFile(file),contentType:mime(name)});}
  catch{await route.fulfill({status:404,body:'missing local library'});}
 });
 const tinyTile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+bLZkAAAAASUVORK5CYII=','base64');
 await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:tinyTile}));
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/**',async route=>{
  const url=new URL(route.request().url()),boardProfile=url.pathname.split('/').pop();
  const id=boardProfile==='trondheim-flybuss-live'?46:147;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   schemaVersion:1,boardProfile,ledCount:id,sequence:1,generatedAt:new Date().toISOString(),ttlSeconds:30,leds:[]
  })});
 });
 const url='http://127.0.0.1:'+server.address().port+'/web/linear/geo/index.html';
 await page.goto(url);
 await page.waitForFunction(()=>document.querySelector('.geo-canvas')?._leaflet_id>0,{timeout:25000});
 await page.waitForFunction(()=>document.querySelector('.leaflet-overlay-pane canvas')!==null,{timeout:20000});
 assert.equal(await page.locator('#boardSelect').inputValue(),'trondheim-bus-board');
 const initial=await page.locator('.leaflet-overlay-pane canvas').count();
 assert(initial>0,'At least one distinct Quay candidate should be rendered');
 await page.locator('[data-g=stop]').selectOption('original-000');
 await page.locator('[data-g=place]').click();
 await page.locator('.geo-canvas').click({position:{x:180,y:220}});
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')));
 assert.equal(before.geo.stops['original-000'].source,'manual');
 assert.equal(before.geo.stops['original-000'].verification,'user-reviewed');
 await page.locator('[data-g=draw]').click();
 await page.locator('.geo-canvas').click({position:{x:320,y:160}});
 await page.locator('.geo-canvas').click({position:{x:375,y:180}});
 assert.equal(await page.locator('[data-g=finish]').isDisabled(),false);
 await page.locator('[data-g=finish]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths.length),1);
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('.geo-canvas')?._leaflet_id>0,{timeout:25000});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths.length),1,'Manual geographic route survived reload');
 await page.locator('[data-g=discard]').click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('intransit-geo-draft-v1')),null);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile geo controls must not overflow');
 assert.deepEqual(errors,[],'No runtime errors in geographic map');
 console.log('Geographic browser: Leaflet, stop candidates, manual placement, route drawing, local autosave, reload/discard, mobile PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

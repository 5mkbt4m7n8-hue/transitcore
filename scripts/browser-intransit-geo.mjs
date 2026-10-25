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
  const file=new URL('.'+p+(p.endsWith('/')?'index.html':''),root);
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
 await page.locator('[data-g=stopName]').fill('Test holdeplass');
 await page.locator('[data-g=saveName]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.names['original-000']),'Test holdeplass');
 await page.locator('[data-g=historyUndo]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.names['original-000']),undefined,'Undo name edit');
 await page.locator('[data-g=historyRedo]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.names['original-000']),'Test holdeplass','Redo name edit');
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')));
 assert.equal(before.geo.stops['original-000'].source,'manual');
 assert.equal(before.geo.stops['original-000'].verification,'user-reviewed');
 await page.locator('[data-g=draw]').click();
 await page.locator('.geo-canvas').click({position:{x:320,y:160}});
 await page.locator('.geo-canvas').click({position:{x:375,y:180}});
 assert.equal(await page.locator('[data-g=finish]').isDisabled(),false);
 await page.locator('[data-g=finish]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths.length),1);
 await page.locator('[data-g=pathName]').fill('Min prøvelinje');
 await page.locator('[data-g=savePathName]').click();
 await page.locator('[data-g=pathColor]').fill('#4488cc');
 await page.locator('[data-g=saveColor]').click();
 await page.locator('[data-g=extend]').click();
 await page.locator('.geo-canvas').click({position:{x:425,y:250}});
 await page.locator('[data-g=finish]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths[0].coordinates.length),3,'Route extension adds new vertex');
 await page.locator('[data-g=historyUndo]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths[0].coordinates.length),2,'Undo complete extension');
 await page.locator('[data-g=historyRedo]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths[0].coordinates.length),3,'Redo extension');
 await page.locator('[data-g=insert]').click();
 await page.locator('.geo-canvas').click({position:{x:400,y:190}});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths[0].coordinates.length),4,'Insert vertex by map click');
 await page.locator('[data-g=deleteVertex]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths[0].coordinates.length),3,'Remove last vertex');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths[0].name),'Min prøvelinje');
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('.geo-canvas')?._leaflet_id>0,{timeout:25000});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths.length),1,'Manual geographic route survived reload');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.names['original-000']),'Test holdeplass','Local name survived reload');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths[0].color),'#4488cc','Color survived reload');
 // Cross-mode round trip: preserve coordinates and path edits while editing one stop's
 // local display name in the schematic map and returning to the same stop.
 const beforeBridge=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo);
 await page.locator('[data-g=schematic]').click();
 await page.waitForSelector('#networkMode[aria-pressed="true"]',{timeout:25000});
 await page.waitForSelector('.map-stop[data-stop="original-000"]');
 assert.match(await page.locator('[data-role=focus] option[value="original-000"]').textContent(),/Test holdeplass/);
 assert.match(await page.locator('[data-role=geoLink]').getAttribute('href'),/stop=original-000/);
 await page.locator('[data-act=edit]').click();
 await page.locator('input[aria-label="Felles lokalt stopnavn"]').fill('Navn fra skjemakart');
 await page.getByRole('button',{name:'Lagre visningsnavn'}).click();
 const afterBridge=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo);
 assert.equal(afterBridge.names['original-000'],'Navn fra skjemakart');
 assert.deepEqual(afterBridge.paths,beforeBridge.paths,'Schematic name edit must preserve geographic line geometry');
 assert.deepEqual(afterBridge.stops,beforeBridge.stops,'Schematic name edit must preserve geographic stop coordinates');
 await page.locator('[data-role=geoLink]').click();
 await page.waitForFunction(()=>document.querySelector('.geo-canvas')?._leaflet_id>0,{timeout:25000});
 assert.equal(await page.locator('[data-g=stop]').inputValue(),'original-000','Deep link selects same original stop');
 assert.equal(await page.locator('[data-g=stopName]').inputValue(),'Navn fra skjemakart','Geo editor uses latest shared local name');
  page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-g=discard]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths.length),0,'Discard clears saved paths');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.names),{},'Discard clears local names');
 await page.locator('[data-g=historyUndo]').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.paths.length),1,'Discard may be undone during current session');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile geo controls must not overflow');
 assert.deepEqual(errors,[],'No runtime errors in geographic map');
 console.log('Geographic browser: Leaflet, stop candidates, manual placement, route drawing, local autosave, reload/discard, mobile PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

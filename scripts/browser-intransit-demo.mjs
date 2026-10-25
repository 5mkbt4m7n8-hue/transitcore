import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const C=require('../web/linear/live/catalog.js'),root=new URL('../',import.meta.url);
const mime=p=>p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':
 p.endsWith('.css')?'text/css':'text/html';
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  const target=new URL('.'+path+(path.endsWith('/')?'index.html':''),root);
  if(!target.href.startsWith(root.href)){res.writeHead(403).end();return;}
  res.setHeader('content-type',mime(path));res.end(await readFile(target));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1120,height:840}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://unpkg.com/leaflet@1.9.4/dist/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/dist/').at(-1);
  try{await route.fulfill({status:200,body:await readFile(new URL('node_modules/leaflet/dist/'+name,root)),contentType:mime(name)});}
  catch{await route.fulfill({status:404,body:'no leaflet'});}
 });
 const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+bLZkAAAAASUVORK5CYII=','base64');
 await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/png',body:tile}));
 let gpsCalls=0,delayed=false;
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/**',async route=>{
  gpsCalls++;
  if(delayed)await new Promise(resolve=>setTimeout(resolve,900));
  const name=new URL(route.request().url()).pathname;
  const time=new Date().toISOString();
  if(name.endsWith('atb-live-all')){
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    schemaVersion:1,codespace:'ATB',scope:'catalogued-bus-lines',
    observationType:'measured-vehicle-position',includedLines:C.CODES,
    vehicles:[{id:'live-bus-id',line:'1',source:'GPS',latitude:63.42,longitude:10.39,
     lastUpdated:time,destination:'Ranheim'}]
   })});return;
  }
  const code=name.match(/atb-line-(\d+)$/)?.[1]||'1';
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   schemaVersion:1,codespace:'ATB',publicCode:code,lineId:'ATB:Line:2_'+code,
   observationType:'measured-vehicle-position',vehicles:[{
    id:'live-bus-id',line:code,source:'GPS',latitude:63.42,longitude:10.39,
    lastUpdated:time,destination:'Ranheim'
   }]
  })});
 });
 const base='http://127.0.0.1:'+server.address().port+'/web/linear/live/';
 await page.goto(base+'?line=all&mode=demo');
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='94',{timeout:45000});
 assert.equal(gpsCalls,0,'Starting DEMO never requests Worker/Entur');
 assert.equal(await page.locator('#sourceMode').inputValue(),'demo');
 assert.equal(await page.locator('#demoBanner').isVisible(),true);
 assert.equal(await page.locator('#demoStamp').isVisible(),true);
 assert.equal(await page.locator('.demo-pin').count(),94,'47 lines x two simulated buses');
 assert.equal(await page.locator('.live-fleet-pin').count(),0,'No real GPS marker in DEMO');
 assert.equal(await page.locator('#refresh').isDisabled(),true);
 assert.match(await page.locator('#gpsStatus').innerText(),/simulerte busser/);
 assert.equal(await page.locator('#followBus option').count(),95);
 await page.locator('#followBus').selectOption('demo:70:0');
 assert.match(await page.locator('#followDetail').innerText(),/DEMO.*følger simulert buss 70/);
 await page.locator('#demoPause').click();
 assert.equal(await page.locator('#demoPause').getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('#demoBanner').innerText(),/PAUSE/);
 await page.locator('#demoSpeed').selectOption('4');
 assert.equal(await page.locator('#demoSpeed').inputValue(),'4');
 await page.locator('#demoPause').click();
 assert.equal(await page.locator('#demoPause').getAttribute('aria-pressed'),'false');
 await page.locator('#toggleAllPanel').click();
 await page.locator('#allLineList input[value="70"]').uncheck();
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='92',{timeout:15000});
 assert.equal(await page.locator('#followBus').inputValue(),'','Follow ends when demo route hidden');
 await page.locator('#allLineList input[value="70"]').check();
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='94',{timeout:15000});
 await page.locator('#fitBuses').click();
 await page.locator('#lineSelect').selectOption('1');
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='2',{timeout:15000});
 assert.equal(await page.locator('.demo-pin').count(),2);
 assert.equal(gpsCalls,0,'Switching DEMO route does not fetch GPS');
 assert.match(page.url(),/mode=demo/);
 await page.locator('#lineSelect').selectOption('all');
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='94',{timeout:20000});
 // Real mode deliberately replaces all 94 demo markers with source-only GPS.
 await page.locator('#sourceMode').selectOption('gps');
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('målte GPS-posisjoner'),{timeout:15000});
 assert.equal(await page.locator('#demoBanner').isVisible(),false);
 assert.equal(await page.locator('.demo-pin').count(),0);
 assert.equal(await page.locator('.live-fleet-pin').count(),1);
 assert.equal(await page.locator('#busCount').innerText(),'1');
 assert(gpsCalls>0,'Only real source mode makes Worker fetches');
 // A late GPS response must not replace simulated markers.
 delayed=true;
 await page.locator('#refresh').click();
 await page.locator('#sourceMode').selectOption('demo');
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='94',{timeout:20000});
 await page.waitForTimeout(1200);
 assert.equal(await page.locator('.live-fleet-pin').count(),0);
 assert.equal(await page.locator('.demo-pin').count(),94);
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='94',{timeout:30000});
 assert.equal(await page.locator('#sourceMode').inputValue(),'demo');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
  'Mobile DEMO must not overflow horizontally');
 assert.equal(await page.locator('#map').isVisible(),true);
 assert.equal(await page.evaluate(()=>localStorage.length),0,'Simulation must not edit saved cartography');
 assert.deepEqual(errors,[],'No browser runtime exceptions: '+errors.join('; '));
 console.log('InTransit DEMO Chromium: 47 routes/94 markers, no GPS fetches, pause/speed/follow, single line, source isolation, late responses and mobile PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

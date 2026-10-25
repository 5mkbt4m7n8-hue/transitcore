import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=new URL('../',import.meta.url);
const mime=path=>path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':
 path.endsWith('.css')?'text/css':'text/html';
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
 const page=await browser.newPage({viewport:{width:1150,height:870}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://unpkg.com/leaflet@1.9.4/dist/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/dist/').at(-1);
  try{await route.fulfill({status:200,body:await readFile(new URL('node_modules/leaflet/dist/'+name,root)),contentType:mime(name)});}
  catch{await route.fulfill({status:404,body:'library missing'});}
 });
 const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+bLZkAAAAASUVORK5CYII=','base64');
 await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/png',body:tile}));
 let gpsMode='valid',gpsCalls=0;
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/**',async route=>{
  gpsCalls++;
  if(gpsMode==='404'){await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'not_found'})});return;}
  if(gpsMode==='503'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'gps_source_unavailable'})});return;}
  const time=new Date().toISOString(),valid=[{
   id:'bus-a',latitude:63.4301,longitude:10.405,destination:'Ranheim',line:'1',source:'GPS',lastUpdated:time
  },{
   id:'bus-b',latitude:63.365,longitude:10.382,destination:'Kattem',line:'1',source:'GPS',lastUpdated:time
  }];
  const vehicles=gpsMode==='empty'?[]:gpsMode==='stale'?valid.map(v=>({...v,lastUpdated:new Date(Date.now()-300000).toISOString()})):valid;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   schemaVersion:1,lineId:'ATB:Line:2_1',publicCode:'1',codespace:'ATB',
   observationType:'measured-vehicle-position',source:'Entur Vehicle Positions v2',vehicles
  })});
 });
 const url='http://127.0.0.1:'+server.address().port+'/web/linear/live/';
 await page.goto(url);
 await page.waitForFunction(()=>document.querySelector('#map')?._leaflet_id>0,{timeout:25000});
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('2 ferske'),{timeout:15000});
 assert.equal(await page.locator('#followBus option').count(),3,'Two actual GPS readings + no follow');
 assert.equal(await page.locator('#busCount').innerText(),'2');
 assert.match(await page.locator('#routeStatus').innerText(),/32 holdeplasser · 98 trasépunkter/);
 assert.equal(await page.locator('#showRoute').isChecked(),true);
 assert.equal(await page.locator('#showStops').isChecked(),true);
 await page.locator('#showStops').uncheck();
 await page.locator('#showRoute').uncheck();
 assert.equal(await page.locator('#showRoute').isChecked(),false);
 await page.locator('#fitRoute').click();
 await page.locator('#showStops').check();
 await page.locator('#showRoute').check();
 await page.locator('#fitBuses').click();
 await page.locator('#followBus').selectOption('bus-a');
 assert.match(await page.locator('#followDetail').innerText(),/Følger buss 1/);
 assert.equal(await page.locator('#followDetail').isVisible(),true);
 await page.locator('#followBus').selectOption('');
 assert.equal(await page.locator('#followDetail').isVisible(),false);
 await page.locator('#fullscreen').click();
 assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'),'true');
 await page.locator('#fullscreen').click();
 assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'),'false');
 gpsMode='empty';await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('ingen ferske'),{timeout:15000});
 assert.equal(await page.locator('#busCount').innerText(),'0');
 assert.equal(await page.locator('#fitBuses').isDisabled(),true);
 gpsMode='stale';await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('ingen ferske'),{timeout:15000});
 assert.equal(await page.locator('#busCount').innerText(),'0');
 gpsMode='404';await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('Cloudflare'),{timeout:15000});
 assert.match(await page.locator('#gpsStatus').innerText(),/HTTP 404/);
 assert.equal(await page.locator('#fitRoute').isDisabled(),false,'Route remains visible on Worker 404');
 gpsMode='503';await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('HTTP 503'),{timeout:15000});
 assert.equal(await page.locator('#busCount').innerText(),'0');
 assert(gpsCalls>=5);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile page must not overflow');
 assert.equal(await page.locator('#map').isVisible(),true);
 assert.equal(await page.evaluate(()=>localStorage.length),0,'Viewing route and GPS must not edit geo or schematic drafts');
 assert.deepEqual(errors,[],'No runtime browser errors');
 console.log('Live line 1 Chromium: 98 route points, 32 stops, real GPS mock, follow, fullscreen, 404/503, stale and mobile PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

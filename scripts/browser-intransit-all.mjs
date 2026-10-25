import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const catalog=require('../web/linear/live/catalog.js');
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
 const page=await browser.newPage({viewport:{width:1120,height:850}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://unpkg.com/leaflet@1.9.4/dist/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/dist/').at(-1);
  try{await route.fulfill({status:200,body:await readFile(new URL('node_modules/leaflet/dist/'+name,root)),contentType:mime(name)});}
  catch{await route.fulfill({status:404,body:'missing'});}
 });
 const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+bLZkAAAAASUVORK5CYII=','base64');
 await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:tile}));
 let gpsCase='fresh',calls=0;
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/**',async route=>{
  calls++;const path=new URL(route.request().url()).pathname,now=new Date().toISOString();
  if(gpsCase==='404'){await route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'});return;}
  if(path.endsWith('atb-live-all')){
   const base=[
    {id:'bus-1',line:'1',latitude:63.43,longitude:10.4,source:'GPS',destination:'Ranheim',lastUpdated:now},
    {id:'bus-2',line:'2',latitude:63.42,longitude:10.39,source:'GPS',destination:'Lund',lastUpdated:now},
    {id:'bus-70',line:'70',latitude:63.47,longitude:10.92,source:'GPS',destination:'Malvik',lastUpdated:now},
    {id:'bus-76',line:'76',latitude:63.38,longitude:10.07,source:'GPS',destination:'Byneset',lastUpdated:now}
   ];
   const vehicles=gpsCase==='empty'?[]:gpsCase==='stale'?
     base.map(x=>({...x,lastUpdated:new Date(Date.now()-180000).toISOString()})):base;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    schemaVersion:1,codespace:'ATB',scope:'catalogued-bus-lines',observationType:'measured-vehicle-position',
    source:'Entur Vehicle Positions v2',requestedAt:now,includedLines:catalog.CODES,vehicles
   })});return;
  }
  const code=path.match(/atb-line-(\d+)$/)?.[1]||'1';
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   schemaVersion:1,codespace:'ATB',lineId:'ATB:Line:2_'+code,publicCode:code,
   observationType:'measured-vehicle-position',vehicles:[]
  })});
 });
 const base='http://127.0.0.1:'+server.address().port+'/web/linear/live/';
 await page.goto(base);
 await page.waitForFunction(()=>document.querySelector('#routeStatus')?.textContent.includes('47 ruteprofiler'),{timeout:45000});
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='4',{timeout:15000});
 assert.equal(await page.locator('#lineSelect').inputValue(),'all');
 assert.equal(await page.locator('#allLinesPanel').isVisible(),true);
 assert.match(await page.locator('#routeStatus').innerText(),/unike holdeplasser/);
 assert.equal(await page.locator('#busCount').innerText(),'4');
 assert.equal(await page.locator('#fitBuses').isDisabled(),false);
 await page.locator('#fitBuses').click();
 await page.locator('#toggleAllPanel').click();
 assert.equal(await page.locator('#allLineList label').count(),47);
 assert.match(await page.locator('#allLinesSummary').innerText(),/47 av 47/);
 await page.locator('#routeSearch').fill('70');
 assert.equal(await page.locator('#allLineList label:visible').count(),1);
 await page.locator('#routeSearch').fill('');
 await page.locator('#allLineList input[value="2"]').uncheck();
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='3');
 assert.equal(await page.locator('#allLineList input[value="70"]').isChecked(),true);
 await page.locator('#allLineList input[value="2"]').check();
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='4');
 await page.locator('#followBus').selectOption('70:bus-70');
 assert.match(await page.locator('#followDetail').innerText(),/Følger linje 70/);
 await page.locator('#disableAllRoutes').click();
 assert.match(await page.locator('#allLinesSummary').innerText(),/0 av 47/);
 assert.equal(await page.locator('#busCount').innerText(),'0');
 await page.locator('#enableAllRoutes').click();
 assert.match(await page.locator('#allLinesSummary').innerText(),/47 av 47/);
 await page.locator('#showStops').uncheck();
 await page.locator('#showRoute').uncheck();
 await page.locator('#showStops').check();
 await page.locator('#showRoute').check();
 gpsCase='stale';await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='0');
 assert.match(await page.locator('#gpsStatus').innerText(),/Ingen ferske/);
 gpsCase='404';await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('HTTP 404'));
 assert.match(await page.locator('#routeStatus').innerText(),/47 ruteprofiler/);
 gpsCase='fresh';await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='4');
 await page.locator('#lineSelect').selectOption('1');
 await page.waitForFunction(()=>document.querySelector('#routeStatus')?.textContent.includes('32 holdeplasser'),{timeout:20000});
 assert.equal(await page.locator('#allLinesPanel').isVisible(),false);
 assert.equal(await page.locator('#busCount').innerText(),'0');
 await page.locator('#lineSelect').selectOption('all');
 await page.waitForFunction(()=>document.querySelector('#routeStatus')?.textContent.includes('47 ruteprofiler'),{timeout:30000});
 await page.waitForFunction(()=>document.querySelector('#busCount')?.textContent==='4',{timeout:15000});
 assert.match(page.url(),/line=all/);
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#routeStatus')?.textContent.includes('47 ruteprofiler'),{timeout:45000});
 assert.equal(await page.locator('#lineSelect').inputValue(),'all');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'All-route mobile view must not scroll horizontally');
 assert.equal(await page.locator('#map').isVisible(),true);
 assert.equal(await page.evaluate(()=>localStorage.length),0,'Fleet viewer never overwrites editor drafts');
 assert.equal(errors.length,0,'No JavaScript runtime errors: '+errors.join('; '));
 assert(calls>=4);
 console.log('All-route Chromium: 47 source profiles, four measured bus pins, 47 switches, follow, 404, stale, mobile PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const Catalog=require('../web/linear/live/catalog.js');
const root=new URL('../',import.meta.url);
const mime=path=>path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':
 path.endsWith('.css')?'text/css':'text/html';
const server=createServer(async(req,res)=>{
 try{
  const name=new URL(req.url,'http://localhost').pathname;
  const location=new URL('.'+name+(name.endsWith('/')?'index.html':''),root);
  if(!location.href.startsWith(root.href)){res.writeHead(403).end();return;}
  res.setHeader('content-type',mime(name));
  res.end(await readFile(location));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1160,height:820},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let phase='errors',gpsRequests=0;
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/**',async route=>{
  gpsRequests++;
  const path=new URL(route.request().url()).pathname;
  const headers={'access-control-allow-origin':'*','cache-control':'no-store'};
  const body=payload=>JSON.stringify(payload);
  if(path.endsWith('/platform/health')){
   await route.fulfill({status:200,headers,contentType:'application/json',
    body:body({api:{status:'ok',version:1}})});return;
  }
  if(phase==='errors'){
   if(path.endsWith('/atb-live-all')){
    await route.fulfill({status:404,headers,contentType:'application/json',
     body:body({error:'not_found'})});return;
   }
   if(path.endsWith('/atb-line-1')){
    await route.fulfill({status:503,headers,contentType:'application/json',
     body:body({error:'gps_source_invalid'})});return;
   }
   if(path.endsWith('/atb-line-3')){await route.abort('failed');return;}
  }
  const code=path.match(/atb-line-(\d+)$/)?.[1];
  if(code){
   const vehicles=phase==='healthy'&&code==='1'?[{
    id:'SECRET-VEHICLE',line:'1',latitude:63.42,longitude:10.4,
    lastUpdated:new Date().toISOString(),source:'GPS',destination:'Ranheim'
   }]:[];
   await route.fulfill({status:200,headers,contentType:'application/json',
    body:body({schemaVersion:1,lineId:'ATB:Line:2_'+code,codespace:'ATB',
     publicCode:code,observationType:'measured-vehicle-position',vehicles})});return;
  }
  if(path.endsWith('/atb-live-all')){
   const vehicles=phase==='healthy'?[{
    id:'SECRET-VEHICLE',line:'1',latitude:63.42,longitude:10.4,
    source:'GPS',destination:'Ranheim',lastUpdated:new Date().toISOString()
   }]:[];
   await route.fulfill({status:200,headers,contentType:'application/json',
    body:body({schemaVersion:1,scope:'catalogued-bus-lines',codespace:'ATB',
     includedLines:Catalog.CODES,observationType:'measured-vehicle-position',vehicles})});return;
  }
  throw Error('Unexpected diagnostic endpoint '+path);
 });
 const base='http://127.0.0.1:'+server.address().port+'/web/linear/diagnostics/';
 await page.goto(base);
 assert.equal(await page.locator('#metricRoutes').innerText(),'0 / 47');
 assert.equal(await page.locator('#export').isDisabled(),true);
 await page.locator('#run').click();
 await page.waitForFunction(()=>document.querySelector('#progress')?.textContent.includes('Ferdig:'),{timeout:35000});
 assert.equal(await page.locator('#metricRoutes').innerText(),'47 / 47');
 assert.equal(await page.locator('#metricWorker').innerText(),'2 / 5');
 assert.equal(await page.locator('#metricBuses').innerText(),'–');
 assert.match(await page.locator('#apiChecks').innerText(),/HTTP 404/);
 assert.match(await page.locator('#apiChecks').innerText(),/HTTP 503/);
 assert.match(await page.locator('#apiChecks').innerText(),/NETTVERK\/CORS/);
 assert.match(await page.locator('#apiChecks').innerText(),/0 FERSKE/);
 await page.locator('#catalogDetails summary').click();
 assert.equal(await page.locator('#catalogList .catalogline').count(),47);
 assert.match(await page.locator('#catalogCount').innerText(),/47 av 47 gyldige/);
 assert(gpsRequests===5,'Exactly five independent API checks');
 phase='healthy';
 await page.locator('#run').click();
 await page.waitForFunction(()=>document.querySelector('#progress')?.textContent.includes('Ferdig:'),{timeout:35000});
 assert.equal(await page.locator('#metricWorker').innerText(),'5 / 5');
 assert.equal(await page.locator('#metricBuses').innerText(),'1');
 assert.match(await page.locator('#apiChecks').innerText(),/ferske, målte GPS-posisjoner/);
 const event=page.waitForEvent('download');
 await page.locator('#export').click();
 const dl=await event;
 assert.equal(dl.suggestedFilename(),'intransit-diagnostics.json');
 const file=JSON.parse(await readFile(await dl.path(),'utf8'));
 assert.equal(file.format,'intransit-public-diagnostics-v1');
 assert.equal(file.checks.length,52);
 const raw=JSON.stringify(file);
 for(const secret of ['SECRET-VEHICLE','latitude','longitude','authorization','Bearer'])
  assert(!raw.includes(secret),'Sensitive content must not be exported: '+secret);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
  'No horizontal scrolling on iPhone viewport');
 assert.equal(await page.locator('#run').isVisible(),true);
 assert.equal(await page.evaluate(()=>localStorage.length),0,'Never mutate original-map drafts');
 assert.deepEqual(errors,[],'No JavaScript errors: '+errors.join('; '));
 console.log('InTransit Diagnostics Chromium: 47 source files, GPS 200/404/503/CORS, freshness, safe export and mobile PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

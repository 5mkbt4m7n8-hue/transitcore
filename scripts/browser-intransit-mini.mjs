import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
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
 const page=await browser.newPage({viewport:{width:1120,height:850},acceptDownloads:true});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let liveStatus=404,apiCalls=0,searchCalls=0,searchStatus=200;
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/v1/mini/stop-search'){
   searchCalls++;
   if(searchStatus===404){
    await route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'});return;
   }
   const query=url.searchParams.get('q');
   const stops=query.toLocaleLowerCase('nb').includes('trondheim')?
    [{id:'NSR:StopPlace:41742',name:'Trondheim S',label:'Trondheim S, Trondheim'}]:
    [{id:'NSR:StopPlace:41613',name:'Prinsens gate',label:'Prinsens gate, Trondheim'}];
   await route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({schemaVersion:1,source:'Entur Geocoder v3',query,stops})});return;
  }
  apiCalls++;
  assert.equal(url.pathname,'/api/v1/mini/departures');
  assert.match(url.searchParams.get('stop'),/^NSR:StopPlace:/);
  if(liveStatus===404){await route.fulfill({status:404,contentType:'application/json',body:'{"error":"not_found"}'});return;}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   schemaVersion:1,stopId:url.searchParams.get('stop'),stopName:'Prinsens gate',
   source:'Entur Journey Planner v3',checkedAt:new Date().toISOString(),
   departures:[{line:'1',destination:'Ranheim',at:new Date(Date.now()+300000).toISOString(),
    realtime:true,cancelled:false},{line:'2',destination:'Lund',at:new Date(Date.now()+900000).toISOString(),
    realtime:false,cancelled:false}]
  })});
 });
 const base='http://127.0.0.1:'+server.address().port+'/web/mini/';
 await page.goto(base);
 assert.equal(await page.locator('#source').inputValue(),'demo');
 assert.equal(apiCalls,0,'DEMO must not contact Cloudflare or Entur');
 assert.equal(await page.locator('#frame').getAttribute('width'),'64');
 assert.equal(await page.locator('#frame').getAttribute('height'),'64');
 assert.equal(await page.locator('#resValue').innerText(),'64 × 64');
 assert.match(await page.locator('#sourceBadge').innerText(),/DEMO/);
 assert.equal(await page.locator('#rowsValue').innerText(),'5 / 5');
 // DEMO stop search is offline and cannot pretend to be full Entur search.
 await page.locator('#stopSearch').fill('Prinsens');
 await page.waitForFunction(()=>document.querySelectorAll('#stopResults .stop-choice').length===1);
 assert.equal(searchCalls,0,'Demo name search remains fully offline');
 await page.locator('#stopResults .stop-choice').click();
 assert.equal(await page.locator('#stop').inputValue(),'custom');
 assert.equal(await page.locator('#customStop').inputValue(),'NSR:StopPlace:41613');
 // Multiple route checkboxes and exact destination selection.
 assert.equal(await page.locator('#lineFilters input[type=checkbox]').count(),8);
 await page.locator('#clearAllLines').click();
 assert.equal(await page.locator('#rowsValue').innerText(),'0 / 5');
 await page.locator('#selectAllLines').click();
 assert.equal(await page.locator('#rowsValue').innerText(),'5 / 5');
 await page.locator('#lineFilters input[value="1"]').uncheck();
 await page.locator('#lineFilters input[value="2"]').uncheck();
 assert.equal(await page.locator('#rowsValue').innerText(),'5 / 5');
 await page.locator('#clearAllLines').click();
 await page.locator('#lineFilters input[value="1"]').check();
 assert.equal(await page.locator('#rowsValue').innerText(),'2 / 5');
 await page.locator('#direction').selectOption('Ranheim');
 assert.equal(await page.locator('#rowsValue').innerText(),'1 / 5');
 assert.match(await page.locator('#filterSummary').innerText(),/Ranheim/);
 const callsBeforeDemo=apiCalls;
 await page.locator('#resetFilters').click();
 assert.equal(await page.locator('#rowsValue').innerText(),'5 / 5');
 assert.equal(apiCalls,callsBeforeDemo);
 assert.equal(await page.locator('#preview').isVisible(),true);
 await page.locator('#profile').selectOption('led-32x16');
 assert.equal(await page.locator('#resValue').innerText(),'32 × 16');
 assert.equal(await page.locator('#rowsValue').innerText(),'1 / 1');
 await page.locator('#profile').selectOption('led-128x128');
 assert.equal(await page.locator('#resValue').innerText(),'128 × 128');
 await page.locator('#profile').selectOption('lcd-240x135');
 assert.equal(await page.locator('#kindValue').innerText(),'LCD / TFT');
 assert.equal(await page.locator('#frame').getAttribute('width'),'240');
 assert.equal(await page.locator('#frame').getAttribute('height'),'135');
 const aspect=await page.locator('#preview').evaluate(el=>{
  const rect=el.getBoundingClientRect();return rect.width/rect.height;
 });
 assert(Math.abs(aspect-(240/135))<.08,'Wide LCD should not appear square');
 await page.locator('#profile').selectOption('custom');
 assert.equal(await page.locator('#customFields').isVisible(),true);
 await page.locator('#width').fill('96');await page.locator('#height').fill('48');
 assert.equal(await page.locator('#resValue').innerText(),'96 × 48');
 await page.locator('#kind').selectOption('mono');
 assert.match(await page.locator('#kindValue').innerText(),/OLED/);
 await page.locator('#palette').selectOption('amber');
 await page.locator('#brightness').evaluate(el=>{el.value='65';el.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.match(await page.locator('#brightnessValue').innerText(),/65/);
 const configEvent=page.waitForEvent('download');
 await page.locator('#downloadConfig').click();
 const configDownload=await configEvent;
 assert.equal(configDownload.suggestedFilename(),'intransit-mini-96x48.json');
 const config=JSON.parse(await readFile(await configDownload.path(),'utf8'));
 assert.deepEqual([config.hardware.width,config.hardware.height,config.hardware.type],[96,48,'mono']);
 assert.equal(config.datasource.mode,'demo');
 assert.equal(config.datasource.filters.destination,null);
 assert.equal(config.datasource.filters.lines,null);
 const pngEvent=page.waitForEvent('download');
 await page.locator('#downloadImage').click();
 const pngDownload=await pngEvent;
 assert.equal(pngDownload.suggestedFilename(),'intransit-mini-96x48.png');
 const png=await readFile(await pngDownload.path());
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10],'PNG signature');
 await page.locator('#source').selectOption('live');
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('HTTP 404'),{timeout:12000});
 assert.equal(apiCalls,1);
 assert.match(await page.locator('#sourceBadge').innerText(),/ENTUR/);
 assert.doesNotMatch(await page.locator('#status').innerText(),/10 avganger hentet/);
 assert.equal(await page.locator('#rowsValue').innerText(),'0 / 4');
 liveStatus=200;await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('2 avganger hentet'),{timeout:12000});
 assert.equal(apiCalls,2);
 assert.equal(await page.locator('#rowsValue').innerText(),'2 / 4');
 // Live search queries Entur v3 via the dedicated Worker route.
 await page.locator('#stopSearch').fill('Trondheim');
 await page.waitForFunction(()=>document.querySelector('#stopResults .stop-choice')?.textContent.includes('Trondheim S'),{timeout:12000});
 assert.equal(searchCalls,1);
 await page.locator('#stopResults .stop-choice').click();
 assert.equal(await page.locator('#customStop').inputValue(),'NSR:StopPlace:41742');
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('2 avganger hentet'),{timeout:12000});
 // Filter only line 1 towards Ranheim: one of two actual departures.
 await page.locator('#clearAllLines').click();
 await page.locator('#lineFilters input[value="1"]').check();
 await page.locator('#direction').selectOption('Ranheim');
 assert.equal(await page.locator('#rowsValue').innerText(),'1 / 4');
 // Re-selecting a stop resets stale line/destination filters.
 await page.locator('#stop').selectOption('NSR:StopPlace:41613');
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('2 avganger hentet'),{timeout:12000});
 assert.equal(await page.locator('#direction').inputValue(),'');
 assert.equal(await page.locator('#rowsValue').innerText(),'2 / 4');
 searchStatus=404;
 await page.locator('#stopSearch').fill('Prinsens');
 await page.waitForFunction(()=>document.querySelector('#searchStatus')?.textContent.includes('HTTP 404'),{timeout:12000});
 assert.equal(await page.locator('#rowsValue').innerText(),'2 / 4',
  'Search service failure must not erase previously fetched departures');
 await page.locator('#stop').selectOption('custom');
 assert.equal(await page.locator('#customStopField').isVisible(),true);
 await page.locator('#customStop').fill('NSR:StopPlace:41613');
 await page.locator('#customStop').press('Tab');
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('avganger hentet'),{timeout:12000});
 await page.locator('#source').selectOption('demo');
 assert.match(await page.locator('#sourceBadge').innerText(),/DEMO/);
 const callsBefore=apiCalls;
 await page.locator('#refresh').click();assert.equal(apiCalls,callsBefore);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
  'Mini simulator must fit narrow iPhone viewport');
 assert.equal(await page.locator('#preview').isVisible(),true);
 assert.equal(await page.evaluate(()=>localStorage.length),0,'Mini must not change existing editor drafts');
 assert.deepEqual(errors,[],'No JS errors');
 console.log('InTransit Mini Chromium: 64/32/128 LED, TFT 240×135, custom 96×48 OLED, PNG/JSON, live 404/200, mobile PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

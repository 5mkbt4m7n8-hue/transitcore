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
 let liveStatus=404,apiCalls=0;
 await page.route('https://transitcore-led-feed.lgb84.workers.dev/**',async route=>{
  apiCalls++;
  const url=new URL(route.request().url());
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

import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('config/boards/trondheim-city-lines-catalog.json',root)));
const ledId=catalog.nodes.find(n=>n.stopIds?.includes('NSR:Quay:74982')).led;
let calls=0,mode='intermittent',release;
const frame=(id,vehicle='production-bus')=>({schemaVersion:1,boardProfile:id,ledCount:id==='trondheim-flybuss-live'?46:1282,sequence:Date.now(),generatedAt:new Date().toISOString(),ttlSeconds:10,leds:id==='trondheim-flybuss-live'?[]:[{id:ledId,rgb:[0,255,0],brightness:32,state:'AT_STOP',vehicle:{id:vehicle,line:'1',destination:'Ranheim'}}]});
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/v1/frame/')){
  calls++;const id=path.split('/').pop();
  if(mode==='intermittent'&&calls<3){req.socket.destroy();return;}
  if(mode==='delay'){await new Promise(resolve=>release=resolve);}
  if(mode==='offline'){res.writeHead(503).end();return;}
  res.setHeader('content-type','application/json');res.end(JSON.stringify(frame(id)));return;
 }
 const file=new URL('.'+path,root);if(!file.href.startsWith(root.href)){res.writeHead(403).end();return;}
 res.setHeader('content-type',path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{}),args:['--no-sandbox']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://transitcore-linear-staging.lgb84.workers.dev/api/v1/frame/**',r=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(frame(r.request().url().split('/').pop(),'staging-bus'))}));
 await page.goto(`http://127.0.0.1:${server.address().port}/web/linear/index.html?route=atb-bus-1-live`);
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('VALID'));
 assert(calls>=3);assert.match(await page.locator('#status').innerText(),/ok · forsøk/);
 const colors=await page.locator('#legend .dot').evaluateAll(els=>els.map(e=>e.style.backgroundColor));assert.deepEqual(colors,['rgb(239, 83, 80)','rgb(102, 187, 106)']);
 assert(await page.locator('.led.on').count()>0);
 // A delayed production reply cannot overwrite a newer staging selection.
 mode='delay';await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('VALID'));
 const deadline=Date.now()+5000;while(!release&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert(release,"Production request reached the delayed fixture");
 await page.selectOption('#source','staging');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('staging.lgb84'));
 release();mode='healthy';await page.waitForTimeout(100);
 assert.match(await page.locator('#status').innerText(),/staging.lgb84/);
 const vehicles=await page.locator('.led.on').evaluateAll(els=>els.map(e=>JSON.parse(e.dataset.vehicle).id));assert(vehicles.every(id=>id==='staging-bus'));
 await page.selectOption('#route','atb-bus-2-live');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('VALID'));assert.equal(await page.locator('#source').inputValue(),'staging');
 await page.selectOption('#route','atb-bus-1-live');await page.selectOption('#source','production');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('VALID')&&!document.querySelector('#status').textContent.includes('staging.lgb84'));
 mode='offline';await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('LAST_VALID'));
 assert.match(await page.locator('#quality').innerText(),/SISTE GYLDIGE/);
 await page.waitForFunction(()=>document.querySelectorAll('.led.on').length===0,{},{timeout:15000});assert.match(await page.locator('#quality').innerText(),/UTDATERT/);
 mode='healthy';await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('VALID')&&!document.querySelector('#status').textContent.includes('LAST_VALID'));assert(await page.locator('.led.on').count()>0);
 assert.deepEqual(errors,[]);console.log('Browser: intermittent recovery, legend, source/route switching, in-flight isolation, TTL OFF and recovery passed');
}finally{release?.();await browser.close();await new Promise(resolve=>server.close(resolve));}

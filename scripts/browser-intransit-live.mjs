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
  const code=url.pathname.match(/atb-line-(\\d+)$/)?.[1]||'1';
  if(code==='2'&&gpsMode==='slow2')await new Promise(resolve=>setTimeout(resolve,700));
  const time=new Date().toISOString(),valid=code==='1'?[{
   id:'bus-a',latitude:63.4301,longitude:10.405,destination:'Ranheim',line:'1',source:'GPS',lastUpdated:time
  },{
   id:'bus-b',latitude:63.365,longitude:10.382,destination:'Kattem',line:'1',source:'GPS',lastUpdated:time
  }]:[{id:'bus-'+code,latitude:63.42,longitude:10.39,destination:'Linje '+code,
     line:code,source:'GPS',lastUpdated:time}];
  const vehicles=gpsMode==='empty'?[]:gpsMode==='stale'?valid.map(v=>({...v,lastUpdated:new Date(Date.now()-300000).toISOString()})):
   gpsMode==='mismatch'?valid.map(v=>({...v,line:'1'})):valid;
  const responseCode=gpsMode==='mismatch'?'1':code;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   schemaVersion:1,lineId:'ATB:Line:2_'+responseCode,publicCode:responseCode,codespace:'ATB',
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
 await page.waitForFunction(()=>document.querySelector('#fullscreen')?.getAttribute('aria-pressed')==='true');
 await page.locator('#fullscreen').click();
 await page.waitForFunction(()=>document.querySelector('#fullscreen')?.getAttribute('aria-pressed')==='false');
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
 // Switch the immutable shape, stops and GPS source as one line-specific view.
 gpsMode='valid';
 await page.locator('#lineSelect').selectOption('2');
 await page.waitForFunction(()=>document.querySelector('#routeStatus')?.textContent.includes('30 holdeplasser · 70 trasépunkter'),{timeout:15000});
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('1 ferske, målte GPS-posisjoner for linje 2'),{timeout:15000});
 assert.equal(await page.locator('#followBus option').count(),2);
 assert.equal(await page.locator('#busCount').innerText(),'1');
 assert.match(await page.locator('#title').innerText(),/Linje 2/);
 assert.match(page.url(),/line=2/);
 await page.locator('#followBus').selectOption('bus-2');
 assert.match(await page.locator('#followDetail').innerText(),/Følger buss 2/);
 // Switching must clear all old observations and the selected bus.
 await page.locator('#lineSelect').selectOption('3');
 await page.waitForFunction(()=>document.querySelector('#routeStatus')?.textContent.includes('24 holdeplasser · 71 trasépunkter'),{timeout:15000});
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('GPS-posisjoner for linje 3'),{timeout:15000});
 assert.equal(await page.locator('#followBus').inputValue(),'');
 assert.equal(await page.locator('#busCount').innerText(),'1');
 assert.equal(await page.locator('#followBus option[value="bus-2"]').count(),0);
 assert.equal(await page.locator('#followBus option[value="bus-3"]').count(),1);
 assert.match(page.url(),/line=3/);
 // Reject wrong-line observations rather than displaying another line's buses.
 gpsMode='mismatch';
 await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('GPS-kilden kan ikke nås'),{timeout:15000});
 assert.equal(await page.locator('#busCount').innerText(),'0');
 gpsMode='valid';
 await page.locator('#refresh').click();
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('linje 3'),{timeout:15000});
 // Route deep link survives reload.
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#gpsStatus')?.textContent.includes('GPS-posisjoner for linje 3'),{timeout:25000});
 assert.equal(await page.locator('#lineSelect').inputValue(),'3');
 assert.match(await page.locator('#routeStatus').innerText(),/24 holdeplasser · 71 trasépunkter/);
 await page.setViewportSize({width:390,height:844});
 const viewportAudit=await page.evaluate(()=>({
  innerWidth,scrollWidth:document.documentElement.scrollWidth,
  offenders:[...document.querySelectorAll('*')].map(el=>({
   tag:el.tagName,id:el.id,cls:typeof el.className==='string'?el.className:'',
   left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right),
   scrollWidth:el.scrollWidth
  })).filter(x=>x.right>innerWidth+1&&x.left<innerWidth+100).sort((a,b)=>b.right-a.right).slice(0,12)
 }));
 if(viewportAudit.scrollWidth>viewportAudit.innerWidth)console.log('MOBILE OVERFLOW DIAGNOSTICS',JSON.stringify(viewportAudit));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile page must not overflow');
 assert.equal(await page.locator('#map').isVisible(),true);
 assert.equal(await page.evaluate(()=>localStorage.length),0,'Viewing route and GPS must not edit geo or schematic drafts');
 assert.deepEqual(errors,[],'No runtime browser errors');
 console.log('Live line 1 Chromium: 98 route points, 32 stops, real GPS mock, follow, fullscreen, 404/503, stale and mobile PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

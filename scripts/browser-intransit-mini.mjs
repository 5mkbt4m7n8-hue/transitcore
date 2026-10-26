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
 assert.equal(await page.locator('#destinationMode').inputValue(),'shorten');
 await page.locator('#destinationMode').selectOption('scroll');
 assert.equal(await page.locator('#destinationMode').inputValue(),'scroll');
 // Check REAL Canvas pixels: the complete label scrolls within its assigned
 // destination field while route/time remain unchanged.
 const frames=await page.evaluate(()=>{
  const M=window.InTransitMiniModel,R=window.InTransitMiniRenderer;
  const now=Date.parse('2026-10-26T11:00:00.000Z');
  const data=M.demo(now);data.departures[0].line='12';
  data.departures[0].destination='Dragvoll via Strindheim';
  data.departures[0].at=new Date(now+180000).toISOString();
  const board=document.createElement('canvas');board.width=64;board.height=64;
  const snapshots=[];
  for(const ms of [0,4800]){
   const r=R.draw(board,M.profile('led-64x64'),data,
    {demo:false,now,design:'classic',destinationMode:'scroll',scrollMs:ms});
   snapshots.push({png:board.toDataURL(),moving:r.scrolling,visible:r.visible});
  }
  return snapshots;
 });
 assert.equal(frames[0].moving,true);
 assert.equal(frames[1].visible,5);
 assert.notEqual(frames[0].png,frames[1].png,'Clipped destination should move in real bitmap canvas');
 await page.locator('#destinationMode').selectOption('shorten');

 // The production browser must use the new physical glyph-width allocation:
 // full STRINDHEIM fits in a 64x64 row beside two-digit line and countdown.
 const measured=await page.evaluate(()=>{
  const C=window.InTransitMiniColumns,F=window.InTransitMiniFont;
  const cols=C.columns(64,2,'12','3m',1);
  return {dest:C.destination('Strindheim',cols.destWidth,1),
   width:cols.destWidth,pixelWidth:F.width('STRINDHEIM',1)};
 });
 assert.deepEqual(measured,{dest:'STRINDHEIM',width:42,pixelWidth:39});

 // LED framebuffer must contain only palette colors, never antialiased edges.
 const raster=await page.evaluate(()=>{
  const R=window.InTransitMiniRenderer,M=window.InTransitMiniModel;
  const old=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(){throw Error('Native LED text rasterization');};
  try{
   const colors=new Set(Object.values(M.palettes.rgb).map(c=>c.toLowerCase()));
   const counts=[];
   for(const size of [[32,16],[64,32],[64,64],[128,64]])for(const design of ['classic','compact','bold','clock']){
    const frame=document.createElement('canvas');frame.width=size[0];frame.height=size[1];
    R.draw(frame,{width:size[0],height:size[1],kind:'led'},M.demo(Date.now()),
     {demo:true,design,now:Date.now(),palette:'rgb'});
    const pixels=frame.getContext('2d').getImageData(0,0,...size).data,seen=new Set();
    for(let i=0;i<pixels.length;i+=4){
     if(pixels[i+3]!==255)throw Error('Nonopaque LED pixel');
     const color='#'+[pixels[i],pixels[i+1],pixels[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('');
     if(!colors.has(color))throw Error('Antialiased LED color '+color);
     seen.add(color);
    }
    counts.push(seen.size);
   }
   return counts;
  }finally{CanvasRenderingContext2D.prototype.fillText=old;}
 });
 assert(raster.every(n=>n>1),'Every LED design must paint visible bitmap content');
 const sharpFrame=await page.locator('#frame').evaluate(el=>el.toDataURL());
 const sharpPreview=await page.locator('#preview').evaluate(el=>el.toDataURL());
 await page.locator('#previewView').selectOption('led');
 assert.notEqual(await page.locator('#preview').evaluate(el=>el.toDataURL()),sharpPreview);
 assert.equal(await page.locator('#frame').evaluate(el=>el.toDataURL()),sharpFrame,
  'LED dots are presentation only; exported physical pixels remain identical');
 await page.locator('#previewView').selectOption('pixels');
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
 assert.equal(await page.locator('#frame').evaluate(el=>el.getContext('2d').pixelFont),undefined,
  'LED font adapter must not leak state into LCD text');
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
 // Mini 3.0: designs are independent, pixel-accurate framebuffer renderers.
 await page.locator('#profile').selectOption('led-64x64');
 const images=[];
 for(const design of ['classic','compact','bold','clock']){
  await page.locator('#design').selectOption(design);
  images.push(await page.locator('#frame').evaluate(el=>el.toDataURL('image/png')));
 }
 assert.equal(new Set(images).size,4,'Every display design must render different real pixels');
 await page.locator('#design').selectOption('bold');
 await page.locator('#clearAllLines').click();
 await page.locator('#lineFilters input[value="1"]').check();
 await page.locator('#direction').selectOption('Ranheim');
 await page.locator('#destinationMode').selectOption('scroll');
 await page.locator('#presetName').fill('Hjem');
 await page.locator('#savePreset').click();
 await page.waitForFunction(()=>document.querySelector('#presetStatus')?.textContent.includes('Lagret'));
 assert.equal(await page.locator('#savedPreset option').count(),2);
 assert.equal(await page.locator('#updatePreset').isDisabled(),false);
 assert.equal(await page.locator('#rowsValue').innerText(),'1 / 1');
 const home=await page.locator('#savedPreset').inputValue();
 assert(home.startsWith('mini-'));
 const localKeys=await page.evaluate(()=>Object.keys(localStorage));
 assert.deepEqual(localKeys,['intransit-mini:v3:presets'],
  'Mini storage must not touch transit drawing drafts or other products');
 await page.locator('#profile').selectOption('lcd-240x135');
 await page.locator('#design').selectOption('clock');
 await page.locator('#destinationMode').selectOption('shorten');
 await page.locator('#stop').selectOption('NSR:StopPlace:41742');
 await page.locator('#presetName').fill('Jobb');
 await page.locator('#savePreset').click();
 assert.equal(await page.locator('#savedPreset option').count(),3);
 assert.equal(await page.locator('#profile').inputValue(),'lcd-240x135');
 await page.locator('#savedPreset').selectOption(home);
 assert.equal(await page.locator('#profile').inputValue(),'led-64x64');
 assert.equal(await page.locator('#design').inputValue(),'bold');
 assert.equal(await page.locator('#destinationMode').inputValue(),'scroll');
 assert.equal(await page.locator('#direction').inputValue(),'Ranheim');
 assert.equal(await page.locator('#rowsValue').innerText(),'1 / 1');
 assert.equal(await page.locator('#presetName').inputValue(),'Hjem');
 const profileExport=page.waitForEvent('download');
 await page.locator('#exportPreset').click();
 const exported=await profileExport;
 const data=JSON.parse(await readFile(await exported.path(),'utf8'));
 assert.equal(data.version,3);
 assert.equal(data.value.display.design,'bold');
 assert.equal(data.value.display.destinationMode,'scroll');
 assert.deepEqual(data.value.datasource.filters.lines,['1']);
 assert.equal(data.value.datasource.filters.destination,'Ranheim');
 await page.locator('#design').selectOption('compact');
 await page.locator('#presetName').fill('Hjem oppdatert');
 await page.locator('#updatePreset').click();
 assert.equal(await page.locator('#savedPreset option').count(),3,
  'Updating saved setup must not create extra slot');
 assert.equal(await page.locator('#presetName').inputValue(),'Hjem oppdatert');
 await page.reload();
 assert.equal(await page.locator('#savedPreset option').count(),3,
  'Named Mini settings must survive a full page reload');
 await page.locator('#savedPreset').selectOption(home);
 assert.equal(await page.locator('#design').inputValue(),'compact');
 assert.equal(await page.locator('#destinationMode').inputValue(),'scroll');
 assert.equal(await page.locator('#direction').inputValue(),'Ranheim');
 // Import saves as NEW identity rather than overwriting Hjem oppdatert.
 await page.locator('#importPreset').setInputFiles({name:'mini-import.json',
  mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
 await page.waitForFunction(()=>document.querySelector('#presetStatus')?.textContent.includes('Importerte'));
 assert.equal(await page.locator('#savedPreset option').count(),4);
 assert.equal(await page.locator('#design').inputValue(),'bold');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#deletePreset').click();
 assert.equal(await page.locator('#savedPreset option').count(),3);
 assert.equal(await page.locator('#profile').inputValue(),'led-64x64');
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).join(',')),
  'intransit-mini:v3:presets');
 // Mini 4.0: no rotation until the user explicitly presses Start.
 assert.equal(await page.locator('#rotationProfiles input[type=checkbox]').count(),2);
 assert.equal(await page.locator('#rotationProfiles input:checked').count(),2);
 assert.equal(await page.evaluate(()=>window.InTransitMiniRotationControl.state().playing),false);
 assert.equal(await page.locator('#rotationToggle').isDisabled(),false);
 await page.locator('#rotationInterval').selectOption('5');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-mini:v4:rotation')).seconds),5);
 await page.locator('#rotationToggle').click();
 assert.equal(await page.evaluate(()=>window.InTransitMiniRotationControl.state().playing),true);
 assert.match(await page.locator('#rotationStatus').innerText(),/Viser/);
 assert.equal(await page.locator('#rotationToggle').getAttribute('aria-pressed'),'true');
 const started=await page.evaluate(()=>window.InTransitMiniRotationControl.state());
 const expectedNext=started.active===home?
  (await page.locator('#savedPreset option').evaluateAll(options=>options.find(x=>
    x.textContent==='Jobb')?.value)):home;
 await page.locator('#rotationNext').click();
 assert.equal(await page.evaluate(()=>window.InTransitMiniRotationControl.state().active),expectedNext);
 await page.locator('#rotationPrevious').click();
 assert.equal(await page.evaluate(()=>window.InTransitMiniRotationControl.state().active),started.active);
 // Real timer advances with the selected 5-second interval.
 await page.waitForFunction(previous=>window.InTransitMiniRotationControl.state().active!==previous,
  started.active,{timeout:8500});
 await page.locator('#rotationToggle').click();
 assert.equal(await page.evaluate(()=>window.InTransitMiniRotationControl.state().paused),true);
 const atPause=await page.evaluate(()=>window.InTransitMiniRotationControl.state());
 await page.waitForTimeout(450);
 const afterPause=await page.evaluate(()=>window.InTransitMiniRotationControl.state());
 assert.equal(afterPause.active,atPause.active);
 assert.equal(afterPause.elapsedMs,atPause.elapsedMs,'Paused slideshow must not advance elapsed time');
 await page.locator('#rotationToggle').click();
 assert.equal(await page.evaluate(()=>window.InTransitMiniRotationControl.state().paused),false);
 // While page is hidden, background throttling must not trigger missed-screen catchup.
 await page.evaluate(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 const hiddenState=await page.evaluate(()=>window.InTransitMiniRotationControl.state());
 await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>window.InTransitMiniRotationControl.state().elapsedMs),
  hiddenState.elapsedMs);
 await page.evaluate(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await page.locator('#palette').selectOption('mono');
 assert.equal(await page.evaluate(()=>window.InTransitMiniRotationControl.state().playing),false,
  'Manual editing must stop auto-rotation');
 // Selecting only one profile disables automatic playback.
 await page.locator('#rotationProfiles input[type=checkbox]').first().uncheck();
 assert.equal(await page.locator('#rotationToggle').isDisabled(),true);
 await page.locator('#rotationProfiles input[type=checkbox]').first().check();
 assert.equal(await page.locator('#rotationToggle').isDisabled(),false);
 await page.reload();
 assert.equal(await page.locator('#rotationInterval').inputValue(),'5');
 assert.equal(await page.locator('#rotationProfiles input:checked').count(),2);
 assert.equal(await page.evaluate(()=>window.InTransitMiniRotationControl.state().playing),false,
  'Auto-play must not unexpectedly start after page reload');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
  'Mini simulator must fit narrow iPhone viewport');
 assert.equal(await page.locator('#preview').isVisible(),true);
 assert.deepEqual((await page.evaluate(()=>Object.keys(localStorage))).sort(),
  ['intransit-mini:v3:presets','intransit-mini:v4:rotation'],
  'Rotation writes only to its isolated Mini key, not original TransitCore drafts');
 assert.deepEqual(errors,[],'No JS errors');
 console.log('InTransit Mini Chromium: 64/32/128 LED, TFT 240×135, custom 96×48 OLED, PNG/JSON, live 404/200, mobile PASS');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

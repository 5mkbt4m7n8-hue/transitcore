import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=new URL('../',import.meta.url);
const mime=file=>file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':
 file.endsWith('.css')?'text/css':'text/html';
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=new URL('.'+pathname+(pathname.endsWith('/')?'index.html':''),root);
  if(!file.href.startsWith(root.href)){res.writeHead(403).end();return;}
  res.setHeader('content-type',mime(file.pathname));res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:900},acceptDownloads:true});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 const base='http://127.0.0.1:'+server.address().port+'/web/linear/stops/';
 await page.goto(base);
 await page.waitForSelector('#results tr',{timeout:20000});
 assert.equal(await page.locator('#results tr').count(),100,'Every original stop gets one row');
 assert.match(await page.locator('#stats').innerText(),/100/);
 assert.match(await page.locator('#stats').innerText(),/23/);
 assert.match(await page.locator('#stats').innerText(),/32/);
 await page.locator('#filter').selectOption('unnamed');
 assert.equal(await page.locator('#results tr').count(),23);
 await page.locator('#results tr[data-id="original-003"]').click();
 assert.match(await page.locator('#detailSubtitle').innerText(),/ikke bekreftet/);
 assert.match(await page.locator('#facts').innerText(),/Ingen verifiserte Quay-koblinger/);
 assert.match(await page.locator('#schematicLink').getAttribute('href'),/view=network&stop=original-003/);
 assert.match(await page.locator('#geoLink').getAttribute('href'),/geo\/\?stop=original-003/);
 await page.locator('#alias').fill('Prøveholdeplass');
 await page.locator('#renameForm button[type="submit"]').click();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo);
 assert.equal(stored.names['original-003'],'Prøveholdeplass');
 assert.equal(stored.stops['original-003'],undefined,'Renaming does not make up coordinates');
 assert.equal(await page.locator('#results tr').count(),23,'Renaming does not change confirmed source names');
 assert.match(await page.locator('#results tr[data-id="original-003"]').innerText(),/Prøveholdeplass/);
 const file=page.waitForEvent('download');
 await page.locator('#export').click();
 assert.equal((await file).suggestedFilename(),'intransit-holdeplasser.csv');
 await page.goto(base+'?stop=original-003');
 await page.waitForSelector('#results tr[data-id="original-003"]');
 assert.equal(await page.locator('#alias').inputValue(),'Prøveholdeplass','Local overlay survives reload');
 assert.match(await page.locator('#detailSubtitle').innerText(),/ikke bekreftet/);
 await page.locator('#reset').click();
 assert.equal(await page.locator('#alias').inputValue(),'');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-geo-draft-v1')).geo.names['original-003']),undefined);
 await page.locator('#filter').selectOption('all');
 await page.locator('#search').fill('original-003');
 assert.equal(await page.locator('#results tr').count(),1);
 await page.locator('#search').fill('');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile admin panel should not overflow');
 assert.deepEqual(errors,[],'No runtime errors');
 console.log('Stop admin browser: 100 rows, 23 unnamed, links, edit/reset, reload, filtered CSV and mobile PASS');
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
}

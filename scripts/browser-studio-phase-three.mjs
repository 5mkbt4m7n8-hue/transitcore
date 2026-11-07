import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';

export async function phaseThree(browser,base,screenshotDir){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'studio.html');await page.waitForFunction(()=>!!window.InTransitStudio);
  const state=()=>page.evaluate(()=>InTransitStudio.snapshot()),doc=()=>state().then(s=>s.doc),stop=()=>doc().then(d=>d.artwork.stops.find(s=>s.id==='s'));
  const at=async(x,y)=>{const {camera:c}=await state(),r=await page.locator('#canvas').boundingBox();return {x:r.x+(x-c.x)*c.k,y:r.y+(y-c.y)*c.k};};
  const click=async(x,y)=>{const p=await at(x,y);await page.mouse.click(p.x,p.y);};
  const drag=async(x,y,toX,toY)=>{const p=await at(x,y),q=await at(toX,toY);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(q.x,q.y,{steps:5});await page.mouse.up();};
  const key=async k=>{await page.locator('#canvas').focus();await page.keyboard.press(k);},button=name=>page.getByRole('button',{name,exact:true}),field=name=>page.getByLabel(name,{exact:true});
  const load=async d=>{await page.locator('#file').setInputFiles({name:'phase3.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.waitForFunction(()=>document.getElementById('file').value==='');assert.deepEqual(await doc(),d);};
  const zoom=async value=>{const p=await at(400,450),old=(await state()).camera.k;await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,-Math.log(value/old)/.0015);await page.waitForFunction(v=>Math.abs(InTransitStudio.snapshot().camera.k-v)<.001,value);};
  const single=await page.evaluate(()=>{const d=InTransitStudioDocument.blank();d.artwork.lines=[{id:'a',name:'A',color:'#218967',width:6,visible:true,locked:false,points:[{x:200,y:300},{x:600,y:300}]}];d.artwork.stops=[{id:'s',name:'Felles navn',x:350,y:600,labelDx:12,labelDy:-12,lineIds:[],visible:true,locked:false}];d.bindings.s={source:'trondheim',sourceId:'source-s',quayIds:['NSR:Quay:1','NSR:Quay:2']};return d;});
  for(const k of [.4,.8,1.5]){
   await load(single);await zoom(k);const camera=(await state()).camera;
   await drag(350,600,350,300+13/k);let s=await stop();assert(Math.abs(s.x-350)<.001);assert.equal(s.y,300);assert.deepEqual(s.lineIds,['a']);assert.equal(s.anchor.kind,'line');assert.deepEqual((await state()).camera,camera);assert.deepEqual((await doc()).bindings,single.bindings);
   await key('Control+z');assert.deepEqual(await doc(),single);assert(await page.locator('#undo').isDisabled());await key('Control+y');assert.equal((await stop()).y,300);
   // A point just beyond 14 screen pixels stays free, even with grid enabled.
   await load(single);await zoom(k);await drag(350,600,350,300+15/k);assert.equal((await stop()).anchor,undefined);assert.deepEqual((await stop()).lineIds,[]);
  }
  const parallel=structuredClone(single);const extra=await page.evaluate(d=>{InTransitStudioDocument.linkedParallel(d,'a',3,6,'right','lanes',['b','c']);d.artwork.lines[1].name='B';d.artwork.lines[2].name='C';return d;},parallel);
  for(const k of [.4,.8,1.5]){
   await load(extra);await zoom(k);const camera=(await state()).camera;
   await drag(350,600,350,306);assert((await state()).pendingStation);assert.equal((await state()).pendingStation.candidates.length,3);assert.deepEqual(await doc(),extra,'ambiguous drag is a preview, not an edit');assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-artwork-v1'))),extra,'pending drag does not persist');assert(await page.locator('#undo').isDisabled());assert.equal(await page.locator('[data-snap-candidate]').count(),3);
   // Escape must also cancel when a checkbox in the chooser has focus.
   await page.getByRole('checkbox',{name:'B',exact:true}).focus();await page.keyboard.press('Escape');assert.equal((await state()).pendingStation,null);assert.deepEqual(await doc(),extra);assert(await page.locator('#undo').isDisabled());
   await drag(350,600,350,306);await button('Fest til B').click();assert.deepEqual((await stop()).lineIds,['b']);assert.equal((await stop()).y,306);await key('Control+z');assert.deepEqual(await doc(),extra);assert(await page.locator('#undo').isDisabled());
   await drag(350,600,350,306);await page.getByRole('button',{name:/^Følg felles trasé ·/}).click();assert.equal((await stop()).anchor.kind,'route');assert.deepEqual(new Set((await stop()).lineIds),new Set(['a','b','c']));assert.equal((await stop()).symbol,undefined);await key('Control+z');assert.deepEqual(await doc(),extra);
   await drag(350,600,350,306);await button('Felles stasjon på valgte linjer').click();assert.equal((await stop()).anchor.kind,'station');assert.equal((await stop()).symbol,'capsule');assert.equal((await stop()).y,306);assert.equal((await stop()).leds.length,3);assert.deepEqual((await state()).camera,camera);assert.deepEqual((await doc()).bindings,extra.bindings);await key('Control+z');assert.deepEqual(await doc(),extra);assert(await page.locator('#undo').isDisabled());await key('Control+y');assert.equal((await stop()).lineIds.length,3);
  }
  await load(extra);await drag(350,600,350,306);await page.getByRole('checkbox',{name:'A',exact:true}).uncheck();await button('Felles stasjon på valgte linjer').click();assert.deepEqual(new Set((await stop()).lineIds),new Set(['b','c']));assert.equal((await stop()).symbol,'double');await key('Control+z');assert.deepEqual(await doc(),extra);
  // At high zoom one lane is unambiguous; the explicit button still offers the
  // complete linked route when the user wants a common station across all lanes.
  const wide=await page.evaluate(d=>{InTransitStudioDocument.updateParallel(d,'lanes',3,20,'right');return d;},structuredClone(extra));await load(wide);await zoom(1.5);await drag(350,600,350,320);assert.equal((await state()).pendingStation,null);assert.deepEqual((await stop()).lineIds,['b']);await button('Fest til linjer her').click();assert.equal((await state()).pendingStation.candidates.length,1);await button('Felles stasjon på valgte linjer').click();assert.equal((await stop()).lineIds.length,3);assert.equal((await stop()).span,52);
  // Symbol switches preserve name, route membership, stable LEDs and Quay sources.
  const common=await stop(),ledIds=common.leds.map(l=>l.id);
  for(const value of ['ring','double','capsule','circle','leds']){await field('Stoppsymbol').selectOption(value);const s=await stop();assert.deepEqual(s.leds.map(l=>l.id),ledIds);assert.deepEqual(s.lineIds,common.lineIds);assert.equal(s.name,common.name);assert.deepEqual((await doc()).bindings,extra.bindings);}
  assert.equal(await page.locator('#art [data-led-id]').count(),3);assert.equal(await page.locator('#art text[data-id=s]').count(),1,'one shared station has one name');
  if(!await page.getByText('Separate LED-punkter',{exact:true}).evaluate(n=>n.parentElement.open))await page.getByText('Separate LED-punkter',{exact:true}).click();await field('LED-kilde for A').selectOption(JSON.stringify(['s','NSR:Quay:1']));await field('LED-kilde for B').selectOption(JSON.stringify(['s','NSR:Quay:2']));
  let s=await stop();assert.equal(s.leds.find(l=>l.lineId==='a').quayId,'NSR:Quay:1');assert.equal(s.leds.find(l=>l.lineId==='b').quayId,'NSR:Quay:2');assert.equal(s.leds.find(l=>l.lineId==='c').quayId,undefined);const configured=await doc();
  await field('Stoppsymbol').selectOption('double');await field('Stoppsymbol').selectOption('leds');assert.deepEqual((await stop()).leds,configured.artwork.stops[0].leds);
  const saveWait=page.waitForEvent('download');await button('Lagre prosjekt').click();const saved=await readFile(await (await saveWait).path(),'utf8');assert.deepEqual(JSON.parse(saved),configured);
  const svgWait=page.waitForEvent('download');await button('SVG').click();const svg=await readFile(await (await svgWait).path(),'utf8');assert.equal((svg.match(/data-led-id/g)||[]).length,3);assert(svg.includes('NSR:Quay:1'));assert(svg.includes('NSR:Quay:2'));
  await page.reload();await page.waitForFunction(()=>!!window.InTransitStudio);assert.deepEqual(await doc(),configured);await load(JSON.parse(saved));
  await click(350,306);await button('Løsne fra linjene').click();assert.deepEqual((await stop()).lineIds,[]);assert.equal((await stop()).anchor,undefined);assert.deepEqual((await stop()).leds,configured.artwork.stops[0].leds);assert.deepEqual((await doc()).bindings,extra.bindings);await key('Control+z');assert.deepEqual(await doc(),configured);
  // Referenced stops follow edited shared routes and keep per-LED identity/source.
  await page.locator('.layers summary').click();await page.locator('#layers .pick').filter({hasText:/^━ A$/}).click();await field('Traséavstand').fill('12');await button('Oppdater parallelle linjer').click();s=await stop();assert.equal(s.y,312);assert.equal(s.span,36);assert.deepEqual(s.leds,configured.artwork.stops[0].leds);assert.deepEqual((await doc()).bindings,extra.bindings);await key('Control+z');assert.deepEqual(await doc(),configured);
  if(screenshotDir){await mkdir(screenshotDir,{recursive:true});await page.locator('#layers .pick').filter({hasText:'Felles navn'}).click();await page.getByText('Separate LED-punkter',{exact:true}).click();await page.screenshot({path:screenshotDir+'/map-studio-v010-phase3.png'});}
  // Ambiguous creation is also deferred and cancellable; invisible lines never win.
  await load(extra);await page.locator('[data-tool=stop]').click();await click(350,306);assert((await state()).pendingStation.create);assert.deepEqual(await doc(),extra);await button('Avbryt plassering').click();assert.deepEqual(await doc(),extra);assert(await page.locator('#undo').isDisabled());
  const hidden=structuredClone(extra);hidden.artwork.lines[0].visible=false;hidden.artwork.lines[2].visible=false;hidden.artwork.lines[1].locked=true;await load(hidden);await drag(350,600,350,306);assert.equal((await state()).pendingStation,null);assert.deepEqual((await stop()).lineIds,['b']);assert.deepEqual((await doc()).artwork.lines,hidden.artwork.lines);
  const locked=structuredClone(extra);locked.artwork.stops[0].locked=true;await load(locked);await drag(350,600,350,306);assert.deepEqual(await doc(),locked);assert(await page.locator('#undo').isDisabled());
  assert.deepEqual(errors,[]);console.log('Studio phase 3 Chromium: 14px snapping at three zooms, ambiguous preview/cancel/no history, explicit line/route/shared choices, hidden/locked layers, symbol/LED/Quay identity, one label, route following, detach/undo, JSON/SVG/reload and camera/source preservation passed');
 }finally{await page.close();}
}

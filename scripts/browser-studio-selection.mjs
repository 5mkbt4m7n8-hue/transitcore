import assert from 'node:assert/strict';

export async function selectionRegression(browser,base){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'studio.html');await page.waitForFunction(()=>!!window.InTransitStudio);
  const state=()=>page.evaluate(()=>InTransitStudio.snapshot());
  const fixture=await page.evaluate(()=>{
   const d=InTransitStudioDocument.blank();
   d.artwork.lines=[
    {id:'route-a',name:'A',color:'#218967',width:4,visible:true,locked:false,points:[{x:200,y:300},{x:600,y:300}]},
    {id:'route-b',name:'B',color:'#cc5271',width:4,visible:true,locked:false,points:[{x:200,y:300},{x:300,y:306},{x:600,y:306}]}
   ];return d;
  });
  const load=async()=>{await page.locator('#file').setInputFiles({name:'selection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>document.getElementById('file').value===''&&InTransitStudio.snapshot().selection.length===0&&document.getElementById('undo').disabled);};
  const paths=()=>page.locator('#art polyline[data-id]').evaluateAll(ns=>ns.map(n=>({id:n.dataset.id,points:n.getAttribute('points'),stroke:n.getAttribute('stroke'),width:n.getAttribute('stroke-width')})));
  const at=async(x,y)=>{const {camera:c}=await state(),r=await page.locator('#canvas').boundingBox();return {x:r.x+(x-c.x)*c.k,y:r.y+(y-c.y)*c.k};};
  const click=async(x,y)=>{const p=await at(x,y);await page.mouse.click(p.x,p.y);};
  for(const modifiers of [['Control'],['Control','Shift'],['Meta']]){
   await load();const before=await state(),originalPaths=await paths();
   for(const k of modifiers)await page.keyboard.down(k);
   // Both clicks hit real route paths; their transparent hit areas overlap.
   await click(450,300);assert.deepEqual((await state()).selection,['route-a']);
   await click(450,306);assert.deepEqual((await state()).selection,['route-a','route-b']);
   assert.equal(await page.locator('#art [data-selection]').count(),2);
   assert.equal(await page.locator('#layers > div[data-selected=true]').count(),2);
   for(const name of ['Slå sammen','Bruk felles trasé','Grupper'])assert.equal(await page.getByRole('button',{name,exact:true,includeHidden:true}).count(),1,'operations require a separate explicit action');
   assert.deepEqual((await state()).doc,before.doc);assert.deepEqual(await paths(),originalPaths);
   assert(await page.locator('#undo').isDisabled(),'selection must not create undo');assert(await page.locator('#redo').isDisabled());
   await click(450,300);assert.deepEqual((await state()).selection,['route-b']);
   // A rapid second click generates native dblclick, which must never insert vertices.
   const p=await at(450,306);await page.mouse.dblclick(p.x,p.y);
   assert.deepEqual((await state()).selection,['route-b']);
   assert.deepEqual((await state()).doc,before.doc);assert.deepEqual(await paths(),originalPaths);
   assert(await page.locator('#undo').isDisabled());
   for(const k of [...modifiers].reverse())await page.keyboard.up(k);
  }
  // An existing endpoint handle must not steal the nearby second route.
  await load();await click(450,300);assert.equal(await page.locator('#handles [data-endpoint=true]').count(),2);
  await page.keyboard.down('Control');await click(208,300.48);await page.keyboard.up('Control');
  assert.deepEqual((await state()).selection,['route-a','route-b']);assert.deepEqual((await state()).doc,fixture);
  assert(await page.locator('#undo').isDisabled());
  // At an exactly shared endpoint, ties consistently use paint order. Layer list
  // gives explicit access to every route even when paths coincide completely.
  await page.locator('#canvas').focus();await page.keyboard.press('Escape');
  await page.keyboard.down('Control');await click(200,300);await click(200,300);await page.keyboard.up('Control');
  assert.deepEqual((await state()).selection,[]);assert.deepEqual((await state()).doc,fixture);
  // Explicit style changes remain one undoable action, and selection preserves redo.
  await page.locator('.layers summary').click();
  await page.locator('#layers .pick').last().click();await page.locator('#layers .pick').first().click({modifiers:['Control']});
  await page.getByLabel('Felles linjetykkelse',{exact:true}).fill('9');await page.getByLabel('Felles linjetykkelse',{exact:true}).press('Tab');
  const styled=(await state()).doc;assert(styled.artwork.lines.every(l=>l.width===9));
  await page.locator('#undo').click();assert.deepEqual((await state()).doc,fixture);assert(await page.locator('#undo').isDisabled());
  await page.keyboard.down('Control');await click(450,300);await page.keyboard.up('Control');assert(await page.locator('#redo').isEnabled());
  await page.locator('#redo').click();assert.deepEqual((await state()).doc,styled);
  assert.deepEqual(errors,[]);
  console.log('Chromium route selection: independent paths/IDs/colors, overlapping hit areas, shared endpoints, Ctrl/Shift/Meta, native dblclick, no undo transaction, explicit style undo/redo passed');
 }finally{await page.close();}
}

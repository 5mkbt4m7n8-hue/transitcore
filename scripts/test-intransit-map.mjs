import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../web/linear/network/model.js');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const layout=JSON.parse(read('web/linear/network/trondheim-layout.json'));
assert.deepEqual(M.validate(layout),[]);
assert.deepEqual(layout.coverage,{scope:'selected-corridors',endToEndRequired:false,expandable:true},'Intentionally partial route geometry must be supported');
assert.equal(M.report(layout,[]).coverage.endToEndRequired,false,'Report must distinguish deliberate partial scope from invalid stop mapping');
assert.equal(layout.stops.length,100,'Existing schematic points preserved');
assert.equal(layout.paths.length,18,'Existing paths preserved');
const invalidScope=structuredClone(layout);invalidScope.coverage.endToEndRequired=true;
assert(M.validate(invalidScope).length,'Do not silently reinterpret selected corridors as complete end-to-end route');

const board=JSON.parse(read('config/boards/trondheim-bus-board.json')),hardware=JSON.parse(read('config/hardware/trondheim-bus-board-hardware.json'));
const n=board.nodes[0],stop={...layout.stops[0],verification:'confirmed',bindings:[{boardId:board.id,nodeId:n.id,stationId:n.stationId,stopId:n.stopIds[0]}]};
const led=M.resolve(stop,board,hardware)[0].physicalLed;
const now=Date.now(),frame={generatedAt:new Date(now).toISOString(),ttlSeconds:30,leds:[{id:led,state:'AT_STOP',rgb:[255,0,0],occupants:[{id:'bus-a',line:'2',state:'AT_STOP',rgb:[255,0,0],source:'ETA'},{id:'bus-b',line:'3',state:'APPROACHING',rgb:[0,0,255]}]}]};
assert.equal(M.signals(stop,board,hardware,frame,null,now).length,2);
assert.equal(M.signals(stop,board,hardware,frame,'2',now)[0].source,'ETA');
assert.equal(M.signals(stop,board,hardware,frame,'3',now)[0].id,'bus-b');
const route=n.routes[0],direction=n.routeDirections[route].directionIds[0];
assert.equal(M.signals(stop,board,hardware,frame,null,now,{route,id:direction}).length,2);
assert.equal(M.signals(stop,board,hardware,frame,null,now,{route:null,routesByLine:{'2':route},id:direction}).length,1);
assert.deepEqual(M.signals(stop,board,hardware,frame,null,now,{route,id:'unknown'}),[]);
const catalog=JSON.parse(read('config/boards/trondheim-city-lines-catalog.json'));
for(const point of layout.stops)for(const binding of point.bindings){
 const sourceBoard=[board,catalog,JSON.parse(read('config/boards/trondheim-flybuss-live.json'))].find(b=>b.id===binding.boardId);
 assert(sourceBoard.nodes.some(n=>n.id===binding.nodeId&&n.stationId===binding.stationId&&n.stopIds.includes(binding.stopId)));
 assert(catalog.nodes.some(n=>n.stationId===binding.stopPlaceId&&n.stopIds.includes(binding.stopId)),'StopPlace and Quay identity must match existing catalog');
}
assert.equal(M.report(layout,[board,catalog]).duplicates.length,0);
const samf=layout.stops.filter(s=>s.name==='Samfundet');assert.equal(samf.length,2);assert(samf.every(s=>s.markerConfirmed&&s.verification==='confirmed'));const ids=samf.map(s=>new Set(s.bindings.map(b=>b.stopId)));assert.equal(ids[0].size,2);assert.equal(ids[1].size,2);assert.equal(new Set([...ids[0],...ids[1]]).size,4);

assert.deepEqual(M.signals(stop,board,hardware,frame,null,now+31000),[]);
assert.deepEqual(M.signals({...stop,verification:'unresolved'},board,hardware,frame,null,now),[]);
assert.deepEqual(M.resolve({...stop,bindings:[{...stop.bindings[0],nodeId:'bad'}]},board,hardware),[]);
assert.deepEqual(M.resolve(stop,{...board,id:'other-board'},hardware),[]);
for(const lifecycle of ['PASSED','PARKED'])assert(M.signals(stop,board,hardware,{...frame,leds:frame.leds.map(l=>({...l,lifecycle}))},null,now).every(v=>v.state===lifecycle));

// Route colors require exact consecutive Quay IDs on both uniquely mapped
// diagram endpoints. They are not inferred for an entire drawn path.
const route1=JSON.parse(read('config/routes/atb-bus-1-live.json'));
const route3=JSON.parse(read('config/routes/atb-bus-3-live.json'));
const route12=JSON.parse(read('config/routes/atb-bus-12-live.json'));
const evidence=M.verifiedSegments(layout,[route1,route3,route12]);
const enhanced=M.verifiedSegments(layout,[route1,route3,route12],[catalog]);
assert(enhanced.length>=evidence.length,'Catalog-verified equivalence must never remove exact Quay evidence');
assert(enhanced.every(e=>e.routes.every(r=>['exact-quay','unique-stopplace'].includes(r.evidence))),'Every colored segment must have explicit evidence');
assert.equal(enhanced.filter(e=>e.pathId==='trace-07'&&e.edgeIndex===0).flatMap(e=>e.routes).filter(r=>r.evidence==='unique-stopplace').length,0,'Distinct Samfundet map markers must never merge via shared StopPlace');
assert(enhanced.every(e=>e.routes.some(r=>r.evidence==='exact-quay')||e.routes.some(r=>r.evidence==='unique-stopplace')));
assert(evidence.some(e=>e.pathId==='trace-04'&&e.from==='original-014'&&e.to==='original-015'&&e.routes.some(r=>r.line==='1')),'Solsiden–Buran adjacency on line 1');
assert(evidence.some(e=>e.pathId==='trace-06'&&e.routes.some(r=>r.line==='1')),'Main corridor contains adjacent line 1 stops');
assert(!evidence.some(e=>e.pathId==='trace-05'&&e.edgeIndex>=1),'Unmapped Lade branch must stay neutral');
assert(!evidence.some(e=>e.pathId==='trace-14'),'Unmapped Tyholt branch must stay neutral');
const removed=structuredClone(route1);removed.stops=removed.stops.filter(s=>s.name!=='Buran');
assert(!M.verifiedSegments(layout,[removed]).some(e=>e.pathId==='trace-04'&&e.from==='original-014'&&e.to==='original-015'),'Route segment must be consecutive');
assert.equal(M.verifiedSegments(layout,[]).length,0,'No route data means no inferred colors');
assert.equal(M.verifiedSegments(layout,[{...route1,stops:[{id:'NSR:Quay:00001'},{id:'NSR:Quay:00002'}]}]).length,0,'No invented IDs');
const exact=structuredClone(layout);M.verifiedSegments(layout,[route1,route3,route12],[catalog]);assert.deepEqual(layout,exact,'Do not change original geometry');
const userReviewed=structuredClone(layout);
userReviewed.paths[3].reviewedSegments={'0':{verification:'user-reviewed',routes:['atb-bus-1-live']}};
assert.deepEqual(M.validate(userReviewed),[],'Explicit per-edge review is valid and must not move map points');
for(const badIndex of ['99','-1','__proto__']){
 const bad=structuredClone(userReviewed);bad.paths[3].reviewedSegments[badIndex]={verification:'user-reviewed',routes:['atb-bus-1-live']};
 if(badIndex!=='__proto__')assert(M.validate(bad).length,'Out of bounds path segments must be rejected');
}
for(const wrong of [{verification:'automatic',routes:['atb-bus-1-live']},{verification:'user-reviewed',routes:['other-route']},{verification:'user-reviewed',routes:[]},{verification:'user-reviewed',routes:['atb-bus-1-live','atb-bus-1-live']}]){
 const bad=structuredClone(userReviewed);bad.paths[3].reviewedSegments['0']=wrong;assert(M.validate(bad).length,'Reject untrusted route approvals');
}

assert.equal(layout.paths.filter(p=>p.verification==='unresolved').length,18,'Whole-path route evidence remains incomplete');

const report=M.report({...layout,stops:[stop,{...stop,id:'duplicate'},...layout.stops]},[board]);
assert(report.duplicates.length);assert(report.unconfirmed.length);assert(report.feedStopsMissing.length);assert(report.multiLine.length>0);
assert.equal(M.report(layout,[board]).complete,false);
for(const bad of [{...layout,viewBox:[0,0,1,1]},{...layout,stops:[{...stop,x:NaN}]},{...layout,paths:[{...layout.paths[0],color:'url(evil)'}]}])assert(M.validate(bad).length);
const Ops=require('../web/linear/network/layout-ops.js');
{
 const grown=structuredClone(layout);
 const originalStops=grown.stops.map(s=>({id:s.id,x:s.x,y:s.y,bindings:s.bindings}));
 const originalPaths=grown.paths.map(p=>({id:p.id,points:p.points}));
 const stopId=Ops.addStop(grown,400,520);
 const pathId=Ops.addPath(grown,400,520);
 assert.equal(stopId,'custom-stop-001');assert.equal(pathId,'custom-path-001');
 assert.equal(grown.stops.length,layout.stops.length+1);
 assert.equal(grown.paths.length,layout.paths.length+1);
 assert.equal(grown.stops.at(-1).verification,'unresolved');
 assert.equal(grown.stops.at(-1).nameConfirmed,false);
 assert.deepEqual(grown.stops.at(-1).bindings,[]);
 assert.deepEqual(M.validate(grown),[]);
 assert.deepEqual(grown.stops.slice(0,layout.stops.length).map(s=>({id:s.id,x:s.x,y:s.y,bindings:s.bindings})),originalStops,'Preserve every original stop and Quay mapping');
 assert.deepEqual(grown.paths.slice(0,layout.paths.length).map(p=>({id:p.id,points:p.points})),originalPaths,'Preserve all 18 original routes');
 const path=grown.paths.at(-1);
 Ops.extendPath(grown,pathId);assert.equal(path.points.length,3);
 path.reviewedSegments={'0':{verification:'user-reviewed',routes:['atb-bus-1-live']},'1':{verification:'user-reviewed',routes:['atb-bus-2-live']}};
 const index=Ops.insertVertex(grown,pathId,0);assert.equal(index,1);
 assert.equal(path.points.length,4);
 assert.deepEqual(Object.keys(path.reviewedSegments),['2'],'Invalidate edited edge; shift review on unaffected edge');
 Ops.removeLastVertex(grown,pathId);assert.equal(path.points.length,3);
 assert.deepEqual(Object.keys(path.reviewedSegments),[],'Removed geometry loses its manual review');
 assert.deepEqual(M.validate(grown),[]);
 assert.throws(()=>Ops.deleteNewStop(grown,layout.stops[0].id),/kan ikke slettes/);
 assert.throws(()=>Ops.deleteNewPath(grown,layout.paths[0].id),/kan ikke slettes/);
 Ops.deleteNewPath(grown,pathId);Ops.deleteNewStop(grown,stopId);
 assert.equal(grown.stops.length,layout.stops.length);
 assert.equal(grown.paths.length,layout.paths.length);
 assert.deepEqual(M.validate(grown),[]);
 const next=Ops.addStop(grown,403,526);
 assert.equal(next,stopId,'New elements reuse available stable IDs after removal');
}

{
 const drawn=structuredClone(layout);
 const existingPaths=drawn.paths.map(p=>({id:p.id,points:structuredClone(p.points),reviewedSegments:structuredClone(p.reviewedSegments||{})}));
 const id=Ops.drawPath(drawn,[{x:100,y:100},{x:120,y:113},{x:160,y:160}]);
 assert.equal(id,'custom-path-001');
 assert.deepEqual(drawn.paths.at(-1).points,[{x:100,y:100},{x:120,y:113},{x:160,y:160}]);
 assert.deepEqual(M.validate(drawn),[]);
 assert.throws(()=>Ops.drawPath(drawn,[{x:80,y:80}]),/Minst to punkter/);
 assert.throws(()=>Ops.drawPath(drawn,[{x:80,y:80},{x:80,y:80}]),/for nær/);
 assert.throws(()=>Ops.drawPath(drawn,[{x:80,y:80},{x:914,y:100}]),/innenfor/);
 assert.equal(drawn.paths.length,layout.paths.length+1,'Invalid sketches must not persist');
 drawn.paths.at(-1).reviewedSegments={'0':{verification:'user-reviewed',routes:['atb-bus-1-live']}};
 const before=structuredClone(drawn.paths.at(-1).reviewedSegments);
 Ops.appendPath(drawn,id,[{x:220,y:180},{x:260,y:200}]);
 assert.equal(drawn.paths.at(-1).points.length,5);
 assert.deepEqual(drawn.paths.at(-1).reviewedSegments,before,'Extending tail must preserve previous review evidence');
 assert.throws(()=>Ops.appendPath(drawn,id,[{x:260,y:200}]),/for nær/);
 assert.throws(()=>Ops.appendPath(drawn,id,[{x:1000,y:200}]),/innenfor/);
 assert.deepEqual(drawn.paths.slice(0,layout.paths.length).map(p=>({id:p.id,points:p.points,reviewedSegments:p.reviewedSegments||{}})),existingPaths,'100 original stops and 18 traced paths must stay unchanged');
 assert.equal(drawn.stops.length,100);
 assert.deepEqual(M.validate(drawn),[]);
}

// Renaming must never rewrite an original ID/NSR binding. Moving an already
// named stop must preserve all attached schematic connections and route proof.
{
 const moved=structuredClone(layout),id='original-014';
 const stop=moved.stops.find(s=>s.id===id),source=layout.stops.find(s=>s.id===id);
 const label=structuredClone(stop.label);
 const oldPaths=moved.paths.flatMap(path=>path.points.map((p,i)=>({id:path.id,i,x:p.x,y:p.y})))
  .filter(p=>Math.hypot(p.x-source.x,p.y-source.y)<=0.8);
 assert(oldPaths.length>0,'Named stop must have an attached schematic vertex');
 const before=M.verifiedSegments(moved,[route1],[catalog]).filter(e=>e.from===id||e.to===id)
  .map(e=>e.pathId+':'+e.edgeIndex).sort();
 Ops.moveStop(moved,id,source.x+11,source.y+17);
 assert.deepEqual([stop.x,stop.y],[source.x+11,source.y+17]);
 assert.deepEqual([stop.label.x,stop.label.y],[label.x+11,label.y+17]);
 assert.deepEqual(stop.bindings,source.bindings,'Original Quay bindings remain untouched');
 assert.equal(stop.name,source.name,'The canonical station name remains untouched');
 for(const p of oldPaths){
  const point=moved.paths.find(x=>x.id===p.id).points[p.i];
  assert.deepEqual(point,{x:stop.x,y:stop.y},'Every joined route vertex follows the moved stop');
 }
 const after=M.verifiedSegments(moved,[route1],[catalog]).filter(e=>e.from===id||e.to===id)
  .map(e=>e.pathId+':'+e.edgeIndex).sort();
 assert.deepEqual(after,before,'Connected route evidence survives local relocation');
 assert.deepEqual(M.validate(moved),[]);
 assert.deepEqual(layout.stops.find(s=>s.id===id),source,'Original source remains unchanged');
 assert.throws(()=>Ops.moveStop(moved,'missing-id',10,10),/Ukjent holdeplass/);
 assert.throws(()=>Ops.moveStop(moved,id,NaN,20),/Ugyldig plassering/);
}
const context={structuredClone,InTransitMapModel:M};vm.createContext(context);vm.runInContext(read('web/linear/network/editor.js'),context);
let changed;const editor=context.InTransitMapEditor(layout,v=>changed=v);editor.change(v=>v.stops[0].x=100);assert.equal(changed.stops[0].x,100);editor.undo();assert.equal(changed.stops[0].x,layout.stops[0].x);editor.import(JSON.parse(editor.export()));assert.throws(()=>editor.import({}));editor.change(v=>v.stops[0].diodeMode='split');editor.discard();assert.equal(changed.stops[0].diodeMode,'shared');
const ui=read('web/linear/network/map.js');
assert.match(ui,/data-role="reviewPath"/);
assert.match(ui,/data-act="addStop"/);
assert.match(ui,/data-act="addPath"/);
assert.match(ui,/intransit-map-autodraft-v1/,'The editor must use a separate auto-draft storage key');
assert.match(ui,/baseFingerprint/,'Restored draft must match the originally loaded layout');
assert.match(ui,/restoreAutoDraft\(\)/,'Map must restore a compatible local draft');
assert.match(ui,/clearAutoDraft\(\)/,'Discard must clear the draft');
assert.match(ui,/svg\.addEventListener\('click'/,'Placement must use map coordinate taps');
assert.match(ui,/placementGestureMoved/,'Dragging must not accidentally create a stop');
assert.match(ui,/L\.insertVertex/);
assert.match(ui,/L\.extendPath/);
assert.match(ui,/sketchTap\(p\)/,'Tap adds provisional route vertices');
assert.match(ui,/L\.drawPath/,'New sketch is committed on finish');
assert.match(ui,/L\.appendPath/,'Existing route can be extended by taps');
assert.match(ui,/data-act="finishSketch"/,'Explicit finish button');
assert.match(ui,/data-act="sketchCancel"/,'Explicit cancel button');
assert.match(ui,/Flytt valgt holdeplass/,'Editor has visible action for existing stop relocation');
assert.match(ui,/Navn på holdeplassen \(lokalt visningsnavn\)/,'Existing named stops have editable name input');
assert.match(ui,/L\.moveStop/,'Map gesture uses connected route-safe movement');
assert.doesNotMatch(ui,/Skjemanavn i JSON \(ikke delt mellom kart\)/,'Original station names should not have competing JSON name field');

assert.match(ui,/data-role="reference"/);
assert.match(ui,/data-role="routeColors"/);
assert.match(ui,/data-role="largeLabels"/);
assert.match(ui,/largeLabels\.onchange=\(\)=>draw\(\)/);
assert.match(ui,/report\.routeEvidence=/);
assert.match(ui,/reference\.onchange=\(\)=>draw\(\)/);
assert.match(ui,/routeColors\.onchange=\(\)=>draw\(\)/);
assert.match(ui,/routeReview\.onchange=/);
for(const file of ['model','layout-ops','map','editor'])new vm.Script(read(`web/linear/network/${file}.js`));
console.log('InTransit layout validation, exact ID/physical LED mapping, lifecycle, expiry, route filtering and editor PASS');

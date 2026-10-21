import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),M=require('../web/linear/network/model.js');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const layout=JSON.parse(read('web/linear/network/trondheim-layout.json'));
assert.deepEqual(M.validate(layout),[]);
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
assert(evidence.some(e=>e.pathId==='trace-04'&&e.from==='original-014'&&e.to==='original-015'&&e.routes.some(r=>r.line==='1')),'Solsiden–Buran adjacency on line 1');
assert(evidence.some(e=>e.pathId==='trace-06'&&e.routes.some(r=>r.line==='1')),'Main corridor contains adjacent line 1 stops');
assert(!evidence.some(e=>e.pathId==='trace-05'&&e.edgeIndex>=1),'Unmapped Lade branch must stay neutral');
assert(!evidence.some(e=>e.pathId==='trace-14'),'Unmapped Tyholt branch must stay neutral');
const removed=structuredClone(route1);removed.stops=removed.stops.filter(s=>s.name!=='Buran');
assert(!M.verifiedSegments(layout,[removed]).some(e=>e.pathId==='trace-04'&&e.from==='original-014'&&e.to==='original-015'),'Route segment must be consecutive');
assert.equal(M.verifiedSegments(layout,[]).length,0,'No route data means no inferred colors');
assert.equal(M.verifiedSegments(layout,[{...route1,stops:[{id:'NSR:Quay:00001'},{id:'NSR:Quay:00002'}]}]).length,0,'No invented IDs');
const exact=structuredClone(layout);M.verifiedSegments(layout,[route1,route3,route12]);assert.deepEqual(layout,exact,'Do not change original geometry');
assert.equal(layout.paths.filter(p=>p.verification==='unresolved').length,18,'Whole-path route evidence remains incomplete');

const report=M.report({...layout,stops:[stop,{...stop,id:'duplicate'},...layout.stops]},[board]);
assert(report.duplicates.length);assert(report.unconfirmed.length);assert(report.feedStopsMissing.length);assert(report.multiLine.length>0);
assert.equal(M.report(layout,[board]).complete,false);
for(const bad of [{...layout,viewBox:[0,0,1,1]},{...layout,stops:[{...stop,x:NaN}]},{...layout,paths:[{...layout.paths[0],color:'url(evil)'}]}])assert(M.validate(bad).length);
const context={structuredClone,InTransitMapModel:M};vm.createContext(context);vm.runInContext(read('web/linear/network/editor.js'),context);
let changed;const editor=context.InTransitMapEditor(layout,v=>changed=v);editor.change(v=>v.stops[0].x=100);assert.equal(changed.stops[0].x,100);editor.undo();assert.equal(changed.stops[0].x,layout.stops[0].x);editor.import(JSON.parse(editor.export()));assert.throws(()=>editor.import({}));editor.change(v=>v.stops[0].diodeMode='split');editor.discard();assert.equal(changed.stops[0].diodeMode,'shared');
const ui=read('web/linear/network/map.js');
assert.match(ui,/data-role="reviewPath"/);
assert.match(ui,/data-role="reference"/);
assert.match(ui,/data-role="routeColors"/);
assert.match(ui,/report\.routeEvidence=/);
assert.match(ui,/reference\.onchange=\(\)=>draw\(\)/);
assert.match(ui,/routeColors\.onchange=\(\)=>draw\(\)/);
assert.match(ui,/routeReview\.onchange=/);
for(const file of ['model','map','editor'])new vm.Script(read(`web/linear/network/${file}.js`));
console.log('InTransit layout validation, exact ID/physical LED mapping, lifecycle, expiry, route filtering and editor PASS');

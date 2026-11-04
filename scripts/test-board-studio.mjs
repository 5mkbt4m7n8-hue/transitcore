import assert from 'node:assert/strict';
import {createProject,parseProject,serialize,svg,moveStations,History} from '../web/board-studio/model.mjs';
const p=createProject();assert.equal(p.board.width,300);assert.equal(p.board.height,400);assert.equal(p.layout.stations.length,16);
assert.deepEqual(parseProject(serialize(p)),p);const fine=structuredClone(p);fine.layout.stations[0].x=123.123456789;assert.equal(parseProject(serialize(fine)).layout.stations[0].x,123.123456789);
const out=svg(p);assert.match(out,/width="300mm" height="400mm" viewBox="0 0 300 400"/);assert.ok(!out.includes('<image'));assert.match(out,/id="names"/);assert.ok(!svg(p,{layers:['holes']}).includes('<text'));assert.match(svg(p,{layers:['holes']}),/cx="198" cy="42" r="1.25"/);assert.match(svg(p,{layers:['rings']}),/cx="198" cy="42" r="3"/);
const q=moveStations(p,['station-1'],2.125,3.25);assert.equal(q.layout.stations[0].x,200.125);assert.deepEqual(q.network,p.network);assert.deepEqual(q.ledLayout,p.ledLayout);assert.equal(p.layout.stations[0].x,198);
q.layers.rings.locked=true;assert.deepEqual(moveStations(q,['station-1'],5,6),q);
const h=new History(p);h.commit(q);assert.deepEqual(h.undo(),p);assert.deepEqual(h.redo(),q);h.undo();h.commit(fine);assert.equal(h.future.length,0);
for(const change of [x=>x.version=999,x=>x.board.width=NaN,x=>x.layout.stations[0].x=Infinity,x=>x.layout.stations[0].label.size=-1,x=>x.layout.routes[0].stationIds=['missing'],x=>x.layers.names.visible='yes']){const bad=structuredClone(p);change(bad);assert.throws(()=>parseProject(bad));}
const evil=structuredClone(p);evil.layout.stations[0].name='<script>&"';assert.match(svg(evil),/&lt;script&gt;&amp;&quot;/);assert.ok(!svg(evil).includes('<script>'));
console.log('Board Studio fase A: mm, SVG layers, independent holes/rings, precision, source isolation, locks, history and invalid files PASS');

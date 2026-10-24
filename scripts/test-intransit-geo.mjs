import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const model=require('../web/linear/geo/model.js');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const layout=JSON.parse(read('web/linear/network/trondheim-layout.json'));
assert.equal(layout.stops.length,100);
const geo=model.empty();
assert.deepEqual(Object.keys(geo.stops),[]);
model.place(geo,layout,layout.stops[0].id,[10.4062,63.4344]);
assert.equal(geo.stops[layout.stops[0].id].source,'manual');
assert.deepEqual(geo.stops[layout.stops[0].id].coordinates,[10.4062,63.4344]);
const routeId=model.draw(geo,[[10.4,63.43],[10.402,63.435],[10.41,63.44]]);
assert.equal(routeId,'geo-path-001');
assert.equal(geo.paths[0].coordinates.length,3);
assert.equal(model.validate(geo,layout),geo);
assert.throws(()=>model.place(geo,layout,'unknown-stop',[10,63]),/Ugyldig/);
assert.throws(()=>model.place(geo,layout,layout.stops[0].id,[250,63]),/Ugyldig/);
assert.throws(()=>model.draw(geo,[[10,63]]),/Minst to/);
assert.throws(()=>model.draw(geo,[[10,63],[10,63]]),/nære/);
const out=model.exportGeo(geo,layout);
assert.equal(out.type,'FeatureCollection');
assert.equal(out.features.length,2);
assert.deepEqual(out.features[0].geometry.coordinates,[10.4062,63.4344]);
assert.equal(out.features[1].geometry.type,'LineString');
assert.deepEqual(model.importGeo(out,layout),geo,'GeoJSON round-trip preserves manually placed stops and lines');
assert.throws(()=>model.importGeo({type:'FeatureCollection',features:[{type:'Feature',properties:{type:'stop',stopId:'not-found'},geometry:{type:'Point',coordinates:[10,63]}}]},layout),/Ugyldig/);
const candidateLayout={stops:[{id:'samfundet-a',verification:'confirmed',bindings:[{boardId:'mock',nodeId:'quay-a',stopId:'quay-a'}]},
{id:'samfundet-b',verification:'confirmed',bindings:[{boardId:'mock',nodeId:'quay-b',stopId:'quay-b'}]},
{id:'unnamed-true-stop',verification:'unresolved',bindings:[]}]};
const boards=[{id:'mock',nodes:[{id:'quay-a',stopIds:['quay-a'],lat:63.42,lon:10.39},
{id:'quay-b',stopIds:['quay-b'],lat:63.421,lon:10.391}]}];
const candidates=model.candidates(candidateLayout,boards);
assert.equal(Object.keys(candidates).length,2,'No invented location for an unbound original stop');
assert.notDeepEqual(candidates['samfundet-a'].coordinates,candidates['samfundet-b'].coordinates,'Two Samfundet points stay distinct');
assert.equal(candidates['samfundet-a'].verification,'pending');
assert.equal(candidates['samfundet-b'].source,'catalog-candidate');
const ambiguous=model.candidates({stops:[{id:'far',verification:'confirmed',bindings:[
{boardId:'mock',nodeId:'quay-a',stopId:'quay-a'},{boardId:'mock',nodeId:'quay-far',stopId:'quay-far'}]}]},[{id:'mock',nodes:[...boards[0].nodes,{id:'quay-far',stopIds:['quay-far'],lat:63.45,lon:10.43}]}]);
assert.equal(ambiguous.far,undefined,'Never midpoint distant platform coordinates');
for(const path of ['web/linear/geo/map.js'])new vm.Script(read(path));
const page=read('web/linear/geo/index.html');
assert.match(page,/geo\/model\.js/);
assert.match(page,/href="map.css"/);
assert.match(page,/Trondheim bybuss/);
assert.match(read('web/linear/geo/map.js'),/OpenStreetMap/);
console.log('Geographic map model: stop identity, quay candidates, manual locations, GeoJSON, path drawing, script syntax PASS');

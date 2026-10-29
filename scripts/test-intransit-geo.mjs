import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const model=require('../web/linear/geo/model.js');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const layout=JSON.parse(read('web/linear/network/trondheim-layout.json'));
assert.equal(layout.stops.length,100);
const catalog=JSON.parse(read('config/boards/trondheim-city-lines-catalog.json'));
const realCandidates=model.candidates(layout,[catalog]);
assert(Object.keys(realCandidates).length>0,'Catalog has at least one mapped Quay coordinate');
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

 // Editor v2: names are overlays, not fake positions or canonical layout mutations.
const unplaced=layout.stops.at(-1).id;
const count=layout.stops.length;
model.renameStop(geo,layout,unplaced,'  Test   holdeplass  ');
assert.equal(geo.names[unplaced],'Test holdeplass');
assert.equal(layout.stops.length,count,'Never mutate canonical stop catalog');
assert.equal(geo.stops[unplaced],undefined,'Renaming must not invent geographic coordinates');
assert.throws(()=>model.renameStop(geo,layout,'missing','Ukjent'),/Ukjent/);
assert.throws(()=>model.renameStop(geo,layout,unplaced,'x'.repeat(81)),/langt/);
model.renamePath(geo,routeId,'Eksempeltrasé');
model.colorPath(geo,routeId,'#abcDEF');
assert.equal(geo.paths[0].name,'Eksempeltrasé');
assert.equal(geo.paths[0].color,'#abcdef');
model.appendPath(geo,routeId,[[10.42,63.45]]);
assert.equal(geo.paths[0].coordinates.length,4);
model.insertVertex(geo,routeId,1,[10.405,63.438]);
assert.equal(geo.paths[0].coordinates.length,5);
model.moveVertex(geo,routeId,2,[10.407,63.439]);
assert.deepEqual(geo.paths[0].coordinates[2],[10.407,63.439]);
assert.throws(()=>model.moveVertex(geo,routeId,2,[10.402,63.435]),/nære|Ugyldig/);
model.removeVertex(geo,routeId,2);
assert.equal(geo.paths[0].coordinates.length,4);
assert.throws(()=>model.insertVertex(geo,routeId,50,[10.4,63.43]),/Ugyldig/);
const full=model.exportGeo(geo,layout);
assert(full.features.some(x=>x.properties.type==='stop-name'&&x.properties.stopId===unplaced&&x.geometry===null));
assert.deepEqual(model.importGeo(full,layout),geo,'Names, color and editing metadata survive GeoJSON round trip');
const legacy=model.empty();delete legacy.names;
assert.deepEqual(model.validate(legacy,layout).names,{},'Load previous local v1 draft');
model.renameStop(geo,layout,unplaced,'');assert.equal(geo.names[unplaced],undefined);
model.deletePath(geo,routeId);assert.equal(geo.paths.length,0);

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
assert.match(page,/src="model\.js"/);
assert.match(page,/href="map.css"/);
assert.match(page,/Trondheim Buss/);
assert.match(read('web/linear/geo/map.js'),/OpenStreetMap/);

 // Read and update the same geographic draft from both editors; existing geometry and
 // hand-reviewed coordinates must never be overwritten by a display-name edit.
const Links=require('../web/linear/geo/stop-links.js');
const memory=new Map();
const store={getItem:key=>memory.get(key)||null,setItem:(key,val)=>memory.set(key,val)};
assert.deepEqual(Links.names(layout,store),{});
const draft=Links.load(layout,store);
model.place(draft.geo,layout,'original-000',[10.401,63.431]);
model.draw(draft.geo,[[10.4,63.43],[10.401,63.432]]);
store.setItem(Links.KEY,JSON.stringify(draft));
const beforeNames=structuredClone(draft.geo);
Links.rename(layout,'original-000','  Felles   navn  ',store);
const shared=Links.readGeo(layout,store);
assert.equal(shared.names['original-000'],'Felles navn');
assert.deepEqual(shared.stops,beforeNames.stops,'Stop locations cannot change from a rename');
assert.deepEqual(shared.paths,beforeNames.paths,'Route geometry cannot change from a rename');
assert.equal(layout.stops[0].id,'original-000','Canonical stop IDs stay unchanged');
assert.match(Links.geographicUrl('original-000'),/stop=original-000/);
assert.match(Links.schematicUrl('original-000'),/view=network&stop=original-000/);
assert.throws(()=>Links.rename(layout,'unknown','Hemmelig',store),/Ukjent/);
Links.rename(layout,'original-000','',store);
assert.equal(Links.names(layout,store)['original-000'],undefined);
const stale=JSON.stringify({fingerprint:'old-source',geo:beforeNames});
store.setItem(Links.KEY,stale);
assert.deepEqual(Links.names(layout,store),{});
assert.throws(()=>Links.rename(layout,'original-000','Trygt',store),/passer ikke/);
assert.equal(store.getItem(Links.KEY),stale,'Mismatched drafts are never overwritten');
const schematicHtml=read('web/linear/index.html');
assert.match(schematicHtml,/src="geo\/stop-links\.js"/);
const schematicUi=read('web/linear/network/map.js');
assert.match(schematicUi,/Navn på holdeplassen \(lokalt visningsnavn\)/);
assert.match(schematicUi,/focusStop\(id\)/);
assert.match(read('web/linear/geo/map.js'),/data-g="schematic"/);

console.log('Geographic map model: stop identity, quay candidates, manual locations, GeoJSON, path drawing, script syntax PASS');

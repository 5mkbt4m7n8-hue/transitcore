import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const tools=require('../web/linear/network/drawing-tools.js');
const snap=(x,y,options)=>tools.snap({x,y},options);
assert.deepEqual(snap(12.7,14.1,{}),{x:12.7,y:14.1},'no snapping keeps exact coordinates');
assert.deepEqual(snap(14.8,16.8,{gridSnap:true,gridSize:10}),{x:10,y:20});
assert.deepEqual(snap(139,111,{gridSnap:true,angleSnap:true,previous:{x:100,y:100}}),{x:140,y:100},'horizontal constraint');
assert.deepEqual(snap(133,127,{gridSnap:true,angleSnap:true,previous:{x:100,y:100}}),{x:130,y:130},'diagonal 45 degrees');
assert.deepEqual(snap(83,122,{gridSnap:true,angleSnap:true,previous:{x:100,y:100}}),{x:80,y:120},'negative diagonal');
assert.deepEqual(snap(128,135,{gridSnap:true,angleSnap:true,previous:{x:103,y:107}}),{x:133,y:137},'unaligned anchors keep 45 degrees');
assert.deepEqual(snap(-50,1500,{gridSnap:true,gridSize:20}),{x:0,y:1280},'within viewBox');
const layout={paths:[{id:'trace-1',color:'#56ccaa',width:2,points:[{x:2,y:3},{x:8,y:9}]}],
 stops:[{id:'stop&1',name:'Buran <mot & retning>',x:10,y:20,radius:4,diodeMode:'shared',
  label:{x:15,y:18,visible:true}}]};
const before=JSON.stringify(layout),svg=tools.exportSVG(layout);
assert.equal(JSON.stringify(layout),before,'export is read only');
assert.match(svg,/viewBox="0 0 913 1280"/);
assert.match(svg,/points="2,3 8,9"/);
assert.match(svg,/Buran &lt;mot &amp; retning&gt;/);
assert.match(svg,/data-stop-id="stop&amp;1"/);
assert.doesNotMatch(svg,/Buran <mot/);
const map=fs.readFileSync(new URL('../web/linear/network/map.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../web/linear/index.html',import.meta.url),'utf8');
new vm.Script(map);
assert.match(html,/network\/drawing-tools\.js/);
assert.match(map,/T\.snap\(/);
assert.match(map,/T\.exportSVG\(/);
assert.match(map,/map-studio-grid/);

const model=require('../web/linear/network/model.js');
const original=JSON.parse(fs.readFileSync(new URL('../web/linear/network/trondheim-layout.json',import.meta.url),'utf8'));
const styled=structuredClone(original);
styled.paths[0].visualTracks={trackCount:2,routeCount:3,spacing:8,
 colors:['#ff0000','#00ff00','#0000ff','#ffffff','#ffff00','#aabbcc']};
styled.stops[0].stationStyle='double';
assert.deepEqual(model.validate(styled),[],'optional display-only track/station settings validate');
const lanes=tools.visualTracks(styled.paths[0]);
assert.equal(lanes.length,6,'two tracks with three route lanes each');
assert.equal(new Set(lanes.map(l=>Math.round(l.points[0].x))).size,6,'lanes stay spaced at endpoints');
assert.match(tools.exportSVG(styled),/data-lane="5"/);
assert.match(tools.exportSVG(styled),/width="4"/);
const fifteen=snap(200,154,{previous:{x:100,y:100},angleStep:15});
assert(Math.abs(Math.atan2(fifteen.y-100,fifteen.x-100)*180/Math.PI-30)<.00001,'15-degree snap');
assert.deepEqual(snap(110,126,{previous:{x:100,y:100},angleStep:0}),{x:110,y:126});
const area=tools.selectArea(styled,{x:470,y:165},{x:490,y:230});
assert(area?.stopIds.includes('original-000')&&area.vertices.length>0,'marquee selects stops and vertices');
const oldY=styled.stops[0].y,oldLabel=styled.stops[0].label.y;
tools.transformArea(styled,area,{mode:'move',dx:3,dy:6});
assert.equal(styled.stops[0].y,oldY+6);
assert.equal(styled.stops[0].label.y,oldLabel+6);
assert.deepEqual(model.validate(styled),[],'translated layout validates');
const stretchArea=tools.selectArea(styled,{x:470,y:165},{x:490,y:240});
const oldVertex=styled.paths[0].points[0].y;
tools.transformArea(styled,stretchArea,{mode:'top',dy:-8});
assert(styled.paths[0].points[0].y<oldVertex,'top handle stretches upward');
assert.deepEqual(model.validate(styled),[],'stretched layout validates');
assert.equal(tools.selectArea(styled,{x:1,y:1},{x:2,y:2}),null);
const invalidMove=structuredClone(styled),invalidArea=tools.selectArea(invalidMove,{x:470,y:140},{x:550,y:260});
const invalidBefore=JSON.stringify(invalidMove);
assert.throws(()=>tools.transformArea(invalidMove,invalidArea,{mode:'move',dy:-200}),/kartflaten/);
assert.equal(JSON.stringify(invalidMove),invalidBefore,'invalid transforms are atomic');
const invalidColor=structuredClone(styled);invalidColor.paths[0].visualTracks.colors[0]='bad';
assert(model.validate(invalidColor).length>0,'visual color validation');
assert.match(map,/studioAngleMode/);
assert.match(map,/data-act="studioSelect"/);
assert.match(map,/T\.transformArea/);
assert.match(map,/T\.visualTracks/);
assert.match(map,/stationStyle==='double'/);


// v0.3: all visible LED circles must point to real canonical Quay identities.
const D=require('../web/linear/network/display-stations.js');
const double=structuredClone(original),untouchedStops=JSON.stringify(double.stops);
const dsId=D.addDouble(double,'original-000');
assert.equal(dsId,'display-original-000');
assert.deepEqual(model.validate(double),[],'real-Quay double station is a valid additive layout');
assert.equal(double.displayStationsVersion,1);
assert.equal(JSON.stringify(double.stops),untouchedStops,'grouping does not modify underlying stop identity');
const station=double.displayStations[0],geometry=D.geometry(double,station);
assert.equal(geometry.members.length,2);
assert.equal(new Set(station.members.map(m=>m.quayId)).size,2);
assert(station.members.every(m=>double.stops.find(s=>s.id===m.mapStopId).bindings.some(b=>b.stopId===m.quayId)));
assert(station.members.every(m=>m.placementReview==='unreviewed'),
 'visual side is never silently certified by original Quay order');
assert.notEqual(geometry.members[0].point.x,geometry.members[1].point.x,'members lie on opposite track sides');
const exported=tools.exportSVG(double);
assert.match(exported,/data-display-station="display-original-000"/);
assert.match(exported,/data-quay="NSR:Quay:71132"/);
assert.match(exported,/data-quay="NSR:Quay:71134"/);
// Real per-Quay preview: an active frame for Quay A cannot illuminate Quay B.
const sourceStop=double.stops[0],ids=station.members.map(m=>m.quayId);
const board={id:'trondheim-city-lines-catalog',nodes:ids.map((id,i)=>({
 id,stationId:'NSR:StopPlace:41586',stopIds:[id],led:i,routes:['atb-bus-1-live']
}))};
const hardware={assignments:[{logicalLed:0,physicalLed:10},{logicalLed:1,physicalLed:11}]};
const now=Date.now(),frame={generatedAt:new Date(now).toISOString(),ttlSeconds:30,
 leds:[{id:10,state:'AT_STOP',rgb:[0,200,0],occupants:[{id:'example-bus',line:'1',state:'AT_STOP'}]}]};
assert.equal(model.signals(sourceStop,board,hardware,frame,null,now,null,[ids[0]]).length,1);
assert.equal(model.signals(sourceStop,board,hardware,frame,null,now,null,[ids[1]]).length,0);
const Preview=require('../web/linear/network/display-preview.js');
const inspection=Preview.inspect(double,station,board,hardware,frame,null,now,model);
assert.equal(inspection.length,2);
assert.equal(inspection[0].sourceStatus,'ACTIVE');
assert.equal(inspection[0].physicalLeds[0],10);
assert.equal(inspection[0].logicalLeds[0],0);
assert.equal(inspection[0].quayId,ids[0]);
assert.equal(inspection[1].sourceStatus,'OFF');
assert.equal(inspection[1].physicalLeds[0],11);
assert.equal(Preview.inspect(double,station,board,hardware,null,null,now,model)[0].sourceStatus,'NO_FRAME');
assert.equal(Preview.inspect(double,station,board,hardware,{
 generatedAt:new Date(now-40000).toISOString(),ttlSeconds:30,leds:frame.leds
},null,now,model)[0].sourceStatus,'STALE');
assert.equal(Preview.inspect(double,station,board,{assignments:[]},frame,null,now,model)[0].sourceStatus,'NO_HARDWARE');
for(const mode of ['a','b','both','off']){
 const expected=mode==='both'?[true,true]:mode==='a'?[true,false]:mode==='b'?[false,true]:[false,false];
 assert.deepEqual([0,1].map(index=>Preview.simulated(mode,index).state==='AT_STOP'),expected);
}
assert.equal(Preview.simulated('live',0),null);
assert.match(html,/network\/display-preview\.js/);
assert.match(map,/SIMULERT LED-TEST/);

const shared={assignments:[{logicalLed:0,physicalLed:10},{logicalLed:1,physicalLed:10}]};
assert.equal(model.signals(sourceStop,board,shared,frame,null,now,null,[ids[0]]).length,0,
 'a shared physical LED cannot fake an independent Quay observation');
assert.equal(model.signals(sourceStop,board,shared,frame,null,now,null,[ids[1]]).length,0);
assert.deepEqual(Preview.inspect(double,station,board,shared,frame,null,now,model).map(s=>s.sourceStatus),['SHARED_LED','SHARED_LED']);
const broken=structuredClone(double);broken.displayStations[0].members[1].quayId=ids[0];
assert(model.validate(broken).length>0,'one Quay cannot occupy two grouped slots');
const unresolved=structuredClone(original);
assert.throws(()=>D.addDouble(unresolved,'original-003'),/bekreftet/);
D.remove(double,dsId);
assert.deepEqual(model.validate(double),[],'ungrouped original layout is valid');
assert.equal(double.displayStations,undefined);
assert.equal(JSON.stringify(double.stops),untouchedStops);
assert.match(html,/network\/display-stations\.js/);
assert.match(map,/D\.geometry\(/);
assert.match(map,/group\.dataset\.quay/);
assert.match(map,/D\.addDouble\(/);


// v0.3 two separate nearby stop markers: Samfundet is intentionally two
// existing map stops in one StopPlace, containing FOUR real Quays in total.
const pairLayout=structuredClone(original);
const nearby=D.nearbyPairs(pairLayout,'original-049');
const samfundet=nearby.find(c=>c.stopId==='original-050');
assert(samfundet&&samfundet.sameStopPlace&&samfundet.distance<20);
const stopData=JSON.stringify(pairLayout.stops);
const pairId=D.addPair(pairLayout,'original-049','NSR:Quay:73101','original-050','NSR:Quay:73100');
assert.equal(pairId,'display-pair-original-049-original-050');
assert.deepEqual(model.validate(pairLayout),[]);
assert.equal(JSON.stringify(pairLayout.stops),stopData);
assert.deepEqual(pairLayout.displayStations[0].members.map(m=>m.mapStopId),['original-049','original-050']);
const pairGeometry=D.geometry(pairLayout,pairLayout.displayStations[0]);
assert.equal(pairGeometry.members.length,2);
assert.notDeepEqual(pairGeometry.members[0].point,pairGeometry.members[1].point);
const leftover1=D.uniqueQuays(pairLayout.stops.find(s=>s.id==='original-049'))
 .filter(q=>!pairLayout.displayStations[0].members.some(m=>m.quayId===q));
const leftover2=D.uniqueQuays(pairLayout.stops.find(s=>s.id==='original-050'))
 .filter(q=>!pairLayout.displayStations[0].members.some(m=>m.quayId===q));
assert.deepEqual(leftover1,['NSR:Quay:73103']);
assert.deepEqual(leftover2,['NSR:Quay:73102']);
const pairSvg=tools.exportSVG(pairLayout);
assert.match(pairSvg,/data-display-station="display-pair-original-049-original-050"/);
assert.match(pairSvg,/data-quay="NSR:Quay:73101"/);
assert.match(pairSvg,/data-quay="NSR:Quay:73100"/);
assert.throws(()=>D.addPair(pairLayout,'original-049','NSR:Quay:73103','original-050','NSR:Quay:73102'),/allerede/);
assert.throws(()=>D.addPair(pairLayout,'original-049','NSR:Quay:00000','original-050','NSR:Quay:73102'),/dokumentert/);
const wrongPair=structuredClone(pairLayout);
wrongPair.displayStations[0].members[1].mapStopId='original-049';
assert(model.validate(wrongPair).length>0,'cross-stop Quay must match the actual original stop');
D.remove(pairLayout,pairId);
assert.deepEqual(model.validate(pairLayout),[]);
assert.equal(JSON.stringify(pairLayout.stops),stopData);
assert.match(map,/D\.nearbyPairs\(/);
assert.match(map,/D\.addPair\(/);
assert.match(map,/group\.dataset\.remainingQuays/);


// Physical preview v0.5 is based on real board dimensions, never fixed pixels.
const Physical=require('../web/linear/network/physical-board.js');
assert.deepEqual(Physical.PRESETS.map(p=>p.id),['30x40','50x70','40x40']);
const boardOriginal=JSON.stringify(original);
const rendered=[];
for(const [w,h] of [[30,40],[50,70],[40,40],[35,55]]){
 const result=Physical.build(original,{widthCm:w,heightCm:h,ledDiameterMm:5,marginMm:12,labelFontMm:2.4});
 assert(result.svg.includes('width="'+w*10+'mm" height="'+h*10+'mm"'));
 assert(result.svg.includes('viewBox="0 0 '+w*10+' '+h*10+'"'));
 assert(result.summary.markers>=original.stops.length);
 assert(result.dimensions.scale>0);
 assert(result.dimensions.offsetX>=0&&result.dimensions.offsetY>=0);
 assert(result.dimensions.contentWidthMm<=w*10-24+0.001);
 assert(result.dimensions.contentHeightMm<=h*10-24+0.001);
 assert(result.svg.includes('r="2.5"'),'LED radius remains physical 2.5 mm across board sizes');
 rendered.push(result);
}
assert.equal(JSON.stringify(original),boardOriginal,'physical preview does not edit canonical map');
assert(rendered[2].dimensions.usagePct<rendered[0].dimensions.usagePct,
 'square board preserves aspect instead of stretching 913×1280 original');
assert(rendered[1].dimensions.scale>rendered[0].dimensions.scale,
 'larger physical dimensions produce more space around same physical LED size');
assert.throws(()=>Physical.build(original,{widthCm:0}),/mål/);
assert.throws(()=>Physical.build(original,{widthCm:10,heightCm:10,marginMm:50}),/for liten/);
assert.throws(()=>Physical.build(original,{widthCm:201}),/mål/);
const physicalGroup=structuredClone(original);
D.addPair(physicalGroup,'original-049','NSR:Quay:73101','original-050','NSR:Quay:73100');
const physicalPair=Physical.build(physicalGroup,{widthCm:30,heightCm:40,ledDiameterMm:5},
 {simulated:true,litQuays:['NSR:Quay:73101']});
assert.match(physicalPair.svg,/data-quay="NSR:Quay:73101"/);
assert.match(physicalPair.svg,/data-quay="NSR:Quay:73100"/);
assert.match(physicalPair.svg,/SIMULERT/);
assert.match(physicalPair.svg,/data-display-station="display-pair-original-049-original-050"/);
const physicalOn=physicalPair.svg.match(/<circle data-stop="original-049" data-quay="NSR:Quay:73101"[^>]+>/)?.[0];
const physicalOff=physicalPair.svg.match(/<circle data-stop="original-050" data-quay="NSR:Quay:73100"[^>]+>/)?.[0];
assert(physicalOn?.includes('fill="#44e392"'));
assert(physicalOff?.includes('fill="#152a3c"'));
assert.match(html,/network\/physical-board\.js/);
assert.match(map,/boardPanel/);
assert.match(map,/B\.build\(/);
assert.match(map,/Eksporter SVG i fysisk størrelse/);
assert.equal(JSON.stringify(pairLayout.stops),stopData,'physical board preview never rewrites real stops');

console.log('InTransit Map Studio v0.5 real-size physical SVG preview and source integrity OK');

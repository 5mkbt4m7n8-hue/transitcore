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
const shared={assignments:[{logicalLed:0,physicalLed:10},{logicalLed:1,physicalLed:10}]};
assert.equal(model.signals(sourceStop,board,shared,frame,null,now,null,[ids[0]]).length,0,
 'a shared physical LED cannot fake an independent Quay observation');
assert.equal(model.signals(sourceStop,board,shared,frame,null,now,null,[ids[1]]).length,0);
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

console.log('InTransit Map Studio v0.3 real-Quay LED grouping and geometry OK');

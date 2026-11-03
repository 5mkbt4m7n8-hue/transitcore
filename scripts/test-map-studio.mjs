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


// v0.6 – layout overrides are saved with the project, per exact physical
// dimensions; they can move both station rings and text without touching GPS.
const editableBoard=structuredClone(original),beforeStopModel=JSON.stringify(editableBoard.stops),
 beforeTracks=JSON.stringify(editableBoard.paths);
const compact={widthCm:30,heightCm:40,ledDiameterMm:5};
const large={widthCm:50,heightCm:70,ledDiameterMm:5};
assert.equal(Physical.profileKey(compact),'30x40');
assert.equal(Physical.profileKey(large),'50x70');
Physical.saveOverrides(editableBoard,compact,{
 positions:{'stop:original-000':{x:.50,y:.50}},
 labels:{'original-000':{x:.55,y:.54}}
});
assert.deepEqual(model.validate(editableBoard),[]);
const compactSvg=Physical.build(editableBoard,compact).svg;
assert.match(compactSvg,/data-board-key="stop:original-000"/);
assert.match(compactSvg,/data-board-label="original-000"/);
assert.match(compactSvg,/data-board-moved="true"/);
assert.match(compactSvg,/data-board-key="stop:original-000"[^>]*cx="150" cy="200"/);
assert.match(compactSvg,/data-board-label="original-000"[^>]*x="165" y="216"/);
const largerSvg=Physical.build(editableBoard,large).svg;
assert.doesNotMatch(largerSvg,/data-board-key="stop:original-000"[^>]*cx="250" cy="350"/);
assert(!editableBoard.physicalBoardLayouts.profiles['50x70'],'50×70 has no inherited edits');
const transient=Physical.build(editableBoard,compact,{
 previewOverrides:{positions:{'stop:original-000':{x:.7,y:.6}}}
}).svg;
assert.match(transient,/data-board-key="stop:original-000"[^>]*cx="210" cy="240"/);
assert.equal(Physical.build(editableBoard,compact).svg,compactSvg,'drag preview does not persist before drop');
Physical.saveOverrides(editableBoard,large,{positions:{'stop:original-000':{x:.4,y:.35}}});
assert.deepEqual(model.validate(editableBoard),[]);
assert.equal(editableBoard.physicalBoardLayouts.profiles['30x40'].positions['stop:original-000'].x,.5);
assert.equal(editableBoard.physicalBoardLayouts.profiles['50x70'].positions['stop:original-000'].x,.4);
assert.equal(JSON.stringify(editableBoard.stops),beforeStopModel);
assert.equal(JSON.stringify(editableBoard.paths),beforeTracks);
const invalidBoard=structuredClone(editableBoard);
invalidBoard.physicalBoardLayouts.profiles['30x40'].positions['stop:original-000'].x=1.1;
assert(model.validate(invalidBoard).length>0);
assert.throws(()=>Physical.saveOverrides(editableBoard,compact,{
 positions:{'quay:NSR:Quay:999999':{x:.5,y:.5}}
}),/Ukjent markør/);
assert.throws(()=>Physical.saveOverrides(editableBoard,compact,{
 labels:{'original-000':{x:-1,y:.2}}
}),/ugyldig tekstposisjon/);
Physical.resetOverrides(editableBoard,compact);
assert.deepEqual(model.validate(editableBoard),[]);
assert(!editableBoard.physicalBoardLayouts.profiles['30x40'],'reset removes only current format');
assert(editableBoard.physicalBoardLayouts.profiles['50x70'],'other format survives reset');
assert.equal(Physical.resetOverrides(editableBoard,compact),false);
const groupedBoard=structuredClone(original);
const groupId=D.addDouble(groupedBoard,'original-000');
Physical.saveOverrides(groupedBoard,compact,{positions:{
 'quay:NSR:Quay:71132':{x:.45,y:.43},
 'quay:NSR:Quay:71134':{x:.48,y:.43}
}});
const groupedSvg=Physical.build(groupedBoard,compact).svg;
assert.match(groupedSvg,/data-board-group="display-original-000"/);
assert.match(groupedSvg,/data-board-key="quay:NSR:Quay:71132"/);
assert.match(groupedSvg,/data-board-key="quay:NSR:Quay:71134"/);
assert.deepEqual(model.validate(groupedBoard),[]);
D.remove(groupedBoard,groupId);
assert.deepEqual(model.validate(groupedBoard),[],'ungroup clears obsolete physical Quay assignments');
assert.equal(groupedBoard.physicalBoardLayouts.profiles['30x40'].positions['quay:NSR:Quay:71132'],undefined);
assert.equal(JSON.stringify(groupedBoard.stops),JSON.stringify(original.stops));
assert.equal(JSON.stringify(groupedBoard.paths),JSON.stringify(original.paths));
assert.match(map,/boardHost\.addEventListener\('pointerdown'/);
assert.match(map,/boardHost\.addEventListener\('pointermove'/);
assert.match(map,/boardHost\.addEventListener\('pointercancel'/);
assert.match(map,/boardHost\.addEventListener\('keydown'/);
assert.match(map,/B\.saveOverrides\(/);


// v0.7: route-follow is purely graphic and explicitly opt-in per physical size.
const following=structuredClone(original),sourceStops=JSON.stringify(following.stops),
 sourcePaths=JSON.stringify(following.paths),size3040={widthCm:30,heightCm:40};
const graphicBefore=Physical.build(following,size3040);
const routeLine=svg=>svg.match(/<polyline data-route="trace-01"[^>]*>/)?.[0];
assert(routeLine(graphicBefore.svg));
Physical.saveOverrides(following,size3040,{positions:{'stop:original-000':{x:.5,y:.5}}});
const graphicStatic=Physical.build(following,size3040);
assert.equal(routeLine(graphicStatic.svg),routeLine(graphicBefore.svg),
 'route geometry unchanged while physical follow switch is off');
Physical.saveOverrides(following,size3040,{followStations:true});
assert.deepEqual(model.validate(following),[]);
const graphicLinked=Physical.build(following,size3040);
assert.equal(graphicLinked.summary.followStations,true);
assert(graphicLinked.summary.trackedVertices>=1,'coincident source vertex follows moved stop');
assert.notEqual(routeLine(graphicLinked.svg),routeLine(graphicBefore.svg),
 'physical preview route bends to opt-in dragged station');
assert.match(routeLine(graphicLinked.svg),/points="150,200 /);
assert.equal(JSON.stringify(following.stops),sourceStops);
assert.equal(JSON.stringify(following.paths),sourcePaths);
assert.equal(Physical.build(following,{widthCm:50,heightCm:70}).summary.followStations,false,
 '50×70 route geometry is not affected by 30×40 toggle');
const routePreview=Physical.build(following,size3040,{
 previewOverrides:{positions:{'stop:original-000':{x:.6,y:.6}}}
});
assert.match(routeLine(routePreview.svg),/points="180,240 /);
assert.equal(routeLine(Physical.build(following,size3040).svg),routeLine(graphicLinked.svg),
 'drag preview does not overwrite saved graphic geometry');
const invalidFollow=structuredClone(following);
invalidFollow.physicalBoardLayouts.profiles['30x40'].followStations='yes';
assert(model.validate(invalidFollow).length>0,'nonboolean route-follow rejected');
assert.throws(()=>Physical.saveOverrides(following,size3040,{followStations:'yes'}),/Ugyldig valg/);
const groupedFollow=structuredClone(original);
D.addDouble(groupedFollow,'original-000');
Physical.saveOverrides(groupedFollow,size3040,{positions:{
 'quay:NSR:Quay:71132':{x:.4,y:.45},
 'quay:NSR:Quay:71134':{x:.5,y:.45}
},followStations:true});
const groupedFollowing=Physical.build(groupedFollow,size3040);
assert(groupedFollowing.summary.trackedVertices>0);
assert.match(routeLine(groupedFollowing.svg),/points="135,180 /,
 'source route follows midpoint of two linked Quays when both moved');
assert.equal(JSON.stringify(groupedFollow.stops),JSON.stringify(original.stops));
assert.equal(JSON.stringify(groupedFollow.paths),JSON.stringify(original.paths));
const partial=structuredClone(original);
D.addPair(partial,'original-049','NSR:Quay:73101','original-050','NSR:Quay:73100');
Physical.saveOverrides(partial,size3040,{positions:{
 'quay:NSR:Quay:73101':{x:.3,y:.3},
 'quay:NSR:Quay:73100':{x:.35,y:.3}
},followStations:true});
const partialGraphic=Physical.build(partial,size3040);
// original-049/050 have remaining, unmoved Quays represented on the map;
// never pull a route vertex towards just one Quay while another stays.
assert.equal(partialGraphic.summary.trackedVertices,0);
Physical.saveOverrides(following,size3040,{followStations:false});
assert.equal(routeLine(Physical.build(following,size3040).svg),routeLine(graphicBefore.svg),
 'turning route-follow off restores the unaltered schematic line');
assert.match(map,/data-role="boardFollow"/);


// v0.8: editable physical route vertices and inserted bends are format-scoped.
const boardBends=structuredClone(original),bendsSourcePaths=JSON.stringify(boardBends.paths),
 bendsSourceStops=JSON.stringify(boardBends.stops),bendsSize={widthCm:30,heightCm:40};
const beforeBends=Physical.build(boardBends,bendsSize,{showRouteHandles:true});
const bendPath=svg=>svg.match(/<polyline data-route="trace-01"[^>]*>/)?.[0];
assert.match(beforeBends.svg,/data-board-route-path="trace-01" data-board-route-key="0"/);
Physical.setRoutePoint(boardBends,bendsSize,'trace-01',0,{x:.5,y:.5});
assert.deepEqual(model.validate(boardBends),[]);
const manuallyMoved=Physical.build(boardBends,bendsSize);
assert.notEqual(bendPath(manuallyMoved.svg),bendPath(beforeBends.svg));
assert.match(bendPath(manuallyMoved.svg),/points="150,200 /);
const addedBend=Physical.addRouteBend(boardBends,bendsSize,'trace-01',0,{x:.55,y:.42});
assert.equal(addedBend,'bend-1');
assert.deepEqual(model.validate(boardBends),[]);
const inserted=Physical.build(boardBends,bendsSize,{showRouteHandles:true});
assert.match(inserted.svg,/data-board-route-path="trace-01" data-board-route-key="bend-1"/);
assert.match(bendPath(inserted.svg),/165,168/);
Physical.setRoutePoint(boardBends,bendsSize,'trace-01',addedBend,{x:.57,y:.44});
assert.match(bendPath(Physical.build(boardBends,bendsSize).svg),/171,176/);
assert.equal(Physical.build(boardBends,{widthCm:50,heightCm:70}).summary.editedRouteVertices,0,
 'a different physical size has no route edits');
const transientBend=Physical.build(boardBends,bendsSize,{previewOverrides:{routes:{
 'trace-01':{vertices:{0:{x:.65,y:.65}},bends:[]}
}}});
assert.match(bendPath(transientBend.svg),/195,260/);
assert.match(bendPath(Physical.build(boardBends,bendsSize).svg),/171,176/);
Physical.removeRouteBend(boardBends,bendsSize,'trace-01',addedBend);
assert.deepEqual(model.validate(boardBends),[]);
assert.equal(Physical.build(boardBends,bendsSize,{showRouteHandles:true}).svg.includes('data-board-route-key="bend-1"'),false);
assert.equal(Physical.resetRoute(boardBends,bendsSize,'trace-01'),true);
assert.equal(Physical.resetRoute(boardBends,bendsSize,'trace-01'),false);
assert.equal(bendPath(Physical.build(boardBends,bendsSize).svg),bendPath(beforeBends.svg));
assert.equal(JSON.stringify(boardBends.paths),bendsSourcePaths);
assert.equal(JSON.stringify(boardBends.stops),bendsSourceStops);
const maliciousRoute=structuredClone(original);
Physical.setRoutePoint(maliciousRoute,bendsSize,'trace-01',0,{x:.45,y:.48});
maliciousRoute.physicalBoardLayouts.profiles['30x40'].routes['trace-01'].vertices['4000']={x:.1,y:.1};
assert(model.validate(maliciousRoute).length>0,'route vertex index must be a canonical original index');
assert.throws(()=>Physical.setRoutePoint(boardBends,bendsSize,'trace-01',999,{x:.3,y:.3}),/Ukjent/);
assert.throws(()=>Physical.addRouteBend(boardBends,bendsSize,'trace-01',999,{x:.3,y:.3}),/Ukjent/);
assert.throws(()=>Physical.addRouteBend(boardBends,bendsSize,'trace-01',0,{x:2,y:.3}),/inne/);
assert.match(map,/data-role="boardRouteEdit"/);
assert.match(map,/data-role="boardAddBend"/);
assert.match(map,/B\.setRoutePoint\(/);

console.log('InTransit Map Studio v0.8 independent physical route bends and SVG preview OK');

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),D=require('../web/linear/network/studio-document.js');
const line=(id,points,color='#218967')=>({id,name:id,color,width:6,visible:true,locked:false,points});
const initial=D.blank();initial.artwork.lines=[line('a',[{x:200,y:200},{x:500,y:200},{x:600,y:300},{x:600,y:600}])];initial.bindings.a={source:'trondheim',sourceId:'route-original',quayIds:['NSR:Quay:1']};
const h=D.history(initial),change=fn=>h.change(fn),group=()=>h.get().artwork.groups[0];
change(d=>D.linkedParallel(d,'a',3,20,'right','lanes',['b','c']));
const three=h.get();assert.equal(three.artwork.lines.length,3);assert.deepEqual(three.artwork.lines[0],initial.artwork.lines[0]);assert.deepEqual(three.bindings,initial.bindings);assert.deepEqual(group().memberIds,['a','b','c']);
assert.deepEqual(three.artwork.lines.map(l=>l.points[0]),[{x:200,y:200},{x:200,y:220},{x:200,y:240}]);assert(new Set(three.artwork.lines.map(l=>l.color)).size===3);
h.undo();assert.deepEqual(h.get(),initial);h.redo();assert.deepEqual(h.get(),three);
change(d=>D.updateParallel(d,'lanes',3,30,'center'));assert.deepEqual(h.get().artwork.lines.map(l=>l.points[0]),[{x:200,y:170},{x:200,y:200},{x:200,y:230}]);
change(d=>D.updateParallel(d,'lanes',4,12,'left',['d']));assert.deepEqual(group().memberIds,['a','b','c','d']);assert.deepEqual(h.get().artwork.lines.map(l=>l.points[0].y),[200,188,176,164]);
change(d=>D.updateParallel(d,'lanes',2,12,'left'));assert.deepEqual(group().memberIds,['a','b']);assert.equal(h.get().artwork.lines.length,2);assert.deepEqual(h.get().bindings,initial.bindings);
// Editing any lane reflows the entire shared spine and retains each style/ID.
const edited=h.get().artwork.lines[1].points;edited[1].x+=40;change(d=>D.setLinePoints(d,'b',edited));assert.deepEqual(h.get().artwork.lines.map(l=>l.id),['a','b']);assert.notDeepEqual(h.get().artwork.lines[0].points,initial.artwork.lines[0].points);assert.deepEqual(h.get().bindings,initial.bindings);
const shaped=h.get();change(d=>D.translate(d,['b'],15,20));assert.deepEqual(h.get().artwork.lines[0].points,shaped.artwork.lines[0].points.map(p=>({x:p.x+15,y:p.y+20})));assert.deepEqual(D.transformIds(h.get(),['b']),['a','b']);
change(d=>D.extend(d,'a','end',[{x:650,y:700}]));assert(h.get().artwork.lines.every(l=>l.points.length===5));
const grouped=h.get();assert.deepEqual(D.validate(JSON.parse(JSON.stringify(grouped))),grouped);assert.equal((D.svg(grouped).match(/<polyline/g)||[]).length,2);
change(d=>D.detachGroup(d,'lanes'));assert.equal(h.get().artwork.groups,undefined);assert.deepEqual(h.get().artwork.lines,grouped.artwork.lines);h.undo();assert.deepEqual(h.get(),grouped);
const stable=h.get();for(const fn of [
 d=>D.updateParallel(d,'lanes',3,0,'right',['z']),d=>D.updateParallel(d,'lanes',3,20,'wrong',['z']),d=>D.updateParallel(d,'lanes',10,20,'right',[]),d=>D.translate(d,['a'],-2000,0),
 d=>{d.artwork.lines[1].locked=true;D.setLinePoints(d,'a',initial.artwork.lines[0].points);},d=>D.groupLines(d,['a','b'],'nested'),d=>D.spaceLines(d,['a','b'],20)
]){assert.throws(()=>change(fn));assert.deepEqual(h.get(),stable,'invalid group edit is atomic');}
// Removing a copy with logical references is refused; original routes are never
// discarded by the lane-count control. Explicit deletion detaches survivors.
change(d=>d.artwork.stops.push({id:'stop',name:'stop',x:200,y:200,labelDx:12,labelDy:-12,lineIds:['b'],visible:true,locked:false}));
change(d=>D.updateParallel(d,'lanes',2,12,'right')); // same count is valid
h.undo(); // undo the valid spacing update, keeping the stop
change(d=>D.updateParallel(d,'lanes',3,12,'right',['extra']));change(d=>d.artwork.stops[0].lineIds.push('extra'));const protectedCopy=h.get();assert.throws(()=>change(d=>D.updateParallel(d,'lanes',2,12,'right')));assert.deepEqual(h.get(),protectedCopy);
change(d=>D.removeObjects(d,['b']));assert.equal(h.get().artwork.groups,undefined);assert.deepEqual(h.get().artwork.stops[0].lineIds,['extra']);h.undo();assert.deepEqual(h.get(),protectedCopy);
// Sharing existing routes changes only explicit visual geometry, not source/stop IDs.
const source=D.blank();source.artwork.lines=[line('x',[{x:100,y:100},{x:400,y:100}]),line('y',[{x:400,y:100},{x:400,y:400}],'#cc5271')];source.artwork.stops=[{id:'s',name:'S',x:400,y:100,labelDx:12,labelDy:-12,lineIds:['x','y'],visible:true,locked:false}];source.bindings={x:{source:'trondheim',sourceId:'x',quayIds:['NSR:Quay:1']},y:{source:'trondheim',sourceId:'y',quayIds:['NSR:Quay:2']}};
const shared=D.history(source);shared.change(d=>D.shareRoute(d,['x','y'],20,'center','shared'));assert.deepEqual(shared.get().bindings,source.bindings);assert.deepEqual(shared.get().artwork.stops,source.artwork.stops);assert.deepEqual(shared.get().artwork.lines.map(l=>l.id),['x','y']);assert.throws(()=>shared.change(d=>D.updateParallel(d,'shared',1,20,'right')));shared.undo();assert.deepEqual(shared.get(),source);
// Grouping is geometry-free. Endpoint joining forms a continuous open chain,
// with independent logical identities, editable common endpoints and detach.
const joined=D.history(source);joined.change(d=>D.groupLines(d,['x','y'],'visual'));assert.deepEqual(joined.get().artwork.lines,source.artwork.lines);joined.undo();joined.change(d=>D.joinLines(d,['y','x'],'joined'));const connected=joined.get();assert.deepEqual(connected.artwork.lines,source.artwork.lines);assert.deepEqual(connected.bindings,source.bindings);
joined.change(d=>D.setLinePoints(d,'x',[{x:100,y:100},{x:420,y:120}]));assert.deepEqual(joined.get().artwork.lines[1].points[0],{x:420,y:120});assert.throws(()=>joined.change(d=>D.extend(d,'x','end',[{x:500,y:200}])));joined.change(d=>D.extend(d,'x','start',[{x:50,y:100}]));assert.equal(joined.get().artwork.lines[0].points.length,3);joined.change(d=>D.detachGroup(d,'joined'));assert.equal(joined.get().artwork.groups,undefined);
for(const mutate of [d=>d.artwork.lines[1].points[0].x+=1,d=>d.artwork.lines.push(line('z',[{x:400,y:100},{x:500,y:200}]))]){const bad=structuredClone(source);mutate(bad);assert.throws(()=>D.joinLines(bad,bad.artwork.lines.map(l=>l.id),'bad'));}
for(const mutate of [d=>d.artwork.groups[0].memberIds.push('missing'),d=>d.artwork.groups.push({...d.artwork.groups[0],id:'duplicate-members'}),d=>d.artwork.lines[1].points[0].x++,d=>d.artwork.groups[0].generatedIds.push('missing'),d=>d.artwork.groups[0].spine[0].x=NaN]){const bad=structuredClone(three);mutate(bad);assert.throws(()=>D.validate(bad));}
assert.deepEqual(D.validate(JSON.parse(JSON.stringify(connected))),connected);
const loop=structuredClone(source);loop.artwork.lines[1].points=[{x:400,y:100},{x:100,y:100}];assert.throws(()=>D.joinPlan(loop,['x','y']));
const tight=structuredClone(initial);tight.artwork.lines[0].points=[{x:100,y:100},{x:120,y:100},{x:120,y:120},{x:140,y:120}];const tightHistory=D.history(tight);assert.throws(()=>tightHistory.change(d=>D.linkedParallel(d,'a',3,30,'right','tight',['t1','t2'])));assert.deepEqual(tightHistory.get(),tight);
assert.deepEqual(initial.bindings,{a:{source:'trondheim',sourceId:'route-original',quayIds:['NSR:Quay:1']}});
console.log('Studio phase 2 model: linked lanes/count/side/bends, shape editing/extension/translation, shared route, visual group, endpoint chain, detach, atomic errors/locks/references, JSON/SVG/history and independent source identities passed');

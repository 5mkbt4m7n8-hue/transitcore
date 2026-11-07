import './test-studio-smart-stations.mjs';
import './test-studio-v012.mjs';
import './test-studio-v011.mjs';
import assert from 'node:assert/strict';
import './test-studio-phase-two.mjs';
import './test-studio-phase-three.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),D=require('../web/linear/network/studio-document.js'),source=require('../web/linear/network/trondheim-layout.json');
const original=JSON.stringify(source),copy=D.fromTrondheim(source),h=D.history(copy);
assert.equal(copy.artwork.stops.length,100);
assert.deepEqual(copy.bindings['stop-0'].sourceBindings,source.stops[0].bindings);
assert(copy.bindings['stop-0'].quayIds.includes('NSR:Quay:71132'));
const bindings=JSON.stringify(copy.bindings);
h.change(d=>{d.artwork.stops[0].x+=10;d.artwork.stops[0].name='Eget navn';d.artwork.lines[0].points[0].x+=5;});
assert.equal(JSON.stringify(source),original,'canonical source stays untouched');
assert.equal(JSON.stringify(h.get().bindings),bindings,'artwork edits preserve bindings');
h.undo();assert.deepEqual(h.get(),copy);h.redo();assert.notDeepEqual(h.get(),copy);
h.undo();h.change(d=>d.title='Ny gren');assert.equal(h.canRedo(),false);
const blank=D.blank(),fresh=D.history(blank);
fresh.change(d=>{d.artwork.lines.push({id:'l',name:'Linje <1>',color:'#218967',width:6,visible:true,locked:false,points:[{x:20,y:30},{x:80,y:90}]});d.artwork.stops.push({id:'s',name:'A & B <C>',x:20,y:30,labelDx:12,labelDy:-12,lineIds:['l'],visible:true,locked:false});});
assert.deepEqual(D.validate(JSON.parse(JSON.stringify(fresh.get()))),fresh.get());
assert.match(D.svg(fresh.get()),/A &amp; B &lt;C&gt;/);
const before=fresh.get();assert.throws(()=>fresh.change(d=>d.artwork.stops[0].x=Infinity));assert.deepEqual(fresh.get(),before,'rejected edits are atomic');
for(const mutate of [d=>d.artwork.stops.push({...d.artwork.stops[0]}),d=>d.artwork.lines[0].color='url(evil)',d=>d.artwork.stops[0].lineIds=['missing'],d=>d.bindings.unknown={source:'trondheim',sourceId:'x',quayIds:[]}]){const bad=structuredClone(before);mutate(bad);assert.throws(()=>D.validate(bad));}
console.log('Studio document: creation, history, import validation, SVG and canonical isolation passed');

assert.equal(copy.artwork.lines.length,18);
const edit=D.history(before);edit.change(d=>D.resize(d,1600,900));assert.match(D.svg(edit.get()),/viewBox="0 0 1600 900"/);assert.deepEqual(edit.get().artwork,before.artwork);edit.undo();assert.deepEqual(edit.get(),before);edit.redo();assert.equal(edit.get().width,1600);
const stable=edit.get();assert.throws(()=>edit.change(d=>D.resize(d,10001,900)));assert.deepEqual(edit.get(),stable);
edit.change(d=>{const s=d.artwork.stops[0];s.labelAngle=315;s.labelSide='left';s.labelDx=-12;s.symbol='capsule';s.span=50;s.symbolAngle=90;});
assert.match(D.svg(edit.get()),/text-anchor="end" transform="rotate\(315 /);assert.equal(D.symbol(edit.get().artwork.stops[0]).width,50);
assert.deepEqual(D.validate(JSON.parse(JSON.stringify(edit.get()))),edit.get());
for(const n of [-1,361,Infinity])assert.throws(()=>edit.change(d=>d.artwork.stops[0].labelAngle=n));
const lanes=D.history(before);lanes.change(d=>{d.artwork.lines[0].points=[{x:100,y:100},{x:300,y:100},{x:300,y:300}];D.parallel(d,'l',2,20,['l2','l3']);});
assert.deepEqual(lanes.get().artwork.lines[1].points,[{x:100,y:120},{x:280,y:120},{x:280,y:300}]);assert.deepEqual(lanes.get().artwork.lines[2].points,[{x:100,y:140},{x:260,y:140},{x:260,y:300}]);assert.equal(lanes.get().artwork.stops.length,1);assert.deepEqual(lanes.get().bindings,before.bindings);const three=lanes.get();lanes.undo();assert.deepEqual(lanes.get(),before);lanes.redo();assert.deepEqual(lanes.get(),three);
const labels=structuredClone(before);labels.artwork.stops.push({...labels.artwork.stops[0],id:'s2'});D.arrangeLabels(labels);assert.notDeepEqual(D.label(labels.artwork.stops[0]),D.label(labels.artwork.stops[1]));
console.log('Studio enhancements: dimensions, rotation, label suggestions, parallel spacing, shared symbol, history and persistence passed');

// Phase 1: editing retains identity and source records and is atomic in history.
const phase=D.history(three),firstLine=phase.get().artwork.lines[0],lineId=firstLine.id;
phase.change(d=>D.extend(d,lineId,'end',[{x:400,y:300},{x:500,y:400}]));let extended=phase.get();assert.equal(extended.artwork.lines.length,three.artwork.lines.length);assert.equal(extended.artwork.lines[0].id,lineId);assert.equal(extended.artwork.lines[0].color,firstLine.color);assert.equal(extended.artwork.lines[0].width,firstLine.width);assert.deepEqual(extended.bindings,three.bindings);phase.undo();assert.deepEqual(phase.get(),three);phase.redo();assert.deepEqual(phase.get(),extended);
phase.change(d=>D.extend(d,lineId,'start',[{x:80,y:80},{x:60,y:80}]));assert.deepEqual(phase.get().artwork.lines[0].points.slice(0,2),[{x:60,y:80},{x:80,y:80}]);assert.deepEqual(phase.get().artwork.lines[0].points.slice(2),extended.artwork.lines[0].points);
const ids=[lineId,'l2'],preBatch=phase.get();phase.change(d=>D.styleLines(d,ids,{color:'#123456',width:11}));assert(phase.get().artwork.lines.filter(l=>ids.includes(l.id)).every(l=>l.color==='#123456'&&l.width===11));phase.undo();assert.deepEqual(phase.get(),preBatch);phase.redo();
const beforeSpacing=phase.get();phase.change(d=>D.spaceLines(d,ids,25));assert.deepEqual(phase.get().artwork.lines[1].points[0],{x:60,y:105});const tail=phase.get().artwork.lines[1].points.at(-1);assert(Math.abs(tail.x-(500-25/Math.sqrt(2)))<1e-8);assert(Math.abs(tail.y-(400+25/Math.sqrt(2)))<1e-8);assert.deepEqual(phase.get().bindings,beforeSpacing.bindings);phase.undo();assert.deepEqual(phase.get(),beforeSpacing);
const rejects=phase.get();for(const fn of [d=>D.extend(d,lineId,'bad',[{x:1,y:1}]),d=>D.extend(d,lineId,'end',[{x:20000,y:1}]),d=>D.styleLines(d,ids,{width:0}),d=>D.styleLines(d,ids,{id:'replacement'}),d=>D.styleLines(d,['missing'],{color:'#123456'}),d=>D.spaceLines(d,ids,0),d=>{d.artwork.lines[1].locked=true;D.styleLines(d,ids,{width:4});}]){assert.throws(()=>phase.change(fn));assert.deepEqual(phase.get(),rejects);}
const deleteState=phase.get();phase.change(d=>D.removeObjects(d,ids));assert.equal(phase.get().artwork.lines.length,1);assert.deepEqual(phase.get().artwork.stops[0].lineIds,[]);phase.undo();assert.deepEqual(phase.get(),deleteState);phase.redo();assert.equal(phase.get().artwork.lines.length,1);
const presetStop={...before.artwork.stops[0],labelDx:22,labelDy:-35};for(const [preset,angle]of [['up',315],['down',45],['vertical',90],['horizontal',0]]){D.labelPreset(presetStop,preset);assert.equal(presetStop.labelAngle,angle);assert.equal(presetStop.labelDx,22);assert.equal(presetStop.labelDy,-35);}D.labelPreset(presetStop,'left');assert.equal(presetStop.labelSide,'left');assert.equal(presetStop.labelDx,-22);assert.equal(presetStop.labelAngle,0);
const canonicalPhase=D.history(copy),bindingsBefore=JSON.stringify(copy.bindings);canonicalPhase.change(d=>{D.extend(d,d.artwork.lines[0].id,'end',[{x:20,y:20}]);D.styleLines(d,d.artwork.lines.slice(0,2).map(l=>l.id),{color:'#123456'});D.labelPreset(d.artwork.stops[0],'up');});assert.equal(JSON.stringify(canonicalPhase.get().bindings),bindingsBefore);assert.equal(JSON.stringify(source),original);assert.equal(canonicalPhase.get().artwork.stops.length,100);assert.equal(canonicalPhase.get().artwork.lines.length,18);assert.deepEqual(D.validate(JSON.parse(JSON.stringify(canonicalPhase.get()))),canonicalPhase.get());
console.log('Studio phase 1: extending identity, batch style/spacing/delete, locked/invalid atomicity, presets, canonical bindings and JSON passed');

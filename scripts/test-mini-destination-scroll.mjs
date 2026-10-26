import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const M=require('../web/mini/model.js');
const C=require('../web/mini/display-columns.js');
const P=require('../web/mini/presets.js');
const F=require('../web/mini/pixel-font.js');
const R=require('../web/mini/renderer.js');
const pause=1200,step=120,distance=20,range=40;
assert.equal(C.scrollOffset(range,range,9999),0);
assert.equal(C.scrollOffset(range,range+10,9999),0);
assert.equal(C.scrollOffset(40,20,0),0);
assert.equal(C.scrollOffset(40,20,pause-1),0);
assert.equal(C.scrollOffset(40,20,pause+step*7),7);
assert.equal(C.scrollOffset(40,20,pause+step*distance),distance);
assert.equal(C.scrollOffset(40,20,2*pause+step*distance-1),distance);
assert.equal(C.scrollOffset(40,20,2*pause+step*distance+step*5),15);
assert.equal(C.scrollOffset(40,20,2*pause+2*step*distance),0);
assert.equal(C.scrollOffset(40,20,-30),0);
assert.equal(C.scrollOffset(40,20,Number.NaN),0);
const preset={hardware:{profileId:'led-64x64',width:64,height:64,type:'led'},
 display:{palette:'rgb',brightnessPercent:80,design:'classic'},
 datasource:{mode:'demo',stopId:'NSR:StopPlace:41613',stopName:'Prinsens gate',
  filters:{lines:null,destination:null}}};
assert.equal(P.config(preset).display.destinationMode,'shorten',
 'Old saved profiles must retain the default abbreviation');
const scrollConfig=P.config({...preset,display:{...preset.display,destinationMode:'scroll'}});
assert.equal(scrollConfig.display.destinationMode,'scroll');
const saved=P.savedItem({id:'scroll-test',name:'Rullende tavle',value:scrollConfig});
assert.equal(P.importOne(P.exportOne(saved)).value.display.destinationMode,'scroll');
assert.throws(()=>P.config({...preset,display:{...preset.display,destinationMode:'fly'}}),
 /Ugyldig visning/);
const now=Date.parse('2026-10-26T11:00:00Z');
const board=M.demo(now);
board.departures[0].line='12';
board.departures[0].destination='Dragvoll via Strindheim';
board.departures[0].at=new Date(now+180000).toISOString();
const p=M.profile('led-64x64');
const snapshots=[];
let calls=[];
const native={
 fillStyle:'#000',font:'6px monospace',textAlign:'left',textBaseline:'top',
 imageSmoothingEnabled:false,
 fillRect(x,y,w,h){calls.push({x,y,w,h,color:this.fillStyle});},
 beginPath(){},rect(x,y,w,h){assert(x>=0&&y>=0&&x+w<=64&&y+h<=64);},
 clip(){},save(){},restore(){},
 measureText(t){return {width:F.width(t)}}};
const frame={width:64,height:64,getContext:()=>native};
function draw(mode,ms,reduced=false){
 calls=[];
 const result=R.draw(frame,p,board,{demo:false,now,
  palette:'rgb',design:'classic',destinationMode:mode,scrollMs:ms,reducedMotion:reduced});
 snapshots.push([...calls]);
 return {result,calls:[...calls]};
}
const shortA=draw('shorten',0),shortB=draw('shorten',5000);
assert.equal(shortA.result.visible,5);
assert.equal(shortA.result.scrolling,false);
assert.deepEqual(shortA.calls,shortB.calls,'Abbreviation never moves');
const scrollA=draw('scroll',0),scrollB=draw('scroll',4800);
assert.equal(scrollA.result.visible,5,'Scrolling must retain all five departures');
assert.equal(scrollB.result.scrolling,true,'Only clipped long destination is moving');
const g=M.geometry(p),rowStart=g.header,rowEnd=g.header+g.rowHeight;
const cols=C.columns(64,2,'12','3m',1);
const byArea=(x,from,to)=>x.calls.filter(v=>v.y>=rowStart&&v.y<rowEnd&&v.x>=from&&v.x<to);
assert.deepEqual(byArea(scrollA,0,cols.destX),byArea(scrollB,0,cols.destX),
 'Line number remains fixed while destination scrolls');
assert.deepEqual(byArea(scrollA,cols.timeX,64),byArea(scrollB,cols.timeX,64),
 'Countdown remains fixed while destination scrolls');
assert.notDeepEqual(byArea(scrollA,cols.destX,cols.timeX),
 byArea(scrollB,cols.destX,cols.timeX),'Destination must visibly move');
const reducedA=draw('scroll',0,true),reducedB=draw('scroll',5000,true);
assert.deepEqual(reducedA.calls,reducedB.calls,'Reduced motion disables destination animation');
assert.equal(reducedA.result.scrolling,false);
const fitBoard=M.demo(now);
fitBoard.departures=fitBoard.departures.slice(0,1);
fitBoard.departures[0].destination='Lund';
const normalBoard=board; // Existing board is never changed by drawing.
assert.equal(normalBoard.departures[0].destination,'Dragvoll via Strindheim');
for(const kind of ['led-32x16','led-64x32','led-64x64','led-128x64','led-128x128']){
 const prof=M.profile(kind),ctx={
  ...native,fillRect(){},rect(x,y,w,h){assert(x>=0&&y>=0&&x+w<=prof.width&&y+h<=prof.height);}};
 for(const design of ['classic','compact','bold','clock']){
  const rendered=R.draw({width:prof.width,height:prof.height,getContext:()=>ctx},
   prof,board,{demo:true,now,design,destinationMode:'scroll',scrollMs:4300});
  assert(rendered.visible>=1);
 }
}
console.log('Mini optional destination ticker: ends/pause, stationary routes and times, 5 rows, profiles, reduced motion and four display layouts PASS');

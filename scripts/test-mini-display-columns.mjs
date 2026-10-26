import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const F=require('../web/mini/pixel-font.js');
const C=require('../web/mini/display-columns.js');
const M=require('../web/mini/model.js');
const R=require('../web/mini/renderer.js');

assert.equal(F.width('STRINDHEIM'),39);
const classic=C.columns(64,2,'12','3m');
assert.equal(classic.lineText,'12');
assert.equal(classic.timeText,'3M');
assert.equal(classic.destWidth,42,'64x64: actual 7px route and 7px time must leave 42px');
assert.equal(C.destination('Strindheim',classic.destWidth),'STRINDHEIM');
assert.equal(C.destination('Dragvoll via Strindheim',classic.destWidth),'DRAGVOLL');
assert.equal(C.destination('Trondheim Spektrum',classic.destWidth),'TRONDHEIM');
assert.equal(C.destination('Vikåsen via Singsaker',classic.destWidth),'VIKÅSEN');
assert.equal(C.destination('Prinsens gate',47),'PRINSENS GT.');
const tighter=C.columns(64,2,'112','12m');
assert(tighter.destWidth<classic.destWidth);
assert(tighter.destWidth>=30,'Longer route/times leave positive destination area');
for(const width of [16,24,32,48,64,96,128,240,320,512]){
 for(const s of [1,2,3]){
  for(const line of ['1','12','701','1204','0123456789']){
   for(const time of ['0m','12m','99m','10:30']){
    const row=C.columns(width,width<48?1:2,line,time,s);
    const label=C.destination('Trondheim Spektrum via Strindheim',row.destWidth,s);
    assert(row.lineX>=0&&row.timeX<=width);
    assert(row.destWidth>=0);
    assert(row.lineX+row.lineWidth+row.gap<=row.destX);
    assert(row.destX+F.width(label,s)+row.gap<=row.timeX || row.destWidth===0,
      'Route, destination and time must never collide at '+width+' px');
    assert(row.timeX+row.timeWidth<=width,'Countdown must remain visible inside panel');
    assert(F.width(row.lineText,s)<=row.right-row.left);
   }
  }
 }
}
const rendered=[];
const ctx={
 fillStyle:'#000',textAlign:'left',textBaseline:'top',font:'6px monospace',
 imageSmoothingEnabled:false,
 fillRect(x,y,w,h){rendered.push({x,y,w,h,c:this.fillStyle});},
 measureText(text){return {width:text.length*6};},
 fillText(){throw Error('LED must use bitmap glyphs, not smoothed Canvas fillText');}
};
const now=Date.parse('2026-10-26T09:00:00.000Z');
for(const profileId of ['led-32x16','led-64x32','led-64x64','led-128x64','led-128x128']){
 const p=M.profile(profileId);
 rendered.length=0;
 const data=M.demo(now);
 data.departures[0].line='12';
 data.departures[0].destination='Strindheim';
 data.departures[0].at=new Date(now+180000).toISOString();
 const frame={width:p.width,height:p.height,getContext:()=>ctx};
 const layout=R.draw(frame,p,data,{demo:false,now,palette:'rgb',design:'classic'});
 assert.equal(layout.rows,M.geometry(p).rows);
 assert(layout.visible>=1);
 assert(rendered.every(r=>r.x>=0&&r.y>=0&&r.x+r.w<=p.width&&r.y+r.h<=p.height),
  profileId+' all bitmap pixels must stay inside physical framebuffer');
 if(profileId==='led-64x64'){
  assert.equal(layout.visible,5,'Retain 5 departures in standard 64x64 LED view');
  const row=M.geometry(p),white=M.palettes.rgb.fg;
  const pixels=rendered.filter(r=>r.c===white&&r.y>=row.header&&r.y<row.header+row.rowHeight);
  assert(pixels.some(r=>r.x>=46),'Full STRINDHEIM word must extend beyond the old fixed-width column');
 }
}
for(const design of ['compact','bold','clock']){
 const p=M.profile('led-64x64'),frame={width:p.width,height:p.height,getContext:()=>ctx};
 rendered.length=0;
 const out=R.draw(frame,p,M.demo(now),{demo:true,now,design});
 assert(out.visible>0);
 assert(rendered.every(r=>r.x>=0&&r.y>=0&&r.x+r.w<=p.width&&r.y+r.h<=p.height),
  design+' must not draw outside panel');
}
const lcd=M.profile('lcd-240x135');
let smoothed=0;
const lcdCtx={...ctx,fillRect(){},fillText(){smoothed++;},measureText(text){return {width:text.length*7};}};
R.draw({width:lcd.width,height:lcd.height,getContext:()=>lcdCtx},lcd,M.demo(now),{demo:true,now});
assert(smoothed>0,'TFT/LCD non-pixel font rendering remains unchanged');
console.log('Mini LED adaptive layout: 5 rows at 64x64, full Strindheim, 10 resolutions x 3 scales, no overlap or pixel spill, other designs and LCD PASS');

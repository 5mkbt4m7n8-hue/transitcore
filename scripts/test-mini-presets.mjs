import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Model=require('../web/mini/model.js');
const P=require('../web/mini/presets.js');
assert.equal(P.KEY,'intransit-mini:v3:presets');
assert.equal(P.MAX,12);
assert.deepEqual(P.DESIGNS.map(x=>x.id),['classic','compact','bold','clock']);
const backing=new Map();
const storage={getItem:k=>backing.get(k)||null,setItem:(k,v)=>backing.set(k,v)};
const sample={schemaVersion:3,product:'intransit-mini',
 hardware:{profileId:'led-64x64',width:64,height:64,type:'led'},
 display:{palette:'rgb',brightnessPercent:80,design:'compact'},
 datasource:{mode:'demo',stopId:'NSR:StopPlace:41613',stopName:'Prinsens gate',
  filters:{lines:['2','1','1'],destination:'Ranheim'}}};
const value=P.config(sample);
assert.deepEqual(value.datasource.filters.lines,['1','2']);
assert.equal(value.display.design,'compact');
assert.equal(value.hardware.pixelCount,4096);
assert.equal(P.load(storage).items.length,0);
const a=P.savedItem({id:'home-0001',name:'Hjem',value});
const saved=P.upsert(storage,[],a);
assert.equal(saved.length,1);
assert.equal(P.load(storage).items[0].value.display.design,'compact');
const b=P.savedItem({id:'work-0002',name:'Jobb',value:{...sample,
 hardware:{profileId:'lcd-240x135',width:240,height:135,type:'lcd'},
 display:{palette:'amber',brightnessPercent:45,design:'clock'},
 datasource:{mode:'live',stopId:'NSR:StopPlace:41742',stopName:'Trondheim S',
  filters:{lines:null,destination:null}}}});
assert.equal(P.upsert(storage,saved,b).length,2);
assert.equal(P.upsert(storage,[a,b],{...a,name:'Hjem oppdatert'}).length,2);
assert.equal(P.load(storage).items[0].name,'Hjem oppdatert');
const text=P.exportOne(b),imported=P.importOne(text);
assert.equal(imported.value.display.design,'clock');
assert.equal(imported.value.datasource.mode,'live');
assert.equal(P.remove(storage,[a,b],a.id).length,1);
assert.equal(P.load(storage).items[0].name,'Jobb');
assert.throws(()=>P.persist(storage,new Array(13).fill(a)),/Maks 12/);
assert.throws(()=>P.persist(storage,[a,a]),/Dupliserte/);
assert.throws(()=>P.importOne(JSON.stringify({version:1,kind:'intransit-mini-saved-profile'})),/Ukjent profilformat/);
assert.throws(()=>P.importOne('a'.repeat(20001)),/for stor/);
assert.throws(()=>P.config({...sample,hardware:{...sample.hardware,width:32}}),/samsvarer ikke/);
assert.throws(()=>P.config({...sample,display:{...sample.display,design:'unsafe'}}),/Ugyldige visningsvalg/);
assert.throws(()=>P.config({...sample,display:{...sample.display,brightnessPercent:101}}),/Ugyldige visningsvalg/);
assert.throws(()=>P.config({...sample,datasource:{...sample.datasource,stopId:'NSR:Quay:41613'}}),/Ugyldig holdeplass/);
assert.throws(()=>P.config({...sample,datasource:{...sample.datasource,filters:{lines:['<script>'],destination:null}}}),/Ugyldig linjefilter/);
assert.throws(()=>P.savedItem({id:'bad id!',name:'Hello',value}),/Ugyldig profilnavn/);
const invalidStore={getItem:()=>'{ not json'};
assert.match(P.load(invalidStore).error,/Kunne ikke lese/);
assert.equal(P.load(invalidStore).items.length,0);
const custom=P.config({...sample,hardware:{profileId:'custom',width:96,height:48,type:'mono'},
 display:{palette:'mono',brightnessPercent:65,design:'bold'}});
assert.deepEqual([custom.hardware.width,custom.hardware.height,custom.hardware.type],[96,48,'mono']);
assert.equal(Model.filterBoard(Model.demo(Date.now()),{lines:new Set(['1'])}).departures.length,2);
const ctx={
 measureText:text=>({width:text.length*6}),
 fillRect(){},fillText(){},beginPath(){},arc(){},fill(){},getImageData:()=>({data:new Uint8ClampedArray(32*16*4)}),
 set textBaseline(_){},set textAlign(_){},set font(_){},set fillStyle(_){}
};
const Renderer=require('../web/mini/renderer.js');
for(const kind of ['led-32x16','led-64x64','lcd-240x135']){
 const p=Model.profile(kind),frame={width:p.width,height:p.height,getContext:()=>ctx},board=Model.demo(Date.now());
 for(const design of P.DESIGNS.map(x=>x.id)){
  const result=Renderer.draw(frame,p,board,{design,demo:true,now:Date.now()});
  assert(result.visible>=1);
  assert(result.rows>=1);
  if(design!=='classic')assert.equal(result.design,design);
 }
}
console.log('Mini 3.0: 4 pixel formats x 3 screens, versioned 12-slot profile CRUD, safe import/export, offline source separation PASS');

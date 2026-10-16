const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const linear=read('web/linear/index.html');
const signals=require('../web/shared/signal-policy.js');
const sandbox={SIGNALS:signals,document:{querySelectorAll:()=>[lamp]}};
const lamp={dataset:{colors:'[[0,80,255],[255,160,0]]',colorIndex:'0'},style:{}};
vm.createContext(sandbox);
vm.runInContext(linear.slice(linear.indexOf('function prioritizedOccupants'),linear.indexOf('function paint(')),sandbox);
const plain=x=>JSON.parse(JSON.stringify(x));
const a={id:'A',line:'1',state:'AT_STOP',rgb:[0,80,255]};
const b={id:'B',line:'2',state:'AT_STOP',rgb:[255,160,0]};
const item={state:'AT_STOP',vehicle:{id:'SERVER'},rgb:a.rgb,occupants:[a,b,{...a,id:'duplicate'}, {...b,id:'passed',state:'PASSED',rgb:[255,0,0]}]};
const before=JSON.stringify(item);
assert.deepEqual(plain(sandbox.prioritizedOccupants(item)).map(x=>x.id),['A','B']);
assert.equal(JSON.stringify(item),before,'Presentation must not mutate frame');
sandbox.cycleLedColors();assert.equal(lamp.style.color,'rgb(255,160,0)');
sandbox.cycleLedColors();assert.equal(lamp.style.color,'rgb(0,80,255)');
assert.equal(sandbox.prioritizedOccupants({...item,occupants:[a,{...b,state:'APPROACHING'}]}).length,1);
assert.equal(sandbox.prioritizedOccupants({...item,occupants:[{...a,state:'APPROACHING'},{...b,state:'APPROACHING'}]}).length,2);
for(const lifecycle of ['PASSED','PARKED'])assert.deepEqual(plain(sandbox.prioritizedOccupants({...item,lifecycle})),[{rgb:a.rgb}]);
assert.deepEqual(plain(sandbox.prioritizedOccupants({rgb:a.rgb,state:'AT_STOP'})),[{rgb:a.rgb,state:'AT_STOP'}]);
assert.match(linear,/effective=item.vehicle\|\|\{\},effectiveState=item.lifecycle\|\|item.state/,'Server identity and lifecycle must remain authoritative');
assert.match(linear,/setInterval\(cycleLedColors,1200\)/);
assert.match(linear,/classList.add\("approaching"\)/);
assert.match(linear,/classList.add\("departed"\)/);
assert.equal(JSON.parse(read('config/boards/trondheim-bus-board.json')).leds.count,147);
const editor=read('web/editor/index.html');
assert.match(editor,/@media\(max-width:700px\)\{\.filters\{grid-template-columns:minmax\(0,1fr\)/);
assert.match(editor,/\.toolbar select\{flex-basis:100%;min-width:0;max-width:100%\}/);
const labHtml=read('web/lab/index.html');
assert.match(labHtml,/\[hidden\]\{display:none!important\}/);
assert(labHtml.indexOf('id="routePicker"')<labHtml.indexOf('id="multiView"'),'Route selection must precede tall panels');
assert.match(read('web/board/client-diagnostics.html'),/#source\{overflow-wrap:anywhere\}/);

// Execute the actual Lab script, including async initialization and multi-view handlers.
async function lab(query){
 const elements=new Map(),classes=new Set(),frames=[];
 function element(id){if(!elements.has(id))elements.set(id,{hidden:false,innerHTML:'',textContent:'',value:'',closest:()=>element('toolbar'),querySelectorAll:()=>[]});return elements.get(id);}
 const context={URLSearchParams,location:{search:query},document:{body:{classList:{add:v=>classes.add(v)}},getElementById:element,addEventListener:()=>{},hidden:false},
  setInterval:()=>0,setTimeout:()=>0,clearTimeout:()=>{},fetch:async p=>({ok:true,json:async()=>JSON.parse(read(p.replace('../../','')))}),
  TransitCoreFrames:{create:opts=>{frames.push(opts);return {refresh:async()=>({algorithm:'test',sample:{sequence:1,ageSeconds:0,status:'CURRENT'},frame:{leds:[]}})}}}};
 vm.createContext(context);
 const html=read('web/lab/index.html'),script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
 vm.runInContext(script,context);
 await new Promise(resolve=>setImmediate(resolve));
 return {context,element,classes,frames};
}
(async()=>{
 const multi=await lab('?multi=1&routes=atb-bus-1-live,atb-bus-2-live');
 const html=multi.element('multiView').innerHTML;
 assert.equal((html.match(/<iframe /g)||[]).length,2);
 assert.match(html,/atb-bus-1-live&amp;|atb-bus-1-live&embedded=1/);
 assert.match(html,/Åpne separat/);
 assert.equal(multi.element('multiView').hidden,false);
 assert.equal(multi.element('view').hidden,true);
 assert.equal(multi.frames.length,0,'Parent does not poll an invisible board');
 assert.match(multi.element('routeChecks').innerHTML,/type="checkbox"/);
 const empty=await lab('?multi=1&routes=bogus');
 assert.doesNotMatch(empty.element('multiView').innerHTML,/<iframe/);
 const embedded=await lab('?route=atb-bus-1-live&embedded=1');
 assert(embedded.classes.has('embedded'));
 assert.equal(embedded.frames[0].boardId,'trondheim-bus-board');
 assert.equal(embedded.frames[0].ledCount,147);
 embedded.element('profile').value='trondheim-flybuss-live';
 embedded.element('profile').onchange();
 assert.equal(vm.runInContext('selectedRoute',embedded.context),null,'Board switch clears prior route filter');
 assert.equal(embedded.frames.at(-1).boardId,'trondheim-flybuss-live');

 // Draft rendering respects physical mapping and colors without any staging connection.
 const preview=read('web/preview/index.html');
 const nodes={leds:{innerHTML:''}};
 const context={project:{board:{nodes:[{id:'n',name:'Test',led:7}]},hardware:{assignments:[{sourceNodeId:'n',logicalLed:7,physicalLed:0,direction:'Ut'}]}},selectedPhysical:0,$:id=>nodes[id],esc:String};
 vm.createContext(context);
 vm.runInContext(preview.slice(preview.indexOf('function rows()'),preview.indexOf('function configurationChecks()')),context);
 vm.runInContext(preview.slice(preview.indexOf('function render(frame)'),preview.indexOf('async function poll()')),context);
 context.render({leds:[{id:0,rgb:[12,34,56],state:'APPROACHING'}]});
 assert.match(nodes.leds.innerHTML,/--rgb:12,34,56/);
 assert.match(nodes.leds.innerHTML,/Ut · APPROACHING/);
 assert.match(nodes.leds.innerHTML,/data-led="0"/);
 context.render({leds:[{id:0,rgb:[12,34,56],state:'AT_STOP',lifecycle:'PASSED'}]});
 assert.match(nodes.leds.innerHTML,/afterglow/);
 context.render({leds:[]});assert.match(nodes.leds.innerHTML,/Ut · AV/);
 console.log('Web preservation: color alternation, canonical identity, Lab multi/routes/embedded, draft physical mapping PASS');
})().catch(error=>{console.error(error);process.exitCode=1});

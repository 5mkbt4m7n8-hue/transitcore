import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const boardId='trondheim-bus-board';
const frame={schemaVersion:1,boardProfile:boardId,ledCount:147,sequence:1,generatedAt:new Date().toISOString(),ttlSeconds:30,leds:[]};
const html=read('web/linear/index.html');
// Real shared client: server PASSED is retained, never inferred; expiry becomes OFF.
const Frames=createRequire(import.meta.url)('../web/shared/canonical-frame-client.js');
for(const [id,count] of [['trondheim-bus-board',147],['trondheim-shared-stops-board',147],['trondheim-city-lines-catalog',1282],['trondheim-flybuss-live',46],['trondheim-bus-1-gps-staging',147]]){
 let now=Date.now(),tick=0,payload,fail=false;const urls=[];
 const client=Frames.create({boardId:id,ledCount:count,origin:'https://gateway.test',clock:()=>now,monotonic:()=>tick,
  fetchImpl:async url=>{urls.push(url);return fail?new Response('error',{status:502}):Response.json(payload);}});
 const make=leds=>({...frame,boardProfile:id,ledCount:count,generatedAt:new Date(now).toISOString(),leds});
 const led={id:0,rgb:[0,80,255],brightness:8,state:'AT_STOP',lifecycle:'PASSED',vehicle:{id:'95',line:'1'}};
 payload=make([led]);let result=await client.refresh();assert.equal(result.sample.leds[0].state,'PASSED');assert.equal(result.frame.leds[0].lifecycle,'PASSED');
 fail=true;result=await client.refresh();assert.equal(result.sample.status,'LAST_VALID');assert(result.sample.error);assert.equal(result.sample.leds[0].state,'PASSED');
 now+=31000;tick+=31000;result=client.snapshot();assert.equal(result.sample.status,'EXPIRED');assert.equal(result.sample.leds[0].state,'OFF');assert.deepEqual(result.frame.leds,[]);
 fail=false;payload=make([]);result=await client.refresh();assert.equal(result.sample.status,'VALID');assert.equal(result.sample.error,null);assert.deepEqual(result.frame.leds,[]);
 fail=true;result=await client.refresh();assert.equal(result.sample.status,'LAST_VALID');assert(result.sample.error);
 assert(urls.every(url=>url==='https://gateway.test/api/v1/frame/'+id),'No hidden production fallback');
}
// Dependency-free, deliberately strict parser for this native select's markup.
// Parse opening/closing tags and attributes; never invent options in the DOM mock.
function parseSourceSelect(markup){
 const options=[];let inside=false,openOption=false,selects=0;
 const tags=markup.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .matchAll(/<(\/?)([a-z][\w-]*)(\s[^<>]*?)?>/gi);
 for(const [,closing,rawName,tail=''] of tags){
  const name=rawName.toLowerCase(),attrs={};
  if(closing){if(inside)assert.equal(tail.trim(),'','Closing tags cannot have attributes');}
  else for(const a of tail.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g))attrs[a[1].toLowerCase()]=a[2]??a[3]??a[4]??'';
  if(name==='select'&&!closing&&attrs.id==='source'){assert(!inside);inside=true;selects++;assert(!('disabled'in attrs));continue;}
  if(!inside)continue;
  if(name==='select'&&closing){assert(!openOption,'Unclosed option');inside=false;continue;}
  if(name==='option'){
   if(closing){assert(openOption,'Unexpected closing option');openOption=false;}
   else {assert(!openOption,'Missing option end tag');assert(!('disabled'in attrs));assert('value'in attrs);options.push({value:attrs.value,selected:'selected'in attrs});openOption=true;}
  }else assert.fail('Unexpected element inside source select: '+name);
 }
 assert.equal(selects,1);assert(!inside);assert.deepEqual(options.map(o=>o.value),['production','staging']);
 return options;
}
const sourceOptions=parseSourceSelect(html);
assert.throws(()=>parseSourceSelect(html.replace('</option><option value="staging">','</option value="staging">')));
const sourceElement={options:sourceOptions,_value:(sourceOptions.find(o=>o.selected)||sourceOptions[0]).value,
 get value(){return this._value;},set value(value){this._value=this.options.some(o=>o.value===value)?value:'';}};
// Test the actual standalone web checkout, without another branch or historic Git objects.
const publishedRead=read;
for(const match of html.matchAll(/(?:src|href)="(\.\.\/shared\/[^"]+)"/g))assert(publishedRead('web/'+match[1].slice(3)));
assert(publishedRead('web/shared/board-client-model.js'));
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
const elements=new Map([['source',sourceElement]]);const el=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,textContent:'',innerHTML:'',classList:{remove(){}},style:{}});return elements.get(id);};
const clients=[],context={URLSearchParams,location:{search:'?v=110'},performance,console,
 TransitCoreSignals:{applyCssVariables(){}},TransitCoreFrames:{create:opts=>{clients.push(opts);return {refresh:async()=>({frame:null,algorithm:'test',sample:{sequence:1,ageSeconds:0,status:'NO_FRAME'}})};}},
 document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){},hidden:false},setInterval(){},setTimeout(){},clearTimeout(){},
 fetch:async url=>({ok:true,json:async()=>JSON.parse(publishedRead(url.replace('../../','')))})};
vm.createContext(context);vm.runInContext(script,context);await new Promise(resolve=>setImmediate(resolve));
assert(clients.length,el('status').textContent);assert.equal(clients.at(-1).boardId,'trondheim-bus-board');assert.equal(clients.at(-1).ledCount,147);assert(!clients.at(-1).origin);
el('source').value='staging';await el('source').onchange();await new Promise(resolve=>setImmediate(resolve));
assert.equal(el('source').value,'staging','Staging must be a selectable option from the HTML');
assert.equal(clients.at(-1).boardId,'trondheim-bus-1-gps-staging');assert.equal(clients.at(-1).ledCount,147);assert.equal(clients.at(-1).origin,'https://transitcore-linear-staging.lgb84.workers.dev');
assert(!el('allRoutes').disabled);
for(const [route,multi,id,count] of [
 ['atb-bus-1-live',false,'trondheim-bus-1-gps-staging',147],
 ['atb-bus-2-live',false,'trondheim-bus-board',147],
 ['atb-bus-2-live',true,'trondheim-shared-stops-board',147],
 ['atb-bus-10-live',false,'trondheim-city-lines-catalog',1282],
 ['flybuss-trondheim-fb73-live',false,'trondheim-flybuss-live',46]]){
 el('route').value=route;el('allRoutes').checked=multi;el('route').onchange();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(el('source').value,'staging');assert.equal(clients.at(-1).boardId,id);assert.equal(clients.at(-1).ledCount,count);assert(clients.at(-1).origin);
 const rows=el('rows').innerHTML;const ids=[...rows.matchAll(/data-id="(\d+)"/g)].map(m=>Number(m[1]));assert(ids.length);assert(ids.every(i=>i>=0&&i<count));
 el('source').value='production';await el('source').onchange();assert.equal(el('route').value,route);assert.equal(clients.at(-1).boardId,id==='trondheim-bus-1-gps-staging'?'trondheim-bus-board':id);assert.equal(clients.at(-1).ledCount,count);assert(!clients.at(-1).origin);
 assert.equal(el('rows').innerHTML,rows,'Source switch must preserve every station, direction and LED index');
 el('source').value='staging';await el('source').onchange();assert.equal(clients.at(-1).boardId,id);
}

// Execute the actual page startup from a mobile bookmark, with no token or origin
// from URL parameters. Production remains the default for missing/invalid source.
for(const [search,expected] of [['?v=110&route=atb-bus-1-live&source=staging','trondheim-bus-1-gps-staging'],
 ['?v=110&route=atb-bus-1-live','trondheim-bus-board'],
 ['?v=110&route=atb-bus-1-live&source=https://evil.test','trondheim-bus-board']]){
 const entries=new Map(),seen=[];
 const get=id=>{if(!entries.has(id))entries.set(id,{value:'',checked:false,textContent:'',innerHTML:'',classList:{remove(){}},style:{}});return entries.get(id);};
 const boot={...context,location:{search},document:{getElementById:get,querySelectorAll:()=>[],addEventListener(){},hidden:false},
  TransitCoreFrames:{create:opts=>{seen.push(opts);return {refresh:async()=>({frame:null,algorithm:'test',sample:{sequence:1,ageSeconds:0,status:'NO_FRAME'}})};}}};
 vm.createContext(boot);vm.runInContext(script,boot);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(seen.at(-1).boardId,expected);assert.equal(seen.at(-1).ledCount,147);
 assert.equal(get('route').value,'atb-bus-1-live');
 assert.equal(!!seen.at(-1).origin,expected==='trondheim-bus-1-gps-staging');
 assert(!JSON.stringify(seen).includes('token'));
}

// GPS Debug is entirely opt-in, read-only and tied to a matching canonical frame.
// No extra diagnostics GET is permitted in production or with the panel closed.
const debugFrame={...frame,boardProfile:'trondheim-bus-1-gps-staging',
 generatedAt:new Date().toISOString(),sequence:42,
 leds:[{id:3,rgb:[80,160,30],brightness:8,state:'AT_STOP',vehicle:{id:'bus-42',line:'1'}}]};
let debugSequence=42,debugError=false;
const debugRequests=[],debugElements=new Map();
const debugEl=id=>{
 if(!debugElements.has(id))debugElements.set(id,{value:'',checked:false,textContent:'',innerHTML:'',
  classList:{remove(){},add(){},contains(){return false;}},style:{},hidden:false,open:false});
 return debugElements.get(id);
};
const debugContext={...context,location:{search:'?route=atb-bus-1-live&source=staging'},
 document:{getElementById:debugEl,querySelectorAll:()=>[],addEventListener(){},hidden:false},
 TransitCoreFrames:{create:()=>({refresh:async()=>({
  frame:debugFrame,algorithm:'gps-proximity-v1',
  sample:{sequence:42,ageSeconds:0,status:'VALID'}
 })})},
 fetch:async url=>{
  debugRequests.push(url);
  if(String(url).includes('/api/v1/frame/trondheim-bus-1-gps-staging/diagnostics')){
   return debugError?{ok:false,status:502}:{ok:true,json:async()=>({
    boardId:'trondheim-bus-1-gps-staging',mode:'gps-proximity-v1',
    sequence:debugSequence,generatedAt:debugFrame.generatedAt,status:'CURRENT',
    observations:[{source:'GPS',vehicleId:'bus-42',lineId:'ATB:Line:2_1',
     observationTime:Date.now()-3000,distanceMeters:28.5,physicalLed:3,
     state:'AT_STOP',uncertain:false,stateChangedAt:Date.now()-7000}]
   })};
  }
  return {ok:true,json:async()=>JSON.parse(publishedRead(url.replace('../../','')))};
 }
};
vm.createContext(debugContext);vm.runInContext(script,debugContext);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(debugEl('gpsDebug').hidden,false);
assert.equal(debugRequests.filter(url=>String(url).includes('/diagnostics')).length,0,'Closed panel must not poll GPS diagnostics');
debugEl('gpsDebug').open=true;debugEl('gpsDebug').ontoggle();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(debugEl('gpsVehicle').value,'bus-42');
assert.equal(debugEl('gpsDistance').textContent,'28.5 m');
assert.equal(debugEl('gpsEvidenceState').textContent,'AT_STOP');
assert.equal(debugEl('gpsLedState').textContent,'AT_STOP');
assert.match(debugEl('gpsDebugStatus').textContent,/Samme frame #42/);
assert.equal(debugRequests.filter(url=>String(url).includes('/diagnostics')).length,1);
assert(debugRequests.every(url=>!String(url).includes('token')));

debugSequence=43;
debugEl('refresh').onclick();
await new Promise(resolve=>setImmediate(resolve));
assert.match(debugEl('gpsDebugStatus').textContent,/Ulike \/ utdaterte frames/);
assert.equal(debugEl('gpsLedState').textContent,'–','No mismatched LED comparisons');

debugSequence=42;debugError=true;
debugEl('refresh').onclick();
await new Promise(resolve=>setImmediate(resolve));
assert.match(debugEl('gpsDebugStatus').textContent,/Diagnostikk utilgjengelig/);
assert.equal(debugEl('gpsDistance').textContent,'–','Failed diagnostics must not keep stale metrics');
const beforeProduction=debugRequests.filter(url=>String(url).includes('/diagnostics')).length;
debugEl('source').value='production';await debugEl('source').onchange();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(debugEl('gpsDebug').hidden,true);
assert.equal(debugRequests.filter(url=>String(url).includes('/diagnostics')).length,beforeProduction,'Production must not read staging diagnostics');


// Compact views reuse one *existing* LED; there are no per-bus markers.
// The same physical diode cycles color and (optionally) its line number.
assert.match(html,/<select id="routeBadgeMode"><option value="details">Detaljer<\/option><option value="colors">Kun farger<\/option><option value="numbers">Linjenummer i diode<\/option><\/select>/);
assert(!html.includes('route-pip'), 'No extra per-vehicle bubbles may be rendered');
assert.match(html,/\.led\.numbered::after\{content:attr\(data-line\)/);
const multiItems=[{id:12,rgb:[237,83,80],occupants:[
 {line:'1',state:'AT_STOP',destination:'Ranheim',rgb:[237,83,80]},
 {line:'3',state:'APPROACHING',destination:'Sentrum',rgb:[20,140,90]},
 {line:'3',state:'AT_STOP',destination:'Sentrum',rgb:[20,140,90]}
]}];
const makeMarkup=mode=>vm.runInContext('renderStationBuses('+JSON.stringify(multiItems)+','+JSON.stringify(mode)+')',context);
const details=makeMarkup('details');
assert.equal((details.match(/class="badge"/g)||[]).length,3,'Detailed labels retained');
assert.match(details,/1 · AT_STOP · Ranheim/);
assert.equal(makeMarkup('colors'),'','No separate dot under any stop in colors mode');
assert.equal(makeMarkup('numbers'),'','No separate dot under any stop in numbers mode');
const untrusted=vm.runInContext('renderStationBuses('+JSON.stringify([{id:1,rgb:[1,2,3],occupants:[{line:'<svg>',state:'AT_STOP',destination:'<img src=x>',rgb:[9,9,9]}]}])+',"details")',context);
assert.match(untrusted,/&lt;svg&gt;/);assert.match(untrusted,/&lt;img src=x&gt;/);
assert(!untrusted.includes('<svg>')&&!untrusted.includes('<img src=x>'));
// Only the selected display mode changes; a switch never fetches a fresh frame.
el('route').value='atb-bus-1-live';el('route').onchange();await new Promise(resolve=>setImmediate(resolve));
assert.equal(el('routeViewOptions').hidden,true);
el('allRoutes').checked=true;el('allRoutes').onchange();await new Promise(resolve=>setImmediate(resolve));
assert.equal(el('routeViewOptions').hidden,false);
const clientCount=clients.length;
el('routeBadgeMode').value='numbers';el('routeBadgeMode').onchange();
assert.equal(clients.length,clientCount,'Changing display mode cannot poll the feed');

// Exercise the *real* paint and 1200ms color-cycle functions with one LED.
const ledClasses=new Set(),makeClassList=()=>({
 add(...values){for(const v of values)ledClasses.add(v);},
 remove(...values){for(const v of values)ledClasses.delete(v);},
 contains(v){return ledClasses.has(v);}
});
const led={dataset:{id:'12',name:'Teststopp',direction:'mot Ranheim'},style:{},classList:makeClassList()};
const container={parentElement:{querySelectorAll:()=>[led]},innerHTML:''};
const originalQuery=context.document.querySelectorAll;
context.TransitCoreSignals.priority=state=>({OFF:0,PASSED:1,APPROACHING:2,AT_STOP:3,PARKED:4})[state]||0;
context.document.querySelectorAll=selector=>{
 if(selector==='.station-buses')return [container];
 if(selector==='.led'||selector==='.led[data-id]')return [led];
 if(selector==='.led[data-id="12"]')return [led];
 if(selector==='.led.on[data-colors]')return ledClasses.has('on')?[led]:[];
 return [];
};
const physicalFrame={...frame,sequence:800,leds:[{
 id:12,rgb:[237,83,80],state:'AT_STOP',lifecycle:'AT_STOP',
 vehicle:{id:'b1',line:'1',destination:'Ranheim'},
 occupants:[{id:'b1',line:'1',destination:'Ranheim',state:'AT_STOP',rgb:[237,83,80]},
            {id:'b2',line:'3',destination:'Sentrum',state:'AT_STOP',rgb:[20,140,90]}]
}]};
vm.runInContext('paint('+JSON.stringify(physicalFrame)+')',context);
assert.equal(container.innerHTML,'','Only existing diode, no extra markers');
assert(ledClasses.has('on')&&ledClasses.has('numbered'));
assert.equal(led.dataset.line,'1');
assert.equal(led.dataset.lines,JSON.stringify(['1','3']));
assert.equal(led.dataset.colors,JSON.stringify([[237,83,80],[20,140,90]]));
vm.runInContext('cycleLedColors()',context);
assert.equal(led.dataset.line,'3','Number must cycle with the same LED');
assert.equal(led.style.color,'rgb(20,140,90)');
vm.runInContext('cycleLedColors()',context);
assert.equal(led.dataset.line,'1');
assert.equal(led.style.color,'rgb(237,83,80)');
el('routeBadgeMode').value='colors';el('routeBadgeMode').onchange();
assert(!ledClasses.has('numbered'),'Colors mode must remove the number from the existing diode');
assert.equal(container.innerHTML,'','Colors mode still has exactly zero extra markers');
assert(!Object.hasOwn(led.dataset,'line'));
vm.runInContext('cycleLedColors()',context);
assert.equal(led.style.color,'rgb(20,140,90)');
assert(!Object.hasOwn(led.dataset,'line'),'Color-only cycle must not add text');
el('routeBadgeMode').value='details';el('routeBadgeMode').onchange();
assert.equal((container.innerHTML.match(/class="badge"/g)||[]).length,2,'Detailed text view preserves two bus labels');
assert(!ledClasses.has('numbered'));
context.document.querySelectorAll=originalQuery;
el('allRoutes').checked=false;el('allRoutes').onchange();await new Promise(resolve=>setImmediate(resolve));
assert.equal(el('routeViewOptions').hidden,true);
assert.equal(el('routeBadgeMode').value,'details','Display choice survives temporary hiding');
el('route').value='flybuss-trondheim-fb73-live';el('route').onchange();await new Promise(resolve=>setImmediate(resolve));
assert.equal(el('routeViewOptions').hidden,true,'Flybuss cannot activate multi-route view');

assert.match(html,/body\.fb73-eta \.led\.approaching\{animation:none/,'Flybuss ETA LEDs must not blink');
assert.match(html,/Datagrunnlag:<\/strong>/,'ETA detail must identify the forecast source');
const etaFixture={boardProfile:'trondheim-flybuss-live',leds:[
 {id:36,state:'AT_STOP',vehicle:{id:'UNI:ServiceJourney:trip-42'}},
 {id:38,state:'AT_STOP',vehicle:{id:'UNI:ServiceJourney:trip-42'}},
 {id:40,state:'AT_STOP',vehicle:{id:'UNI:ServiceJourney:trip-42'}},
 {id:30,state:'APPROACHING',vehicle:{id:'UNI:ServiceJourney:trip-43'}},
 {id:31,state:'AT_STOP',vehicle:{id:'UNI:ServiceJourney:trip-44'}}
]};
const originalEta=JSON.stringify(etaFixture);
const projected=vm.runInContext('projectFb73EtaFrame('+originalEta+')',context);
assert.deepEqual(Array.from(projected.leds,item=>item.id),[31,36],
 'FB73 must keep separate trips but show at most one stable stop per journey; do not render early APPROACHING');
assert.equal(JSON.stringify(etaFixture),originalEta,'ETA projection cannot mutate the fetched PixelFrame');
assert.equal(projected.leds.filter(v=>v.vehicle.id==='UNI:ServiceJourney:trip-42').length,1,'Same FB73 departure cannot light three consecutive stops');


console.log('Linear HTML, full Bus1 147 mapping, one cycling LED with synchronized route number, mobile defaults, GPS Debug PASS');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {renderArrivalFrame} from '../core/frame/frame-renderer.mjs';
import {normalizeLedEntries, SIGNAL_POLICY} from '../worker/led-feed-worker.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const boardId='trondheim-bus-board';
const frame={schemaVersion:1,boardProfile:boardId,ledCount:147,sequence:1,generatedAt:new Date().toISOString(),ttlSeconds:30,leds:[]};
const html=read('web/linear/index.html');
assert.match(html,/<a id="geographicMode" href="\.\/geo\/"/,'Geographic editor must be discoverable from the existing Linear mode selector');
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
assert(clients.length,el('status').textContent);assert.equal(clients.at(-1).boardId,'trondheim-city-lines-catalog');assert.equal(clients.at(-1).ledCount,1282);assert(!clients.at(-1).origin);
el('source').value='staging';await el('source').onchange();await new Promise(resolve=>setImmediate(resolve));
assert.equal(el('source').value,'staging','Staging must be a selectable option from the HTML');
assert.equal(clients.at(-1).boardId,'trondheim-city-lines-catalog');assert.equal(clients.at(-1).ledCount,1282);assert.equal(clients.at(-1).origin,'https://transitcore-linear-staging.lgb84.workers.dev');
assert(!el('allRoutes').disabled);
for(const [route,multi,id,count] of [
 ['atb-bus-1-live',false,'trondheim-city-lines-catalog',1282],
 ['atb-bus-2-live',false,'trondheim-city-lines-catalog',1282],
 ['atb-bus-2-live',true,'trondheim-city-lines-catalog',1282],
 ['atb-bus-10-live',false,'trondheim-city-lines-catalog',1282],
 ['flybuss-trondheim-fb73-live',false,'trondheim-flybuss-live',46]]){
 el('route').value=route;el('allRoutes').checked=multi;el('route').onchange();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(el('source').value,'staging');assert.equal(clients.at(-1).boardId,id);assert.equal(clients.at(-1).ledCount,count);assert(clients.at(-1).origin);
 const rows=el('rows').innerHTML;const ids=[...rows.matchAll(/data-id="(\d+)"/g)].map(m=>Number(m[1]));assert(ids.length);assert(ids.every(i=>i>=0&&i<count));
 el('source').value='production';await el('source').onchange();assert.equal(el('route').value,route);assert.equal(clients.at(-1).boardId,id);assert.equal(clients.at(-1).ledCount,count);assert(!clients.at(-1).origin);
 assert.equal(el('rows').innerHTML,rows,'Source switch must preserve every station, direction and LED index');
 el('source').value='staging';await el('source').onchange();assert.equal(clients.at(-1).boardId,id);
}

// Execute the actual page startup from a mobile bookmark, with no token or origin
// from URL parameters. Production remains the default for missing/invalid source.
for(const [search,expected] of [['?v=110&route=atb-bus-1-live&source=staging','trondheim-city-lines-catalog'],
 ['?v=110&route=atb-bus-1-live','trondheim-city-lines-catalog'],
 ['?v=110&route=atb-bus-1-live&source=https://evil.test','trondheim-city-lines-catalog']]){
 const entries=new Map(),seen=[];
 const get=id=>{if(!entries.has(id))entries.set(id,{value:'',checked:false,textContent:'',innerHTML:'',classList:{remove(){}},style:{}});return entries.get(id);};
 const boot={...context,location:{search},document:{getElementById:get,querySelectorAll:()=>[],addEventListener(){},hidden:false},
  TransitCoreFrames:{create:opts=>{seen.push(opts);return {refresh:async()=>({frame:null,algorithm:'test',sample:{sequence:1,ageSeconds:0,status:'NO_FRAME'}})};}}};
 vm.createContext(boot);vm.runInContext(script,boot);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(seen.at(-1).boardId,expected);assert.equal(seen.at(-1).ledCount,1282);
 assert.equal(get('route').value,'atb-bus-1-live');
 assert.equal(!!seen.at(-1).origin,search.includes('source=staging'));
 assert(!JSON.stringify(seen).includes('token'));
}

// Catalog live monitor is covered by the network-map tests.
assert(!html.includes('id="gpsDebug"'),'147-point staging-only GPS panel must be removed');
assert(!html.includes('trondheim-shared-stops-board'),'Linear must not select 147-point bus frames');
assert(!html.includes('trondheim-bus-board'),'Linear must not select 147-point bus frames');

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
vm.runInContext('paint('+JSON.stringify({...frame,leds:[]})+')',context);
assert.match(el('legend').innerHTML,/background:#ef5350/);
assert.match(el('legend').innerHTML,/background:#66bb6a/,'Painting must preserve the northbound direction color');
assert.match(el('legend').innerHTML,/mot Ranheim\/Strindheim/);
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
assert.deepEqual(Array.from(projected.leds,item=>item.id),[30,31,36],
 'FB73 must keep separate departures and show approaching ETA without multiple LEDs for one departure');
assert.equal(JSON.stringify(etaFixture),originalEta,'ETA projection cannot mutate the fetched PixelFrame');

// A future estimated call must be shown, but one journey cannot light multiple stops.
const future=vm.runInContext('projectFb73EtaFrame('+JSON.stringify({...etaFixture,leds:[
 {id:36,state:'APPROACHING',vehicle:{id:'journey-a'}},
 {id:38,state:'APPROACHING',vehicle:{id:'journey-a'}},
 {id:40,state:'APPROACHING',vehicle:{id:'journey-a'}},
 {id:30,state:'AT_STOP',vehicle:{id:'journey-b'}},
 {id:32,state:'APPROACHING',vehicle:{id:'journey-b'}}
]})+')',context);
assert.equal(future.leds.length,2,'One LED per FB73 journey including approaching journeys');
assert(future.leds.some(item=>item.vehicle.id==='journey-a'&&item.state==='APPROACHING'),'Future ETA should not disappear');
assert(future.leds.some(item=>item.vehicle.id==='journey-b'&&item.id===30),'Nearer AT_STOP has priority for same journey');
assert.match(html,/flybuss\?\[\{\.\.\.item\.vehicle,line:'FB73'/,'FB73 board frames must not require vehicle.line metadata absent from estimated calls');

assert.equal(projected.leds.filter(v=>v.vehicle.id==='UNI:ServiceJourney:trip-42').length,1,'Same FB73 departure cannot light three consecutive stops');


// Screenshot regressions: exercise the producer, collision merge and actual popup.
const journeyId='UNI:ServiceJourney:FB73-169433-47600635';
const etaCall={id:138,vehicleId:journeyId,destination:'Trondheim lufthavn',state:'AT_STOP',deltaSeconds:14,
 profile:{line:{publicCode:'FB73',color:'#ffaa00'}}};
const arrival=board=>renderArrivalFrame({board:{id:board,leds:{count:1282},render:{}},hardware:{leds:{count:1282}},
 now:Date.now(),signalPolicy:SIGNAL_POLICY,estimatedCalls:[etaCall]});
const etaLed=arrival('trondheim-city-lines-catalog').leds[0];
assert.equal(etaLed.vehicle.line,'FB73');
assert.equal(etaLed.vehicle.positionType,'estimated-station-call');
assert.equal(etaLed.vehicle.deltaSeconds,14);
assert(!Object.hasOwn(etaLed.vehicle,'distanceMeters'));
assert(!Object.hasOwn(etaLed.vehicle,'ageSeconds'));
// The historical 147 and dedicated FB73 wire formats are unchanged.
for(const id of ['trondheim-bus-board','trondheim-shared-stops-board','trondheim-flybuss-live'])
 assert.deepEqual(arrival(id).leds[0].vehicle,{id:journeyId});
const gpsLed={id:138,state:'AT_STOP',rgb:[237,83,80],vehicle:{id:'1545',line:'1',destination:'Ranheim',ageSeconds:2,distanceMeters:14}};
const merged=normalizeLedEntries([gpsLed,etaLed],1282)[0];
assert.equal(merged.occupants.length,2);
assert.deepEqual(merged.occupants.map(v=>v.line),['1','FB73']);
el('route').value='atb-bus-1-live';el('route').onchange();await new Promise(resolve=>setImmediate(resolve));
const popup=entry=>{
 el('info').classList.add=()=>{};
 context.popupFrame={...frame,leds:[entry]};
 context.popupLed={dataset:{id:String(entry.id),name:'Buran',direction:'mot Ranheim',state:entry.state,
  vehicle:JSON.stringify(entry.vehicle),occupants:JSON.stringify(entry.occupants||[entry.vehicle])},classList:{contains:()=>false}};
 vm.runInContext('lastFrame=popupFrame;showInfo(popupLed)',context);
 return el('infoBody').innerHTML;
};
const mixedPopup=popup(merged);
assert.match(mixedPopup,/Kjøretøy-ID:<\/strong> 1545/);
assert.match(mixedPopup,/2 s gammel GPS-posisjon/);
assert.match(mixedPopup,/Linje 1 – Ranheim – AT_STOP \(14 m\)/);
assert.match(mixedPopup,/Linje FB73 – Trondheim lufthavn – AT_STOP \(ETA, ikke GPS\)/);
assert(!mixedPopup.includes('Linje ?')&&!mixedPopup.includes('? m'));
const etaPopup=popup({...etaLed,id:997});
assert.match(etaPopup,/Tur-ID:<\/strong> UNI:ServiceJourney:FB73-169433-47600635/);
assert.match(etaPopup,/Linje:<\/strong> FB73/);
assert.match(etaPopup,/Ankomstprognose \(ETA\)/);
assert(!etaPopup.includes('gammel GPS')&&!etaPopup.includes('Live frame'));
const legacyPopup=popup({id:997,state:'AT_STOP',vehicle:{id:journeyId}});
assert.match(legacyPopup,/Linje:<\/strong> Ukjent/,'Never infer route identity from selected profile');
assert.match(legacyPopup,/Ankomstprognose \(ETA\)/,'Old journey-only frames cannot claim GPS');
// All GPS buses remain recorded, but a line 11 view hides line 1 buses
// until the user explicitly enables the all-lines checkbox.
el('route').value='atb-bus-11-live';
el('allRoutes').checked=false;
el('route').onchange();
await new Promise(resolve=>setImmediate(resolve));
const otherLineClasses=new Set();
const stopLed={dataset:{id:'134',name:'Bukkvollan',direction:'mot Blakli'},
 style:{},classList:{
  add(...names){for(const name of names)otherLineClasses.add(name);},
  remove(...names){for(const name of names)otherLineClasses.delete(name);},
  contains(name){return otherLineClasses.has(name);}
 }};
context.document.querySelectorAll=selector=>{
 if(selector==='.led'||selector==='.led[data-id]'||selector==='.led[data-id="134"]')return [stopLed];
 if(selector==='.station-buses'||selector==='.led.on[data-colors]')return [];
 return [];
};
const offRouteItem={id:134,state:'AT_STOP',rgb:[237,83,80],vehicle:{
 id:'line-1-detour',line:'1',destination:'Unexpected',ageSeconds:3,
 distanceMeters:4,positionType:'gps-nearest-stop',routeListedHere:false
},occupants:[{id:'line-1-detour',line:'1',destination:'Unexpected',
 state:'AT_STOP',rgb:[237,83,80],distanceMeters:4,ageSeconds:3,
 positionType:'gps-nearest-stop',routeListedHere:false}]};
vm.runInContext('paint('+JSON.stringify({...frame,boardProfile:'trondheim-city-lines-catalog',
 ledCount:1282,leds:[offRouteItem]})+')',context);
assert(!otherLineClasses.has('on'),'Without the checkbox line 11 view must hide line 1 buses');
assert.equal(stopLed.dataset.vehicle,undefined,'An off-route observation must not enter the selected-line popup');
el('allRoutes').checked=true;
vm.runInContext('paint('+JSON.stringify({...frame,boardProfile:'trondheim-city-lines-catalog',
 ledCount:1282,leds:[offRouteItem]})+')',context);
assert(otherLineClasses.has('on'),'Opt-in all-lines view must show line 1 at a line 11 stop');
assert.equal(JSON.parse(stopLed.dataset.vehicle).line,'1');
const offRoutePopup=popup(offRouteItem);
assert.match(offRoutePopup,/Linje:<\/strong> 1/);
assert.match(offRoutePopup,/Nærmeste registrerte plattform/);
assert.match(offRoutePopup,/GPS bekrefter ikke faktisk stopp/);
assert.match(offRoutePopup,/Linjen er ikke registrert på denne plattformen/);
const conflictItem={...offRouteItem,state:'APPROACHING',vehicle:{...offRouteItem.vehicle,
 line:'11',destination:'Blakli',platformEvidence:'direction-conflict',platformConfirmed:false,
 withinStopRadius:true},occupants:[{...offRouteItem.occupants[0],line:'11',
 destination:'Blakli',state:'APPROACHING',platformEvidence:'direction-conflict'}]};
vm.runInContext('paint('+JSON.stringify({...frame,boardProfile:'trondheim-city-lines-catalog',
 ledCount:1282,leds:[conflictItem]})+')',context);
assert(otherLineClasses.has('unconfirmed'),'Direction conflict needs a visible question marker');
const conflictPopup=popup(conflictItem);
assert.match(conflictPopup,/Destinasjonen stemmer ikke med plattformens retning/);
assert.match(conflictPopup,/GPS innenfor stoppradius \(ikke bekreftet stans\)/);
const inferredItem={...conflictItem,vehicle:{...conflictItem.vehicle,
 platformEvidence:'route-destination',withinStopRadius:false},occupants:[{
 ...conflictItem.occupants[0],platformEvidence:'route-destination'}]};
vm.runInContext('paint('+JSON.stringify({...frame,boardProfile:'trondheim-city-lines-catalog',
 ledCount:1282,leds:[inferredItem]})+')',context);
assert(!otherLineClasses.has('unconfirmed'),'Question marker clears when evidence changes');
assert.match(popup(inferredItem),/Plattform valgt ut fra linje og destinasjon/);
assert.match(popup(inferredItem),/GPS i nærheten \(ikke bekreftet stans\)/);
el('allRoutes').checked=false;
vm.runInContext('paint('+JSON.stringify({...frame,leds:[inferredItem]})+')',context);
assert.match(el('legend').innerHTML,/mot Stavset/);
assert.match(el('legend').innerHTML,/mot Blakli/);
context.document.querySelectorAll=originalQuery;

// Regression: GPS may detect buses from any route at a physical stop,
// but single-line Linear view must display ONLY the selected line.
const mixedStop={
 id:134,state:'AT_STOP',lifecycle:'PASSED',rgb:[220,45,50],
 vehicle:{id:'line1-primary',line:'1',destination:'Ranheim',ageSeconds:2},
 occupants:[
  {id:'line1-primary',line:'1',destination:'Ranheim',state:'AT_STOP',rgb:[220,45,50],ageSeconds:2},
  {id:'line11-secondary',line:'11',destination:'Blakli',state:'APPROACHING',rgb:[70,190,85],ageSeconds:2,positionType:'gps-nearest-stop'}
 ]
};
const otherOnly={id:135,state:'AT_STOP',rgb:[220,45,50],
 vehicle:{id:'line1-only',line:'1',destination:'Ranheim'},
 occupants:[{id:'line1-only',line:'1',state:'AT_STOP',rgb:[220,45,50]}]};
const testFrame={...frame,boardProfile:'trondheim-city-lines-catalog',ledCount:1282,leds:[mixedStop,otherOnly]};
el('route').value='atb-bus-11-live';
el('route').onchange();
await new Promise(resolve=>setImmediate(resolve));
el('allRoutes').checked=false;
let result=JSON.parse(vm.runInContext('JSON.stringify(selectVisibleItems(filterFrame, new Set(["134","135"])))',
  Object.assign(context,{filterFrame:testFrame})));
assert.equal(result.length,1,'Single-line view must not show a stop occupied only by other lines');
assert.equal(result[0].id,134);
assert.equal(result[0].occupants.length,1,'Selected view must not expose additional line occupants');
assert.equal(result[0].vehicle.line,'11','Do not show the other line as primary');
assert.equal(result[0].vehicle.id,'line11-secondary');
assert.deepEqual(result[0].rgb,[70,190,85],'Selected line must supply its own LED color');
assert.equal(result[0].state,'APPROACHING','Use selected line state');
assert.equal(result[0].lifecycle,'APPROACHING','Other line PASSED must not mask selected line');
assert.match(html,/Viser kun busser på valgt linje/,'Default view must explain selected-line visibility (staging warning can override the live note)');

// Enabling checkbox reveals the same registered stops with all GPS bus lines.
el('allRoutes').checked=true;
result=JSON.parse(vm.runInContext('JSON.stringify(selectVisibleItems(filterFrame, new Set(["134","135"])))',context));
assert.equal(result.length,2,'All-lines mode reveals otherwise hidden vehicles at registered stops');
assert.deepEqual(result[0].occupants.map(v=>v.line),['1','11']);
assert.equal(result[1].vehicle.line,'1');
assert.equal(testFrame.leds[0].occupants.length,2,'Presentation must not mutate original GPS frame');
// Switching back must restore line-only filter without changing backend.
el('allRoutes').checked=false;
result=JSON.parse(vm.runInContext('JSON.stringify(selectVisibleItems(filterFrame, new Set(["134","135"])))',context));
assert.deepEqual(result.map(v=>v.id),[134]);

// Flybuss ETA does not always carry a line identifier in legacy source frames.
el('route').value='flybuss-trondheim-fb73-live';
el('route').onchange();await new Promise(resolve=>setImmediate(resolve));
const legacyFlyFrame={...frame,boardProfile:'trondheim-flybuss-live',leds:[{
  id:36,state:'AT_STOP',rgb:[255,170,0],vehicle:{id:'UNI:ServiceJourney:test'}
}]};
const legacyShown=JSON.parse(vm.runInContext('JSON.stringify(selectVisibleItems(flyFrame,new Set(["36"])))',
  Object.assign(context,{flyFrame:legacyFlyFrame})));
assert.equal(legacyShown.length,1,'ETA flight-bus frame should remain visible');
assert.equal(legacyShown[0].occupants[0].line,'FB73');
assert.match(read('web/linear/network/map.js'),/function activeLine\(\)\{return playback\|\|context\.all\?null:context\.line;\}/,
 'Schematic map must filter selected route until all-lines checkbox is selected');

// Strict dual projection never paints unresolved GPS as a stop occupant.
el('route').value='atb-bus-11-live';el('route').onchange();await new Promise(resolve=>setImmediate(resolve));
const strictFrame={...frame,boardProfile:'trondheim-city-lines-catalog',ledCount:1282,
 gpsMatchingPolicy:'strict-route-quay-v1',leds:[],gpsObservations:[
 {id:'ambiguous-11',line:'11',destination:'Blakli',status:'unresolved',reason:'competing-quay',latitude:63.4,longitude:10.3},
 {id:'other-line-bus',line:'1',destination:'Ranheim',status:'unresolved',reason:'route-or-direction-unresolved',latitude:63.5,longitude:10.4}]};
el('allRoutes').checked=false;context.strictFrame=strictFrame;
vm.runInContext('paint(strictFrame)',context);
assert.match(el('diagUnresolved').innerHTML,/ambiguous-11/);assert(!el('diagUnresolved').innerHTML.includes('other-line-bus'));
assert.equal(String(el('diagAtStop').textContent),'0');assert.match(el('diagNote').textContent,/ingen aktiv LED/);
el('allRoutes').checked=true;vm.runInContext('paint(strictFrame)',context);
assert.match(el('diagUnresolved').innerHTML,/other-line-bus/);
assert.match(el('diagUnresolved').innerHTML,/63.4/);
assert.equal(strictFrame.leds.length,0);

console.log('Linear HTML, full Bus1 147 mapping, popup evidence, mobile defaults, GPS Debug PASS');

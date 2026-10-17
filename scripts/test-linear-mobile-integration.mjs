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
for(const [id,count] of [['trondheim-bus-board',147],['trondheim-shared-stops-board',147],['trondheim-city-lines-catalog',1282],['trondheim-flybuss-live',46]]){
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
assert.equal(clients.at(-1).boardId,boardId);assert.equal(clients.at(-1).ledCount,147);assert.equal(clients.at(-1).origin,'https://transitcore-linear-staging.lgb84.workers.dev');
assert(!el('allRoutes').disabled);
for(const [route,multi,id,count] of [
 ['atb-bus-1-live',false,'trondheim-bus-board',147],
 ['atb-bus-2-live',true,'trondheim-shared-stops-board',147],
 ['atb-bus-10-live',false,'trondheim-city-lines-catalog',1282],
 ['flybuss-trondheim-fb73-live',false,'trondheim-flybuss-live',46]]){
 el('route').value=route;el('allRoutes').checked=multi;el('route').onchange();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(el('source').value,'staging');assert.equal(clients.at(-1).boardId,id);assert.equal(clients.at(-1).ledCount,count);assert(clients.at(-1).origin);
 const rows=el('rows').innerHTML;const ids=[...rows.matchAll(/data-id="(\d+)"/g)].map(m=>Number(m[1]));assert(ids.length);assert(ids.every(i=>i>=0&&i<count));
 el('source').value='production';await el('source').onchange();assert.equal(el('route').value,route);assert.equal(clients.at(-1).boardId,id);assert.equal(clients.at(-1).ledCount,count);assert(!clients.at(-1).origin);
 el('source').value='staging';await el('source').onchange();assert.equal(clients.at(-1).boardId,id);
}

console.log('Linear HTML, four profiles, source/route switching and authoritative PASSED/expiry PASS');

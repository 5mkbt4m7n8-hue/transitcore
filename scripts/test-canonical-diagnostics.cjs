const assert=require('node:assert/strict');
const Frames=require('../web/shared/canonical-frame-client.js');
const element=()=>({children:[],style:{},textContent:'',append(...children){this.children.push(...children);}});
global.document={body:element(),createElement:element};
(async()=>{
 let now=Date.parse('2026-10-14T12:00:00Z');
 const frame={schemaVersion:1,boardProfile:'test-board',generatedAt:new Date(now).toISOString(),sequence:1,ttlSeconds:30,ledCount:8,leds:[]};
 const c=Frames.create({boardId:'test-board',ledCount:8,clock:()=>now,monotonic:()=>0,fetchImpl:async()=>Response.json({boardId:'test-board',sequence:1,generatedAt:frame.generatedAt,status:'CURRENT',uncertain:true,observations:[]})});
 c.accept(frame);c.snapshot();const panel=document.body.children[0],button=panel.children[2],evidence=panel.children[3];
 await button.onclick();assert(evidence.textContent.startsWith('SAMME FRAME'));
 c.accept({...frame,sequence:2});c.snapshot();assert(evidence.textContent.includes('tidligere frame'));
 await button.onclick();assert(evidence.textContent.startsWith('IKKE BEKREFTET SAMME FRAME'));
 c.snapshot();assert(evidence.textContent.includes('tidligere frame'));
 const draft=Frames.create({boardId:'test-board',ledCount:8,published:false});
 assert(button.disabled);assert.equal((await draft.diagnostics()).status,'DRAFT');
 assert(evidence.textContent.includes('UTKAST'));
 delete global.document;console.log('Diagnostic sequence invalidation, mismatch and draft isolation PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});

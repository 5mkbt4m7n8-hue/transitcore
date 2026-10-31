import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderedGpsConflicts,SCOPE}
 from '../worker/trondheim-rendered-gps-conflicts.mjs';
import {recordScheduledTrondheimFrame,dayHistoryStorage}
 from '../worker/trondheim-history.mjs';
import {summarizeMultiLineFrame,validatedMultiLineQuality,rollupMultiLineQuality}
 from '../worker/trondheim-multiline-quality.mjs';
const A='NSR:Quay:102733',B='NSR:Quay:102734';
const board={id:'trondheim-city-lines-catalog',nodes:[
 {led:8,quayId:A,routes:['atb-bus-1-live']},
 {led:9,quayId:B,routes:['atb-bus-1-live']},
 {led:10,quayId:'NSR:Quay:900',routes:['atb-bus-11-live']},
 {led:12,quayId:A,routes:['atb-bus-1-live']},
 {led:12,quayId:B,routes:['atb-bus-1-live']}
]};
const at=new Date(Date.now()-1000).toISOString();
const secret='ATB:Vehicle:PRIVATE-NO-PERSIST';
const occupant=(id,extra={})=>({id,line:'1',state:'APPROACHING',
 positionType:'gps-nearest-stop',platformEvidence:'direction-conflict',
 nearestQuayLed:8,routeListedHere:true,withinStopRadius:true,
 ...extra});
const frame={schemaVersion:1,boardProfile:board.id,generatedAt:at,
 sequence:Math.floor(Date.parse(at)/1000),ttlSeconds:30,ledCount:20,
 leds:[
 {id:8,state:'APPROACHING',occupants:[
  occupant(secret),
  occupant(secret),
  occupant('NORMAL',{platformEvidence:'route-destination'}),
  occupant('GPS-ONLY',{platformEvidence:'gps-only'}),
  occupant('FAR',{withinStopRadius:false}),
  occupant('WRONG-LED',{nearestQuayLed:9}),
  occupant('WRONG-ROUTE',{line:'11'}),
  occupant('NOT-LISTED',{routeListedHere:false}),
  occupant('NO-ID',{id:null})]},
 {id:12,state:'APPROACHING',occupants:[occupant('AMBIGUOUS',{nearestQuayLed:12})]},
 {id:9,state:'APPROACHING',occupants:[occupant('SECOND',{
  nearestQuayLed:9,platformEvidence:'direction-conflict'})]}
 ]};
const issues=renderedGpsConflicts(frame,board);
assert.equal(issues.length,2);
assert.deepEqual(issues.map(x=>x.nearestQuayId),[A,B]);
assert(issues.every(x=>x.status==='unresolved'&&x.line==='1'));
assert.equal(issues[0].vehicleRef,secret,'Kept only in ephemeral quality computation');
const scoped={...frame,gpsObservations:issues,gpsObservationScope:SCOPE};
const stats=summarizeMultiLineFrame(scoped,board);
assert.equal(stats.diagnosticAvailable,true);
assert.equal(stats.diagnosticScope,SCOPE);
assert.equal(stats.issuesComplete,true);
assert.equal(stats.lines['1'].unresolved,2);
assert.deepEqual(stats.issues,[['1',A,1],['1',B,1]]);
assert(!JSON.stringify(stats).includes(secret));
assert(!JSON.stringify(stats).includes('PRIVATE'));
assert.deepEqual(validatedMultiLineQuality(stats),stats);
const sum=rollupMultiLineQuality(null,null,{status:'OK',lineQuality:stats});
assert.equal(sum.issueCoverageSamples,1);
assert.equal(sum.renderedScopeSamples,1);
assert.equal(sum.quayIssues['1|'+A].frames,1);
assert.equal(sum.quayIssues['1|'+B].hits,1);
const replaced=rollupMultiLineQuality(sum,{status:'OK',lineQuality:stats},null);
assert.equal(replaced.issueCoverageSamples,0);
assert.equal(replaced.renderedScopeSamples,0);
assert.deepEqual(replaced.quayIssues,{});
assert.equal(renderedGpsConflicts({...frame,boardProfile:'wrong'},board),null);
assert.equal(renderedGpsConflicts({...frame,leds:[]},board).length,0);
class Storage{
 data=new Map();
 async get(k){return this.data.get(k)}
 async put(k,v){this.data.set(k,structuredClone(v))}
 async delete(k){this.data.delete(k)}
 async list({prefix='',limit=1000,startAfter=''}){return new Map([...this.data]
  .filter(([k])=>k.startsWith(prefix)&&k>startAfter)
  .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))}
}
const store=new Storage();
const env={DEVICE_STATUS:{idFromName:x=>x,get:()=>({
 fetch:(url,opts)=>dayHistoryStorage(store,new Request(url,opts))
})}};
const before=JSON.stringify(frame);
const out=await recordScheduledTrondheimFrame(env,frame,'',at,board);
assert.equal(out.status,'OK');
assert.equal(JSON.stringify(frame),before,'Input frame must not be mutated');
let index=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
assert.equal(index.days[0].multiLineQuality.renderedScopeSamples,1);
assert.equal(index.days[0].multiLineQuality.diagnosticSamples,1);
const day=index.days[0].day;
const stored=await dayHistoryStorage(store,new Request(
 'https://status.internal/trondheim-history?day='+day)).then(r=>r.json());
assert.equal(stored.records[0].lineQuality.diagnosticScope,SCOPE);
assert.equal(stored.records[0].lineQuality.issuesComplete,true);
assert(!JSON.stringify(stored.records[0]).includes(secret),
 'Raw test vehicle IDs are forbidden in quality-only fields, but compact LED history legitimately retains IDs');
assert.deepEqual(stored.records[0].lineQuality.issues,[['1',A,1],['1',B,1]]);
// A different helper proof: a valid empty GPS frame still has inspected scope,
// but nobody can infer a physical departure from no visible occupants.
const clean={...frame,leds:[],generatedAt:new Date(Date.now()+301000).toISOString(),
 sequence:Math.floor((Date.now()+301000)/1000)};
await recordScheduledTrondheimFrame(env,clean,'',clean.generatedAt,board);
index=await dayHistoryStorage(store,new Request('https://status.internal/trondheim-history')).then(r=>r.json());
assert.equal(index.days[0].multiLineQuality.renderedScopeSamples,2);
assert.equal(index.days[0].multiLineQuality.lines['1'].unresolved,2);

const doc=readFileSync(new URL('../docs/trondheim-multiline-quality.md',import.meta.url),'utf8');
assert(doc.includes('rendered-direction-conflict-only'));
const wf=readFileSync(new URL('../.github/workflows/linear-mobile.yml',import.meta.url),'utf8');
assert(wf.includes('node scripts/test-trondheim-rendered-gps-conflicts.mjs'));
console.log('Trondheim GPS quality scope: explicit conflicts only, no inference, ephemeral vehicle IDs, honest limited coverage and unchanged frame PASS');

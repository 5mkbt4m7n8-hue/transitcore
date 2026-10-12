import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STOP_POLICY, gpsEvidence, callEvidence} from '../core/engines/stop-evidence.mjs';
import {reduceStop} from '../core/engines/stop-lifecycle-candidate.mjs';
import {normalizeStopCall} from '../core/providers/entur/stop-call-evidence.mjs';
import {createStopAccuracyShadow} from '../core/frame/stop-accuracy-shadow.mjs';
import {buildPixelFrame} from '../core/frame/build-frame.mjs';
import worker,{SIGNAL_POLICY,applyMotionLifecycle} from '../worker/led-feed-worker.mjs';
import {loadDiagnosticContext,legacyCalls,createComparison} from './diagnose-stop-accuracy.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const board=read('config/boards/trondheim-bus-1-visual-test.json');
const hardware=read('config/hardware/trondheim-bus-1-visual-test-hardware.json');
const profile=read('config/routes/atb-bus-1-live.json');
const context={board,hardware,profiles:[profile],signalPolicy:SIGNAL_POLICY};
const epoch=Date.parse('2026-10-12T10:00:00Z');
const node=board.nodes[0];
const observation=(t,m)=>({observedAt:epoch+t*1000,lat:node.lat+m/111195,lon:node.lon,distanceMeters:Math.abs(m),directionMatched:true});
const vehicle=(t,m,id='bus-a')=>({id,lineId:profile.line.id,publicCode:'1',destination:'Kattem',latitude:observation(t,m).lat,longitude:node.lon,timestamp:new Date(epoch+t*1000).toISOString()});
const effective=led=>led?.lifecycle||led?.state||'OFF';
let assertions=0;
function check(label,fn){fn();assertions++;console.log('PASS '+label);}
assert.throws(()=>reduceStop(null,{},epoch),/disabled/);
assert.throws(()=>createStopAccuracyShadow(context),/enabled/);

function sequence(samples) {
  const shadow=createStopAccuracyShadow(context,{enabled:true}); let history={};
  return samples.map(([t,m])=>{
    const now=epoch+t*1000,vehicles=[vehicle(t,m)];
    const baseline=buildPixelFrame({...context,now,vehicles},{validate:true});
    const lifecycle=applyMotionLifecycle(baseline,history,now);history=lifecycle.state;
    const proposed=shadow.step({now,vehicles});
    return {t,old:effective(baseline.leds.find(x=>x.id===0)),oldWithLifecycle:effective(lifecycle.frame.leds.find(x=>x.id===0)),
      proposed:effective(proposed.frame.leds.find(x=>x.id===0))};
  });
}
const comparisons=[];
for(const [name,stopEnd] of [['normal',40],['short',30],['long',160]]) {
  const samples=[[0,140],[10,50],[20,4],[30,4]];
  for(let t=40;t<=stopEnd;t+=10)samples.push([t,4]);
  samples.push([stopEnd+10,-22],[stopEnd+20,-45],[stopEnd+30,-70],[stopEnd+40,-110],[stopEnd+50,-160]);
  const rows=sequence(samples);
  check(name+' arrival/departure',()=>{
    assert.equal(rows.find(x=>x.proposed==='AT_STOP').t,30);
    assert.equal(rows.find(x=>x.proposed==='PASSED').t,stopEnd+20);
    assert.equal(rows.find(x=>x.oldWithLifecycle==='PASSED').t,stopEnd+40);
    assert.equal(rows.find(x=>x.t===stopEnd+30).proposed,'OFF');
  });
  comparisons.push({scenario:name,simulatedFirstMovingSample:stopEnd+10,oldDeparture:stopEnd+40,newDeparture:stopEnd+20,earlierSeconds:20,transitions:rows});
}
check('queue outside close stop zone: no false arrival',()=>assert(sequence([[0,140],[10,50],[20,50],[30,50],[40,50]]).every(x=>x.proposed!=='AT_STOP')));
check('passing without stop: no false arrival/departure',()=>assert(sequence([[0,140],[10,50],[20,4],[30,-60],[40,-120]]).every(x=>!['AT_STOP','PASSED'].includes(x.proposed))));
check('GPS jitter around arrival: no false departure',()=>{
  const rows=sequence([[0,140],[10,50],[20,4],[30,4],[40,9],[50,2],[60,10],[70,3]]);
  assert(rows.filter(x=>x.t>=30).every(x=>x.proposed==='AT_STOP'));
});
check('duplicate/out-of-order do not confirm arrival',()=>{
  const shadow=createStopAccuracyShadow(context,{enabled:true});
  shadow.step({now:epoch,vehicles:[vehicle(0,4)]});
  assert.equal(effective(shadow.step({now:epoch+10000,vehicles:[vehicle(0,4)]}).frame.leds[0]),'APPROACHING');
  assert.equal(effective(shadow.step({now:epoch+20000,vehicles:[vehicle(-1,4)]}).frame.leds[0]),'APPROACHING');
});
check('missing/stale/future/jump data does not manufacture departure',()=>{
  for(const delta of [31000,-1000]) assert(gpsEvidence(observation(0,4),null,epoch+delta).invalid);
  assert(gpsEvidence(observation(1,500),observation(0,4),epoch+1000).invalid);
  const shadow=createStopAccuracyShadow(context,{enabled:true});
  shadow.step({now:epoch,vehicles:[vehicle(0,4)]}); shadow.step({now:epoch+10000,vehicles:[vehicle(10,4)]});
  assert.equal(shadow.step({now:epoch+20000,vehicles:[]}).frame.leds.length,0);
  assert.equal(effective(shadow.step({now:epoch+60000,vehicles:[vehicle(60,4)]}).frame.leds[0]),'APPROACHING');
});
check('two vehicles same LED keep occupants and priority',()=>{
  const shadow=createStopAccuracyShadow(context,{enabled:true});
  shadow.step({now:epoch,vehicles:[vehicle(0,4),vehicle(0,50,'bus-b')]});
  const {frame}=shadow.step({now:epoch+10000,vehicles:[vehicle(10,4),vehicle(10,50,'bus-b')]});
  assert.equal(frame.leds[0].occupants.length,2);assert.equal(frame.leds[0].state,'AT_STOP');
});
check('unknown direction and wrong line cannot arrive',()=>{
  const shadow=createStopAccuracyShadow(context,{enabled:true});
  assert.equal(shadow.step({now:epoch,vehicles:[{...vehicle(0,4),destination:''}]}).frame.leds.length,0);
  assert.equal(shadow.step({now:epoch,vehicles:[{...vehicle(0,4),lineId:'NBU:Line:FB73'}]}).frame.leds.length,0);
});
const baseCall={receivedAt:epoch,expectedArrival:epoch,expectedDeparture:epoch+10000,realtime:true};
check('ETA never becomes confirmed physical arrival',()=>{
  assert.equal(callEvidence({...baseCall,receivedAt:epoch-10000},epoch-10000).arrived,false);
  assert.equal(callEvidence(baseCall,epoch).confidence,'forecast');
  assert.equal(callEvidence({...baseCall,realtime:false},epoch).confidence,'timetable');
});
check('estimated departure ends arrival window 40 seconds earlier at 10s sampling',()=>{
  let state;const rows=[];
  for(let t=-60;t<=60;t+=10){const now=epoch+t*1000;state=reduceStop(state,callEvidence({...baseCall,receivedAt:now},now),now,{enabled:true});
    const old=Math.abs(t)<=45?'AT_STOP':t<0?'APPROACHING':'OFF';rows.push({t,old,proposed:state.state});}
  assert.equal(rows.find(x=>x.proposed==='PASSED').t,10);
  assert.equal(rows.find(x=>x.t>0 && x.old==='OFF').t,50);
  comparisons.push({scenario:'estimated call; simulated departure t=10',oldAtStopEnds:50,newAtStopEnds:10,earlierSeconds:40,transitions:rows});
});
check('delayed forecast, bounded dwell, cancellation, stale calls',()=>{
  assert.equal(callEvidence({...baseCall,expectedArrival:epoch+60000,expectedDeparture:epoch+70000},epoch).approaching,true);
  assert.equal(callEvidence({...baseCall,receivedAt:epoch+20000,expectedDeparture:epoch+120000},epoch+20000).departed,true);
  assert.equal(callEvidence({...baseCall,cancelled:true},epoch).cancelled,true);
  assert.equal(callEvidence(baseCall,epoch+31000).invalid,true);
  assert.equal(callEvidence({...baseCall,predictionInaccurate:true},epoch).invalid,true);
});
check('actual arrival/departure precedence and long reported stop',()=>{
  const call={...baseCall,actualArrival:epoch,expectedDeparture:epoch+120000,receivedAt:epoch+30000};
  assert.equal(callEvidence(call,epoch+30000).arrived,true);
  assert.equal(callEvidence(call,epoch+30000).confidence,'reported');
  assert.equal(callEvidence({...call,actualDeparture:epoch+20000},epoch+30000).reason,'reported actual departure');
});
check('call adapter identity, date, quay and schedule vs actual',()=>{
  const c=normalizeStopCall({date:'2026-10-12',aimedArrivalTime:new Date(epoch).toISOString(),actualArrivalTime:null,realtime:false,
    serviceJourney:{id:'UNI:ServiceJourney:trip',journeyPattern:{line:{id:'UNI:Line:FB73',publicCode:'FB73'}}}},'NSR:Quay:100211',epoch);
  assert.equal(c.actualArrival,null);assert.equal(c.expectedArrival,epoch);assert.equal(c.lineId,'UNI:Line:FB73');assert.equal(c.serviceDate,'2026-10-12');assert.equal(c.quayId,'NSR:Quay:100211');
});
check('PixelFrame remains v1 and missing history expires',()=>{
  const shadow=createStopAccuracyShadow(context,{enabled:true});
  const {frame}=shadow.step({now:epoch,vehicles:[vehicle(0,4)]});
  assert.equal(frame.schemaVersion,1);assert.equal(frame.ledCount,8);
  shadow.step({now:epoch+STOP_POLICY.retentionMs+1});assert.equal(shadow.historySize,0);
});
check('revised delayed ETA may reopen estimated visit, not actual departure',()=>{
  const at=epoch+10000;
  const passed=reduceStop(null,callEvidence({...baseCall,receivedAt:at},at),at,{enabled:true});
  const later={...baseCall,receivedAt:epoch+20000,expectedArrival:epoch+60000,expectedDeparture:epoch+70000};
  assert.equal(reduceStop(passed,callEvidence(later,epoch+20000),epoch+20000,{enabled:true}).state,'APPROACHING');
  assert.equal(reduceStop({...passed,departureConfidence:'reported'},callEvidence(later,epoch+20000),epoch+20000,{enabled:true}).state,'OFF');
});
check('sub-poll short stop is not falsely claimed detected',()=>{
  assert(sequence([[0,50],[10,4],[20,-50],[30,-110]]).every(x=>x.proposed!=='AT_STOP'));
});
check('GPS latching prevents regression; departing occupant cannot hide active bus',()=>{
  const shadow=createStopAccuracyShadow(context,{enabled:true});let result;
  for(const [t,a,b] of [[0,4,50],[10,4,50],[20,-22,4],[30,-45,4]])result=shadow.step({now:epoch+t*1000,vehicles:[vehicle(t,a),vehicle(t,b,'bus-b')]});
  assert.equal(result.frame.leds[0].state,'AT_STOP');assert.equal(result.frame.leds[0].vehicle.id,'bus-b');
  assert(result.frame.leds[0].occupants.some(x=>x.id==='bus-a' && x.state==='PASSED'));
  const regression=shadow.step({now:epoch+40000,vehicles:[vehicle(40,4)]});
  assert.equal(regression.frame.leds.length,0);
});
check('full call mapping uses exact line/quay/service date, not NBU',()=>{
  const ctx=loadDiagnosticContext('flybuss-trondheim-fb73-live'),p=ctx.profiles[0];
  const n=ctx.board.nodes.find(n=>n.routeDirections?.[p.id]?.destinationMatches?.length);
  const call={...baseCall,id:'UNI:ServiceJourney:test',lineId:p.line.id,serviceDate:'2026-10-12',quayId:n.stopIds[0],destination:n.routeDirections[p.id].destinationMatches[0]};
  const shadow=createStopAccuracyShadow(ctx,{enabled:true});
  assert.equal(shadow.step({now:epoch,calls:[call,call]}).frame.leds.length,1);
  for(const bad of [{lineId:'NBU:Line:FB73'},{quayId:'NSR:Quay:wrong'},{serviceDate:null},{destination:'wrong direction'}])
    assert.equal(createStopAccuracyShadow(ctx,{enabled:true}).step({now:epoch,calls:[{...call,...bad}]}).frame.leds.length,0);
  assert.equal(legacyCalls(ctx,[call],epoch+40000)[0].state,'AT_STOP');
  assert.equal(legacyCalls(ctx,[call],epoch+50000).length,0);
  assert(createComparison(ctx)({now:epoch,calls:[call]}).comparisons.length>0);
});
check('older call response cannot undo newer cancellation/state',()=>{
  const state=reduceStop(null,callEvidence({...baseCall,receivedAt:epoch+10000,cancelled:true},epoch+10000),epoch+10000,{enabled:true});
  assert.equal(state.observedAt,epoch+10000);
  assert.equal(reduceStop(state,callEvidence(baseCall,epoch+15000),epoch+15000,{enabled:true}).state,'OFF');
});
// Compare the ETA oracle to the unchanged real Worker route, not only a copy
// of the formula. Network and clock are isolated fixtures, never production.
const savedFetch=globalThis.fetch,savedNow=Date.now;
try {
  const ctx=loadDiagnosticContext('flybuss-trondheim-fb73-live'),p=ctx.profiles[0];
  const n=ctx.board.nodes.find(n=>n.routeDirections?.[p.id]?.destinationMatches?.length);
  const raw={date:'2026-10-12',realtime:true,expectedArrivalTime:new Date(epoch).toISOString(),expectedDepartureTime:new Date(epoch+10000).toISOString(),
    destinationDisplay:{frontText:n.routeDirections[p.id].destinationMatches[0]},serviceJourney:{id:'UNI:ServiceJourney:fixture',journeyPattern:{line:p.line}}};
  const c=normalizeStopCall(raw,n.stopIds[0],epoch);
  globalThis.fetch=async(url,options)=>{
    const path=String(url).split('/main/')[1];
    if(path?.startsWith('config/boards/'))return Response.json(ctx.board);
    if(path?.startsWith('config/hardware/'))return Response.json(ctx.hardware);
    if(path?.startsWith('config/routes/'))return Response.json(p);
    if(String(url)===p.positioning.endpoint){const query=JSON.parse(options.body).query,data={};
      for(const m of query.matchAll(/(q\d+):quay\(id:"([^"]+)"/g))data[m[1]]={estimatedCalls:m[2]===n.stopIds[0]?[raw]:[]};
      return Response.json({data});}
    throw Error('Unexpected request in isolated ETA comparison');
  };
  for(const t of [-60,-40,0,10,40,50]) {
    const now=epoch+t*1000;Date.now=()=>now;
    const response=await worker.fetch(new Request('https://worker.test/api/v1/frame/'+ctx.board.id),{});
    assert.equal(response.status,200);
    const actual=await response.json();
    const expected=buildPixelFrame({...ctx,now,estimatedCalls:legacyCalls(ctx,[c],now)},{strategy:'estimated-calls'});
    assert.deepEqual(actual.leds,expected.leds);
  }
  assertions++;console.log('PASS 6 ETA oracle/real Worker route comparisons');
} finally {globalThis.fetch=savedFetch;Date.now=savedNow;}
console.log(JSON.stringify({synthetic:true,comparisons},null,2));
console.log('Stop accuracy checks passed: '+assertions);

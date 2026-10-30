import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {updateRouteProgress} from '../core/engines/route-progress.mjs';

const load=id=>JSON.parse(readFileSync(new URL('../config/routes/'+id+'.json',import.meta.url)));
const p11=load('atb-bus-11-live'), p1=load('atb-bus-1-live');
const epoch=Date.parse('2026-10-29T12:00:00Z');
function position(profile,index,s,id='bus-1'){
  const stop=profile.stops[index];
  return {id,publicCode:String(profile.line.publicCode),destination:profile.directions[0].destinationMatches[0],
    latitude:stop.lat,longitude:stop.lon,timestamp:new Date(epoch+s*1000).toISOString()};
}
function run(profile,indices,steps=[0,20,40]){
  let state={tracks:{}},results=[];
  for(let i=0;i<indices.length;i++){
    const v=position(profile,indices[i],steps[i]);
    const output=updateRouteProgress({profiles:[profile],vehicles:[v],previousState:state,now:Date.parse(v.timestamp)+1000});
    state=output.state;results.push(output.results[0]);
  }
  return {state,results};
}
const forward=run(p11,[0,1,2]);
assert.equal(forward.results[0].status,'unresolved');
assert.equal(forward.results[1].status,'unresolved');
assert.equal(forward.results[2].status,'direction-tracked');
assert.equal(forward.results[2].orientation,'forward');
assert.equal(forward.results[2].directionLabel,'mot Stavset');
assert(!('AT_STOP' in forward.results[2]));
const reverse=run(p11,[7,6,5]);
assert.equal(reverse.results[2].status,'direction-tracked');
assert.equal(reverse.results[2].orientation,'reverse');
assert.equal(reverse.results[2].directionLabel,'mot Blakli');
assert.equal(run(p1,[0,1,2],[0,45,90]).results[2].directionLabel,'sørover');
const one=position(p11,0,0);
const first=updateRouteProgress({profiles:[p11],vehicles:[one],now:epoch+1000});
const repeat=updateRouteProgress({profiles:[p11],vehicles:[one],previousState:first.state,now:epoch+2000});
assert.equal(repeat.results[0].status,'unresolved');
assert.equal(repeat.results[0].checkpointCount,1);
const lockedDuplicate=updateRouteProgress({
 profiles:[p11],vehicles:[position(p11,2,40)],previousState:forward.state,now:epoch+41000});
assert.equal(lockedDuplicate.results[0].status,'direction-tracked','Repeated identical GPS timestamp cannot drop valid progress');
const lockedConflict=updateRouteProgress({profiles:[p11],
 vehicles:[{...position(p11,2,40),latitude:p11.stops[2].lat+0.00001}],
 previousState:forward.state,now:epoch+41000});
assert.equal(lockedConflict.results[0].status,'unresolved','Changed position at same timestamp invalidates lock');
const outOfOrder=updateRouteProgress({profiles:[p11],
 vehicles:[position(p11,2,39)],previousState:forward.state,now:epoch+41000});
assert.equal(outOfOrder.results[0].reason,'out-of-order-sample');
assert.deepEqual(outOfOrder.state.tracks['11:bus-1'],forward.state.tracks['11:bus-1']);
const older=updateRouteProgress({profiles:[p11],vehicles:[{...one,timestamp:new Date(epoch-1000).toISOString()}],previousState:first.state,now:epoch+3000});
assert.equal(older.results[0].checkpointCount,1);
const stale=updateRouteProgress({profiles:[p11],vehicles:[one],previousState:first.state,now:epoch+60000});
assert.equal(stale.results[0].status,'unresolved');
assert.equal(stale.results[0].reason,'invalid-or-stale');
const largeGap=updateRouteProgress({profiles:[p11],vehicles:[position(p11,1,220)],previousState:first.state,now:epoch+221000});
assert.equal(largeGap.results[0].checkpointCount,1,'Long gaps cannot carry direction evidence');
const newRoute=structuredClone(p11);newRoute.stops=[...newRoute.stops].reverse();
const changed=updateRouteProgress({profiles:[newRoute],vehicles:[position(p11,1,20)],previousState:first.state,now:epoch+21000});
assert.equal(changed.results[0].checkpointCount,1,'Route revision resets checkpoint history');
let state=forward.state;
const reversal=position(p11,1,60);
const reversed=updateRouteProgress({profiles:[p11],vehicles:[reversal],previousState:state,now:epoch+61000});
assert.equal(reversed.results[0].status,'unresolved','A backwards sample drops the lock');
assert.equal(reversed.results[0].orientation,null);
const jump=updateRouteProgress({profiles:[p11],vehicles:[position(p11,20,41)],previousState:forward.state,now:epoch+42000});
assert.equal(jump.results[0].status,'unresolved','GPS jump must drop confidence');
const unknown=updateRouteProgress({profiles:[p11],vehicles:[position(p1,0,0)],now:epoch+1000});
assert.equal(unknown.results[0].status,'unresolved');
const combined=updateRouteProgress({profiles:[p11,p1],vehicles:[position(p11,0,0,'a'),position(p1,0,0,'b')],now:epoch+1000});
assert.equal(combined.results.length,2);
assert.equal(Object.keys(combined.state.tracks).length,2);
console.log('Conservative route progress: forward/reverse A-B-C, counterdirection, stale, jumps, revision, duplicate, unknown line PASS');

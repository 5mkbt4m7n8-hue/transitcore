import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createEnturProvider} from '../core/providers/entur/entur-provider.mjs';
import {normalizeEnturVehicle} from '../core/providers/entur/entur-normalizer.mjs';
import {normalizeBoardConfig, validateBoardConfig} from '../core/models/board-config.mjs';
import {buildPixelFrame} from '../core/frame/build-frame.mjs';
import {interpretStationVehicles} from '../core/engines/position-interpretation.mjs';
import {mapLedStates} from '../core/frame/led-mapper.mjs';
import {matchesDirection} from '../core/frame/mapping-support.mjs';
import {buildFrame as reference} from './fixtures/phase-c-frame-reference.mjs';
import {SIGNAL_POLICY, vehicleProviderGroups, applyMotionLifecycle} from '../worker/led-feed-worker.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const now=Date.parse('2026-10-06T10:00:00Z');
let comparisons=0, approachCases=0, sharedCases=0;
for(const id of ['trondheim-bus-board','trondheim-shared-stops-board']) {
  const original=read(`config/boards/${id}.json`);
  const hardware=read(`config/hardware/${id}-hardware.json`);
  const profiles=original.routes.map(r=>read(`config/routes/${r}.json`));
  const board=normalizeBoardConfig(original,{hardware,routeProfiles:profiles});
  assert.equal(validateBoardConfig(board).valid,true);
  assert.equal(board.directionalPlatforms,true);
  assert.equal(hardware.leds.dataPin,null,'Do not invent production GPIO');
  const context={board,hardware,profiles,now,signalPolicy:SIGNAL_POLICY};
  const raw=(node,route,vehicleId='one')=>({vehicleId,lastUpdated:new Date(now-1000).toISOString(),
    line:{publicCode:profiles.find(p=>p.id===route).line.publicCode},
    destinationName:node.routeDirections[route].destinationMatches[0],
    location:{latitude:node.lat,longitude:node.lon}});
  const canonical=input=>input.map(normalizeEnturVehicle).map(({raw,frameCompatibility,...v})=>{
    assert.equal(frameCompatibility,undefined,'Fixtures must be valid canonical observations');
    return v;
  });
  const compare=(input,overrides={})=>{
    const ctx={...context,...overrides};
    const actual=buildPixelFrame({...ctx,vehicles:canonical(input)},{validate:true});
    const expected=reference({...ctx,vehicles:input});
    assert.deepEqual(actual,expected);
    assert.deepEqual(applyMotionLifecycle(actual,{},now),applyMotionLifecycle(expected,{},now));
    comparisons++;
    return actual;
  };
  compare([]);
  for(const code of ['1','2','3']) {
    const profile=profiles.find(p=>p.line.publicCode===code);
    assert.ok(profile);
    const nodes=board.nodes.filter(n=>n.routes.includes(profile.id));
    const directions=new Set();
    for(const node of nodes) {
      const observation=raw(node,profile.id);
      const frame=compare([observation]);
      assert.equal(frame.leds.length,1);
      assert.equal(frame.leds[0].state,'AT_STOP');
      assert.equal(frame.leds[0].vehicle.line,code);
      const logical=hardware.assignments.find(a=>a.physicalLed===frame.leds[0].id).logicalLed;
      const selected=board.nodes.find(n=>n.led===logical);
      assert.ok(matchesDirection(selected,profile,observation.destinationName));
      for(const d of node.routeDirections[profile.id].directionIds)directions.add(d);
    }
    assert.ok(directions.has('0')&&directions.has('1'));
    const observation=raw(nodes[0],profile.id);
    assert.equal(compare([{...observation,lastUpdated:new Date(now-3600000).toISOString()}]).leds.length,0);
    const old={...observation,lastUpdated:new Date(now-2000).toISOString(),location:{latitude:0,longitude:0}};
    assert.deepEqual(compare([old,observation]),compare([observation,old]));
    assert.equal(compare([{...observation,destinationName:'UNRECOGNIZED DESTINATION'}]).leds.length,0);
    // Find a real proximity-approach sample, not a synthetic station-only board.
    let approach;
    for(const node of nodes) {
      const candidate=raw(node,profile.id);
      candidate.location.latitude+=0.0015;
      const frame=buildPixelFrame({...context,vehicles:canonical([candidate])});
      if(frame.leds.some(l=>l.state==='APPROACHING')) {approach=candidate;break;}
    }
    assert.ok(approach,`${id}/${code} approach sample`);
    compare([approach]);approachCases++;
  }
  const shared=board.nodes.find(n=>n.routes.length>=2&&n.routes.every(r=>n.routeDirections[r]?.destinationMatches.length));
  assert.ok(shared);
  const input=shared.routes.slice(0,2).map((r,i)=>raw(shared,r,'shared-'+i));
  input.push({...input[0],vehicleId:'shared-third'});
  const collision=compare(input);
  const item=collision.leds.find(l=>l.occupants.length===3);
  assert.ok(item);assert.equal(new Set(item.occupants.map(o=>o.line)).size,2);
  sharedCases++;
  const reversed={...hardware,assignments:hardware.assignments.map(a=>({...a,physicalLed:hardware.leds.count-1-a.physicalLed}))};
  const interpreted=interpretStationVehicles({...context,vehicles:canonical(input)});
  const mapped=mapLedStates({hardware:reversed},interpreted);
  for(const [logical,candidate] of interpreted.strongest) {
    assert.equal(candidate.id,logical,'Interpretation remains logical');
    const physical=reversed.assignments.find(a=>a.logicalLed===logical).physicalLed;
    assert.equal(mapped.strongest.get(physical).id,physical);
  }
  compare(input,{hardware:reversed});
  // Existing collisionMode is config metadata, not an alternative bus engine.
  for(const collisionMode of ['alternate','unknown-direction'])compare(input,{board:{...board,render:{...board.render,collisionMode}}});
  let calls=0;
  const provider=createEnturProvider({clock:()=>now,clientName:'local-regression',fetchJson:async()=>{
    calls++;return {data:{vehicles:input}};
  }});
  const groups=vehicleProviderGroups(profiles);assert.equal(groups.length,1);
  const vehicles=await provider.loadVehicles(groups[0]);
  assert.equal(await provider.loadVehicles(groups[0]),vehicles);
  assert.equal(calls,1,'All selected routes share cached provider data');
  assert.deepEqual(buildPixelFrame({...context,vehicles}),collision);
}
console.log(`Trondheim canonical: ${comparisons} legacy comparisons; ${approachCases} approach cases; ${sharedCases} shared-stop boards; provider/cache, raw-free mapping and PixelFrame validation PASS.`);

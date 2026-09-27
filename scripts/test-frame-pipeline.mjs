import assert from "node:assert/strict";
import fs from "node:fs";
import {performance} from "node:perf_hooks";
import * as legacy from "./fixtures/phase-c-frame-reference.mjs";
import {buildPixelFrame} from "../core/frame/build-frame.mjs";
import {validatePixelFrame} from "../core/frame/frame-validator.mjs";
import {createFrameContext, FramePipelineError} from "../core/frame/frame-context.mjs";
import {mapLedStates} from "../core/frame/led-mapper.mjs";
import {normalizeEnturVehicle} from "../core/providers/entur/entur-normalizer.mjs";
import {SIGNAL_POLICY, applyMotionLifecycle} from "../worker/led-feed-worker.mjs";

const now=Date.parse("2026-09-27T12:00:00Z");
const read=p=>JSON.parse(fs.readFileSync(new URL("../"+p,import.meta.url),"utf8"));
let comparisons=0, benchmarkContext, benchmarkLegacy;
for(const id of ["grakallbanen-board","grakallbanen-prototype-board","trondheim-bus-board"]) {
  const board=read("config/boards/"+id+".json");
  const hardware=read("config/hardware/"+id+"-hardware.json");
  const profiles=board.routes.map(r=>read("config/routes/"+r+".json"));
  if(board.layout!=="linear-route-vled") for(const node of board.nodes) {
    if(node.lat!=null) continue;
    const stop=profiles.flatMap(p=>p.stops).find(s=>(node.stopIds||[]).includes(s.id));
    if(stop) {node.lat=stop.lat;node.lon=stop.lon;}
  }
  const profile=profiles[0], stop=profile.stops[0], next=profile.stops[1];
  const raw={vehicleId:"one",lastUpdated:new Date(now-5000).toISOString(),
    line:{publicCode:profile.line.publicCode},destinationName:profile.directions[0].destinationMatches[0],
    location:{latitude:stop.lat,longitude:stop.lon}};
  const atStopConfirmationSeconds=id.startsWith("grakallbanen")?0:SIGNAL_POLICY.atStopConfirmationSeconds;
  const context={board,hardware,profiles,now,signalPolicy:SIGNAL_POLICY,atStopConfirmationSeconds};
  const oldBuild=board.layout==="linear-route-vled"?legacy.buildLinearRouteFrame:legacy.buildFrame;
  const cases=[
    ["fresh",[raw]],["empty",[]],
    ["stale",[{...raw,lastUpdated:new Date(now-600000).toISOString()}]],
    ["duplicates",[raw,{...raw,lastUpdated:new Date(now-15000).toISOString()}]],
    ["duplicate-newest",[{...raw,lastUpdated:new Date(now-15000).toISOString()},raw]],
    ["missing-destination",[{...raw,destinationName:undefined}]],
    ["missing-location",[{...raw,location:{}}]],
    ["missing-id",[{...raw,vehicleId:undefined}]],
    ["null-id",[{...raw,vehicleId:null}]],
    ["numeric-code",[{...raw,line:{publicCode:Number(profile.line.publicCode)}}]],
    ["numeric-string-coordinates",[{...raw,location:{latitude:String(stop.lat),longitude:String(stop.lon)}}]],
    ["missing-longitude",[{...raw,location:{latitude:stop.lat}}]],
    ["bad-time",[{...raw,lastUpdated:"invalid"}]],
    ["timezone-less-time",[{...raw,lastUpdated:"2026-09-27T12:00:00"}]],
    ["collision",[raw,{...raw,vehicleId:"two",destinationName:profile.directions.at(-1).destinationMatches[0]}]],
    ["between-stops",[{...raw,location:{latitude:(stop.lat+next.lat)/2,longitude:(stop.lon+next.lon)/2}}]]
  ];
  for(const [name,input] of cases) {
    const vehicles=input.map(normalizeEnturVehicle);
    let expected;
    try { expected=oldBuild({...context,vehicles:input}); }
    catch (error) {
      // Preserve failure/last-good behavior for malformed legacy coordinates.
      assert.throws(()=>buildPixelFrame({...context,vehicles}),
        e=>e instanceof FramePipelineError&&e.message===error.message);
      comparisons++;
      continue;
    }
    const actual=buildPixelFrame({...context,vehicles},{validate:true});
    assert.deepEqual(actual,expected,id+" "+name);
    assert.equal(JSON.stringify(actual),JSON.stringify(expected),id+" wire equality "+name);
    assert.deepEqual(applyMotionLifecycle(actual,{},now),applyMotionLifecycle(expected,{},now));
    // Remove raw entirely: the production pipeline must not need it.
    assert.deepEqual(buildPixelFrame({...context,vehicles:vehicles.map(({raw,...v})=>v)}),expected);
    comparisons++;
  }
  const generic=normalizeEnturVehicle(raw);
  delete generic.raw;
  delete generic.frameCompatibility;
  generic.provider="another-provider";
  assert.deepEqual(buildPixelFrame({...context,vehicles:[generic]}),oldBuild({...context,vehicles:[raw]}));
  assert.ok(buildPixelFrame({...context,vehicles:[generic]}).leds.length);
  // Temporal lifecycle equivalence with previous state, not just isolated frames.
  let oldMemory={},newMemory={};
  for(let i=0;i<profile.stops.length;i++) {
    const observation={...raw,lastUpdated:new Date(now+i*10000).toISOString(),
      location:{latitude:profile.stops[i].lat,longitude:profile.stops[i].lon}};
    const step={...context,now:now+i*10000};
    const before=applyMotionLifecycle(oldBuild({...step,vehicles:[observation]}),oldMemory,step.now);
    const after=applyMotionLifecycle(buildPixelFrame({...step,vehicles:[normalizeEnturVehicle(observation)]}),newMemory,step.now);
    assert.deepEqual(after,before);
    // Lifecycle returns frame + state; use actual state contract below.
    oldMemory=before.state;newMemory=after.state;
  }
  const arrivals=[{id:0,profile,destination:raw.destinationName,state:"APPROACHING",vehicleId:"call-one"}];
  for(const calls of [[],arrivals,[...arrivals,{...arrivals[0],id:1,state:"AT_STOP"}]]) {
    const expected=legacy.frameFromStationArrivals(board,hardware,structuredClone(calls),now);
    const actual=buildPixelFrame({...context,vehicles:[generic],estimatedCalls:structuredClone(calls)},{strategy:"estimated-calls",validate:true});
    assert.deepEqual(actual,expected);comparisons++;
  }
  const frame=buildPixelFrame({...context,vehicles:[generic]});
  assert.equal(validatePixelFrame(frame,{now:now+31000}).valid,false);
  assert.equal(validatePixelFrame(frame,{expectedBoardProfile:"wrong-board"}).valid,false);
  assert.equal(validatePixelFrame(frame,{expectedLedCount:999}).valid,false);
  assert.throws(()=>buildPixelFrame({...context,hardware:{...hardware,boardProfile:"wrong"},vehicles:[]}),
    e=>e instanceof FramePipelineError&&e.stage==="config");
  assert.throws(()=>buildPixelFrame({...context,now:NaN,vehicles:[]}),
    e=>e.stage==="render");
  assert.throws(()=>buildPixelFrame({...context,hardware:{...hardware,leds:{...hardware.leds,count:0}},vehicles:[]},{validate:true}),
    e=>e.stage==="validation");
  benchmarkContext={...context,vehicles:[normalizeEnturVehicle(raw)]};
  benchmarkLegacy={...context,vehicles:[raw]};
}
const gps=[],calls=[];
const ctx=createFrameContext({vehicles:gps,estimatedCalls:calls});
assert.equal(ctx.vehicles,gps);assert.equal(ctx.estimatedCalls,calls);assert.notEqual(ctx.vehicles,ctx.estimatedCalls);
assert.throws(()=>mapLedStates({hardware:{assignments:[]}},
  {strongest:new Map([[0,{id:0}]]),occupantsByLed:new Map()}),/Unmapped logical LED/);
for(let i=0;i<500;i++){legacy.buildFrame(benchmarkLegacy);buildPixelFrame(benchmarkContext);}
const measure=fn=>{const t=performance.now();for(let i=0;i<5000;i++)fn();return performance.now()-t;};
const oldCost=measure(()=>legacy.buildFrame(benchmarkLegacy));
const newCost=measure(()=>buildPixelFrame(benchmarkContext));
console.log(comparisons+" frozen-reference comparisons passed; normalized/raw-free and lifecycle tests passed");
console.log("Illustrative local 5000 bus-frame builds (not Cloudflare CPU): legacy="+oldCost.toFixed(1)+" ms; modular="+newCost.toFixed(1)+" ms");

import assert from "node:assert/strict";
import fs from "node:fs";
import { corridors, buildStationLayout, lineColors } from "../web/oslo/layout.mjs";
import {metroQuayTargets,selectMetroEstimatedCalls} from "../core/engines/metro-arrival-estimates.mjs";
import worker from '../worker/led-feed-worker.mjs';
import {validatePixelFrame} from '../core/models/pixel-frame.mjs';

const board=JSON.parse(fs.readFileSync(new URL("../config/boards/oslo-metro-wizard-separate.json",import.meta.url)));
const hardware=JSON.parse(fs.readFileSync(new URL("../config/hardware/oslo-metro-wizard-separate-hardware.json",import.meta.url)));
const page=fs.readFileSync(new URL("../web/oslo/index.html",import.meta.url),"utf8");
const stationNames=new Set(board.nodes.map(node=>node.name));
const layout=buildStationLayout();

assert.equal(stationNames.size,101,"fullkartet skal inneholde 101 unike stasjoner");
assert.equal(board.nodes.length,201,"fullkartet skal bruke 201 retnings-LED-er");
assert.deepEqual([...layout.keys()].filter(name=>!stationNames.has(name)),[],"layouten har ukjente stasjoner");
assert.deepEqual([...stationNames].filter(name=>!layout.has(name)),[],"alle tavlestasjoner skal finnes i layouten");
assert.deepEqual([...new Set(corridors.flatMap(corridor=>corridor.lines))].sort(),Object.keys(lineColors).sort(),"alle fem linjer skal tegnes");
for(const [line,visualColor] of Object.entries(lineColors)){
  const profile=JSON.parse(fs.readFileSync(new URL(`../config/routes/rut-metro-${line}-live.json`,import.meta.url),"utf8"));
  assert.equal(profile.line.color.toLowerCase(),visualColor.toLowerCase(),`linje ${line} skal ha samme farge i kart og Worker-profil`);
}
assert.equal(new Set(hardware.assignments.map(item=>item.physicalLed)).size,201,"alle fysiske LED-numre skal være unike");
assert.equal(["Berg","Tåsen","Østhorn","Holstein","Kringsjå","Sognsvann"].filter(name=>layout.has(name)).length,6,"hele Sognsvann-grenen skal være med");
assert.match(page,/oslo-metro-wizard-separate\/frame/,"kartet skal lese publisert Worker-frame");
assert.match(page,/Vis alle LED-er/,"kartet skal ha full LED-test");
assert.match(page,/directionSide/,"kartet skal vise begge retninger");
assert.match(page,/lineColors\[String\(value\?\.line/,"togfargen skal bestemmes av offentlig linjenummer");
assert.match(page,/collisionCycleSeconds/,"fargeveksling skal bruke felles TransitCore-rytme");

const targets=metroQuayTargets(board);
assert.equal(targets.length,205,"Query 205 unique Oslo quays");
assert(targets.some(t=>t.nodes.some(n=>n.id==="osteras-direction-a")&&t.nodes.some(n=>n.id==="osteras-direction-b")),"Shared quay must target both directions");
const metro2=JSON.parse(fs.readFileSync(new URL("../config/routes/rut-metro-2-live.json",import.meta.url)));
const quayIndex=targets.findIndex(t=>t.quayId==="NSR:Quay:6658");
assert(quayIndex>=0);
const moment=Date.parse('2026-10-19T10:00:00Z'),at=ms=>new Date(moment+ms).toISOString();
const call=(destination,overrides={})=>({realtime:true,cancellation:false,predictionInaccurate:false,
  aimedArrivalTime:at(20000),expectedArrivalTime:at(20000),
  aimedDepartureTime:at(30000),expectedDepartureTime:at(30000),
  destinationDisplay:{frontText:destination},
  serviceJourney:{id:"test-oslo-2",journeyPattern:{line:{id:"RUT:Line:2",publicCode:"2"}}},...overrides});
const complete=overrides=>({data:{...Object.fromEntries(targets.map((_,i)=>['q'+i,{estimatedCalls:[]}])),...overrides}});
const payload=call=>complete({["q"+quayIndex]:{estimatedCalls:[call]}});
const physical=logical=>hardware.assignments.find(item=>item.logicalLed===logical).physicalLed;
const directionA=board.nodes.find(n=>n.id==="osteras-direction-a"),directionB=board.nodes.find(n=>n.id==="osteras-direction-b");
const evaluate=callData=>selectMetroEstimatedCalls({...board,hardware},[metro2],payload(callData),moment);
assert.equal(evaluate(call("Ellingsrudåsen"))[0]?.id,physical(directionB.led),"B must work at duplicate quay");
assert.equal(evaluate(call("Østerås"))[0]?.id,physical(directionA.led),"A must work at duplicate quay");
for(const bad of [{realtime:false},{cancellation:true},{predictionInaccurate:true},{destinationDisplay:{frontText:""}}])
  assert.deepEqual(evaluate(call("Østerås",bad)),[],"No misleading live light for invalid evidence");
assert.deepEqual(evaluate(call("Østerås",{expectedArrivalTime:at(-30000),expectedDepartureTime:at(-10000)})),[],"Past departure is not a live stop");
assert.equal(evaluate(call("Østerås",{expectedArrivalTime:at(-1000)}))[0]?.state,"AT_STOP","ETA dwell remains explicitly estimated");
// On a five-line interchange both journeys must survive on the one A-direction LED.
const metro3=JSON.parse(fs.readFileSync(new URL("../config/routes/rut-metro-3-live.json",import.meta.url)));
const interchangeIndex=targets.findIndex(t=>t.quayId==="NSR:Quay:8028");
assert(interchangeIndex>=0);
const call3=call("Kolsås",{serviceJourney:{id:"test-oslo-3",journeyPattern:{line:{id:"RUT:Line:3",publicCode:"3"}}}});
const mixed=complete({["q"+interchangeIndex]:{estimatedCalls:[call("Østerås"),call3]}});
const multi=selectMetroEstimatedCalls({...board,hardware},[metro2,metro3],mixed,moment);
const majorstuenA=board.nodes.find(n=>n.id==="majorstuen-direction-a");
const combined=multi.find(value=>value.id===physical(majorstuenA.led));
assert.equal(combined?.occupants?.length,2,"Shared directional LED must retain both trains");
assert.deepEqual(new Set(combined.occupants.map(o=>o.profile.line.publicCode)),new Set(["2","3"]));
// A confirmed call from the provider can supersede an ETA, but an ETA
// disappearing by itself must never manufacture a PASSED signal.
assert.equal(evaluate(call("Østerås",{actualArrivalTime:at(-1000)}))[0]?.positionType,
  "reported-actual-arrival");
assert.equal(evaluate(call("Østerås",{actualDepartureTime:at(-3000)}))[0]?.state,
  "PASSED","Only actual departure evidence may mark departure");
assert.deepEqual(evaluate(call("Østerås",{actualArrivalTime:at(-35000),expectedDepartureTime:at(-25000)})),[], "A reported arrival is not indefinite evidence of station occupancy");
assert.equal(evaluate(call("Østerås",{actualDepartureTime:at(-11000)})).length,0,
  "Reported departure afterglow is strictly time-bounded");
assert.deepEqual(evaluate(call("Østerås",{expectedArrivalTime:at(-3000),expectedDepartureTime:at(-1000)})),[],
  "A departed forecast alone must not create PASSED");
assert.equal(evaluate(call("Østerås",{realtime:false,actualDepartureTime:at(-1000)}))[0]?.positionType,
  "reported-actual-departure","Actual event counts as evidence even without forecast flag");
// The same service journey can be reported twice at a shared quay. A later
// reported departure must beat a stale inferred dwell for the same LED.
const predictedDwellCall=call("Østerås",{expectedArrivalTime:at(-20000),expectedDepartureTime:at(20000)});
const reportedDepartureCall=call("Østerås",{
  expectedArrivalTime:at(-20000),expectedDepartureTime:at(20000),
  actualDepartureTime:at(-2000)
});
const overlap=complete({["q"+quayIndex]:{estimatedCalls:[predictedDwellCall,reportedDepartureCall]}});
const overlapReverse=complete({["q"+quayIndex]:{estimatedCalls:[reportedDepartureCall,predictedDwellCall]}});
for(const response of [overlap,overlapReverse]){
  const candidates=selectMetroEstimatedCalls({...board,hardware},[metro2],response,moment);
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].state,"PASSED","Actual departure must beat overlapping predicted dwell");
  assert.equal(candidates[0].positionType,"reported-actual-departure");
}
assert.match(page,/Liveprognose/);
assert.match(page,/Utdatert prognose/);

// Synthetic fixtures, not a reconstruction of the historical 68 -> 0 incident.
const inspect=(data,time=moment)=>{
 const diagnostics={};const selected=selectMetroEstimatedCalls({...board,hardware},[metro2,metro3],data,time,{diagnostics});
 assert.equal(diagnostics.callsReceived,diagnostics.acceptedCalls+Object.values(diagnostics.rejected).reduce((a,b)=>a+b,0));
 return {selected,diagnostics};
};
let result=inspect(complete({}));
assert.equal(result.diagnostics.outcome,'VALID_EMPTY');assert.equal(result.diagnostics.quaysAccepted,205);
result=inspect(payload(call('Østerås',{realtime:false})));
assert.equal(result.diagnostics.outcome,'FILTERED_EMPTY');assert.equal(result.diagnostics.rejected.noRealtime,1);
for(const [patch,reason] of [[{realtime:undefined},'noRealtime'],[{cancellation:true},'cancellation'],[{predictionInaccurate:true},'inaccurate'],
 [{actualDepartureTime:at(-11000)},'actualDepartureExpired'],[{actualDepartureTime:at(1000)},'actualDepartureFuture'],
 [{actualArrivalTime:at(-91000)},'actualArrivalExpired'],[{expectedArrivalTime:at(121000)},'outsideWindow']]){
 assert.equal(inspect(payload(call('Østerås',patch))).diagnostics.rejected[reason],1);
}
for(const data of [{}, {data:[]},{data:{}},complete({q0:null}),complete({q0:{}}),complete({q0:{estimatedCalls:null}}),
 complete({q0:{estimatedCalls:{}}}),complete({q0:{estimatedCalls:[null]}}),{...complete({}),errors:[{message:'untrusted upstream text'}]}]){
 const diagnostics={};assert.throws(()=>selectMetroEstimatedCalls({...board,hardware},[metro2],data,moment,{diagnostics}),/METRO_/);
 assert.equal(diagnostics.outcome,'INVALID_SOURCE');assert.ok(diagnostics.sourceError);
}
const shared=inspect(mixed);assert.equal(shared.diagnostics.uniqueJourneys,2);assert.equal(shared.diagnostics.activeLeds,1);
assert.equal(inspect(overlap).diagnostics.mergedCalls,1);
assert.equal(inspect(payload(call('Østerås',{actualDepartureTime:at(-1000)}))).diagnostics.states.PASSED,1);
const allProfiles=board.routes.map(id=>JSON.parse(fs.readFileSync(new URL(`../config/routes/${id}.json`,import.meta.url))));
const line5=allProfiles.find(p=>p.line.publicCode==='5');
for(const station of ['Ammerud','Kalbakken','Stortinget','Storo']){
 const node=board.nodes.find(n=>n.name===station),i=targets.findIndex(t=>t.quayId===node.stopIds[0]);
 const diagnostics={},data=complete({['q'+i]:{estimatedCalls:[call(station==='Storo'?'Vestli via Majorstuen':'Ringen via Tøyen',{serviceJourney:{id:'synthetic-ring',journeyPattern:{line:line5.line}}})]}});
 assert.deepEqual(selectMetroEstimatedCalls({...board,hardware},allProfiles,data,moment,{diagnostics}),[]);
 assert.equal(diagnostics.rejected[station==='Storo'?'directionUnknown':'directionAmbiguous'],1);
}

// Exercise the real existing Worker route, cache and error response with zero network IO.
const savedFetch=globalThis.fetch,savedNow=Date.now,savedLog=console.log,savedError=console.error;
let clock=moment,providerRequests=0,source=payload(call('Østerås',{expectedArrivalTime:at(5000),expectedDepartureTime:at(15000)}));
const logs=[];
try{
 Date.now=()=>clock;console.log=value=>logs.push(JSON.parse(value));console.error=()=>{};
 globalThis.fetch=async(url)=>{
   const file=String(url).split('/main/')[1];
   if(file?.startsWith('config/'))return Response.json(JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url))));
   if(String(url)===metro2.positioning.endpoint){providerRequests++;return Response.json(source);}
   throw Error('Unexpected fixture request');
 };
 const get=()=>worker.fetch(new Request('https://worker.test/api/v1/frame/'+board.id),{});
 let frameKeys;
 for(const [seconds,state,requests] of [[0,'APPROACHING',1],[10,'AT_STOP',1],[20,null,2]]){
   clock=moment+seconds*1000;const response=await get();assert.equal(response.status,200);
   const frame=await response.json();assert.equal(frame.ledCount,201);
   assert.equal(frame.leds[0]?.state??null,state);assert.equal(providerRequests,requests);
   assert.equal(validatePixelFrame(frame,{expectedBoardProfile:board.id,expectedLedCount:201,now:clock}).valid,true);
   frameKeys??=Object.keys(frame).sort();assert.deepEqual(Object.keys(frame).sort(),frameKeys);
   assert.equal('diagnostics' in frame,false);
 }
 source=complete({q0:null});clock=moment+40000;assert.equal((await get()).status,503);assert.equal(providerRequests,3);
 clock=moment+50000;assert.equal((await get()).status,503);assert.equal(providerRequests,3,'invalid source must not amplify Entur calls');
 source=complete({});clock=moment+60000;assert.equal((await get()).status,200);
 source=payload(call('Østerås',{realtime:false}));clock=moment+80000;assert.equal((await get()).status,200);
 source={...complete({}),errors:[{message:'do not log this provider content'}]};clock=moment+100000;assert.equal((await get()).status,503);
 const summaries=logs.filter(l=>l.event==='metro_arrival_diagnostics');
 for(const outcome of ['ACTIVE','FILTERED_EMPTY','INVALID_SOURCE','VALID_EMPTY'])assert.ok(summaries.some(l=>l.outcome===outcome),outcome);
 assert.ok(summaries.some(l=>l.sourceError==='METRO_GRAPHQL_ERROR'));
 assert.ok(!JSON.stringify(logs).includes('do not log this provider content'));
}finally{globalThis.fetch=savedFetch;Date.now=savedNow;console.log=savedLog;console.error=savedError;}

// Optional replay of the existing 2026-10-19 audit capture; no network or invented data.
if(process.argv[2]){
 const capture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 assert.equal(capture.evaluatedAt,'2026-10-19T08:35:08.349Z');
 const profiles=[1,2,3,4,5].map(n=>JSON.parse(fs.readFileSync(new URL(`../config/routes/rut-metro-${n}-live.json`,import.meta.url))));
 for(const [age,accepted,journeys,leds] of [[0,54,43,39],[10,49,41,37],[20,47,39,35]]){
  const diagnostics={};
  selectMetroEstimatedCalls({...board,hardware},profiles,capture.payload,Date.parse(capture.evaluatedAt)+age*1000,{diagnostics});
  assert.equal(diagnostics.quaysAccepted,205);assert.equal(diagnostics.callsReceived,101);
  assert.equal(diagnostics.acceptedCalls,accepted);assert.equal(diagnostics.uniqueJourneys,journeys);
  assert.equal(diagnostics.activeLeds,leds);assert.equal(diagnostics.rejected.directionAmbiguous,3);
  assert.equal(diagnostics.rejected.directionUnknown,1);assert.equal(diagnostics.rejected.noRealtime,0);
  assert.deepEqual(diagnostics.states,{AT_STOP:age===0?1:0,APPROACHING:age===0?38:leds,PASSED:0});
 }
 console.log('Saved Entur capture replay: 0/10/20 seconds PASS (39/37/35 active LEDs).');
}
console.log("Oslo fullnett-kart: 101 stasjoner, 201 LED-er, prognoser og retninger er dekket.");

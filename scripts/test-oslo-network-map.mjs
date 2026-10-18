import assert from "node:assert/strict";
import fs from "node:fs";
import { corridors, buildStationLayout, lineColors } from "../web/oslo/layout.mjs";
import {metroQuayTargets,selectMetroEstimatedCalls} from "../core/engines/metro-arrival-estimates.mjs";

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
const moment=Date.now(),at=ms=>new Date(moment+ms).toISOString();
const call=(destination,overrides={})=>({realtime:true,cancellation:false,predictionInaccurate:false,
  aimedArrivalTime:at(20000),expectedArrivalTime:at(20000),
  aimedDepartureTime:at(30000),expectedDepartureTime:at(30000),
  destinationDisplay:{frontText:destination},
  serviceJourney:{id:"test-oslo-2",journeyPattern:{line:{id:"RUT:Line:2",publicCode:"2"}}},...overrides});
const payload=call=>({data:{["q"+quayIndex]:{estimatedCalls:[call]}}});
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
const mixed={data:{["q"+interchangeIndex]:{estimatedCalls:[call("Østerås"),call3]}}};
const multi=selectMetroEstimatedCalls({...board,hardware},[metro2,metro3],mixed,moment);
const majorstuenA=board.nodes.find(n=>n.id==="majorstuen-direction-a");
const combined=multi.find(value=>value.id===physical(majorstuenA.led));
assert.equal(combined?.occupants?.length,2,"Shared directional LED must retain both trains");
assert.deepEqual(new Set(combined.occupants.map(o=>o.profile.line.publicCode)),new Set(["2","3"]));
assert.match(page,/Liveprognose/);
assert.match(page,/Utdatert prognose/);

console.log("Oslo fullnett-kart: 101 stasjoner, 201 LED-er, prognoser og retninger er dekket.");

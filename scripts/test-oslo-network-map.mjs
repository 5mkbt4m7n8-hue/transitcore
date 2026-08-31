import assert from "node:assert/strict";
import fs from "node:fs";
import { corridors, buildStationLayout, lineColors } from "../web/oslo/layout.mjs";

const board=JSON.parse(fs.readFileSync(new URL("../config/boards/oslo-metro-wizard-separate.json",import.meta.url)));
const hardware=JSON.parse(fs.readFileSync(new URL("../config/hardware/oslo-metro-wizard-separate-hardware.json",import.meta.url)));
const page=fs.readFileSync(new URL("../web/oslo/index.html",import.meta.url),"utf8");
const stationNames=new Set(board.nodes.map(node=>node.name));
const layout=buildStationLayout();

assert.equal(stationNames.size,95,"fullkartet skal inneholde 95 unike stasjoner");
assert.equal(board.nodes.length,189,"fullkartet skal bruke 189 retnings-LED-er");
assert.deepEqual([...layout.keys()].filter(name=>!stationNames.has(name)),[],"layouten har ukjente stasjoner");
assert.deepEqual([...stationNames].filter(name=>!layout.has(name)),[],"alle tavlestasjoner skal finnes i layouten");
assert.deepEqual([...new Set(corridors.flatMap(corridor=>corridor.lines))].sort(),Object.keys(lineColors).sort(),"alle fem linjer skal tegnes");
assert.equal(new Set(hardware.assignments.map(item=>item.physicalLed)).size,189,"alle fysiske LED-numre skal være unike");
assert.match(page,/oslo-metro-wizard-separate\/frame/,"kartet skal lese publisert Worker-frame");
assert.match(page,/Vis alle LED-er/,"kartet skal ha full LED-test");
assert.match(page,/directionSide/,"kartet skal vise begge retninger");
console.log("Oslo fullnett-kart: 95 stasjoner, 189 LED-er og fem linjer er dekket.");

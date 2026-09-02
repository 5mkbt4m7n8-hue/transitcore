import assert from "node:assert/strict";
import fs from "node:fs";
import { corridors, buildStationLayout, lineColors } from "../web/oslo/layout.mjs";

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
console.log("Oslo fullnett-kart: 101 stasjoner, 201 LED-er, Sognsvann og fem linjefarger er dekket.");

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("../web/color-calibration/index.html",import.meta.url),"utf8");
const moduleScript=[...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(moduleScript,"kalibreringssiden skal ha et modulskript");
new vm.Script(moduleScript.replace(/^import .*;$/m,""),{filename:"web/color-calibration/index.html"});
assert.match(html,/transitcore-oslo-line-colors-v1/,"lokale valg skal lagres separat");
assert.match(html,/påvirker ikke Worker eller ESP/,"siden skal forklare at testen er lokal");
assert.match(html,/transitCoreApproachPulse var\(--tc-approach-pulse\)/,"kalibreringen skal bruke felles pulshastighet");
assert.match(moduleScript,/lineColors as publishedColors/,"alle publiserte linjefarger skal være utgangspunktet");
assert.match(moduleScript,/Object\.keys\(colors\)/,"alle linjene skal få kalibreringskontroller");
console.log("Local Oslo color calibration page OK");

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const page=fs.readFileSync(new URL("../web/editor/index.html",import.meta.url),"utf8");
const scripts=[...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]).filter(Boolean);
for(const [index,script] of scripts.entries())new vm.Script(script,{filename:`web/editor/index.html#${index}`});
assert.match(page,/id="useSelection"/);
assert.match(page,/vehicleDirectionFilters/);
assert.match(page,/function projectBoard\(/);
assert.doesNotMatch(page,/Alle tavlepunkter må være aktive/);
console.log("Editor single-line direction project flow OK");

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("../web/board/index.html",import.meta.url),"utf8");
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(inline,"board page must contain its application script");
new vm.Script(inline,{filename:"web/board/index.html"});
assert.match(inline,/async function fetchPublishedBoard/);
assert.match(inline,/logicalByPhysical\.get\(physical\)/);
assert.match(inline,/"grakallbanen-board":"\.\.\/\.\.\/config\/boards\/grakallbanen-board\.json"/);
assert.match(inline,/\["oslo-metro-wizard-separate","grakallbanen-board"\]\.includes\(board\.id\)/);
assert.match(inline,/entry\.state\|\|item\.state/);
assert.match(inline,/signalColor:Array\.isArray\(rgb\)/);
console.log("Board page syntax and published Worker-frame LED mapping OK");

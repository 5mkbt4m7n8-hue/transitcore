import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../web/publish/index.html", import.meta.url), "utf8");
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(inline, "publish page must contain its application script");
new vm.Script(inline, { filename: "web/publish/index.html" });
assert.match(html, /id="loadDevices"/);
assert.match(html, /id="deviceRows"/);
assert.match(inline, /action:"create"/);
assert.match(inline, /action==="rotate"/);
assert.match(inline, /action==="revoke"/);
assert.match(inline, /device:activeDevice/);
assert.match(inline, /board\.directionMode!=="separate"\|\|board\.positioning==="vehicle-proximity"/);
console.log("Publish device enrollment UI syntax and controls OK");

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const page=fs.readFileSync(new URL("../web/grakallbanen-editor/index.html",import.meta.url),"utf8");
const script=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(script,"Gråkallbanen-redigereren skal ha et applikasjonsskript");
new vm.Script(script,{filename:"web/grakallbanen-editor/index.html"});
assert.match(page,/min="0" max="8"/,"hver strekning skal støtte et valgfritt antall mellom-LED-er");
assert.match(script,/counts\[index\]/,"hver strekning skal ha en uavhengig LED-verdi");
assert.match(script,/type:"segment"/,"mellom-LED-er skal eksporteres som segmentpunkter");
assert.match(script,/physicalLed:reverse\?all\.length-1-node\.led:node\.led/,"DIN-retningen skal kunne snus uten å endre logisk rute");
assert.match(script,/TransitCoreZip\.createZip\(files\(\)\)/,"redigereren skal laste ned en komplett prosjektpakke");
assert.match(script,/PREVIEW_STORE/,"pakken skal kunne testes med live-data før publisering");
assert.match(script,/sourceEditor:\s*"grakallbanen"/,"live-testen skal kunne gå tilbake til Gråkallbanen-editoren");
console.log("Gråkallbanen prototype editor syntax and export flow OK");

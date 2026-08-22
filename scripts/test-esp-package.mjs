import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../web/publish/esp-package.js",import.meta.url),"utf8");
const context={};context.globalThis=context;vm.runInNewContext(source,context);
const api=context.TransitCoreEspPackage;

assert.equal(api.FIRMWARE_VERSION,"1.0.6");
assert.equal(api.FIRMWARE_FILE,"TransitCore_Universal_BoardClient_v1_0_6.ino");
assert.equal(api.sketchName("oslo-metro-board"),"TransitCore_oslo_metro_board_ESP32");

const result=api.createFiles({
  board:{id:"test-board",name:"Test",leds:{count:2,dataPin:2}},
  hardware:{leds:{count:2}},
  boardConfig:"#pragma once\n",
  firmware:"void setup(){}\nvoid loop(){}\n"
});
assert.equal(result.files.length,4);
assert.equal(result.filename,"test-board-esp32-v1.0.6.zip");
assert.deepEqual(Array.from(result.files,file=>file.name),[
  "TransitCore_test_board_ESP32/TransitCore_test_board_ESP32.ino",
  "TransitCore_test_board_ESP32/board_config.h",
  "TransitCore_test_board_ESP32/secrets.example.h",
  "TransitCore_test_board_ESP32/README.txt"
]);
assert.match(result.files[2].content,/TRANSITCORE_STATUS_TOKEN/);
assert.match(result.files[3].content,/STATUS \| HTTP 200/);
console.log("ESP package builder OK: 4 safe files for Board Client v1.0.6");

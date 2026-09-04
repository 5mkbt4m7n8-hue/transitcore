import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.resolve(process.argv[2] || path.join(root, ".build", "esp-sketches"));
const firmwarePath = path.join(root, "firmware", "esp32", "TransitCore_Universal_BoardClient_v1_1_5.ino");
const firmware = fs.readFileSync(firmwarePath, "utf8");
const boardIds = [
  "grakallbanen-board",
  "trondheim-bus-board",
  "oslo-metro-wizard-separate"
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function sketchName(boardId) {
  return `TransitCore_${boardId.replace(/[^a-zA-Z0-9_]/g, "_")}_ESP32`;
}

function boardConfig(board, hardware) {
  const count = hardware.leds?.count;
  const dataPin = Number.isInteger(hardware.leds?.dataPin)
    ? hardware.leds.dataPin
    : Number.isInteger(board.leds?.dataPin) ? board.leds.dataPin : 2;
  if (!Number.isInteger(count) || count < 1 || count !== board.nodes?.length) {
    throw new Error(`${board.id}: board and hardware LED counts do not match`);
  }
  return `#pragma once

const uint8_t LED_DATA_PIN = ${dataPin};
const uint16_t LED_COUNT = ${count};
const char* EXPECTED_BOARD_PROFILE = "${board.id}";
const char* FEED_URL =
  "https://transitcore-led-feed.lgb84.workers.dev/"
  "v1/boards/${board.id}/frame";
`;
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

for (const boardId of boardIds) {
  const board = readJson(`config/boards/${boardId}.json`);
  const hardware = readJson(`config/hardware/${boardId}-hardware.json`);
  if (hardware.boardProfile !== board.id) {
    throw new Error(`${boardId}: hardware profile points to ${hardware.boardProfile}`);
  }
  const folder = sketchName(boardId);
  const sketchDir = path.join(outputRoot, folder);
  fs.mkdirSync(sketchDir, { recursive: true });
  fs.writeFileSync(path.join(sketchDir, `${folder}.ino`), firmware);
  fs.writeFileSync(path.join(sketchDir, "board_config.h"), boardConfig(board, hardware));
  fs.writeFileSync(path.join(sketchDir, "secrets.h"), `#pragma once
const char* WIFI_SSID = "CI_ONLY";
const char* WIFI_PASSWORD = "CI_ONLY";
#define TRANSITCORE_DEVICE_ID "${boardId}-ci"
#define TRANSITCORE_DEVICE_TOKEN "CI_ONLY"
`);
  console.log(`${boardId}: prepared ${hardware.leds.count} LED sketch at ${sketchDir}`);
}

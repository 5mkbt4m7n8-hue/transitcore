(function(root){
"use strict";

const FIRMWARE_VERSION="1.0.9";
const FIRMWARE_FILE=`TransitCore_Universal_BoardClient_v${FIRMWARE_VERSION.replaceAll(".","_")}.ino`;

function sketchName(boardId){
  const safe=String(boardId||"board").replace(/[^a-zA-Z0-9_]/g,"_");
  return `TransitCore_${safe}_ESP32`;
}

function secretsExample(){return `#pragma once

// Fyll inn lokale verdier. Ikke publiser secrets.h.
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Må samsvare med Worker-hemmeligheten STATUS_INGEST_TOKEN.
#define TRANSITCORE_STATUS_TOKEN "YOUR_PRIVATE_STATUS_TOKEN"
`}

function readme(board,hardware,folder){return `TransitCore ferdig ESP32-pakke
================================

Tavle: ${board.name||board.id}
Tavle-ID: ${board.id}
Firmware: Universal Board Client v${FIRMWARE_VERSION}
Fysiske LED-er: ${hardware.leds.count}
Datapin: ${board.leds?.dataPin??2}

Innhold
-------
${folder}.ino       Stabil, universell ESP32-motor.
board_config.h      Tavle-ID, feed-adresse, datapin og LED-antall.
secrets.example.h   Mal for Wi-Fi og privat status-token.

Arduino-oppsett
---------------
1. Pakk ut ZIP-filen uten å endre mappenavnet «${folder}».
2. Kopier secrets.example.h til secrets.h i samme mappe.
3. Fyll inn Wi-Fi-navn, Wi-Fi-passord og TRANSITCORE_STATUS_TOKEN.
4. Installer bibliotekene ArduinoJson og Adafruit NeoPixel i Arduino IDE.
5. Åpne ${folder}.ino og velg riktig ESP32-kort og port.
6. Kjør Verify og deretter Upload.
7. Åpne Serial Monitor på 115200 baud.

Sikker LED-test
---------------
Testen er avslått som standard. Når LED-stripen skal kontrolleres, sett både
LED_HARDWARE_ENABLED og LED_STARTUP_TEST_ENABLED til true i sketch-filen.
Testen bruker brightness 8, viser rød, grønn og blå på LED 0, går deretter
gjennom én fysisk LED om gangen og slukker alt før normal drift starter.

Forventet kontroll
------------------
Board ${board.id} | ${hardware.leds.count} LED-er
Status-token konfigurert: JA
LED-frame OK | profil r… | policy v1 1800 ms
STATUS | HTTP 200

Sikkerhet
---------
secrets.h skal aldri legges i Git eller deles. GitHub-token og
publiseringsnøkkel skal ikke brukes som status-token.
`}

function createFiles({board,hardware,boardConfig,firmware}){
  if(!board?.id||!Number.isInteger(hardware?.leds?.count)||!boardConfig||!firmware)throw Error("ESP-pakken mangler påkrevde data");
  const folder=sketchName(board.id),prefix=`${folder}/`;
  return{
    filename:`${board.id}-esp32-v${FIRMWARE_VERSION}.zip`,
    folder,
    files:[
      {name:`${prefix}${folder}.ino`,content:firmware},
      {name:`${prefix}board_config.h`,content:boardConfig},
      {name:`${prefix}secrets.example.h`,content:secretsExample()},
      {name:`${prefix}README.txt`,content:readme(board,hardware,folder)}
    ]
  };
}

root.TransitCoreEspPackage={FIRMWARE_VERSION,FIRMWARE_FILE,sketchName,createFiles};
})(globalThis);

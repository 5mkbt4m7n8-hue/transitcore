(function(root){
"use strict";

const FIRMWARE_VERSION="1.1.2";
const FIRMWARE_FILE=`TransitCore_Universal_BoardClient_v${FIRMWARE_VERSION.replaceAll(".","_")}.ino`;

function sketchName(boardId){
  const safe=String(boardId||"board").replace(/[^a-zA-Z0-9_]/g,"_");
  return `TransitCore_${safe}_ESP32`;
}

function secretsExample(deviceId,deviceToken="YOUR_UNIQUE_DEVICE_TOKEN"){return `#pragma once

// Fyll inn lokale verdier. Ikke publiser secrets.h.
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Unik identitet og nøkkel for denne fysiske tavlen. Registreres i Workerens
// krypterte DEVICE_INGEST_TOKENS. Ikke bruk GitHub- eller administratornøkler.
#define TRANSITCORE_DEVICE_ID "${deviceId}"
#define TRANSITCORE_DEVICE_TOKEN "${deviceToken}"
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
secrets.example.h   Reserveverdier og unik enhetsidentitet.

Arduino-oppsett
---------------
1. Pakk ut ZIP-filen uten å endre mappenavnet «${folder}».
2. Kopier secrets.example.h til secrets.h i samme mappe. Enhets-ID og token er
   allerede fylt inn i en registrert pakke.
3. Wi-Fi kan fylles inn i secrets.h som reserve. Uten gyldig nettverk starter
   tavlen «TransitCore-XXXXXX». Koble telefonen til dette nettet, åpne
   http://192.168.4.1 og velg kundens Wi-Fi. Opplysningene lagres lokalt på ESP.
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
TLS-verifisering: CA-bunt | enhet … | enhetsnøkkel JA
LED-frame OK | profil r… | policy v1 1800 ms
STATUS | HTTP 200

Sikkerhet
---------
secrets.h skal aldri legges i Git eller deles. Hver fysisk tavle skal ha sin
egen nøkkel. GitHub-token og publiseringsnøkkel skal aldri brukes her.
`}

function createFiles({board,hardware,boardConfig,firmware,device}){
  if(!board?.id||!Number.isInteger(hardware?.leds?.count)||!boardConfig||!firmware)throw Error("ESP-pakken mangler påkrevde data");
  const folder=sketchName(board.id),prefix=`${folder}/`;
  return{
    filename:`${board.id}-esp32-v${FIRMWARE_VERSION}.zip`,
    folder,
    files:[
      {name:`${prefix}${folder}.ino`,content:firmware},
      {name:`${prefix}board_config.h`,content:boardConfig},
      {name:`${prefix}secrets.example.h`,content:secretsExample(device?.deviceId||board.id,device?.token)},
      {name:`${prefix}README.txt`,content:readme(board,hardware,folder)}
    ]
  };
}

root.TransitCoreEspPackage={FIRMWARE_VERSION,FIRMWARE_FILE,sketchName,createFiles};
})(globalThis);

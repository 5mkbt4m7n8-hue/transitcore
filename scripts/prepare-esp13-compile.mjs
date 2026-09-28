import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const out=path.resolve(process.argv[2]||path.join(root,".build","esp13-sketches"));
const ids=["grakallbanen-prototype-board","trondheim-bus-board"];
const firmware=fs.readFileSync(path.join(root,"firmware/esp32/TransitCore_Universal_BoardClient_v1_3_0.ino"),"utf8");
for(const id of ids){
 const hardware=JSON.parse(fs.readFileSync(path.join(root,"config/hardware",id+"-hardware.json"),"utf8"));
 const board=JSON.parse(fs.readFileSync(path.join(root,"config/boards",id+".json"),"utf8"));
 if(hardware.boardProfile!==id||hardware.leds.count!==board.nodes.length)throw Error("Invalid profile");
 const name="TransitCore13_"+id.replaceAll("-","_"),dir=path.join(out,name);
 fs.mkdirSync(dir,{recursive:true});
 const secretPath=path.join(dir,"secrets.h");
 if(fs.existsSync(secretPath)&&!fs.readFileSync(secretPath,"utf8").includes('#define TRANSITCORE_DEVICE_TOKEN "CI_ONLY"'))
  throw Error("Refusing to overwrite non-fixture secrets");
 // Generated compile fixtures only; never overwrite a user's actual secrets.
 fs.writeFileSync(path.join(dir,name+".ino"),firmware.replace("const bool LED_HARDWARE_ENABLED = false;","const bool LED_HARDWARE_ENABLED = true;"));
 fs.copyFileSync(path.join(root,"firmware/esp32/TransitCore_Platform_v1.h"),path.join(dir,"TransitCore_Platform_v1.h"));
 fs.writeFileSync(path.join(dir,"board_config.h"),[
 "#pragma once",
 "const uint8_t LED_DATA_PIN = "+hardware.leds.dataPin+";",
 "const uint16_t LED_COUNT = "+hardware.leds.count+";",
 'const char* EXPECTED_BOARD_PROFILE = "'+id+'";',
 'const char* FEED_URL = "https://transitcore-led-feed.lgb84.workers.dev/api/v1/frame/'+id+'";',
 '#define TRANSITCORE_API_ORIGIN "https://transitcore-led-feed.lgb84.workers.dev"',
 '#define TRANSITCORE_HARDWARE_PROFILE "'+hardware.id+'"',
 '#define TRANSITCORE_HARDWARE_BRIGHTNESS_LIMIT '+hardware.leds.brightnessLimit,
 '#define TRANSITCORE_OTA_ENABLED 1'
 ].join("\n")+"\n");
 fs.writeFileSync(path.join(dir,"secrets.h"),'#pragma once\nconst char* WIFI_SSID="CI_ONLY";\nconst char* WIFI_PASSWORD="CI_ONLY";\n#define TRANSITCORE_DEVICE_ID "'+id+'-ci"\n#define TRANSITCORE_DEVICE_TOKEN "CI_ONLY"\n');
 console.log(dir);
}

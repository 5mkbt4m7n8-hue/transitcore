#pragma once
#include <utility>
// Platform client policy for Universal BoardClient 1.3.0. No transit logic.
#ifndef TRANSITCORE_API_ORIGIN
#define TRANSITCORE_API_ORIGIN ""
#endif
#ifndef TRANSITCORE_HARDWARE_PROFILE
#define TRANSITCORE_HARDWARE_PROFILE ""
#endif
#ifndef TRANSITCORE_HARDWARE_BRIGHTNESS_LIMIT
#define TRANSITCORE_HARDWARE_BRIGHTNESS_LIMIT 32
#endif
struct OutputCapability {
  uint8_t outputId, gpio;
  uint16_t logicalCount, physicalCount;
  neoPixelType pixelType;
};
const OutputCapability platformOutputs[] = {
  {0, LED_DATA_PIN, LED_COUNT, TRANSITCORE_PHYSICAL_LED_COUNT, LED_PIXEL_TYPE}
};
static_assert(LED_COUNT > 0 && TRANSITCORE_PHYSICAL_LED_COUNT <= 2048, "Unsupported LED capacity");
static_assert(TRANSITCORE_HARDWARE_BRIGHTNESS_LIMIT <= 255, "Invalid brightness ceiling");
// A descriptor array prepares the contract; this build supports exactly one output.
static_assert(sizeof(platformOutputs)/sizeof(platformOutputs[0]) == 1, "Renderer supports one output");
struct RuntimeDeviceConfig {
  String board, hardware, frameUrl, otaUrl;
  uint32_t pollMs = 10000, healthMs = 300000;
  uint8_t brightness = 0;
  bool otaEnabled = false, ambient = false, warmWhite = false;
};
RuntimeDeviceConfig runtimeConfig;
volatile uint8_t runtimeBrightnessLimit = 0;
bool platformConfigured = false, configAttempted = false;
bool platformIdentityValid = false;
unsigned long lastConfigAttemptMs = 0;
const char* configSource = "DEFAULT";
const char* configFetchResult = "NOT_CHECKED";
const char* otaStage = "NOT_CHECKED";
const char* otaResult = "none";
bool bootCountKnown = false;
uint32_t platformBootCount = 0;
String cachedConfigEncoding, platformBootId;
const uint32_t CONFIG_REFRESH_MS = 3600000UL, CONFIG_RETRY_MS = 300000UL;
const size_t CONFIG_MAX_BYTES = 4096;
enum PlatformErrorIndex { PWIFI, PFETCH, PSTALE, PINVALID, PCONFIG, POTA, PHEAP, PPROFILE, PNVS, PLATFORM_ERROR_COUNT };
struct PlatformErrorState { const char* code; bool active; uint32_t count; uint32_t id; };
uint32_t platformEventSequence=0;
PlatformErrorState platformErrors[PLATFORM_ERROR_COUNT] = {
  {"WIFI_DOWN",false,0},{"FRAME_FETCH_FAILED",false,0},{"FRAME_STALE",false,0},
  {"INVALID_FRAME",false,0},{"CONFIG_FAILED",false,0},{"OTA_FAILED",false,0},
  {"LOW_HEAP",false,0},{"PROFILE_MISMATCH",false,0},{"NVS_FAILED",false,0}
};
void setPlatformError(PlatformErrorIndex index, bool active) {
  PlatformErrorState& e = platformErrors[index];
  if (e.active == active) return;
  e.active = active;
  if (active && e.count < UINT32_MAX) ++e.count;
  if (active && platformEventSequence < UINT32_MAX) e.id=++platformEventSequence;
  deviceErrorReportPending = true;
  diagnosticSerial.printf("[ERROR] %s active=%u count=%lu\n", e.code, active, (unsigned long)e.count);
}
void setOtaStage(const char* stage, const char* result) {
  otaStage=stage; otaResult=result;
  setPlatformError(POTA, strcmp(result,"failed")==0);
  diagnosticSerial.printf("[OTA] result=%s\n", stage);
}
const char* otaFailureStage(int code) {
  if ((code<0 && code>HTTP_UE_TOO_LESS_SPACE) || code==HTTP_UE_SERVER_FILE_NOT_FOUND ||
      code==HTTP_UE_SERVER_FORBIDDEN || code==HTTP_UE_SERVER_WRONG_HTTP_CODE) return "FAILED_HTTP";
  if (code<=HTTP_UE_TOO_LESS_SPACE || code==UPDATE_ERROR_MD5) return "FAILED_VALIDATION";
  return "FAILED_FLASH"; // Remaining Update writer errors; numeric code is logged too.
}
uint32_t uptimeSeconds64() {
  const uint64_t seconds = esp_timer_get_time()/1000000ULL;
  return seconds > UINT32_MAX ? UINT32_MAX : uint32_t(seconds);
}
const char* normalizedResetReason() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON: return "POWER_ON";
    case ESP_RST_SW: return "SOFTWARE_RESET";
    case ESP_RST_INT_WDT: case ESP_RST_TASK_WDT: case ESP_RST_WDT: return "WATCHDOG";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_DEEPSLEEP: return "DEEP_SLEEP";
    default: return "UNKNOWN";
  }
}
bool platformId(const String& value, bool underscore=false) {
  if(value.length()<3 || value.length()>120) return false;
  for(size_t i=0;i<value.length();++i) {
    char c=value[i]; if(!((c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='-'||(underscore&&c=='_')))return false;
  }
  return true;
}
bool trustedPlatformOrigin() {
  const String origin=TRANSITCORE_API_ORIGIN;
  if(!origin.startsWith("https://") || origin.length()<12 || origin.length()>180)return false;
  for(size_t i=8;i<origin.length();++i) {
    const char c=origin[i];
    if(!((c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='.'||c=='-'))return false;
  }
  return true;
}
String platformBinding() {
  return String(TRANSITCORE_DEVICE_ID)+"|"+EXPECTED_BOARD_PROFILE+"|"+TRANSITCORE_HARDWARE_PROFILE+
    "|"+TRANSITCORE_API_ORIGIN+"|"+String(LED_DATA_PIN)+"|"+String(LED_COUNT)+"|"+
    String(TRANSITCORE_PHYSICAL_LED_COUNT)+"|"+String(LED_PIXEL_TYPE)+"|"+String(TRANSITCORE_HARDWARE_BRIGHTNESS_LIMIT);
}
String encodeRuntimeConfig(const RuntimeDeviceConfig& c) {
  DynamicJsonDocument doc(3072);
  doc["schemaVersion"]=1; doc["deviceId"]=TRANSITCORE_DEVICE_ID;
  doc["boardProfile"]=c.board; doc["hardwareProfile"]=c.hardware;
  doc["frameUrl"]=c.frameUrl; doc["otaManifestUrl"]=c.otaUrl;
  doc["pollIntervalSeconds"]=c.pollMs/1000; doc["statusIntervalSeconds"]=c.healthMs/1000;
  doc["brightnessLimit"]=c.brightness; doc["otaEnabled"]=c.otaEnabled;
  JsonObject flags=doc.createNestedObject("featureFlags");
  flags["ambientLighting"]=c.ambient; flags["warmWhiteVehicles"]=c.warmWhite;
  doc["cacheBinding"]=platformBinding();
  String out; if(!doc.overflowed())serializeJson(doc,out); return out;
}
bool decodeRuntimeConfig(const String& body, RuntimeDeviceConfig& out, bool fromCache, bool& mismatch) {
  mismatch=false;
  if(!platformIdentityValid || body.isEmpty() || body.length()>CONFIG_MAX_BYTES)return false;
  DynamicJsonDocument doc(6144);
  if(deserializeJson(doc,body) || doc.overflowed() || !doc.is<JsonObject>())return false;
  if(!doc["schemaVersion"].is<unsigned int>() || doc["schemaVersion"].as<unsigned int>()!=1)return false;
  const char* strings[]={"deviceId","boardProfile","hardwareProfile","frameUrl","otaManifestUrl"};
  for(const char* key:strings)if(!doc[key].is<const char*>())return false;
  if(String(doc["deviceId"].as<const char*>())!=TRANSITCORE_DEVICE_ID)return false;
  RuntimeDeviceConfig candidate;
  candidate.board=doc["boardProfile"].as<const char*>(); candidate.hardware=doc["hardwareProfile"].as<const char*>();
  if(candidate.board!=EXPECTED_BOARD_PROFILE || candidate.hardware!=TRANSITCORE_HARDWARE_PROFILE) {
    mismatch=true; return false;
  }
  if(fromCache && String(doc["cacheBinding"] | "")!=platformBinding())return false;
  candidate.frameUrl=doc["frameUrl"].as<const char*>(); candidate.otaUrl=doc["otaManifestUrl"].as<const char*>();
  const String origin=TRANSITCORE_API_ORIGIN;
  if(candidate.frameUrl!=origin+"/api/v1/frame/"+candidate.board ||
     candidate.otaUrl!=origin+"/api/v1/ota/"+TRANSITCORE_DEVICE_ID)return false;
  if(!doc["pollIntervalSeconds"].is<uint32_t>() || !doc["statusIntervalSeconds"].is<uint32_t>() ||
     !doc["brightnessLimit"].is<unsigned int>() || doc["brightnessLimit"].as<unsigned int>()>255 ||
     !doc["otaEnabled"].is<bool>() || !doc["featureFlags"].is<JsonObject>())return false;
  uint32_t poll=doc["pollIntervalSeconds"].as<uint32_t>(), health=doc["statusIntervalSeconds"].as<uint32_t>();
  // Reject zero/malformed; clamp positive numbers without overflow before conversion to ms.
  if(!poll || !health)return false;
  candidate.pollMs=constrain(poll,5U,300U)*1000UL;
  candidate.healthMs=constrain(health,300U,900U)*1000UL;
  candidate.brightness=min(doc["brightnessLimit"].as<unsigned int>(),
    min((unsigned int)LOCAL_BRIGHTNESS_LIMIT,(unsigned int)TRANSITCORE_HARDWARE_BRIGHTNESS_LIMIT));
  candidate.otaEnabled=doc["otaEnabled"].as<bool>();
  JsonObject flags=doc["featureFlags"].as<JsonObject>();
  if(flags.size()>32)return false;
  for(JsonPair flag:flags) {
    const String key=flag.key().c_str();
    if(key.isEmpty() || key.length()>40 || key[0]<'a'||key[0]>'z'||!flag.value().is<bool>())return false;
    for(size_t i=1;i<key.length();++i)if(!isalnum((unsigned char)key[i]))return false;
  }
  candidate.ambient=flags["ambientLighting"] | false;
  candidate.warmWhite=flags["warmWhiteVehicles"] | false;
  out=std::move(candidate); return true; // no allocation/copy on validated handoff
}
void activateRuntimeConfig(RuntimeDeviceConfig& candidate, const char* source) {
  runtimeConfig=std::move(candidate); platformConfigured=true; configSource=source;
  // Only scalars are shared with the render task. GPIO and buffers never change.
  portENTER_CRITICAL(&frameMutex);
  runtimeBrightnessLimit=runtimeConfig.brightness;
  ambientLightingEnabled=runtimeConfig.ambient;
  warmWhiteVehiclesEnabled=runtimeConfig.warmWhite;
  portEXIT_CRITICAL(&frameMutex);
  diagnosticSerial.printf("[CONFIG] source=%s profile=%s poll=%lu health=%lu brightness=%u\n",
    source,runtimeConfig.board.c_str(),(unsigned long)(runtimeConfig.pollMs/1000),
    (unsigned long)(runtimeConfig.healthMs/1000),runtimeConfig.brightness);
}
void initializePlatform() {
  char id[24]; snprintf(id,sizeof(id),"%08lx-%08lx",(unsigned long)esp_random(),(unsigned long)esp_random());
  platformBootId=id; diagnosticBootId=platformBootId;
  platformIdentityValid=trustedPlatformOrigin()&&platformId(TRANSITCORE_DEVICE_ID,true)&&
    platformId(EXPECTED_BOARD_PROFILE)&&platformId(TRANSITCORE_HARDWARE_PROFILE)&&strlen(TRANSITCORE_DEVICE_TOKEN)>0;
  Preferences prefs;
  if(prefs.begin("tc-platform",false)) {
    const uint32_t previous=prefs.getUInt("bootCount",0);
    if(previous<UINT32_MAX) {
      platformBootCount=previous+1;
      bootCountKnown=prefs.putUInt("bootCount",platformBootCount)==sizeof(uint32_t);
    }
    setPlatformError(PNVS,!bootCountKnown);
    const size_t bytes=prefs.getStringLength("config");
    if(bytes>0 && bytes<=CONFIG_MAX_BYTES+1)cachedConfigEncoding=prefs.getString("config","");
    prefs.end();
  } else setPlatformError(PNVS,true);
  if(platformIdentityValid) {
    // Explicit compiled identity is safe, but endpoint paths are still exact and trusted.
    const String origin=TRANSITCORE_API_ORIGIN;
    const String feed=FEED_URL;
    if(feed==origin+"/v1/boards/"+EXPECTED_BOARD_PROFILE+"/frame" ||
       feed==origin+"/api/v1/frame/"+EXPECTED_BOARD_PROFILE) {
      RuntimeDeviceConfig defaults;
      defaults.board=EXPECTED_BOARD_PROFILE; defaults.hardware=TRANSITCORE_HARDWARE_PROFILE;
      defaults.frameUrl=origin+"/api/v1/frame/"+EXPECTED_BOARD_PROFILE;
      defaults.otaUrl=origin+"/api/v1/ota/"+TRANSITCORE_DEVICE_ID;
      defaults.brightness=min((uint8_t)LOCAL_BRIGHTNESS_LIMIT,(uint8_t)TRANSITCORE_HARDWARE_BRIGHTNESS_LIMIT);
      defaults.otaEnabled=TRANSITCORE_OTA_ENABLED;
      activateRuntimeConfig(defaults,"DEFAULT");
    }
    RuntimeDeviceConfig cached; bool mismatch=false;
    if(decodeRuntimeConfig(cachedConfigEncoding,cached,true,mismatch))activateRuntimeConfig(cached,"CACHED");
  }
  setPlatformError(PCONFIG,!platformConfigured); // NOT_CHECKED is not itself a failure
  if(!platformIdentityValid)setPlatformError(PPROFILE,true);
  diagnosticSerial.printf("[BOOT] firmware=%s bootId=%s bootCount=%s reset=%s\n",
    TRANSITCORE_FIRMWARE_VERSION,platformBootId.c_str(),
    bootCountKnown?String(platformBootCount).c_str():"UNKNOWN",normalizedResetReason());
}
// Bounded decoded-body sink works for HTTPClient chunked as well as Content-Length.
class PlatformBodySink : public Stream {
  String& target;
  const size_t limit;
  unsigned long deadline;
public:
  bool exceeded=false;
  PlatformBodySink(String& body,size_t max):target(body),limit(max),deadline(millis()+15000) { target.reserve(max); }
  using Print::write;
  size_t write(uint8_t b) override {return write(&b,1);}
  size_t write(const uint8_t* bytes,size_t n) override {
    if(n>limit-target.length() || int32_t(millis()-deadline)>=0){exceeded=true;return 0;}
    return target.concat((const char*)bytes,n)?n:0;
  }
  int available() override {return 0;} int read() override {return -1;}
  int peek() override {return -1;} void flush() override {}
};
bool readPlatformBody(HTTPClient& http,String& body,size_t limit) {
  if(http.getSize()>int(limit))return false;
  PlatformBodySink sink(body,limit);
  const int result=http.writeToStream(&sink);
  return result>=0&&!sink.exceeded&&!body.isEmpty();
}
void refreshDeviceConfig(unsigned long now) {
  if(!platformIdentityValid || WiFi.status()!=WL_CONNECTED || !wifiConnectedAtMs ||
     now-wifiConnectedAtMs<WIFI_STABLE_BEFORE_HTTP_MS)return;
  const uint32_t interval=strcmp(configFetchResult,"SUCCESS")==0?CONFIG_REFRESH_MS:CONFIG_RETRY_MS;
  if(configAttempted && now-lastConfigAttemptMs<interval)return;
  configAttempted=true; lastConfigAttemptMs=now;
  const uint32_t before=ESP.getFreeHeap();
  TransitCoreSecureClient client; client.useSystemCaBundle();
  client.setHandshakeTimeout(HTTP_CONNECT_TIMEOUT_MS/1000);
  HTTPClient http; http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);http.setTimeout(HTTP_RESPONSE_TIMEOUT_MS);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  configFetchResult="FAILED_HTTP";
  RuntimeDeviceConfig candidate; bool valid=false,mismatch=false;
  if(http.begin(client,String(TRANSITCORE_API_ORIGIN)+"/api/v1/device/config/"+TRANSITCORE_DEVICE_ID)) {
    http.addHeader("Authorization",String("Bearer ")+TRANSITCORE_DEVICE_TOKEN);
    const int code=http.GET();
    if(code==200) {
      String body;
      if(readPlatformBody(http,body,CONFIG_MAX_BYTES))valid=decodeRuntimeConfig(body,candidate,false,mismatch);
      configFetchResult=valid?"SUCCESS":mismatch?"PROFILE_MISMATCH":"FAILED_VALIDATION";
    }
    // Log status only, never upstream body/headers, credential or URLs.
    diagnosticSerial.printf("[CONFIG] http=%d\n",code);
    http.end();
  }
  if(valid) {
    activateRuntimeConfig(candidate,"LIVE");
    setPlatformError(PCONFIG,false);setPlatformError(PPROFILE,false);
    const String encoded=encodeRuntimeConfig(runtimeConfig);
    if(encoded.isEmpty())setPlatformError(PNVS,true);
    if(!encoded.isEmpty() && encoded!=cachedConfigEncoding) {
      Preferences prefs; bool saved=false;
      if(prefs.begin("tc-platform",false)){saved=prefs.putString("config",encoded)==encoded.length();prefs.end();}
      if(saved)cachedConfigEncoding=encoded;
      setPlatformError(PNVS,!saved||!bootCountKnown);
    }
  } else {
    setPlatformError(PCONFIG,true);setPlatformError(PPROFILE,mismatch);
    // Keep the last accepted live config in RAM; CACHED means loaded from NVS.
    diagnosticSerial.printf("[CONFIG] keeping source=%s configured=%u\n",configSource,platformConfigured);
  }
  diagnosticSerial.printf("[CONFIG] result=%s heapBefore=%u heapAfter=%u\n",configFetchResult,before,ESP.getFreeHeap());
}
void appendPlatformHealth(JsonDocument& doc) {
  doc["firmwareVersion"]=TRANSITCORE_FIRMWARE_VERSION;
  doc["hardwareProfile"]=TRANSITCORE_HARDWARE_PROFILE;
  doc["uptimeSeconds"]=uptimeSeconds64();
  doc["bootId"]=platformBootId;
  if(bootCountKnown)doc["bootCount"]=platformBootCount;else doc["bootCount"]=nullptr;
  doc["resetReason"]=normalizedResetReason();
  if(WiFi.status()==WL_CONNECTED)doc["wifiRssi"]=WiFi.RSSI();else doc["wifiRssi"]=nullptr;
  if(hasValidFrame) {
    doc["lastFrameSequence"]=lastSequence;
    const uint64_t age=(esp_timer_get_time()-lastAcceptedFrameUs)/1000000ULL;
    doc["lastFrameAgeSeconds"]=age>UINT32_MAX?UINT32_MAX:uint32_t(age);
  } else {doc["lastFrameSequence"]=nullptr;doc["lastFrameAgeSeconds"]=nullptr;}
  doc["successfulPolls"]=successfulFeedPolls;doc["failedPolls"]=failedFeedPolls;
  doc["configSource"]=configSource;doc["configFetchResult"]=configFetchResult;
  doc["lastOtaResult"]=otaResult;doc["otaStage"]=otaStage;
  setPlatformError(PWIFI,hasEverConnected&&WiFi.status()!=WL_CONNECTED);
  setPlatformError(PHEAP,ESP.getFreeHeap()<40000);
  setPlatformError(PSTALE,hasValidFrame&&ttlExpired);
  JsonArray errors=doc.createNestedArray("errors");
  for(const auto& e:platformErrors)if(e.count>0 || e.active) {
    JsonObject row=errors.createNestedObject();row["code"]=e.code;row["count"]=1;row["id"]=e.id;
    row["active"]=e.active;row["severity"]=strcmp(e.code,"PROFILE_MISMATCH")==0?"error":"warning";
  }
}

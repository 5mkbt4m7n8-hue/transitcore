#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <algorithm>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include "mini_settings.hpp"
#include "mini_hardware.hpp"

namespace {
constexpr uint32_t REFRESH_MS=30000;
constexpr uint32_t FRAME_MS=5000;
constexpr char API_ROOT[]=
  "https://transitcore-led-feed.lgb84.workers.dev/api/v1/mini/departures?stop=";
mini::HardwareDisplay screen;
mini::Profile profile{
  MINI_WIDTH,MINI_HEIGHT,
#if defined(MINI_PANEL_OLED)
  mini::PanelKind::Mono
#elif defined(MINI_PANEL_TFT)
  mini::PanelKind::Lcd
#else
  mini::PanelKind::Led
#endif
};
mini::Board board;
mini::Mode mode=MINI_USE_LIVE?mini::Mode::Live:mini::Mode::Demo;
uint32_t lastFetch=0,lastFrame=0;
bool forceFetch=true;

int64_t nowEpoch(){
  const time_t real=time(nullptr);
  if(real>1700000000)return static_cast<int64_t>(real);
  // Offline relative clock is fine for DEMO countdown only.
  return 86400+static_cast<int64_t>(millis()/1000);
}
bool validStopId(const String &value){
  if(!value.startsWith("NSR:StopPlace:"))return false;
  String tail=value.substring(strlen("NSR:StopPlace:"));
  if(tail.length()==0||tail.length()>9||tail[0]=='0')return false;
  for(size_t i=0;i<tail.length();i++)if(tail[i]<'0'||tail[i]>'9')return false;
  return true;
}
bool parseIso(const char* input,int64_t &epoch){
  if(!input||strlen(input)<20||strlen(input)>40)return false;
  int year=0,month=0,day=0,hour=0,min=0,sec=0;
  if(sscanf(input,"%4d-%2d-%2dT%2d:%2d:%2d",
     &year,&month,&day,&hour,&min,&sec)!=6)return false;
  if(year<2020||year>2100||month<1||month>12||day<1||day>31||
    hour>23||min>59||sec>59)return false;
  tm dt{};dt.tm_year=year-1900;dt.tm_mon=month-1;
  dt.tm_mday=day;dt.tm_hour=hour;dt.tm_min=min;dt.tm_sec=sec;
  const time_t utc=timegm(&dt);
  if(utc<=0)return false;
  int offset=0;
  const char suffix=input[19];
  if(suffix=='Z'&&input[20]=='\0')offset=0;
  else if((suffix=='+'||suffix=='-')&&strlen(input)>=25&&input[22]==':'&&input[25]=='\0'){
    int oh=0,om=0;
    if(sscanf(input+20,"%2d:%2d",&oh,&om)!=2||oh>23||om>59)return false;
    offset=(suffix=='+'?1:-1)*(oh*3600+om*60);
  }else return false;
  epoch=static_cast<int64_t>(utc)-offset;
  return true;
}
void showError(const char* reason){
  board=mini::Board{};
  board.mode=mini::Mode::Live;
  board.valid=false;
  board.error=reason;
  board.stopName=MINI_STOP_NAME;
  Serial.printf("Mini LIVE unavailable: %s\n",reason);
}
bool connectSecure(){
  if(!strlen(MINI_WIFI_SSID)||!strlen(MINI_ROOT_CA_PEM)){
    showError("WIFI OR CA NOT CONFIGURED");return false;
  }
  if(WiFi.status()!=WL_CONNECTED){
    WiFi.mode(WIFI_STA);
    WiFi.begin(MINI_WIFI_SSID,MINI_WIFI_PASSWORD);
    const uint32_t since=millis();
    while(WiFi.status()!=WL_CONNECTED&&millis()-since<12000)delay(200);
  }
  if(WiFi.status()!=WL_CONNECTED){showError("WIFI OFFLINE");return false;}
  if(time(nullptr)<1700000000){
    configTzTime("CET-1CEST,M3.5.0/2,M10.5.0/3",
      "pool.ntp.org","time.google.com");
    const uint32_t since=millis();
    while(time(nullptr)<1700000000&&millis()-since<12000)delay(200);
  }
  if(time(nullptr)<1700000000){showError("CLOCK NOT SYNCHRONIZED");return false;}
  return true;
}
bool updateLive(){
  if(!connectSecure())return false;
  const String stopId=MINI_STOP_ID;
  if(!validStopId(stopId)){showError("INVALID STOP ID");return false;}
  WiFiClientSecure secure;
  secure.setCACert(MINI_ROOT_CA_PEM); // Always validate server certificate.
  HTTPClient http;
  http.setTimeout(10000);
  String url=API_ROOT+stopId;
  if(!http.begin(secure,url)){showError("HTTPS START FAILED");return false;}
  const int status=http.GET();
  if(status!=200){
    http.end();
    showError(status==404?"WORKER ROUTE 404":
      status==503?"ENTUR SOURCE 503":"HTTP / TLS ERROR");
    return false;
  }
  const int contentLength=http.getSize();
  if(contentLength>16000){http.end();showError("RESPONSE TOO LARGE");return false;}
  String payload=http.getString();http.end();
  if(payload.length()>16000){showError("RESPONSE TOO LARGE");return false;}
  JsonDocument document;
  if(deserializeJson(document,payload)!=DeserializationError::Ok){
    showError("INVALID JSON");return false;
  }
  if(document["schemaVersion"].as<int>()!=1||
     document["stopId"].as<String>()!=stopId||
     document["source"].as<String>()!="Entur Journey Planner v3"||
     !document["departures"].is<JsonArray>()){
    showError("INVALID STOP OR SOURCE");return false;
  }
  JsonArrayConst arr=document["departures"].as<JsonArrayConst>();
  if(arr.size()>80){showError("TOO MANY DEPARTURES");return false;}
  mini::Board received;
  received.mode=mini::Mode::Live;
  received.stopId=stopId.c_str();
  const String name=document["stopName"].as<String>();
  received.stopName=(name.length()&&name.length()<151)?
    std::string(name.c_str()):std::string(MINI_STOP_NAME);
  const int64_t now=nowEpoch();
  for(JsonObjectConst row:arr){
    if(received.count>=32)break;
    const String line=row["line"].as<String>();
    const String destination=row["destination"].as<String>();
    const String at=row["at"].as<String>();
    if(!line.length()||line.length()>10||!destination.length()||
       destination.length()>120||
       !row["realtime"].is<bool>()||!row["cancelled"].is<bool>())continue;
    int64_t epoch=0;
    if(!parseIso(at.c_str(),epoch)||epoch<now-120||epoch>now+86400)continue;
    received.departures[received.count++]={
      std::string(line.c_str()),std::string(destination.c_str()),epoch,
      row["realtime"].as<bool>(),row["cancelled"].as<bool>()};
  }
  std::sort(received.departures.begin(),
    received.departures.begin()+received.count,
    [](const mini::Departure &a,const mini::Departure &b){return a.epoch<b.epoch;});
  board=received;
  Serial.printf("Mini LIVE valid: %u departures (no vehicle GPS)\n",board.count);
  return true;
}
void draw(){
  mini::draw(screen,profile,mini::Palette::Rgb,board,nowEpoch());
  screen.present();
}
} // namespace

void setup(){
  Serial.begin(115200);
  delay(200);
  if(!mini::validProfile(profile)||!screen.begin()){
    Serial.println("Mini display initialization failed: check panel dimensions and hardware setup");
    while(true)delay(1000);
  }
  if(mode==mini::Mode::Demo){
    board=mini::demoBoard(nowEpoch(),MINI_STOP_ID,MINI_STOP_NAME);
    Serial.println("MINI DEMO: SIMULERT, Wi-Fi disabled");
  }else{
    showError("WAITING FOR ENTUR");
  }
  draw();
}
void loop(){
  // Explicit Serial control; never auto-switch from LIVE failure into DEMO.
  while(Serial.available()){
    const char ch=static_cast<char>(Serial.read());
    if(ch=='d'||ch=='D'){
      mode=mini::Mode::Demo;WiFi.disconnect(true);
      board=mini::demoBoard(nowEpoch(),MINI_STOP_ID,MINI_STOP_NAME);
      Serial.println("Mode: DEMO / SIMULERT");
    }else if(ch=='l'||ch=='L'){
      mode=mini::Mode::Live;showError("WAITING FOR ENTUR");
      forceFetch=true;Serial.println("Mode: LIVE (measured departures, not GPS)");
    }else if(ch=='r'||ch=='R')forceFetch=true;
  }
  const uint32_t now=millis();
  if(mode==mini::Mode::Live&&(forceFetch||now-lastFetch>=REFRESH_MS)){
    forceFetch=false;lastFetch=millis();
    updateLive();
  }
  if(now-lastFrame>=FRAME_MS){
    lastFrame=now;draw();
  }
  delay(15);
}

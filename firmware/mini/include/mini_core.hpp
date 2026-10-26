#pragma once
// Portable Mini contract: no Arduino, GPIO, Wi-Fi or display dependencies.
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <ctime>
#include <string>

namespace mini {
enum class PanelKind { Led, Mono, Lcd };
enum class Palette { Rgb, Amber, Mono };
enum class Mode { Demo, Live };
struct Profile { uint16_t width=64,height=64; PanelKind kind=PanelKind::Led; };
struct Layout { uint16_t header=0,footer=0,rowHeight=9,rows=1,fontSize=6; bool compact=false; };
struct Departure {
  std::string line,destination;
  int64_t epoch=0; // absolute Unix seconds in UTC
  bool realtime=false,cancelled=false;
};
struct Board {
  std::string stopId="NSR:StopPlace:41613",stopName="Prinsens gate";
  std::array<Departure,32> departures{};
  uint8_t count=0;
  Mode mode=Mode::Demo;
  bool valid=true;
  std::string error;
};
struct Colors { uint16_t bg,fg,accent,ok,dim,alert; };
constexpr uint16_t rgb(uint8_t r,uint8_t g,uint8_t b){
  return static_cast<uint16_t>(((r&0xf8)<<8)|((g&0xfc)<<3)|(b>>3));
}
inline Colors colors(Palette p,PanelKind kind){
  if(kind==PanelKind::Mono||p==Palette::Mono)
    return {rgb(3,11,8),rgb(230,255,233),rgb(164,239,194),
      rgb(210,255,237),rgb(108,153,131),rgb(243,255,239)};
  if(p==Palette::Amber)
    return {rgb(11,9,6),rgb(255,214,138),rgb(255,171,53),
      rgb(255,191,103),rgb(132,98,65),rgb(255,146,114)};
  return {rgb(7,16,24),rgb(233,244,238),rgb(243,163,60),
    rgb(100,242,172),rgb(122,139,146),rgb(255,114,114)};
}
inline bool validProfile(Profile p){
  return p.width>=16&&p.width<=512&&p.height>=16&&p.height<=320&&
    static_cast<uint32_t>(p.width)*p.height<=131072;
}
inline Layout geometry(Profile p){
  Layout g;
  g.compact=p.width<48||p.height<24;
  g.header=p.height>=32?std::max(8,static_cast<int>(p.height*.17)):0;
  g.footer=p.height>=56?std::max(8,static_cast<int>(p.height*.13)):0;
  g.rowHeight=p.kind==PanelKind::Lcd?
    std::max(14,static_cast<int>(p.height*.145)):
    p.width<=64?9:p.height<=32?10:std::max(10,static_cast<int>(p.height*.15));
  g.rows=std::max(1,std::min(10,static_cast<int>((p.height-g.header-g.footer)/g.rowHeight)));
  g.fontSize=p.kind==PanelKind::Lcd?
    std::max(11,std::min(28,static_cast<int>(g.rowHeight*.7))):
    g.compact?6:std::min(18,std::max(7,static_cast<int>(g.rowHeight*.72)));
  return g;
}
inline std::string ascii(const std::string &s){
  std::string out;out.reserve(s.size());
  for(size_t i=0;i<s.size();++i){
    const auto c=static_cast<uint8_t>(s[i]);
    if(c<128){out+=static_cast<char>(c);continue;}
    if(c==0xc3&&i+1<s.size()){
      const uint8_t tail=static_cast<uint8_t>(s[++i]);
      if(tail==0xa6||tail==0x86){out+="ae";continue;}
      if(tail==0xb8||tail==0x98){out+="o";continue;}
      if(tail==0xa5||tail==0x85){out+="a";continue;}
      if(tail==0xa4||tail==0x84){out+="a";continue;}
      if(tail==0xb6||tail==0x96){out+="o";continue;}
      out+='?';continue;
    }
    out+='?';
  }
  return out;
}
inline int64_t minutesUntil(int64_t when,int64_t now){
  return std::max<int64_t>(0,(when-now+59)/60);
}
inline std::string hhmm(int64_t when){
  time_t t=static_cast<time_t>(when);
  std::tm value{};
#if defined(_WIN32)
  localtime_s(&value,&t);
#else
  localtime_r(&t,&value);
#endif
  char text[8];
  std::snprintf(text,sizeof(text),"%02d:%02d",value.tm_hour,value.tm_min);
  return text;
}
inline std::string timeLabel(const Departure &d,int64_t now){
  if(d.cancelled)return "INNST.";
  const int64_t m=minutesUntil(d.epoch,now);
  if(m==0)return "NA";
  if(m<=99)return std::to_string(m)+"m";
  return hhmm(d.epoch);
}
inline Board demoBoard(int64_t now,const std::string &stopId="NSR:StopPlace:41613",
                        const std::string &stop="Prinsens gate"){
  Board out;out.mode=Mode::Demo;out.stopId=stopId;out.stopName=stop;
  constexpr const char* lines[]={"1","2","3","1","10","20","12","75","2","22"};
  constexpr const char* names[]={"Ranheim","Strindheim","Hallset","Kattem","Saeterbakken",
    "Romolslia","Dragvoll","Spongdal","Lund","Vestlia"};
  constexpr int mins[]={2,5,7,12,16,21,27,33,39,45};
  for(size_t i=0;i<10;i++){
    out.departures[i]={lines[i],names[i],now+mins[i]*60,(i%2)==0,false};
  }
  out.count=10;
  return out;
}
struct Display {
  virtual ~Display()=default;
  virtual uint16_t width()const=0;
  virtual uint16_t height()const=0;
  virtual void clear(uint16_t color)=0;
  virtual void rect(int x,int y,int width,int height,uint16_t color)=0;
  // Text draws with a native 5x7 GFX font and integer scaling. 1 => 6x8 cell.
  virtual void text(int x,int y,const std::string& text,uint16_t color,uint8_t scale)=0;
  virtual void present()=0;
};
struct Stats { uint8_t rows=0,visible=0; };
inline Stats draw(Display &display,Profile p,Palette palette,const Board &board,int64_t now){
  if(!validProfile(p)||display.width()!=p.width||display.height()!=p.height)
    return {};
  const Layout g=geometry(p);
  const Colors col=colors(palette,p.kind);
  display.clear(col.bg);
  const int w=p.width,h=p.height,pad=w<=48?1:std::max(2,static_cast<int>(w*.04));
  const int gap=std::max(1,static_cast<int>(w*.025));
  const bool demo=board.mode==Mode::Demo;
  auto text=[&](int x,int y,const std::string &input,uint16_t color,int width,uint8_t scale){
    if(width<6*scale)return;
    const std::string clean=ascii(input);
    const size_t max=static_cast<size_t>(std::max(0,width/(6*scale)));
    display.text(x,y,clean.substr(0,max),color,scale);
  };
  if(g.header){
    display.rect(0,g.header-1,w,1,col.accent);
    const int topFont=std::max(6,std::min(static_cast<int>(g.fontSize)+1,static_cast<int>(g.header)-2));
    const uint8_t scale=std::max(1,topFont/8);
    const int room=w-2*pad-(demo?std::max(15,static_cast<int>(w*.23)):0);
    text(pad,std::max(0,(g.header-8*scale)/2),board.stopName,col.fg,room,scale);
    if(demo){
      if(w>=80)text(w-30,0,"DEMO",col.alert,28,1);
      else text(w-6,0,"D",col.alert,6,1);
    }
  }
  if(!board.valid){
    text(pad,g.header+2,"DATA FEIL",col.alert,w-2*pad,1);
    return {g.rows,0};
  }
  int visible=0;
  for(size_t i=0;i<board.count&&visible<g.rows;i++){
    const Departure &d=board.departures[i];
    if(d.cancelled)continue; // matches existing web Mini renderer
    const int y=g.header+visible*g.rowHeight;
    if(y+g.rowHeight>h-g.footer+1)break;
    if(visible%2==1&&p.kind==PanelKind::Lcd)display.rect(0,y,w,g.rowHeight,rgb(24,40,56));
    const uint8_t scale=std::max(1,static_cast<int>(g.fontSize)/8);
    const int baseline=y+std::max(1,(g.rowHeight-8*scale)/2);
    const int lineW=std::max(g.compact?7:12,static_cast<int>(std::round(w*(w<=64?.21:.14))));
    const int timeW=std::max(g.compact?10:15,static_cast<int>(std::round(w*(w<=64?.22:.18))));
    const int destX=pad+lineW+gap,destW=w-pad-timeW-gap-destX;
    text(pad,baseline,d.line,col.accent,lineW,scale);
    if(demo&&!g.header&&g.compact)text(destX,baseline,"D",col.alert,6,1);
    else if(destW>g.fontSize*1.4)text(destX,baseline,d.destination,col.fg,destW,scale);
    const std::string timer=g.compact?std::to_string(minutesUntil(d.epoch,now)):
      timeLabel(d,now);
    const int tw=std::min<int>(timer.size(),timeW/(6*scale))*6*scale;
    text(w-pad-tw,baseline,timer,d.realtime?col.ok:col.accent,timeW,scale);
    visible++;
  }
  if(!visible)text(pad,g.header+2,demo?"DEMO INGEN AVG.":"INGEN AVGANGER",
                    col.dim,w-2*pad,1);
  if(g.footer){
    display.rect(0,h-g.footer,w,1,col.accent);
    text(pad,h-g.footer+2,demo?"SIMULERT":"AVGANGER",col.dim,w-2*pad,1);
  }
  return {g.rows,static_cast<uint8_t>(visible)};
}
} // namespace mini

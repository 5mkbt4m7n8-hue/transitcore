#include "mini_core.hpp"
#include <cassert>
#include <iostream>
#include <string>
#include <vector>

struct Command {std::string type,text;int x,y,w,h,scale;uint16_t color;};
struct Recorder final:mini::Display {
  uint16_t w,h;
  std::vector<Command> commands;
  Recorder(uint16_t a,uint16_t b):w(a),h(b){}
  uint16_t width()const override{return w;}
  uint16_t height()const override{return h;}
  void clear(uint16_t c)override{commands.push_back({"clear","",0,0,w,h,1,c});}
  void rect(int x,int y,int width,int height,uint16_t c)override{
    assert(x>=0&&y>=0&&width>=0&&height>=0&&x+width<=w&&y+height<=h);
    commands.push_back({"rect","",x,y,width,height,1,c});
  }
  void text(int x,int y,const std::string &s,uint16_t c,uint8_t scale)override{
    assert(x>=0&&x<w&&y>=0&&y<h&&scale>=1);
    commands.push_back({"text",s,x,y,0,0,scale,c});
  }
  void present()override{}
  bool has(const std::string &part)const{
    for(const auto &c:commands)if(c.type=="text"&&c.text.find(part)!=std::string::npos)return true;
    return false;
  }
};
int main(int argc,char**argv){
  struct Record {const char*id;mini::Profile p;};
  const Record all[]={
    {"led-32x16",{32,16,mini::PanelKind::Led}},
    {"led-64x32",{64,32,mini::PanelKind::Led}},
    {"led-64x64",{64,64,mini::PanelKind::Led}},
    {"led-128x64",{128,64,mini::PanelKind::Led}},
    {"led-128x128",{128,128,mini::PanelKind::Led}},
    {"lcd-128x64",{128,64,mini::PanelKind::Mono}},
    {"lcd-240x135",{240,135,mini::PanelKind::Lcd}},
    {"lcd-320x240",{320,240,mini::PanelKind::Lcd}},
    {"custom",{96,48,mini::PanelKind::Led}}
  };
  if(argc>1&&std::string(argv[1])=="--geometry"){
    for(const auto &r:all){
      const auto g=mini::geometry(r.p);
      std::cout<<r.id<<","<<g.header<<","<<g.footer<<","<<g.rowHeight<<","
       <<g.rows<<","<<g.fontSize<<","<<(g.compact?1:0)<<"\n";
    }
    return 0;
  }
  assert(mini::validProfile({64,64,mini::PanelKind::Led}));
  assert(!mini::validProfile({0,64,mini::PanelKind::Led}));
  assert(!mini::validProfile({512,320,mini::PanelKind::Led}));
  assert(mini::geometry({32,16,mini::PanelKind::Led}).rows==1);
  assert(mini::geometry({64,64,mini::PanelKind::Led}).rows==5);
  assert(mini::ascii("Sæterbakken / Øya / Ås").find("Saeterbakken")!=std::string::npos);
  const int64_t now=1800000000;
  assert(mini::minutesUntil(now+119,now)==2);
  assert(mini::minutesUntil(now-2,now)==0);
  assert(mini::timeLabel({"1","Ranheim",now,false,false},now)=="NA");
  assert(mini::timeLabel({"1","Ranheim",now,true,true},now)=="INNST.");
  for(const auto &r:all){
    const auto p=r.p;
    assert(mini::validProfile(p));
    Recorder rec{p.width,p.height};
    auto board=mini::demoBoard(now);
    const auto out=mini::draw(rec,p,mini::Palette::Rgb,board,now);
    assert(out.rows==mini::geometry(p).rows);
    assert(out.visible>=1&&out.visible<=10);
    assert(rec.has("1")&&rec.commands.size()>=3);
    assert(rec.commands[0].type=="clear");
    if(p.width>=64&&p.height>=32)assert(p.kind==mini::PanelKind::Led?rec.has("PRINSENS"):(rec.has("Prinsens")||rec.has("Prinsen")));
    Recorder error{p.width,p.height};
    board.valid=false;board.mode=mini::Mode::Live;
    const auto fail=mini::draw(error,p,mini::Palette::Rgb,board,now);
    assert(fail.visible==0);
    if(p.width>=64)assert(error.has("DATA"));
  }
  Recorder wrong{32,16};
  assert(mini::draw(wrong,{64,64,mini::PanelKind::Led},mini::Palette::Amber,
    mini::demoBoard(now),now).rows==0);
  Recorder mono{128,64};
  auto demo=mini::demoBoard(now);
  mini::draw(mono,{128,64,mini::PanelKind::Mono},mini::Palette::Mono,demo,now);
  assert(mono.has("SIMULERT"));
  Recorder live{128,64};
  demo.mode=mini::Mode::Live;
  mini::draw(live,{128,64,mini::PanelKind::Mono},mini::Palette::Mono,demo,now);
  assert(!live.has("SIMULERT")&&live.has("AVGANGER"));
  std::cout<<"Mini portable C++ renderer: 9 physical resolutions, source modes, bounds and error states PASS\n";
}

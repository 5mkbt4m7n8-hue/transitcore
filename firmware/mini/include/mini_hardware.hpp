#pragma once
// Hardware selection is made by PlatformIO environment. Never guess HUB75 pins.
#include <Arduino.h>
#include "mini_core.hpp"

#if defined(MINI_PANEL_HUB75)
  #include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#elif defined(MINI_PANEL_OLED)
  #include <Wire.h>
  #include <Adafruit_GFX.h>
  #include <Adafruit_SSD1306.h>
#elif defined(MINI_PANEL_TFT)
  #include <TFT_eSPI.h>
#else
  #error "Choose one MINI_PANEL_HUB75, MINI_PANEL_OLED, or MINI_PANEL_TFT"
#endif

#ifndef MINI_WIDTH
  #define MINI_WIDTH 64
#endif
#ifndef MINI_HEIGHT
  #define MINI_HEIGHT 64
#endif

#if defined(MINI_PANEL_HUB75)
// Required values have NO default pin mapping: board/adapter must be verified.
  #if !defined(MINI_PIN_R1) || !defined(MINI_PIN_G1) || !defined(MINI_PIN_B1) || \
      !defined(MINI_PIN_R2) || !defined(MINI_PIN_G2) || !defined(MINI_PIN_B2) || \
      !defined(MINI_PIN_A) || !defined(MINI_PIN_B) || !defined(MINI_PIN_C) || \
      !defined(MINI_PIN_D) || !defined(MINI_PIN_E) || !defined(MINI_PIN_LAT) || \
      !defined(MINI_PIN_OE) || !defined(MINI_PIN_CLK)
    #error "Set all MINI_PIN_* HUB75 GPIO values after checking your ESP32 board and panel wiring"
  #endif
#endif

#if defined(MINI_PANEL_TFT) && !defined(MINI_TFT_CONFIGURED)
  #error "Configure TFT_eSPI controller and pins and define MINI_TFT_CONFIGURED=1 before building"
#endif

namespace mini {
class HardwareDisplay final: public Display {
public:
#if defined(MINI_PANEL_HUB75)
  HardwareDisplay():pins_{MINI_PIN_R1,MINI_PIN_G1,MINI_PIN_B1,
    MINI_PIN_R2,MINI_PIN_G2,MINI_PIN_B2,
    MINI_PIN_A,MINI_PIN_B,MINI_PIN_C,MINI_PIN_D,MINI_PIN_E,
    MINI_PIN_LAT,MINI_PIN_OE,MINI_PIN_CLK},
    config_{MINI_WIDTH,MINI_HEIGHT,1,pins_},matrix_{config_}{}
#elif defined(MINI_PANEL_OLED)
  HardwareDisplay():oled_{MINI_WIDTH,MINI_HEIGHT,&Wire,-1}{}
#endif
  bool begin(){
#if defined(MINI_PANEL_HUB75)
    if(!matrix_.begin())return false;
    matrix_.setBrightness8(22); // initial conservative prototype brightness
    matrix_.setTextWrap(false);
    return true;
#elif defined(MINI_PANEL_OLED)
    if(!oled_.begin(SSD1306_SWITCHCAPVCC,0x3c))return false;
    oled_.setTextWrap(false);
    return true;
#else
    tft_.init();
    tft_.setRotation(MINI_TFT_ROTATION);
    tft_.setTextWrap(false);
    return tft_.width()==MINI_WIDTH&&tft_.height()==MINI_HEIGHT;
#endif
  }
  uint16_t width()const override{return MINI_WIDTH;}
  uint16_t height()const override{return MINI_HEIGHT;}
  void clear(uint16_t color)override{
#if defined(MINI_PANEL_HUB75)
    matrix_.fillScreen(color);
#elif defined(MINI_PANEL_OLED)
    oled_.fillScreen(mono(color));
#else
    tft_.fillScreen(color);
#endif
  }
  void rect(int x,int y,int w,int h,uint16_t color)override{
#if defined(MINI_PANEL_HUB75)
    matrix_.fillRect(x,y,w,h,color);
#elif defined(MINI_PANEL_OLED)
    oled_.fillRect(x,y,w,h,mono(color));
#else
    tft_.fillRect(x,y,w,h,color);
#endif
  }
  void text(int x,int y,const std::string &word,uint16_t color,uint8_t scale)override{
#if defined(MINI_PANEL_HUB75)
    matrix_.setTextColor(color);
    matrix_.setTextSize(scale);
    matrix_.setCursor(x,y);matrix_.print(word.c_str());
#elif defined(MINI_PANEL_OLED)
    oled_.setTextColor(mono(color));
    oled_.setTextSize(scale);
    oled_.setCursor(x,y);oled_.print(word.c_str());
#else
    tft_.setTextColor(color);
    tft_.setTextSize(scale);
    tft_.drawString(word.c_str(),x,y,1);
#endif
  }
  void present()override{
#if defined(MINI_PANEL_OLED)
    oled_.display();
#endif
    // HUB75 I2S DMA continuously scans the framebuffer;
    // TFT draws directly. No separate swap required.
  }
private:
#if defined(MINI_PANEL_HUB75)
  HUB75_I2S_CFG::i2s_pins pins_;
  HUB75_I2S_CFG config_;
  MatrixPanel_I2S_DMA matrix_;
#elif defined(MINI_PANEL_OLED)
  Adafruit_SSD1306 oled_;
#else
  TFT_eSPI tft_;
#endif
#if defined(MINI_PANEL_OLED)
  static uint16_t mono(uint16_t c){
    const int r=(c>>11)&31,g=(c>>5)&63,b=c&31;
    return r*2+g+b*2>98?SSD1306_WHITE:SSD1306_BLACK;
  }
#endif
};
} // namespace mini

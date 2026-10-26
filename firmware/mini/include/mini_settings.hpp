#pragma once
// Safe source-controlled defaults. Override in a private mini_secrets.h or
// PlatformIO build flags; do NOT commit Wi-Fi secrets or TLS root certificates.
#ifndef MINI_WIDTH
  #define MINI_WIDTH 128
#endif
#ifndef MINI_HEIGHT
  #define MINI_HEIGHT 64
#endif
#ifndef MINI_TFT_ROTATION
  #define MINI_TFT_ROTATION 1
#endif
#ifndef MINI_STOP_ID
  #define MINI_STOP_ID "NSR:StopPlace:41613"
#endif
#ifndef MINI_STOP_NAME
  #define MINI_STOP_NAME "Prinsens gate"
#endif
#ifndef MINI_USE_LIVE
  #define MINI_USE_LIVE 0 // default: offline and explicitly SIMULERT
#endif
#ifndef MINI_WIFI_SSID
  #define MINI_WIFI_SSID ""
#endif
#ifndef MINI_WIFI_PASSWORD
  #define MINI_WIFI_PASSWORD ""
#endif
#ifndef MINI_ROOT_CA_PEM
  #define MINI_ROOT_CA_PEM "" // Required for verified TLS in live mode
#endif
// Your private secrets file can #undef and override the above macros.
#if __has_include("mini_secrets.h")
  #include "mini_secrets.h"
#endif

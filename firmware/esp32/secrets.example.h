#pragma once

// Copy this file to secrets.h. Wi-Fi values are optional fallbacks: when they
// are absent or fail, the ESP32 starts a phone-friendly setup network.
// Never commit secrets.h to GitHub.
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
#define TRANSITCORE_DEVICE_ID "YOUR_UNIQUE_DEVICE_ID"
#define TRANSITCORE_DEVICE_TOKEN "YOUR_UNIQUE_DEVICE_TOKEN"

// Temporary migration fallback for older firmware only.
#define TRANSITCORE_STATUS_TOKEN ""



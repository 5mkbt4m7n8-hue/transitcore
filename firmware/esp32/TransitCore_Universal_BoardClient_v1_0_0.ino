#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>
#include <time.h>
#include "secrets.h"
#include "board_config.h"

// TransitCore Universal Board Client v1.0.0
// One stable ESP32 engine; board_config.h selects the physical board.

// -----------------------------------------------------------------------------
// USER CONFIG
// -----------------------------------------------------------------------------
const bool LED_HARDWARE_ENABLED = false;
const bool LED_STARTUP_TEST_ENABLED = false;
const uint8_t LOCAL_BRIGHTNESS_LIMIT = 32;
const neoPixelType LED_PIXEL_TYPE = NEO_GRB + NEO_KHZ800;

const unsigned long POLL_INTERVAL_MS = 10000;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
const unsigned long WIFI_STABLE_BEFORE_HTTP_MS = 2000;
const unsigned long HTTP_CONNECT_TIMEOUT_MS = 10000;
const unsigned long HTTP_RESPONSE_TIMEOUT_MS = 20000;
const int HTTP_MAX_RETRIES = 1;
const size_t MAX_RESPONSE_BYTES = 32768;
const size_t JSON_CAPACITY = 32768;
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.google.com";
const uint32_t MAX_CLOCK_SKEW_SECONDS = 15;

// -----------------------------------------------------------------------------
// FRAME STORAGE
// -----------------------------------------------------------------------------
enum LedState : uint8_t {
  LED_OFF = 0,
  LED_APPROACHING = 1,
  LED_AT_STOP = 2
};

struct LedPixel {
  uint8_t red;
  uint8_t green;
  uint8_t blue;
  uint8_t brightness;
  LedState state;
};

Adafruit_NeoPixel strip(
  LED_COUNT,
  LED_DATA_PIN,
  LED_PIXEL_TYPE
);

LedPixel activeFrame[LED_COUNT];
LedPixel candidateFrame[LED_COUNT];

bool hasValidFrame = false;
bool ttlExpired = false;
uint32_t lastSequence = 0;
uint32_t frameTtlMs = 30000;
unsigned long lastValidFrameAtMs = 0;
unsigned long lastPollAtMs = 0;
unsigned long lastWifiAttemptAtMs = 0;
unsigned long wifiConnectedAtMs = 0;
uint16_t consecutiveFeedFailures = 0;

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------
void clearFrame(LedPixel* frame) {
  for (uint16_t i = 0; i < LED_COUNT; i++) {
    frame[i] = {0, 0, 0, 0, LED_OFF};
  }
}

void clearHardware() {
  if (!LED_HARDWARE_ENABLED) return;
  strip.clear();
  strip.show();
}

uint8_t scaleChannel(
  uint8_t channel,
  uint8_t brightness,
  uint8_t animationLevel
) {
  const uint16_t capped = min(
    brightness,
    LOCAL_BRIGHTNESS_LIMIT
  );

  return (uint32_t)channel * capped * animationLevel /
    (255UL * 255UL);
}

uint8_t approachingPulse() {
  const unsigned long phase = millis() % 1800UL;
  const unsigned long triangle =
    phase < 900UL ? phase : 1800UL - phase;

  return 55 + (uint32_t)triangle * 200 / 900UL;
}

void renderFrame() {
  if (!LED_HARDWARE_ENABLED) return;

  const uint8_t pulse = approachingPulse();

  for (uint16_t i = 0; i < LED_COUNT; i++) {
    const LedPixel& pixel = activeFrame[i];
    const uint8_t level =
      pixel.state == LED_APPROACHING ? pulse : 255;

    strip.setPixelColor(
      i,
      scaleChannel(pixel.red, pixel.brightness, level),
      scaleChannel(pixel.green, pixel.brightness, level),
      scaleChannel(pixel.blue, pixel.brightness, level)
    );
  }

  strip.show();
}

void startupTest() {
  if (!LED_HARDWARE_ENABLED || !LED_STARTUP_TEST_ENABLED) return;

  strip.clear();
  for (uint16_t i = 0; i < LED_COUNT; i++) {
    strip.clear();
    strip.setPixelColor(i, 0, LOCAL_BRIGHTNESS_LIMIT, 0);
    strip.show();
    delay(40);
  }
  clearHardware();
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (wifiConnectedAtMs == 0) {
      wifiConnectedAtMs = millis();
      Serial.printf("Wi-Fi OK. IP: %s\n", WiFi.localIP().toString().c_str());
    }
    return;
  }

  wifiConnectedAtMs = 0;

  const unsigned long now = millis();
  if (
    lastWifiAttemptAtMs != 0 &&
    now - lastWifiAttemptAtMs < WIFI_RETRY_INTERVAL_MS
  ) return;

  lastWifiAttemptAtMs = now;
  Serial.println("Wi-Fi frakoblet. Starter nytt forsÃ¸k.");
  WiFi.disconnect(false, false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

bool receiveFeedBody(
  String& body,
  int& httpStatus,
  String& error
) {
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(HTTP_RESPONSE_TIMEOUT_MS);

  HTTPClient http;
  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_RESPONSE_TIMEOUT_MS);
  http.useHTTP10(false);

  if (!http.begin(client, FEED_URL)) {
    error = "HTTP begin feilet";
    return false;
  }

  httpStatus = http.GET();
  if (httpStatus != HTTP_CODE_OK) {
    error = "HTTP status " + String(httpStatus);
    http.end();
    return false;
  }

  body = http.getString();
  http.end();

  if (body.length() == 0) {
    error = "tom HTTP-body";
    return false;
  }

  if (body.length() > MAX_RESPONSE_BYTES) {
    error = "HTTP-body for stor: " + String(body.length());
    body = "";
    return false;
  }

  return true;
}

LedState parseState(const char* value) {
  if (strcmp(value, "AT_STOP") == 0) return LED_AT_STOP;
  if (strcmp(value, "APPROACHING") == 0) {
    return LED_APPROACHING;
  }
  return LED_OFF;
}

const char* stateName(LedState state) {
  if (state == LED_AT_STOP) return "AT_STOP";
  if (state == LED_APPROACHING) return "APPROACHING";
  return "OFF";
}

bool parseUtcTimestamp(const char* value, time_t& epoch) {
  if (value == nullptr || strlen(value) < 20) return false;

  struct tm parsed = {};
  char seconds[3] = {value[17], value[18], '\0'};
  parsed.tm_year = atoi(value) - 1900;
  parsed.tm_mon = atoi(value + 5) - 1;
  parsed.tm_mday = atoi(value + 8);
  parsed.tm_hour = atoi(value + 11);
  parsed.tm_min = atoi(value + 14);
  parsed.tm_sec = atoi(seconds);
  epoch = mktime(&parsed);
  return epoch > 0;
}

void printFrameSimulation(uint32_t sequence, uint16_t activeCount) {
  Serial.printf(
    "TAVLESIMULATOR | sequence %lu | aktive %u/%u\n",
    (unsigned long)sequence,
    activeCount,
    LED_COUNT
  );

  if (activeCount == 0) {
    Serial.println("  Ingen aktive LED-er.");
    return;
  }

  for (uint16_t id = 0; id < LED_COUNT; id++) {
    const LedPixel& pixel = candidateFrame[id];
    if (pixel.state == LED_OFF) continue;
    Serial.printf(
      "  LED %03u | %-11s | RGB %u,%u,%u | brightness %u\n",
      id,
      stateName(pixel.state),
      pixel.red,
      pixel.green,
      pixel.blue,
      pixel.brightness
    );
  }
}

bool parseAndValidateFrame(
  const String& body,
  String& error,
  uint16_t& activeCount,
  uint32_t& sequence,
  uint32_t& ttlMs
) {
  DynamicJsonDocument document(JSON_CAPACITY);
  const DeserializationError jsonError =
    deserializeJson(document, body);

  if (jsonError) {
    error = "JSON-feil: ";
    error += jsonError.c_str();
    return false;
  }

  if (document["schemaVersion"] != 1) {
    error = "ukjent schemaVersion";
    return false;
  }

  const char* boardProfile = document["boardProfile"] | "";
  if (strcmp(boardProfile, EXPECTED_BOARD_PROFILE) != 0) {
    error = "feil boardProfile";
    return false;
  }

  if (document["ledCount"] != LED_COUNT) {
    error = "feil ledCount";
    return false;
  }

  const char* generatedAt = document["generatedAt"] | "";
  if (generatedAt[0] == '\0') {
    error = "generatedAt mangler";
    return false;
  }

  time_t generatedEpoch = 0;
  const time_t nowEpoch = time(nullptr);
  if (nowEpoch < 1577836800) {
    error = "UTC-klokken er ikke synkronisert";
    return false;
  }
  if (!parseUtcTimestamp(generatedAt, generatedEpoch)) {
    error = "ugyldig generatedAt";
    return false;
  }

  sequence = document["sequence"] | 0;
  if (sequence == 0) {
    error = "ugyldig sequence";
    return false;
  }

  const uint32_t ttlSeconds = document["ttlSeconds"] | 0;
  if (ttlSeconds < 10 || ttlSeconds > 300) {
    error = "ugyldig ttlSeconds";
    return false;
  }
  const int64_t ageSeconds = (int64_t)nowEpoch - (int64_t)generatedEpoch;
  if (ageSeconds > (int64_t)ttlSeconds) {
    error = "frame er utlÃ¸pt ved mottak: " + String((long)ageSeconds) + " s";
    return false;
  }
  if (ageSeconds < -(int64_t)MAX_CLOCK_SKEW_SECONDS) {
    error = "generatedAt ligger i fremtiden";
    return false;
  }
  const uint32_t consumedTtlSeconds = ageSeconds > 0 ? ageSeconds : 0;
  ttlMs = (ttlSeconds - consumedTtlSeconds) * 1000UL;

  JsonArray leds = document["leds"].as<JsonArray>();
  if (leds.isNull() || leds.size() > LED_COUNT) {
    error = "ugyldig leds-array";
    return false;
  }

  clearFrame(candidateFrame);
  bool seen[LED_COUNT] = {false};
  activeCount = 0;

  for (JsonObject item : leds) {
    const int id = item["id"] | -1;
    JsonArray rgb = item["rgb"].as<JsonArray>();
    const int brightness = item["brightness"] | -1;
    const char* stateText = item["state"] | "";
    const LedState state = parseState(stateText);

    if (
      id < 0 || id >= LED_COUNT || seen[id] ||
      rgb.isNull() || rgb.size() != 3 ||
      brightness < 0 || brightness > 255 ||
      state == LED_OFF
    ) {
      error = "ugyldig LED-oppfÃ¸ring";
      return false;
    }

    const int red = rgb[0] | -1;
    const int green = rgb[1] | -1;
    const int blue = rgb[2] | -1;
    if (
      red < 0 || red > 255 ||
      green < 0 || green > 255 ||
      blue < 0 || blue > 255
    ) {
      error = "ugyldig RGB-verdi";
      return false;
    }

    seen[id] = true;
    candidateFrame[id] = {
      (uint8_t)red,
      (uint8_t)green,
      (uint8_t)blue,
      (uint8_t)brightness,
      state
    };
    activeCount++;
  }

  return true;
}

void acceptCandidateFrame(
  uint16_t activeCount,
  uint32_t sequence,
  uint32_t ttlMs
) {
  memcpy(activeFrame, candidateFrame, sizeof(activeFrame));
  hasValidFrame = true;
  ttlExpired = false;
  lastSequence = sequence;
  frameTtlMs = ttlMs;
  lastValidFrameAtMs = millis();

  Serial.printf(
    "LED-frame OK | sequence %lu | aktive %u/%u | TTL %lu s | heap %u\n",
    (unsigned long)lastSequence,
    activeCount,
    LED_COUNT,
    (unsigned long)(frameTtlMs / 1000UL),
    ESP.getFreeHeap()
  );
}

bool fetchFrameAttempt(int retryIndex) {
  String body;
  String error;
  int httpStatus = 0;

  Serial.printf(
    "Henter LED-feed | retry %d/%d | heap %u\n",
    retryIndex,
    HTTP_MAX_RETRIES,
    ESP.getFreeHeap()
  );

  if (!receiveFeedBody(body, httpStatus, error)) {
    Serial.printf("Feed-mottaksfeil: %s\n", error.c_str());
    return false;
  }

  uint16_t activeCount = 0;
  uint32_t sequence = 0;
  uint32_t ttlMs = 0;

  Serial.printf(
    "HTTP %d | body %u bytes | heap %u\n",
    httpStatus,
    body.length(),
    ESP.getFreeHeap()
  );

  if (!parseAndValidateFrame(
    body,
    error,
    activeCount,
    sequence,
    ttlMs
  )) {
    Serial.printf("Feed-valideringsfeil: %s\n", error.c_str());
    return false;
  }

  // A repeated sequence is still a valid freshness confirmation. An older
  // sequence is rejected to prevent a stale response from replacing new data.
  if (hasValidFrame && sequence < lastSequence) {
    Serial.printf(
      "Eldre frame forkastet | mottatt %lu | aktiv %lu\n",
      (unsigned long)sequence,
      (unsigned long)lastSequence
    );
    return false;
  }

  acceptCandidateFrame(activeCount, sequence, ttlMs);
  printFrameSimulation(sequence, activeCount);
  return true;
}

void fetchFrame() {
  if (WiFi.status() != WL_CONNECTED) return;

  for (int retry = 0; retry <= HTTP_MAX_RETRIES; retry++) {
    if (fetchFrameAttempt(retry)) {
      if (consecutiveFeedFailures > 0) {
        Serial.printf(
          "LED-feed tilbake etter %u mislykkede pollinger.\n",
          consecutiveFeedFailures
        );
      }
      consecutiveFeedFailures = 0;
      return;
    }
    if (retry < HTTP_MAX_RETRIES) delay(250);
  }

  Serial.println(
    "LED-feed utilgjengelig. Beholder siste gyldige frame."
  );
  if (consecutiveFeedFailures < UINT16_MAX) consecutiveFeedFailures++;
}

void enforceTtl() {
  if (!hasValidFrame || ttlExpired) return;

  if (millis() - lastValidFrameAtMs <= frameTtlMs) return;

  ttlExpired = true;
  clearFrame(activeFrame);
  clearHardware();
  Serial.println("LED-frame utlÃ¸pt. Tavlen er slukket.");
}

// -----------------------------------------------------------------------------
// ARDUINO
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(250);

  clearFrame(activeFrame);
  clearFrame(candidateFrame);

  if (LED_HARDWARE_ENABLED) {
    strip.begin();
    strip.clear();
    strip.show();
    startupTest();
  }

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttemptAtMs = millis();
  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);

  Serial.println("TransitCore Universal Board Client v1.0.0 starter.");
  Serial.printf(
    "Board %s | %u LED-er | hardware %s\n",
    EXPECTED_BOARD_PROFILE,
    LED_COUNT,
    LED_HARDWARE_ENABLED ? "PÃ…" : "AV"
  );
}

void loop() {
  ensureWifi();

  const unsigned long now = millis();
  if (
    WiFi.status() == WL_CONNECTED &&
    wifiConnectedAtMs != 0 &&
    now - wifiConnectedAtMs >= WIFI_STABLE_BEFORE_HTTP_MS &&
    (lastPollAtMs == 0 || now - lastPollAtMs >= POLL_INTERVAL_MS)
  ) {
    lastPollAtMs = now;
    fetchFrame();
  }

  enforceTtl();
  renderFrame();
  delay(20);
}


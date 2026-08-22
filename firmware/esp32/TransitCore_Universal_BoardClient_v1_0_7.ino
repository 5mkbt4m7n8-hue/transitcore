#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>
#include <time.h>
#include "secrets.h"
#include "board_config.h"

// TransitCore Universal Board Client v1.0.7
// One stable ESP32 engine; board_config.h selects the physical board.
// v1.0.7 adds a safe, non-blocking LED commissioning sequence.
// LED behavior is unchanged.

#ifndef TRANSITCORE_STATUS_TOKEN
#define TRANSITCORE_STATUS_TOKEN ""
#endif

// -----------------------------------------------------------------------------
// USER CONFIG
// -----------------------------------------------------------------------------
const bool LED_HARDWARE_ENABLED = false;
const bool LED_STARTUP_TEST_ENABLED = false;
const uint8_t LOCAL_BRIGHTNESS_LIMIT = 32;
const uint8_t LED_TEST_BRIGHTNESS = 8;
const unsigned long LED_TEST_STEP_MS = 250;
const neoPixelType LED_PIXEL_TYPE = NEO_GRB + NEO_KHZ800;

const unsigned long POLL_INTERVAL_MS = 10000;
const unsigned long WIFI_RETRY_BASE_MS = 5000;
const unsigned long WIFI_RETRY_MAX_MS = 60000;
const unsigned long WIFI_DEVICE_RESTART_MS = 10UL * 60UL * 1000UL;
const uint8_t WIFI_RADIO_RESET_EVERY_ATTEMPTS = 3;
const unsigned long WIFI_STABLE_BEFORE_HTTP_MS = 2000;
const unsigned long HTTP_CONNECT_TIMEOUT_MS = 10000;
const unsigned long HTTP_RESPONSE_TIMEOUT_MS = 20000;
const int HTTP_MAX_RETRIES = 1;
const size_t MAX_RESPONSE_BYTES = 32768;
const size_t JSON_CAPACITY = 32768;
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.google.com";
const uint32_t MAX_CLOCK_SKEW_SECONDS = 15;
const unsigned long HEALTH_REPORT_INTERVAL_MS = 5UL * 60UL * 1000UL;

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
unsigned long wifiDisconnectedAtMs = 0;
uint16_t wifiAttemptCount = 0;
bool wifiOutageActive = false;
bool hasEverConnected = false;
uint16_t consecutiveFeedFailures = 0;
uint32_t successfulFeedPolls = 0;
uint32_t failedFeedPolls = 0;
uint32_t wifiOutageCount = 0;
uint32_t wifiRecoveryCount = 0;
uint32_t minimumFreeHeap = UINT32_MAX;
unsigned long lastHealthReportAtMs = 0;
bool initialHealthLogged = false;
uint32_t activeProfileRevision = 0;
String activeProfileFingerprint = "";
bool profileMetadataPresent = false;
bool ledTestActive = false;
uint16_t ledTestStep = 0;
unsigned long lastLedTestStepAtMs = 0;

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

void beginLedTest() {
  if (!LED_HARDWARE_ENABLED || !LED_STARTUP_TEST_ENABLED) return;
  ledTestActive = true;
  ledTestStep = 0;
  lastLedTestStepAtMs = 0;
  clearHardware();
  Serial.printf(
    "LED-TEST starter | %u LED-er | brightness %u | %lu ms per steg\n",
    LED_COUNT,
    LED_TEST_BRIGHTNESS,
    LED_TEST_STEP_MS
  );
}

bool updateLedTest() {
  if (!ledTestActive) return false;
  const unsigned long now = millis();
  if (lastLedTestStepAtMs != 0 && now - lastLedTestStepAtMs < LED_TEST_STEP_MS) {
    return true;
  }
  lastLedTestStepAtMs = now;
  strip.clear();

  if (ledTestStep < 3) {
    const uint8_t red = ledTestStep == 0 ? LED_TEST_BRIGHTNESS : 0;
    const uint8_t green = ledTestStep == 1 ? LED_TEST_BRIGHTNESS : 0;
    const uint8_t blue = ledTestStep == 2 ? LED_TEST_BRIGHTNESS : 0;
    strip.setPixelColor(0, red, green, blue);
    strip.show();
    Serial.printf("LED-TEST kanal | LED 0 | %s\n", ledTestStep == 0 ? "RED" : ledTestStep == 1 ? "GREEN" : "BLUE");
    ledTestStep++;
    return true;
  }

  const uint16_t physicalLed = ledTestStep - 3;
  if (physicalLed < LED_COUNT) {
    strip.setPixelColor(physicalLed, LED_TEST_BRIGHTNESS, LED_TEST_BRIGHTNESS, LED_TEST_BRIGHTNESS);
    strip.show();
    Serial.printf("LED-TEST fysisk | LED %u/%u\n", physicalLed, LED_COUNT - 1);
    ledTestStep++;
    return true;
  }

  strip.show();
  ledTestActive = false;
  Serial.println("LED-TEST ferdig. Alle LED-er er slukket. Normal drift starter.");
  return false;
}

unsigned long wifiRetryDelayMs() {
  unsigned long delayMs = WIFI_RETRY_BASE_MS;
  const uint8_t steps = min((uint16_t)4, wifiAttemptCount);
  for (uint8_t i = 0; i < steps; i++) {
    delayMs = min(delayMs * 2UL, WIFI_RETRY_MAX_MS);
  }
  return delayMs;
}

void startWifiAttempt(bool resetRadio) {
  if (resetRadio) {
    Serial.println("Nullstiller Wi-Fi-radio fÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸r nytt forsÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸k.");
    WiFi.disconnect(true, false);
    delay(150);
    WiFi.mode(WIFI_STA);
  } else {
    WiFi.disconnect(false, false);
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttemptAtMs = millis();
  if (wifiAttemptCount < UINT16_MAX) wifiAttemptCount++;
  Serial.printf(
    "Wi-Fi-forsÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸k %u startet | neste tidligst om %lu s\n",
    wifiAttemptCount,
    wifiRetryDelayMs() / 1000UL
  );
}

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (wifiConnectedAtMs == 0) {
      wifiConnectedAtMs = millis();
      Serial.printf("Wi-Fi OK. IP: %s\n", WiFi.localIP().toString().c_str());
      if (hasEverConnected && wifiOutageActive) wifiRecoveryCount++;
      hasEverConnected = true;
    }
    wifiOutageActive = false;
    wifiDisconnectedAtMs = 0;
    wifiAttemptCount = 0;
    return;
  }

  wifiConnectedAtMs = 0;

  const unsigned long now = millis();
  if (!wifiOutageActive) {
    wifiOutageActive = true;
    wifiDisconnectedAtMs = now;
    wifiAttemptCount = 0;
    if (hasEverConnected) wifiOutageCount++;
    Serial.println("Wi-Fi frakoblet. Starter kontrollert gjenoppretting.");
  }

  if (now - wifiDisconnectedAtMs >= WIFI_DEVICE_RESTART_MS) {
    Serial.println("Wi-Fi har vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦rt borte i 10 minutter. Starter ESP pÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¥ nytt.");
    Serial.flush();
    delay(100);
    ESP.restart();
  }

  if (lastWifiAttemptAtMs != 0 && now - lastWifiAttemptAtMs < wifiRetryDelayMs()) return;

  const bool resetRadio =
    wifiAttemptCount > 0 &&
    wifiAttemptCount % WIFI_RADIO_RESET_EVERY_ATTEMPTS == 0;
  startWifiAttempt(resetRadio);
}

String feedHost() {
  String url = FEED_URL;
  const int scheme = url.indexOf("://");
  const int start = scheme >= 0 ? scheme + 3 : 0;
  int end = url.indexOf('/', start);
  if (end < 0) end = url.length();
  const int port = url.indexOf(':', start);
  if (port >= 0 && port < end) end = port;
  return url.substring(start, end);
}

String statusEndpoint() {
  String url = FEED_URL;
  const int scheme = url.indexOf("://");
  const int start = scheme >= 0 ? scheme + 3 : 0;
  const int slash = url.indexOf('/', start);
  if (slash >= 0) url = url.substring(0, slash);
  return url + "/v1/devices/" + EXPECTED_BOARD_PROFILE + "/status";
}

void printNetworkFailureDetails(
  int httpStatus,
  WiFiClientSecure& client,
  unsigned long elapsedMs
) {
  char tlsError[160] = {0};
  const int tlsCode = client.lastError(tlsError, sizeof(tlsError));
  const String host = feedHost();
  IPAddress resolved;
  const int dnsResult = WiFi.hostByName(host.c_str(), resolved);
  const wl_status_t wifiStatus = WiFi.status();

  Serial.printf(
    "Nettverksdiagnostikk | HTTP %d (%s) | elapsed %lu ms | "
    "Wi-Fi status %d | RSSI %d dBm\n",
    httpStatus,
    HTTPClient::errorToString(httpStatus).c_str(),
    elapsedMs,
    (int)wifiStatus,
    WiFi.RSSI()
  );
  Serial.printf(
    "  IP %s | gateway %s | DNS %s | host %s | oppslag %s",
    WiFi.localIP().toString().c_str(),
    WiFi.gatewayIP().toString().c_str(),
    WiFi.dnsIP().toString().c_str(),
    host.c_str(),
    dnsResult == 1 ? "OK" : "FEIL"
  );
  if (dnsResult == 1) {
    Serial.printf(" (%s)", resolved.toString().c_str());
  }
  Serial.println();
  Serial.printf(
    "  TLS code %d | TLS detail %s | heap %u\n",
    tlsCode,
    tlsError[0] != '\0' ? tlsError : "ingen detalj",
    ESP.getFreeHeap()
  );
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

  const unsigned long requestStartedAtMs = millis();
  httpStatus = http.GET();
  const unsigned long requestElapsedMs = millis() - requestStartedAtMs;
  if (httpStatus != HTTP_CODE_OK) {
    error = "HTTP status " + String(httpStatus) + " (" +
      HTTPClient::errorToString(httpStatus) + ")";
    printNetworkFailureDetails(
      httpStatus,
      client,
      requestElapsedMs
    );
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
  uint32_t& ttlMs,
  uint32_t& profileRevision,
  String& profileFingerprint
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

  profileRevision = document["profileRevision"] | 0;
  profileFingerprint = String((const char*)(document["profileFingerprint"] | ""));
  const bool hasRevision = profileRevision > 0;
  const bool hasFingerprint = profileFingerprint.length() > 0;
  if (hasRevision != hasFingerprint) {
    error = "ufullstendig profilidentitet";
    return false;
  }
  if (hasFingerprint && profileFingerprint.length() != 16) {
    error = "ugyldig profileFingerprint";
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
    error = "frame er utlÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸pt ved mottak: " + String((long)ageSeconds) + " s";
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
      error = "ugyldig LED-oppfÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ring";
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
  uint32_t ttlMs,
  uint32_t profileRevision,
  const String& profileFingerprint
) {
  memcpy(activeFrame, candidateFrame, sizeof(activeFrame));
  hasValidFrame = true;
  ttlExpired = false;
  lastSequence = sequence;
  frameTtlMs = ttlMs;
  lastValidFrameAtMs = millis();
  activeProfileRevision = profileRevision;
  activeProfileFingerprint = profileFingerprint;
  profileMetadataPresent = profileRevision > 0 && profileFingerprint.length() == 16;

  Serial.printf(
    "LED-frame OK | sequence %lu | aktive %u/%u | TTL %lu s | profil r%lu %s | heap %u\n",
    (unsigned long)lastSequence,
    activeCount,
    LED_COUNT,
    (unsigned long)(frameTtlMs / 1000UL),
    (unsigned long)activeProfileRevision,
    profileMetadataPresent ? activeProfileFingerprint.c_str() : "eldre-frame",
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
  uint32_t profileRevision = 0;
  String profileFingerprint;

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
    ttlMs,
    profileRevision,
    profileFingerprint
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

  acceptCandidateFrame(activeCount, sequence, ttlMs, profileRevision, profileFingerprint);
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
      successfulFeedPolls++;
      return;
    }
    if (retry < HTTP_MAX_RETRIES) delay(250);
  }

  Serial.println(
    "LED-feed utilgjengelig. Beholder siste gyldige frame."
  );
  if (consecutiveFeedFailures < UINT16_MAX) consecutiveFeedFailures++;
  failedFeedPolls++;
}

bool sendHealthStatus(unsigned long now, uint32_t freeHeap) {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (strlen(TRANSITCORE_STATUS_TOKEN) == 0) {
    Serial.println("STATUS | token IKKE konfigurert");
    return true;
  }

  DynamicJsonDocument document(768);
  document["schemaVersion"] = 1;
  document["boardProfile"] = EXPECTED_BOARD_PROFILE;
  document["firmware"] = "1.0.7";
  document["uptimeSeconds"] = now / 1000UL;
  document["wifiOutages"] = wifiOutageCount;
  document["wifiRecoveries"] = wifiRecoveryCount;
  document["feedSuccesses"] = successfulFeedPolls;
  document["feedFailures"] = failedFeedPolls;
  document["frameAgeSeconds"] = hasValidFrame ? (now - lastValidFrameAtMs) / 1000UL : 0;
  document["frameValid"] = hasValidFrame && !ttlExpired;
  document["profileRevision"] = activeProfileRevision;
  document["profileFingerprint"] = activeProfileFingerprint;
  document["freeHeap"] = freeHeap;
  document["minimumFreeHeap"] = minimumFreeHeap;
  String payload;
  serializeJson(document, payload);

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(HTTP_CONNECT_TIMEOUT_MS);
  HTTPClient http;
  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_CONNECT_TIMEOUT_MS);
  const String endpoint = statusEndpoint();
  if (!http.begin(client, endpoint)) {
    Serial.println("STATUS | HTTP begin feilet");
    return true;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + String(TRANSITCORE_STATUS_TOKEN));
  const int status = http.POST(payload);
  http.end();
  Serial.printf("STATUS | HTTP %d\n", status);
  return true;
}

void reportHealth() {
  const unsigned long now = millis();
  const uint32_t freeHeap = ESP.getFreeHeap();
  if (freeHeap < minimumFreeHeap) minimumFreeHeap = freeHeap;
  if (lastHealthReportAtMs != 0 && now - lastHealthReportAtMs < HEALTH_REPORT_INTERVAL_MS) return;

  // Log the initial local state once, but do not consume the five-minute
  // interval until Wi-Fi is stable and a status send can be attempted. The
  // feed poll runs earlier in loop(), so profile identity is normally present
  // in the first remote report as well.
  const bool wifiReady = WiFi.status() == WL_CONNECTED &&
    wifiConnectedAtMs != 0 &&
    now - wifiConnectedAtMs >= WIFI_STABLE_BEFORE_HTTP_MS;
  if (!wifiReady && initialHealthLogged) return;

  const unsigned long frameAgeSeconds = hasValidFrame
    ? (now - lastValidFrameAtMs) / 1000UL
    : 0;
  Serial.printf(
    "HELSE | uptime %lu s | Wi-Fi %s | brudd %lu | tilbake %lu | "
    "feed OK/feil %lu/%lu | frame %s | alder %lu s | profil r%lu %s | heap %u | min %u\n",
    now / 1000UL,
    WiFi.status() == WL_CONNECTED ? "OK" : "AV",
    (unsigned long)wifiOutageCount,
    (unsigned long)wifiRecoveryCount,
    (unsigned long)successfulFeedPolls,
    (unsigned long)failedFeedPolls,
    !hasValidFrame ? "INGEN" : (ttlExpired ? "UTLÃƒÆ’Ã‹Å“PT" : "OK"),
    frameAgeSeconds,
    (unsigned long)activeProfileRevision,
    profileMetadataPresent ? activeProfileFingerprint.c_str() : "eldre-frame",
    freeHeap,
    minimumFreeHeap
  );
  initialHealthLogged = true;
  if (wifiReady && sendHealthStatus(now, freeHeap)) lastHealthReportAtMs = now;
}

void enforceTtl() {
  if (!hasValidFrame || ttlExpired) return;

  if (millis() - lastValidFrameAtMs <= frameTtlMs) return;

  ttlExpired = true;
  clearFrame(activeFrame);
  clearHardware();
  Serial.println("LED-frame utlÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸pt. Tavlen er slukket.");
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
    beginLedTest();
  }

  WiFi.mode(WIFI_STA);
  // The client owns reconnect timing. This avoids overlapping automatic and
  // manual WiFi.begin() calls after a long outage.
  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);
  wifiOutageActive = true;
  wifiDisconnectedAtMs = millis();
  startWifiAttempt(false);
  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);

  Serial.println("TransitCore Universal Board Client v1.0.7 starter.");
  Serial.printf(
    "Board %s | %u LED-er | hardware %s\n",
    EXPECTED_BOARD_PROFILE,
    LED_COUNT,
    LED_HARDWARE_ENABLED ? "PÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦" : "AV"
  );
  Serial.printf(
    "Status-token konfigurert: %s\n",
    strlen(TRANSITCORE_STATUS_TOKEN) > 0 ? "JA" : "NEI"
  );
}

void loop() {
  ensureWifi();

  if (updateLedTest()) {
    reportHealth();
    delay(20);
    return;
  }

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
  reportHealth();
  renderFrame();
  delay(20);
}






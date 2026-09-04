#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WebServer.h>
#include <time.h>
#include "secrets.h"
#include "board_config.h"

// TransitCore Universal Board Client v1.1.9
// One stable ESP32 engine; board_config.h selects the physical board.
// v1.1.6 separates the board LED count from the connected strip length so
// unused tail pixels are actively held off on full-length test strips.
// v1.1.7 adds a frame-isolation diagnostic and tests the complete strip.
// v1.1.8 continuously retransmits the fixed isolation pattern.
// v1.1.9 freezes and retransmits the first complete Worker frame.

#ifndef TRANSITCORE_PHYSICAL_LED_COUNT
#define TRANSITCORE_PHYSICAL_LED_COUNT LED_COUNT
#endif

#ifndef TRANSITCORE_LED_FRAME_ISOLATION_TEST
#define TRANSITCORE_LED_FRAME_ISOLATION_TEST 0
#endif

static_assert(TRANSITCORE_PHYSICAL_LED_COUNT >= LED_COUNT,
  "TRANSITCORE_PHYSICAL_LED_COUNT must be at least LED_COUNT");

#ifndef TRANSITCORE_STATUS_TOKEN
#define TRANSITCORE_STATUS_TOKEN ""
#endif

#ifndef TRANSITCORE_DEVICE_ID
#define TRANSITCORE_DEVICE_ID EXPECTED_BOARD_PROFILE
#endif

#ifndef TRANSITCORE_DEVICE_TOKEN
#define TRANSITCORE_DEVICE_TOKEN TRANSITCORE_STATUS_TOKEN
#endif

class TransitCoreSecureClient : public WiFiClientSecure {
public:
  void useSystemCaBundle() {
    // The Arduino ESP32 core ships Espressif's full public root-CA bundle.
    // This verifies both the certificate chain and FEED_URL hostname while
    // allowing normal server certificate rotation.
    attach_ssl_certificate_bundle(sslclient.get(), true);
    _use_ca_bundle = true;
    _use_insecure = false;
  }
};

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
const unsigned long WIFI_PROVISIONING_TIMEOUT_MS = 10UL * 60UL * 1000UL;
const unsigned long HTTP_CONNECT_TIMEOUT_MS = 10000;
const unsigned long HTTP_RESPONSE_TIMEOUT_MS = 20000;
const int HTTP_MAX_RETRIES = 1;
const uint8_t FEED_FAILURES_BEFORE_WIFI_RESET = 2;
const size_t MAX_RESPONSE_BYTES = 32768;
const size_t JSON_CAPACITY = 32768;
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.google.com";
const uint32_t MAX_CLOCK_SKEW_SECONDS = 15;
const unsigned long HEALTH_REPORT_INTERVAL_MS = 5UL * 60UL * 1000UL;
const uint16_t SUPPORTED_SIGNAL_POLICY_VERSION = 1;
const uint16_t EXPECTED_APPROACH_PULSE_MS = 1800;

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
  TRANSITCORE_PHYSICAL_LED_COUNT,
  LED_DATA_PIN,
  LED_PIXEL_TYPE
);

LedPixel activeFrame[LED_COUNT];
LedPixel candidateFrame[LED_COUNT];
LedPixel renderFrameSnapshot[LED_COUNT];
LedPixel isolationFrame[LED_COUNT];
portMUX_TYPE frameMutex = portMUX_INITIALIZER_UNLOCKED;
SemaphoreHandle_t ledHardwareMutex = nullptr;

volatile bool hasValidFrame = false;
volatile bool ttlExpired = false;
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
volatile bool ledTestActive = false;
uint16_t ledTestStep = 0;
unsigned long lastLedTestStepAtMs = 0;
uint16_t activeSignalPolicyVersion = 0;
uint16_t activeApproachPulseMs = EXPECTED_APPROACH_PULSE_MS;
Preferences wifiPreferences;
WebServer provisioningServer(80);
DNSServer provisioningDns;
String configuredWifiSsid;
String configuredWifiPassword;
String provisioningApName;
volatile bool provisioningActive = false;
bool provisioningIndicatorShown = false;
unsigned long provisioningStartedAtMs = 0;
volatile bool startupWaveActive = false;
uint16_t startupWaveStep = 0;
unsigned long startupWaveStepAtMs = 0;
bool isolationFrameCaptured = false;

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
  if (ledHardwareMutex != nullptr) xSemaphoreTake(ledHardwareMutex, portMAX_DELAY);
  strip.clear();
  strip.show();
  if (ledHardwareMutex != nullptr) xSemaphoreGive(ledHardwareMutex);
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
  // The animation phase is monotonic and never restarts when a frame arrives.
  const unsigned long period = EXPECTED_APPROACH_PULSE_MS;
  const unsigned long halfPeriod = period / 2UL;
  const unsigned long phase = millis() % period;
  const unsigned long triangle =
    phase < halfPeriod ? phase : period - phase;

  return 55 + (uint32_t)triangle * 200 / halfPeriod;
}

void showStatusColor(uint8_t red, uint8_t green, uint8_t blue) {
  if (!LED_HARDWARE_ENABLED) return;
  if (ledHardwareMutex != nullptr) xSemaphoreTake(ledHardwareMutex, portMAX_DELAY);
  strip.clear();
  const uint16_t shown = min((uint16_t)3, LED_COUNT);
  for (uint16_t i = 0; i < shown; i++) {
    strip.setPixelColor(i, red, green, blue);
  }
  strip.show();
  if (ledHardwareMutex != nullptr) xSemaphoreGive(ledHardwareMutex);
}

void startStartupWave() {
  if (!LED_HARDWARE_ENABLED) return;
  startupWaveActive = true;
  startupWaveStep = 0;
  startupWaveStepAtMs = 0;
}

bool updateStartupWave() {
  if (!startupWaveActive) return false;
  const unsigned long now = millis();
  if (startupWaveStepAtMs != 0 && now - startupWaveStepAtMs < 28) return true;
  startupWaveStepAtMs = now;
  if (ledHardwareMutex != nullptr) xSemaphoreTake(ledHardwareMutex, portMAX_DELAY);
  strip.clear();
  if (startupWaveStep < LED_COUNT) {
    strip.setPixelColor(startupWaveStep, 0, 10, 28);
    if (startupWaveStep > 0) strip.setPixelColor(startupWaveStep - 1, 0, 3, 8);
    strip.show();
    if (ledHardwareMutex != nullptr) xSemaphoreGive(ledHardwareMutex);
    startupWaveStep++;
    return true;
  }
  strip.show();
  if (ledHardwareMutex != nullptr) xSemaphoreGive(ledHardwareMutex);
  startupWaveActive = false;
  return false;
}

void renderFrame() {
  if (!LED_HARDWARE_ENABLED) return;

  portENTER_CRITICAL(&frameMutex);
  memcpy(renderFrameSnapshot, activeFrame, sizeof(activeFrame));
  portEXIT_CRITICAL(&frameMutex);

  const uint8_t pulse = approachingPulse();

  if (ledHardwareMutex != nullptr) xSemaphoreTake(ledHardwareMutex, portMAX_DELAY);
  for (uint16_t i = 0; i < LED_COUNT; i++) {
    const LedPixel& pixel = renderFrameSnapshot[i];
    const uint8_t level =
      pixel.state == LED_APPROACHING ? pulse : 255;

    strip.setPixelColor(
      i,
      scaleChannel(pixel.red, pixel.brightness, level),
      scaleChannel(pixel.green, pixel.brightness, level),
      scaleChannel(pixel.blue, pixel.brightness, level)
    );
  }

  // Pixels beyond the board profile can exist on an uncut development strip.
  // Address them on every refresh so electrical noise cannot leave them latched.
  for (uint16_t i = LED_COUNT; i < TRANSITCORE_PHYSICAL_LED_COUNT; i++) {
    strip.setPixelColor(i, 0, 0, 0);
  }

  strip.show();
  if (ledHardwareMutex != nullptr) xSemaphoreGive(ledHardwareMutex);
}

void showFrozenIsolationFrame() {
  if (!LED_HARDWARE_ENABLED) return;
  if (!isolationFrameCaptured) {
    portENTER_CRITICAL(&frameMutex);
    memcpy(isolationFrame, activeFrame, sizeof(activeFrame));
    portEXIT_CRITICAL(&frameMutex);
    isolationFrameCaptured = true;
    Serial.println("ISOLASJONSTEST | første Worker-frame er fryst | senere frames vises ikke");
  }
  if (ledHardwareMutex != nullptr) xSemaphoreTake(ledHardwareMutex, portMAX_DELAY);
  for (uint16_t i = 0; i < LED_COUNT; i++) {
    const LedPixel& pixel = isolationFrame[i];
    const uint8_t level = pixel.state == LED_APPROACHING ? 128 : 255;
    strip.setPixelColor(i,
      scaleChannel(pixel.red, pixel.brightness, level),
      scaleChannel(pixel.green, pixel.brightness, level),
      scaleChannel(pixel.blue, pixel.brightness, level));
  }
  for (uint16_t i = LED_COUNT; i < TRANSITCORE_PHYSICAL_LED_COUNT; i++) {
    strip.setPixelColor(i, 0, 0, 0);
  }
  strip.show();
  if (ledHardwareMutex != nullptr) xSemaphoreGive(ledHardwareMutex);
}

void ledRenderTask(void* parameter) {
  while (true) {
    if (
      !provisioningActive &&
      !ledTestActive &&
      !startupWaveActive &&
      hasValidFrame &&
      !ttlExpired
    ) {
      if (TRANSITCORE_LED_FRAME_ISOLATION_TEST) showFrozenIsolationFrame();
      else renderFrame();
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void beginLedTest() {
  if (!LED_HARDWARE_ENABLED || !LED_STARTUP_TEST_ENABLED) return;
  ledTestActive = true;
  ledTestStep = 0;
  lastLedTestStepAtMs = 0;
  clearHardware();
  Serial.printf(
    "LED-TEST starter | %u LED-er | brightness %u | %lu ms per steg\n",
    TRANSITCORE_PHYSICAL_LED_COUNT,
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
  if (ledHardwareMutex != nullptr) xSemaphoreTake(ledHardwareMutex, portMAX_DELAY);
  strip.clear();

  if (ledTestStep < 3) {
    const uint8_t red = ledTestStep == 0 ? LED_TEST_BRIGHTNESS : 0;
    const uint8_t green = ledTestStep == 1 ? LED_TEST_BRIGHTNESS : 0;
    const uint8_t blue = ledTestStep == 2 ? LED_TEST_BRIGHTNESS : 0;
    strip.setPixelColor(0, red, green, blue);
    strip.show();
    if (ledHardwareMutex != nullptr) xSemaphoreGive(ledHardwareMutex);
    Serial.printf("LED-TEST kanal | LED 0 | %s\n", ledTestStep == 0 ? "RED" : ledTestStep == 1 ? "GREEN" : "BLUE");
    ledTestStep++;
    return true;
  }

  const uint16_t physicalLed = ledTestStep - 3;
  if (physicalLed < TRANSITCORE_PHYSICAL_LED_COUNT) {
    strip.setPixelColor(physicalLed, LED_TEST_BRIGHTNESS, LED_TEST_BRIGHTNESS, LED_TEST_BRIGHTNESS);
    strip.show();
    if (ledHardwareMutex != nullptr) xSemaphoreGive(ledHardwareMutex);
    Serial.printf("LED-TEST fysisk | LED %u/%u\n", physicalLed, TRANSITCORE_PHYSICAL_LED_COUNT - 1);
    ledTestStep++;
    return true;
  }

  strip.show();
  if (ledHardwareMutex != nullptr) xSemaphoreGive(ledHardwareMutex);
  ledTestActive = false;
  Serial.println("LED-TEST ferdig. Alle LED-er er slukket. Normal drift starter.");
  return false;
}

String htmlEscape(const String& value) {
  String escaped = value;
  escaped.replace("&", "&amp;");
  escaped.replace("<", "&lt;");
  escaped.replace(">", "&gt;");
  escaped.replace("\"", "&quot;");
  escaped.replace("'", "&#39;");
  return escaped;
}

String provisioningPage(const String& message = "") {
  String options;
  const int networkCount = WiFi.scanNetworks(false, true);
  for (int i = 0; i < networkCount; i++) {
    const String ssid = htmlEscape(WiFi.SSID(i));
    options += "<option value=\"" + ssid + "\">" + ssid + " (" +
      String(WiFi.RSSI(i)) + " dBm)</option>";
  }
  WiFi.scanDelete();
  return String(
    "<!doctype html><html lang=\"no\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
    "<title>TransitCore Wi-Fi</title><style>body{font-family:system-ui;background:#0b1017;color:#eef4ff;"
    "max-width:34rem;margin:3rem auto;padding:1rem}main{background:#151d28;border:1px solid #34445a;"
    "border-radius:18px;padding:1.4rem}label{display:block;margin-top:1rem}select,input,button{box-sizing:border-box;"
    "width:100%;padding:.85rem;margin-top:.35rem;border-radius:10px;border:1px solid #52647b;font-size:1rem}"
    "button{background:#1685ff;color:white;font-weight:700;margin-top:1.4rem}</style><main>"
    "<h1>TransitCore Wi-Fi</h1><p>Koble tavlen til nettverket den skal bruke.</p>") +
    (message.length() ? "<p><strong>" + htmlEscape(message) + "</strong></p>" : "") +
    "<form method=\"post\" action=\"/save\"><label>Nettverk<select name=\"ssid\" required>" + options +
    "</select></label><label>Passord<input name=\"password\" type=\"password\" maxlength=\"63\"></label>"
    "<button type=\"submit\">Lagre og koble til</button></form></main></html>";
}

void stopProvisioning() {
  if (!provisioningActive) return;
  provisioningDns.stop();
  provisioningServer.stop();
  WiFi.softAPdisconnect(true);
  provisioningActive = false;
  provisioningIndicatorShown = false;
  provisioningStartedAtMs = 0;
}

void startProvisioning() {
  if (provisioningActive) return;
  WiFi.disconnect(false, false);
  WiFi.mode(WIFI_AP_STA);
  const uint64_t chipId = ESP.getEfuseMac();
  char suffix[7];
  snprintf(suffix, sizeof(suffix), "%06X", (uint32_t)(chipId & 0xFFFFFF));
  provisioningApName = "TransitCore-" + String(suffix);
  if (!WiFi.softAP(provisioningApName.c_str())) {
    Serial.println("OPPSETT | Klarte ikke starte Wi-Fi-nettet");
    return;
  }

  provisioningDns.start(53, "*", WiFi.softAPIP());
  provisioningServer.on("/", HTTP_GET, []() {
    provisioningServer.send(200, "text/html; charset=utf-8", provisioningPage());
  });
  provisioningServer.on("/save", HTTP_POST, []() {
    const String ssid = provisioningServer.arg("ssid");
    const String password = provisioningServer.arg("password");
    if (ssid.length() == 0 || ssid.length() > 32 || password.length() > 63) {
      provisioningServer.send(400, "text/html; charset=utf-8", provisioningPage("Ugyldig nettverksinformasjon."));
      return;
    }
    wifiPreferences.begin("transitcore", false);
    wifiPreferences.putString("wifiSsid", ssid);
    wifiPreferences.putString("wifiPassword", password);
    wifiPreferences.end();
    provisioningServer.send(200, "text/html; charset=utf-8",
      "<!doctype html><meta name=viewport content='width=device-width'><h1>Lagret</h1>"
      "<p>Tavlen starter på nytt og kobler seg til nettverket.</p>");
    showStatusColor(0, 24, 4);
    Serial.printf("OPPSETT | Nettverk lagret | SSID %s | starter på nytt\n", ssid.c_str());
    delay(800);
    ESP.restart();
  });
  provisioningServer.onNotFound([]() {
    provisioningServer.sendHeader("Location", "http://192.168.4.1/", true);
    provisioningServer.send(302, "text/plain", "");
  });
  provisioningServer.begin();
  provisioningActive = true;
  provisioningIndicatorShown = false;
  provisioningStartedAtMs = millis();
  Serial.printf("OPPSETT | Koble telefonen til %s | åpne http://192.168.4.1\n", provisioningApName.c_str());
}

void loadWifiCredentials() {
  wifiPreferences.begin("transitcore", true);
  configuredWifiSsid = wifiPreferences.getString("wifiSsid", "");
  configuredWifiPassword = wifiPreferences.getString("wifiPassword", "");
  wifiPreferences.end();
  if (configuredWifiSsid.length() == 0 && String(WIFI_SSID) != "YOUR_WIFI_NAME") {
    configuredWifiSsid = WIFI_SSID;
    configuredWifiPassword = WIFI_PASSWORD;
  }
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

  if (configuredWifiSsid.length() == 0) {
    startProvisioning();
    return;
  }
  WiFi.begin(configuredWifiSsid.c_str(), configuredWifiPassword.c_str());
  lastWifiAttemptAtMs = millis();
  if (wifiAttemptCount < UINT16_MAX) wifiAttemptCount++;
  Serial.printf(
    "Wi-Fi-forsÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸k %u startet | neste tidligst om %lu s\n",
    wifiAttemptCount,
    wifiRetryDelayMs() / 1000UL
  );
}

void ensureWifi() {
  if (provisioningActive) {
    provisioningDns.processNextRequest();
    provisioningServer.handleClient();
    if (millis() - provisioningStartedAtMs >= WIFI_PROVISIONING_TIMEOUT_MS) {
      Serial.println("OPPSETT | Tidsgrense nådd. Starter enheten på nytt.");
      ESP.restart();
    }
    return;
  }
  if (WiFi.status() == WL_CONNECTED) {
    if (wifiConnectedAtMs == 0) {
      wifiConnectedAtMs = millis();
      Serial.printf("Wi-Fi OK. IP: %s\n", WiFi.localIP().toString().c_str());
      if (!hasValidFrame) showStatusColor(0, 24, 4);
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
  return url + "/v1/devices/" + TRANSITCORE_DEVICE_ID + "/status";
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
  TransitCoreSecureClient client;
  client.useSystemCaBundle();
  client.setTimeout(HTTP_RESPONSE_TIMEOUT_MS);
  client.setHandshakeTimeout(max(1UL, HTTP_CONNECT_TIMEOUT_MS / 1000UL));

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
  String& profileFingerprint,
  uint16_t& signalPolicyVersion,
  uint16_t& approachPulseMs
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

  JsonObject signalPolicy = document["signalPolicy"].as<JsonObject>();
  signalPolicyVersion = 0;
  approachPulseMs = EXPECTED_APPROACH_PULSE_MS;
  if (!signalPolicy.isNull()) {
    const int version = signalPolicy["version"] | -1;
    const int pulseMs = signalPolicy["approachPulseMs"] | -1;
    if (version != SUPPORTED_SIGNAL_POLICY_VERSION) {
      error = "signalPolicy-versjon støttes ikke";
      return false;
    }
    if (pulseMs != EXPECTED_APPROACH_PULSE_MS) {
      error = "approachPulseMs avviker fra firmware-policy";
      return false;
    }
    signalPolicyVersion = (uint16_t)version;
    approachPulseMs = (uint16_t)pulseMs;
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
  const String& profileFingerprint,
  uint16_t signalPolicyVersion,
  uint16_t approachPulseMs
) {
  // Continue showing the previous complete frame during replacement. The
  // mutex makes the swap atomic, so a normal refresh is never a TTL expiry.
  portENTER_CRITICAL(&frameMutex);
  memcpy(activeFrame, candidateFrame, sizeof(activeFrame));
  portEXIT_CRITICAL(&frameMutex);
  lastSequence = sequence;
  frameTtlMs = ttlMs;
  lastValidFrameAtMs = millis();
  activeProfileRevision = profileRevision;
  activeProfileFingerprint = profileFingerprint;
  profileMetadataPresent = profileRevision > 0 && profileFingerprint.length() == 16;
  activeSignalPolicyVersion = signalPolicyVersion;
  activeApproachPulseMs = approachPulseMs;
  hasValidFrame = true;
  ttlExpired = false;

  Serial.printf(
    "LED-frame OK | sequence %lu | aktive %u/%u | TTL %lu s | profil r%lu %s | policy v%u %u ms | heap %u\n",
    (unsigned long)lastSequence,
    activeCount,
    LED_COUNT,
    (unsigned long)(frameTtlMs / 1000UL),
    (unsigned long)activeProfileRevision,
    profileMetadataPresent ? activeProfileFingerprint.c_str() : "eldre-frame",
    activeSignalPolicyVersion,
    activeApproachPulseMs,
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
  uint16_t signalPolicyVersion = 0;
  uint16_t approachPulseMs = EXPECTED_APPROACH_PULSE_MS;

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
    profileFingerprint,
    signalPolicyVersion,
    approachPulseMs
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

  acceptCandidateFrame(
    activeCount,
    sequence,
    ttlMs,
    profileRevision,
    profileFingerprint,
    signalPolicyVersion,
    approachPulseMs
  );
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
  if (consecutiveFeedFailures >= FEED_FAILURES_BEFORE_WIFI_RESET) {
    Serial.println("Gjentar TLS-feil. Kobler Wi-Fi kontrollert til på nytt.");
    WiFi.disconnect(false, false);
    wifiConnectedAtMs = 0;
  }
}

bool sendHealthStatus(unsigned long now, uint32_t freeHeap) {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (strlen(TRANSITCORE_DEVICE_TOKEN) == 0) {
    Serial.println("STATUS | token IKKE konfigurert");
    return true;
  }

  DynamicJsonDocument document(768);
  document["schemaVersion"] = 1;
  document["deviceId"] = TRANSITCORE_DEVICE_ID;
  document["boardProfile"] = EXPECTED_BOARD_PROFILE;
  document["firmware"] = "1.1.9";
  document["uptimeSeconds"] = now / 1000UL;
  document["wifiOutages"] = wifiOutageCount;
  document["wifiRecoveries"] = wifiRecoveryCount;
  document["feedSuccesses"] = successfulFeedPolls;
  document["feedFailures"] = failedFeedPolls;
  document["frameAgeSeconds"] = hasValidFrame ? (now - lastValidFrameAtMs) / 1000UL : 0;
  document["frameValid"] = hasValidFrame && !ttlExpired;
  document["profileRevision"] = activeProfileRevision;
  document["profileFingerprint"] = activeProfileFingerprint;
  document["signalPolicyVersion"] = activeSignalPolicyVersion;
  document["freeHeap"] = freeHeap;
  document["minimumFreeHeap"] = minimumFreeHeap;
  String payload;
  serializeJson(document, payload);

  TransitCoreSecureClient client;
  client.useSystemCaBundle();
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
  http.addHeader("Authorization", "Bearer " + String(TRANSITCORE_DEVICE_TOKEN));
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
  portENTER_CRITICAL(&frameMutex);
  clearFrame(activeFrame);
  portEXIT_CRITICAL(&frameMutex);
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
    ledHardwareMutex = xSemaphoreCreateMutex();
    strip.begin();
    strip.clear();
    strip.show();
    if (LED_STARTUP_TEST_ENABLED) beginLedTest();
    else startStartupWave();
  }

  loadWifiCredentials();
  WiFi.mode(WIFI_STA);
  // The client owns reconnect timing. This avoids overlapping automatic and
  // manual WiFi.begin() calls after a long outage.
  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);
  wifiOutageActive = true;
  wifiDisconnectedAtMs = millis();
  if (configuredWifiSsid.length() > 0) startWifiAttempt(false);
  else startProvisioning();
  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);

  if (LED_HARDWARE_ENABLED) {
    xTaskCreatePinnedToCore(
      ledRenderTask,
      "transitcore-led-render",
      4096,
      nullptr,
      1,
      nullptr,
      1
    );
  }

  Serial.println("TransitCore Universal Board Client v1.1.9 starter | build frozen-worker-frame-test.");
  Serial.printf(
    "Board %s | %u tavle-LED-er | %u fysiske stripe-LED-er | hardware %s\n",
    EXPECTED_BOARD_PROFILE,
    LED_COUNT,
    TRANSITCORE_PHYSICAL_LED_COUNT,
    LED_HARDWARE_ENABLED ? "PÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦" : "AV"
  );
  Serial.printf(
    "TLS-verifisering: CA-bunt | enhet %s | enhetsnøkkel %s\n",
    TRANSITCORE_DEVICE_ID,
    strlen(TRANSITCORE_DEVICE_TOKEN) > 0 ? "JA" : "NEI"
  );
  Serial.printf("LED-frame isolasjonstest: %s\n",
    TRANSITCORE_LED_FRAME_ISOLATION_TEST ? "JA" : "NEI");
}

void loop() {
  ensureWifi();

  if (provisioningActive) {
    if (!updateStartupWave() && !provisioningIndicatorShown) {
      showStatusColor(18, 12, 0);
      provisioningIndicatorShown = true;
    }
    delay(2);
    return;
  }

  if (updateLedTest()) {
    reportHealth();
    delay(20);
    return;
  }

  if (updateStartupWave()) {
    reportHealth();
    delay(2);
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
  delay(20);
}






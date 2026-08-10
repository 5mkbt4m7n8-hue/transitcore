#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <StreamString.h>
#include <time.h>

// TransitCore ESP32 v0.39.2
// Arduino IDE
// Live test: dedup + state + terminal hysteresis -> 16 red LEDs

// -----------------------------------------------------------------------------
// USER CONFIG
// -----------------------------------------------------------------------------
#include "secrets.h"

// Required by Entur. Format should identify application.
// Example used by earlier prototype:
const char* ET_CLIENT_NAME = "lgb-grakallboard";

// GrÃ¥kallbanen / AtB
const char* ENTUR_URL =
  "https://api.entur.io/realtime/v2/vehicles/graphql";

// Polling interval. Entur vehicle GraphQL supports live vehicle positions.
// 10 seconds is conservative for this first physical test.
const unsigned long UPDATE_INTERVAL_MS = 10000;

// Entur HTTP/TLS reliability settings.
const uint16_t ENTUR_CONNECT_TIMEOUT_MS = 10000;
const uint16_t ENTUR_RESPONSE_TIMEOUT_MS = 20000;
const int ENTUR_MAX_RESPONSE_RETRIES = 1;

// Vehicle Freshness Filter. Records older than this never reach the position,
// state, terminal or VLED engines.
const uint32_t MAX_VEHICLE_DATA_AGE_SECONDS = 120;
const uint32_t MAX_FUTURE_CLOCK_SKEW_SECONDS = 30;

// UTC is used so ISO-8601 timestamps can be compared without local-time/DST
// conversions. ESP32 supplies the clock through SNTP after Wi-Fi connects.
const char* NTP_SERVER_1 = "pool.ntp.org";
const char* NTP_SERVER_2 = "time.google.com";
const unsigned long TIME_SYNC_TIMEOUT_MS = 10000;

// A station LED is only allowed to light when the tram is actually close
// enough to that station. This matches the web prototype principle.
const double STATION_ARRIVAL_RADIUS_METERS = 65.0;

// Vehicle state thresholds for the red-LED prototype.
// MOVING: normal steady station LED.
// WAITING: slow blink.
// PARKED: faster blink.
// State is inferred only after we have history for a vehicle.
const double VEHICLE_MOVEMENT_THRESHOLD_METERS = 12.0;
const unsigned long VEHICLE_WAITING_AFTER_MS = 45000;
const unsigned long VEHICLE_PARKED_AFTER_MS = 180000;

const unsigned long WAITING_BLINK_MS = 800;
const unsigned long PARKED_BLINK_MS = 250;

// Terminal hysteresis.
const double TERMINAL_DEPARTURE_METERS = 85.0;
const double TERMINAL_HARD_RELEASE_METERS = 180.0;

// -----------------------------------------------------------------------------
// HARDWARE PROFILE
// -----------------------------------------------------------------------------
struct StationLed {
  const char* name;
  double lat;
  double lon;
  uint8_t gpio;
};

StationLed stations[] = {
  {"Lian",           63.402909, 10.314250, 16},
  {"HerlofsonlÃ¸ypa", 63.405185, 10.320049, 17},
  {"Vestmarka",      63.406483, 10.325116, 18},
  {"Kyvannet",       63.404107, 10.337601, 19},
  {"Ugla",           63.400533, 10.343923, 21},
  {"Ferstad",        63.399498, 10.349037, 22},
  {"Munkvoll",       63.397756, 10.359984, 23},
  {"Rognheim",       63.399425, 10.373459, 25},
  {"SÃ¸ndre Hoem",    63.403350, 10.381672, 26},
  {"Nordre Hoem",    63.405587, 10.381037, 27},
  {"Breidablikk",    63.412348, 10.377005, 32},
  {"Belvedere",      63.416226, 10.376340, 33},
  {"Bygrensen",      63.418824, 10.375680, 4},
  {"Nyveibakken",    63.424354, 10.372478, 5},
  {"Bergsli gate",   63.427819, 10.367510, 13},
  {"Ila",            63.429279, 10.368299, 14}
};

const size_t STATION_COUNT =
  sizeof(stations) / sizeof(stations[0]);

const bool LED_ACTIVE_HIGH = true;

// -----------------------------------------------------------------------------
// LED DRIVER
// -----------------------------------------------------------------------------
void writeLed(uint8_t gpio, bool on) {
  const bool level = LED_ACTIVE_HIGH ? on : !on;
  digitalWrite(gpio, level ? HIGH : LOW);
}

void clearAllLeds() {
  for (size_t i = 0; i < STATION_COUNT; i++) {
    writeLed(stations[i].gpio, false);
  }
}

void setStationLed(size_t index, bool on) {
  if (index >= STATION_COUNT) return;
  writeLed(stations[index].gpio, on);
}

void startupWave(uint16_t stepMs = 30) {
  clearAllLeds();

  for (size_t i = 0; i < STATION_COUNT; i++) {
    setStationLed(i, true);
    delay(stepMs);
    setStationLed(i, false);
  }
}

void allOn(uint16_t durationMs = 250) {
  for (size_t i = 0; i < STATION_COUNT; i++) {
    setStationLed(i, true);
  }

  delay(durationMs);
  clearAllLeds();
}

// -----------------------------------------------------------------------------
// POSITION ENGINE - STATION ARRIVAL MODE v2.1
// -----------------------------------------------------------------------------
const double EARTH_RADIUS_METERS = 6371000.0;

// Position Confidence diagnostics for segment projection distance.
// These values do not affect matching, VLED placement or rendering.
const double POSITION_CONFIDENCE_HIGH_BELOW_METERS = 50.0;
const double POSITION_CONFIDENCE_MEDIUM_MAX_METERS = 100.0;

const char* segmentPositionConfidenceName(
  double segmentDistanceMeters
) {
  if (
    segmentDistanceMeters <
      POSITION_CONFIDENCE_HIGH_BELOW_METERS
  ) {
    return "HIGH";
  }

  if (
    segmentDistanceMeters <=
      POSITION_CONFIDENCE_MEDIUM_MAX_METERS
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

double toRadians(double degrees) {
  return degrees * PI / 180.0;
}

double distanceMeters(
  double lat1,
  double lon1,
  double lat2,
  double lon2
) {
  const double lat1Rad = toRadians(lat1);
  const double lat2Rad = toRadians(lat2);
  const double deltaLat = toRadians(lat2 - lat1);
  const double deltaLon = toRadians(lon2 - lon1);

  const double a =
    sin(deltaLat / 2.0) * sin(deltaLat / 2.0) +
    cos(lat1Rad) * cos(lat2Rad) *
    sin(deltaLon / 2.0) * sin(deltaLon / 2.0);

  const double c =
    2.0 * atan2(sqrt(a), sqrt(1.0 - a));

  return EARTH_RADIUS_METERS * c;
}


int segmentLedCount(int segmentIndex) {
  if (segmentIndex < 0 || segmentIndex >= (int)STATION_COUNT - 1) return 0;

  const double length = distanceMeters(
    stations[segmentIndex].lat,
    stations[segmentIndex].lon,
    stations[segmentIndex + 1].lat,
    stations[segmentIndex + 1].lon
  );

  if (length < 300.0) return 1;
  if (length < 550.0) return 2;
  if (length < 850.0) return 3;
  if (length < 1200.0) return 4;
  return 5;
}


// -----------------------------------------------------------------------------
// VIRTUAL LED MAPPING ENGINE v1
// -----------------------------------------------------------------------------
// Creates one stable route-wide LED index:
// station 0, segment LEDs, station 1, segment LEDs ... station 15.
//
// This is independent of the current GPIO hardware rig. Later an addressable
// RGB chain can map these virtual indexes directly to physical WS2812/SK6812
// indexes or through a configurable hardware map.

int virtualStationLedIndex(int stationIndex) {
  if (stationIndex < 0 || stationIndex >= (int)STATION_COUNT) {
    return -1;
  }

  int index = 0;

  for (int station = 0; station < stationIndex; station++) {
    // Current station LED.
    index += 1;

    // Between-LEDs following that station.
    if (station < (int)STATION_COUNT - 1) {
      index += segmentLedCount(station);
    }
  }

  return index;
}

int virtualSegmentLedIndex(
  int segmentIndex,
  int ledIndex
) {
  if (
    segmentIndex < 0 ||
    segmentIndex >= (int)STATION_COUNT - 1
  ) {
    return -1;
  }

  const int count = segmentLedCount(segmentIndex);

  if (ledIndex < 0 || ledIndex >= count) {
    return -1;
  }

  // Segment LEDs follow the segment's starting station.
  return
    virtualStationLedIndex(segmentIndex) +
    1 +
    ledIndex;
}

int totalVirtualLedCount() {
  int total = (int)STATION_COUNT;

  for (int i = 0; i < (int)STATION_COUNT - 1; i++) {
    total += segmentLedCount(i);
  }

  return total;
}

void printVirtualLedMap() {
  Serial.println();
  Serial.println("TransitCore virtual LED map:");
  Serial.printf(
    "Total virtual LEDs: %d\n",
    totalVirtualLedCount()
  );

  for (int i = 0; i < (int)STATION_COUNT; i++) {
    Serial.printf(
      "VLED %02d | STATION | %s\n",
      virtualStationLedIndex(i),
      stations[i].name
    );

    if (i >= (int)STATION_COUNT - 1) {
      continue;
    }

    const int count = segmentLedCount(i);

    for (int led = 0; led < count; led++) {
      Serial.printf(
        "VLED %02d | SEGMENT | %s -> %s | %d/%d\n",
        virtualSegmentLedIndex(i, led),
        stations[i].name,
        stations[i + 1].name,
        led + 1,
        count
      );
    }
  }

  Serial.println();
}

int findNearestSegment(
  double lat,
  double lon,
  double &segmentProgress,
  double &segmentDistanceMeters,
  int &virtualLedIndex,
  int &virtualLedCount
) {
  int bestSegmentIndex = -1;
  segmentProgress = 0.0;
  segmentDistanceMeters = 1e99;
  virtualLedIndex = -1;
  virtualLedCount = 0;

  for (int i = 0; i < (int)STATION_COUNT - 1; i++) {
    const double refLat = toRadians(
      (lat + stations[i].lat + stations[i + 1].lat) / 3.0
    );

    const double metersPerLon =
      111320.0 * cos(refLat);
    const double metersPerLat = 111320.0;

    const double ax = stations[i].lon * metersPerLon;
    const double ay = stations[i].lat * metersPerLat;
    const double bx = stations[i + 1].lon * metersPerLon;
    const double by = stations[i + 1].lat * metersPerLat;
    const double px = lon * metersPerLon;
    const double py = lat * metersPerLat;

    const double vx = bx - ax;
    const double vy = by - ay;
    const double lengthSquared = vx * vx + vy * vy;
    if (lengthSquared <= 0.001) continue;

    double progress =
      ((px - ax) * vx + (py - ay) * vy) /
      lengthSquared;

    if (progress < 0.0) progress = 0.0;
    if (progress > 1.0) progress = 1.0;

    const double qx = ax + progress * vx;
    const double qy = ay + progress * vy;
    const double distance =
      sqrt((px - qx) * (px - qx) +
           (py - qy) * (py - qy));

    if (distance < segmentDistanceMeters) {
      bestSegmentIndex = i;
      segmentProgress = progress;
      segmentDistanceMeters = distance;

      virtualLedCount = segmentLedCount(i);

      int ledIndex =
        (int)floor(progress * virtualLedCount);

      if (ledIndex < 0) ledIndex = 0;
      if (ledIndex >= virtualLedCount) {
        ledIndex = virtualLedCount - 1;
      }

      virtualLedIndex = ledIndex;
    }
  }

  return bestSegmentIndex;
}


int findNearestStation(
  double lat,
  double lon,
  double &nearestDistanceMeters
) {
  int bestIndex = -1;
  nearestDistanceMeters = 1e99;

  for (size_t i = 0; i < STATION_COUNT; i++) {
    const double stationDistance = distanceMeters(
      lat,
      lon,
      stations[i].lat,
      stations[i].lon
    );

    if (stationDistance < nearestDistanceMeters) {
      nearestDistanceMeters = stationDistance;
      bestIndex = (int)i;
    }
  }

  return bestIndex;
}

// -----------------------------------------------------------------------------
// WI-FI
// -----------------------------------------------------------------------------
void connectWifi() {
  Serial.printf("Kobler til Wi-Fi: %s\n", WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startedAt = millis();

  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");

    if (millis() - startedAt > 20000) {
      Serial.println();
      Serial.println("Wi-Fi timeout. Starter nytt forsÃ¸k.");
      WiFi.disconnect(true);
      delay(500);
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      startedAt = millis();
    }
  }

  Serial.println();
  Serial.print("Wi-Fi OK. IP: ");
  Serial.println(WiFi.localIP());
}

bool ensureUtcClock() {
  const time_t minimumValidEpoch = 1577836800; // 2020-01-01 UTC

  if (time(nullptr) >= minimumValidEpoch) {
    return true;
  }

  Serial.println("Synkroniserer UTC-klokke...");
  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);

  const unsigned long startedAt = millis();
  while (
    time(nullptr) < minimumValidEpoch &&
    millis() - startedAt < TIME_SYNC_TIMEOUT_MS
  ) {
    delay(100);
  }

  if (time(nullptr) < minimumValidEpoch) {
    Serial.println("UTC-klokke ikke klar. Beholder siste gyldige frame.");
    return false;
  }

  Serial.println("UTC-klokke OK.");
  return true;
}


// -----------------------------------------------------------------------------
// VEHICLE MANAGER v1 - deduplication by vehicleId + lastUpdated
// -----------------------------------------------------------------------------
const size_t MAX_ACTIVE_VEHICLES = 16;

bool isAllDigits(const String &value) {
  if (value.length() == 0) return false;

  for (size_t i = 0; i < value.length(); i++) {
    if (!isDigit(value[i])) return false;
  }

  return true;
}

// Works for both numeric epoch-like timestamps and ISO-8601 timestamps.
// Numeric strings are compared by length first, then lexicographically.
// ISO-8601 timestamps sort correctly lexicographically when the format matches.
int compareFreshnessKeys(
  const String &a,
  const String &b
) {
  const bool aNumeric = isAllDigits(a);
  const bool bNumeric = isAllDigits(b);

  if (aNumeric && bNumeric) {
    if (a.length() < b.length()) return -1;
    if (a.length() > b.length()) return 1;
  }

  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

String jsonValueToString(JsonVariantConst value) {
  if (value.isNull()) return "";

  if (value.is<const char*>()) {
    return String(value.as<const char*>());
  }

  String result;
  serializeJson(value, result);

  // serializeJson() includes quotes for JSON strings; remove them if present.
  if (
    result.length() >= 2 &&
    result[0] == '"' &&
    result[result.length() - 1] == '"'
  ) {
    result.remove(result.length() - 1);
    result.remove(0, 1);
  }

  return result;
}

int findVehicleIndex(
  String vehicleIds[],
  size_t count,
  const String &vehicleId
) {
  for (size_t i = 0; i < count; i++) {
    if (vehicleIds[i] == vehicleId) {
      return (int)i;
    }
  }

  return -1;
}

bool readFixedDigits(
  const String &value,
  size_t offset,
  size_t count,
  int &result
) {
  if (offset + count > value.length()) return false;

  result = 0;
  for (size_t i = 0; i < count; i++) {
    const char c = value[offset + i];
    if (c < '0' || c > '9') return false;
    result = result * 10 + (c - '0');
  }
  return true;
}

// Gregorian calendar date -> days since 1970-01-01. This is independent of
// the C library timezone and avoids timegm(), which is unavailable in some
// Arduino ESP32 setups.
int64_t daysSinceUnixEpoch(int year, unsigned month, unsigned day) {
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yearOfEra = (unsigned)(year - era * 400);
  const unsigned adjustedMonth =
    month > 2 ? month - 3 : month + 9;
  const unsigned dayOfYear =
    (153 * adjustedMonth + 2) / 5 + day - 1;
  const unsigned dayOfEra =
    yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
  return (int64_t)era * 146097 + (int64_t)dayOfEra - 719468;
}

bool parseLastUpdatedEpoch(
  const String &value,
  int64_t &epochSeconds
) {
  if (value.length() == 0) return false;

  if (isAllDigits(value)) {
    char *endPointer = nullptr;
    const uint64_t raw = strtoull(value.c_str(), &endPointer, 10);
    if (endPointer == value.c_str() || *endPointer != '\0') return false;

    // Entur data may expose Unix time in seconds or milliseconds.
    epochSeconds = value.length() >= 13
      ? (int64_t)(raw / 1000ULL)
      : (int64_t)raw;
    return epochSeconds > 0;
  }

  // Supported form: YYYY-MM-DDTHH:MM:SS[.fraction](Z|+HH:MM|-HH:MM)
  if (value.length() < 20) return false;
  if (
    value[4] != '-' || value[7] != '-' ||
    (value[10] != 'T' && value[10] != 't' && value[10] != ' ') ||
    value[13] != ':' || value[16] != ':'
  ) {
    return false;
  }

  int year, month, day, hour, minute, second;
  if (
    !readFixedDigits(value, 0, 4, year) ||
    !readFixedDigits(value, 5, 2, month) ||
    !readFixedDigits(value, 8, 2, day) ||
    !readFixedDigits(value, 11, 2, hour) ||
    !readFixedDigits(value, 14, 2, minute) ||
    !readFixedDigits(value, 17, 2, second)
  ) {
    return false;
  }

  if (
    month < 1 || month > 12 || day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 60
  ) {
    return false;
  }

  size_t zoneOffset = 19;
  if (zoneOffset < value.length() && value[zoneOffset] == '.') {
    zoneOffset++;
    const size_t fractionStart = zoneOffset;
    while (zoneOffset < value.length() && isDigit(value[zoneOffset])) {
      zoneOffset++;
    }
    if (zoneOffset == fractionStart) return false;
  }

  int timezoneOffsetSeconds = 0;
  if (
    zoneOffset < value.length() &&
    (value[zoneOffset] == 'Z' || value[zoneOffset] == 'z')
  ) {
    zoneOffset++;
  } else if (
    zoneOffset < value.length() &&
    (value[zoneOffset] == '+' || value[zoneOffset] == '-')
  ) {
    const int sign = value[zoneOffset] == '+' ? 1 : -1;
    int zoneHour, zoneMinute;
    if (
      zoneOffset + 6 != value.length() ||
      value[zoneOffset + 3] != ':' ||
      !readFixedDigits(value, zoneOffset + 1, 2, zoneHour) ||
      !readFixedDigits(value, zoneOffset + 4, 2, zoneMinute) ||
      zoneHour > 23 || zoneMinute > 59
    ) {
      return false;
    }
    timezoneOffsetSeconds = sign * (zoneHour * 3600 + zoneMinute * 60);
    zoneOffset += 6;
  } else {
    return false;
  }

  if (zoneOffset != value.length()) return false;

  epochSeconds =
    daysSinceUnixEpoch(year, (unsigned)month, (unsigned)day) * 86400LL +
    hour * 3600LL + minute * 60LL + second - timezoneOffsetSeconds;
  return epochSeconds > 0;
}


// -----------------------------------------------------------------------------
// VEHICLE STATE ENGINE v1
// -----------------------------------------------------------------------------
// Fixed-size arrays keep this Arduino-friendly and avoid custom types in
// function signatures, which can confuse the Arduino sketch preprocessor.
const size_t MAX_TRACKED_VEHICLES = 16;

String historyVehicleId[MAX_TRACKED_VEHICLES];
double historyLat[MAX_TRACKED_VEHICLES];
double historyLon[MAX_TRACKED_VEHICLES];
unsigned long historyLastMovementAt[MAX_TRACKED_VEHICLES];
bool historyInitialized[MAX_TRACKED_VEHICLES];

// -1 = no terminal lock, otherwise station index.
int historyTerminalLock[MAX_TRACKED_VEHICLES];

size_t historyCount = 0;

enum VehicleStateCode {
  VEHICLE_MOVING = 0,
  VEHICLE_WAITING = 1,
  VEHICLE_PARKED = 2
};

int findHistoryIndex(const String &vehicleId) {
  for (size_t i = 0; i < historyCount; i++) {
    if (historyVehicleId[i] == vehicleId) {
      return (int)i;
    }
  }
  return -1;
}

const char* vehicleStateName(int state) {
  if (state == VEHICLE_WAITING) return "WAITING";
  if (state == VEHICLE_PARKED) return "PARKED";
  return "MOVING";
}

int updateVehicleState(
  const String &vehicleId,
  double lat,
  double lon,
  unsigned long now
) {
  int index = findHistoryIndex(vehicleId);

  if (index < 0) {
    if (historyCount >= MAX_TRACKED_VEHICLES) {
      return VEHICLE_MOVING;
    }

    index = (int)historyCount++;
    historyVehicleId[index] = vehicleId;
    historyLat[index] = lat;
    historyLon[index] = lon;
    historyLastMovementAt[index] = now;
    historyInitialized[index] = true;
    historyTerminalLock[index] = -1;

    return VEHICLE_MOVING;
  }

  const double movedMeters = distanceMeters(
    historyLat[index],
    historyLon[index],
    lat,
    lon
  );

  if (movedMeters >= VEHICLE_MOVEMENT_THRESHOLD_METERS) {
    historyLat[index] = lat;
    historyLon[index] = lon;
    historyLastMovementAt[index] = now;

    return VEHICLE_MOVING;
  }

  const unsigned long stationaryFor =
    now - historyLastMovementAt[index];

  if (stationaryFor >= VEHICLE_PARKED_AFTER_MS) {
    return VEHICLE_PARKED;
  }

  if (stationaryFor >= VEHICLE_WAITING_AFTER_MS) {
    return VEHICLE_WAITING;
  }

  return VEHICLE_MOVING;
}



// -----------------------------------------------------------------------------
// DIRECTION ENGINE v1
// -----------------------------------------------------------------------------
// Current rule for GrÃ¥kallbanen:
// destination Lian => direction Lian
// destination Ila  => direction Ila
//
// Later we can add bearing/history fallback if destination is missing.

enum DirectionCode {
  DIRECTION_UNKNOWN = 0,
  DIRECTION_LIAN = 1,
  DIRECTION_ILA = 2
};

int directionFromDestination(const String &destination) {
  String dest = destination;
  dest.toLowerCase();

  if (dest.indexOf("lian") >= 0) {
    return DIRECTION_LIAN;
  }

  if (dest.indexOf("ila") >= 0) {
    return DIRECTION_ILA;
  }

  return DIRECTION_UNKNOWN;
}

const char* directionName(int direction) {
  if (direction == DIRECTION_LIAN) return "LIAN";
  if (direction == DIRECTION_ILA) return "ILA";
  return "UNKNOWN";
}


// -----------------------------------------------------------------------------
// VIRTUAL LED FRAME v1
// -----------------------------------------------------------------------------
// This is a logical frame only. The current prototype still drives the 16
// station GPIO LEDs, but every active route position is now also represented
// as a virtual LED with direction and state.
//
// Later, an addressable RGB driver can render this frame directly.

const int MAX_VIRTUAL_LEDS = 128;

bool virtualLedActive[MAX_VIRTUAL_LEDS];
int virtualLedDirection[MAX_VIRTUAL_LEDS];
int virtualLedState[MAX_VIRTUAL_LEDS];

void clearVirtualLedFrame() {
  for (int i = 0; i < MAX_VIRTUAL_LEDS; i++) {
    virtualLedActive[i] = false;
    virtualLedDirection[i] = DIRECTION_UNKNOWN;
    virtualLedState[i] = VEHICLE_MOVING;
  }
}

void setVirtualLed(
  int virtualIndex,
  int direction,
  int vehicleState
) {
  if (
    virtualIndex < 0 ||
    virtualIndex >= MAX_VIRTUAL_LEDS
  ) {
    return;
  }

  virtualLedActive[virtualIndex] = true;

  // If multiple vehicles map to the same VLED, keep a known direction if one
  // exists. State priority remains PARKED > WAITING > MOVING.
  if (
    virtualLedDirection[virtualIndex] == DIRECTION_UNKNOWN ||
    virtualLedDirection[virtualIndex] == direction
  ) {
    virtualLedDirection[virtualIndex] = direction;
  } else {
    // Direction collision: keep UNKNOWN so later RGB rendering can show this
    // as a special conflict instead of silently choosing one.
    virtualLedDirection[virtualIndex] = DIRECTION_UNKNOWN;
  }

  if (vehicleState > virtualLedState[virtualIndex]) {
    virtualLedState[virtualIndex] = vehicleState;
  }
}

void printActiveVirtualFrame() {
  Serial.println("Aktiv VLED-frame:");

  const int count = totalVirtualLedCount();

  for (int i = 0; i < count; i++) {
    if (!virtualLedActive[i]) continue;

    Serial.printf(
      "  VLED %02d | dir %-7s | state %s\n",
      i,
      directionName(virtualLedDirection[i]),
      vehicleStateName(virtualLedState[i])
    );
  }
}

// -----------------------------------------------------------------------------
// RGB RENDER ENGINE v1
// -----------------------------------------------------------------------------
// Translates the logical Virtual LED Frame into logical RGB output values.
// No physical WS2812/SK6812 driver is connected in v0.39.2; the existing
// 16-station red-LED GPIO output remains unchanged.

enum RgbRenderModeCode {
  RGB_RENDER_STEADY = 0,
  RGB_RENDER_BLINK = 1,
  RGB_RENDER_PULSE = 2
};

uint8_t virtualLedRed[MAX_VIRTUAL_LEDS];
uint8_t virtualLedGreen[MAX_VIRTUAL_LEDS];
uint8_t virtualLedBlue[MAX_VIRTUAL_LEDS];
uint8_t virtualLedBrightness[MAX_VIRTUAL_LEDS];
int virtualLedRenderMode[MAX_VIRTUAL_LEDS];

const char* rgbRenderModeName(int renderMode) {
  if (renderMode == RGB_RENDER_BLINK) return "blink";
  if (renderMode == RGB_RENDER_PULSE) return "pulse";
  return "steady";
}

void renderVirtualLedFrameRgb() {
  for (int i = 0; i < MAX_VIRTUAL_LEDS; i++) {
    virtualLedRed[i] = 0;
    virtualLedGreen[i] = 0;
    virtualLedBlue[i] = 0;
    virtualLedBrightness[i] = 0;
    virtualLedRenderMode[i] = RGB_RENDER_STEADY;

    if (!virtualLedActive[i]) continue;

    const int direction = virtualLedDirection[i];
    const int vehicleState = virtualLedState[i];

    if (direction == DIRECTION_LIAN) {
      virtualLedRed[i] = 0;
      virtualLedGreen[i] = 255;
      virtualLedBlue[i] = 80;
    } else if (direction == DIRECTION_ILA) {
      virtualLedRed[i] = 0;
      virtualLedGreen[i] = 100;
      virtualLedBlue[i] = 255;
    } else {
      // UNKNOWN and direction collisions use a visible diagnostic color.
      virtualLedRed[i] = 255;
      virtualLedGreen[i] = 0;
      virtualLedBlue[i] = 255;
    }

    if (vehicleState == VEHICLE_WAITING) {
      virtualLedBrightness[i] = 180;
      virtualLedRenderMode[i] = RGB_RENDER_PULSE;
    } else if (vehicleState == VEHICLE_PARKED) {
      virtualLedBrightness[i] = 255;
      virtualLedRenderMode[i] = RGB_RENDER_BLINK;
    } else {
      virtualLedBrightness[i] = 255;
      virtualLedRenderMode[i] = RGB_RENDER_STEADY;
    }
  }
}

void printActiveRgbFrame() {
  Serial.println("RGB Render Frame:");

  const int count = totalVirtualLedCount();

  for (int i = 0; i < count; i++) {
    if (!virtualLedActive[i]) continue;

    Serial.printf(
      "  VLED %02d | dir %-7s | state %-7s | RGB %u,%u,%u | brightness %u | %s\n",
      i,
      directionName(virtualLedDirection[i]),
      vehicleStateName(virtualLedState[i]),
      virtualLedRed[i],
      virtualLedGreen[i],
      virtualLedBlue[i],
      virtualLedBrightness[i],
      rgbRenderModeName(virtualLedRenderMode[i])
    );
  }
}

// -----------------------------------------------------------------------------
// TERMINAL STABILIZER v1
// -----------------------------------------------------------------------------
const int TERMINAL_LIAN_INDEX = 0;
const int TERMINAL_ILA_INDEX = (int)STATION_COUNT - 1;

bool isTerminalIndex(int stationIndex) {
  return stationIndex == TERMINAL_LIAN_INDEX ||
         stationIndex == TERMINAL_ILA_INDEX;
}

bool destinationMeansLeavingTerminal(
  int terminalIndex,
  const String &destination
) {
  String dest = destination;
  dest.toLowerCase();

  if (terminalIndex == TERMINAL_LIAN_INDEX) {
    return dest.indexOf("ila") >= 0;
  }

  if (terminalIndex == TERMINAL_ILA_INDEX) {
    return dest.indexOf("lian") >= 0;
  }

  return false;
}

int stabilizeTerminalStation(
  const String &vehicleId,
  const String &destination,
  double lat,
  double lon,
  int rawStationIndex,
  bool rawArrived,
  double &distanceToChosenStation
) {
  const int historyIndex = findHistoryIndex(vehicleId);

  if (historyIndex < 0) {
    return rawArrived ? rawStationIndex : -1;
  }

  int &lockedTerminal = historyTerminalLock[historyIndex];

  if (rawArrived && isTerminalIndex(rawStationIndex)) {
    lockedTerminal = rawStationIndex;
    return rawStationIndex;
  }

  if (lockedTerminal < 0) {
    return rawArrived ? rawStationIndex : -1;
  }

  const double terminalDistance = distanceMeters(
    lat,
    lon,
    stations[lockedTerminal].lat,
    stations[lockedTerminal].lon
  );

  const bool leavingDirection = destinationMeansLeavingTerminal(
    lockedTerminal,
    destination
  );

  const bool normalRelease =
    leavingDirection &&
    terminalDistance >= TERMINAL_DEPARTURE_METERS;

  const bool hardRelease =
    terminalDistance >= TERMINAL_HARD_RELEASE_METERS;

  if (normalRelease || hardRelease) {
    Serial.printf(
      "TERMINAL RELEASE vehicle %s | %s | %.1f m | dest %s\n",
      vehicleId.c_str(),
      stations[lockedTerminal].name,
      terminalDistance,
      destination.c_str()
    );

    lockedTerminal = -1;
    return rawArrived ? rawStationIndex : -1;
  }

  distanceToChosenStation = terminalDistance;

  Serial.printf(
    "TERMINAL LOCK vehicle %s | %s | %.1f m | dest %s\n",
    vehicleId.c_str(),
    stations[lockedTerminal].name,
    terminalDistance,
    destination.c_str()
  );

  return lockedTerminal;
}

// -----------------------------------------------------------------------------
// ENTUR
// -----------------------------------------------------------------------------
const char* GRAPHQL_QUERY = R"graphql(
{
  vehicles(codespaceId:"ATB") {
    vehicleId
    lastUpdated
    line {
      publicCode
    }
    destinationName
    location {
      latitude
      longitude
    }
  }
}
)graphql";


bool stationOccupied[STATION_COUNT];
int stationState[STATION_COUNT];

void clearStationFrame() {
  for (size_t i = 0; i < STATION_COUNT; i++) {
    stationOccupied[i] = false;
    stationState[i] = VEHICLE_MOVING;
  }

  clearVirtualLedFrame();
}

void applyStationFrame() {
  const unsigned long now = millis();

  for (size_t i = 0; i < STATION_COUNT; i++) {
    if (!stationOccupied[i]) {
      setStationLed(i, false);
      continue;
    }

    bool on = true;

    if (stationState[i] == VEHICLE_WAITING) {
      on =
        ((now / WAITING_BLINK_MS) % 2) == 0;
    }
    else if (stationState[i] == VEHICLE_PARKED) {
      on =
        ((now / PARKED_BLINK_MS) % 2) == 0;
    }

    setStationLed(i, on);
  }
}

bool fetchAndRenderEntur() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi er ikke tilkoblet.");
    return false;
  }

  if (!ensureUtcClock()) {
    return false;
  }

  const int64_t currentEpochSeconds = (int64_t)time(nullptr);

  JsonDocument requestDoc;
  requestDoc["query"] = GRAPHQL_QUERY;

  String requestBody;
  serializeJson(requestDoc, requestBody);
  JsonDocument doc;
  bool responseReady = false;
  bool responseRetryAttempted = false;

  for (
    int retryNumber = 0;
    retryNumber <= ENTUR_MAX_RESPONSE_RETRIES && !responseReady;
    retryNumber++
  ) {
    WiFiClientSecure client;

    // Prototype only: certificate verification remains unchanged from v0.39.1.
    client.setInsecure();
    client.setTimeout(ENTUR_RESPONSE_TIMEOUT_MS);

    HTTPClient http;
    http.useHTTP10(false);
    http.setReuse(false);
    http.setConnectTimeout(ENTUR_CONNECT_TIMEOUT_MS);
    http.setTimeout(ENTUR_RESPONSE_TIMEOUT_MS);

    Serial.println();
    Serial.printf(
      "Henter Entur | retry %d/%d | free heap fÃ¸r HTTP: %u bytes\n",
      retryNumber,
      ENTUR_MAX_RESPONSE_RETRIES,
      ESP.getFreeHeap()
    );

    if (!http.begin(client, ENTUR_URL)) {
      Serial.println("HTTP-feil: kunne ikke starte HTTPS.");
      break;
    }

    http.addHeader("Content-Type", "application/json");
    http.addHeader("ET-Client-Name", ET_CLIENT_NAME);

    const int httpCode = http.POST(requestBody);

    if (httpCode <= 0) {
      Serial.printf(
        "HTTP-feil: %s | retry %d/%d\n",
        http.errorToString(httpCode).c_str(),
        retryNumber,
        ENTUR_MAX_RESPONSE_RETRIES
      );
      http.end();
      break;
    }

    Serial.printf(
      "HTTP status: %d | Content-Length: %d bytes\n",
      httpCode,
      http.getSize()
    );

    if (httpCode != HTTP_CODE_OK) {
      Serial.printf(
        "HTTP-feil: uventet status %d. Response body logges ikke.\n",
        httpCode
      );
      http.end();
      break;
    }

    const int expectedBodyBytes = http.getSize();
    const uint32_t heapBeforeReceive = ESP.getFreeHeap();
    StreamString responseBody;

    if (expectedBodyBytes > 0) {
      responseBody.reserve((unsigned int)expectedBodyBytes + 1U);
    }

    // HTTPClient decodes both Content-Length and chunked bodies here. For an
    // unknown identity length (-1), setReuse(false) requests connection-close
    // framing. ArduinoJson sees the body only after this read has completed.
    const int receiveResult = http.writeToStream(&responseBody);
    const size_t receivedBodyBytes = responseBody.length();
    const bool knownLengthMatches =
      expectedBodyBytes < 0 ||
      receivedBodyBytes == (size_t)expectedBodyBytes;
    const bool bodyReadComplete =
      receiveResult >= 0 &&
      receivedBodyBytes == (size_t)receiveResult &&
      knownLengthMatches;

    Serial.printf(
      "Entur body mottatt | %u bytes | ferdig: %s | receive result: %d | free heap fÃ¸r/etter: %u/%u bytes\n",
      (unsigned)receivedBodyBytes,
      bodyReadComplete ? "JA" : "NEI",
      receiveResult,
      heapBeforeReceive,
      ESP.getFreeHeap()
    );

    if (receivedBodyBytes == 0) {
      Serial.printf(
        "Entur response empty | received 0 bytes | retry %d/%d\n",
        retryNumber,
        ENTUR_MAX_RESPONSE_RETRIES
      );
      http.end();

      if (retryNumber < ENTUR_MAX_RESPONSE_RETRIES) {
        Serial.println("Entur response incomplete | received 0 bytes | retry 1/1");
        responseRetryAttempted = true;
        delay(250);
        continue;
      }
      break;
    }

    if (!bodyReadComplete) {
      Serial.printf(
        "Entur response timeout/avkortet | received %u bytes | error %s\n",
        (unsigned)receivedBodyBytes,
        receiveResult < 0
          ? http.errorToString(receiveResult).c_str()
          : "length mismatch"
      );
      http.end();

      if (retryNumber < ENTUR_MAX_RESPONSE_RETRIES) {
        Serial.printf(
          "Entur response incomplete | received %u bytes | retry 1/1\n",
          (unsigned)receivedBodyBytes
        );
        responseRetryAttempted = true;
        delay(250);
        continue;
      }
      break;
    }

    Serial.printf(
      "Entur body komplett | %u bytes | free heap fÃ¸r parse: %u bytes\n",
      (unsigned)receivedBodyBytes,
      ESP.getFreeHeap()
    );

    doc.clear();
    const DeserializationError jsonError = deserializeJson(
      doc,
      responseBody.c_str(),
      receivedBodyBytes
    );

    if (jsonError) {
      if (jsonError == DeserializationError::IncompleteInput) {
        Serial.printf(
          "JSON IncompleteInput | body %u bytes | free heap etter parse: %u bytes\n",
          (unsigned)receivedBodyBytes,
          ESP.getFreeHeap()
        );
        http.end();

        if (retryNumber < ENTUR_MAX_RESPONSE_RETRIES) {
          Serial.printf(
            "Entur response incomplete | received %u bytes | retry 1/1\n",
            (unsigned)receivedBodyBytes
          );
          responseRetryAttempted = true;
          delay(250);
          continue;
        }
        break;
      }

      Serial.printf(
        "JSON-feil (ikke IncompleteInput): %s | body %u bytes | free heap etter parse: %u bytes\n",
        jsonError.c_str(),
        (unsigned)receivedBodyBytes,
        ESP.getFreeHeap()
      );
      http.end();
      break;
    }

    Serial.printf(
      "JSON OK | free heap etter parse: %u bytes\n",
      ESP.getFreeHeap()
    );

    responseReady = true;
    http.end();
  }

  if (!responseReady) {
    if (responseRetryAttempted) {
      Serial.println(
        "Entur/JSON-feil etter retry. Beholder siste gyldige station/VLED-frame."
      );
    } else {
      Serial.println(
        "Entur/JSON-feil. Beholder siste gyldige station/VLED-frame."
      );
    }
    return false;
  }

  // Small diagnostic: if Entur ever changes the response shape, print the
  // top-level keys instead of silently failing.
  if (doc["data"].isNull()) {
    Serial.println("Mangler 'data' i Entur-svaret.");
    serializeJson(doc, Serial);
    Serial.println();
    return false;
  }

  JsonArray vehicles =
    doc["data"]["vehicles"].as<JsonArray>();

  if (vehicles.isNull()) {
    Serial.println("Fant ingen vehicles-array i Entur-svaret.");
    Serial.println("Data-objektet som ble mottatt:");
    serializeJson(doc["data"], Serial);
    Serial.println();
    return false;
  }

  Serial.printf(
    "Vehicles i rÃ¥data: %u\n",
    (unsigned)vehicles.size()
  );

  // First normalize and deduplicate the raw Entur result.
  // LED rendering happens only AFTER one freshest record per vehicleId remains.
  String uniqueVehicleIds[MAX_ACTIVE_VEHICLES];
  String uniqueDestinations[MAX_ACTIVE_VEHICLES];
  String uniqueLastUpdated[MAX_ACTIVE_VEHICLES];
  double uniqueLat[MAX_ACTIVE_VEHICLES];
  double uniqueLon[MAX_ACTIVE_VEHICLES];

  size_t uniqueCount = 0;
  int rawLine9Count = 0;
  int duplicateCount = 0;

  for (JsonObject vehicle : vehicles) {
    const char* lineCode =
      vehicle["line"]["publicCode"] | "";

    if (strcmp(lineCode, "9") != 0) {
      continue;
    }

    rawLine9Count++;

    const String vehicleId =
      String(vehicle["vehicleId"] | "unknown");

    const String destination =
      String(vehicle["destinationName"] | "");

    const String lastUpdatedKey =
      jsonValueToString(
        vehicle["lastUpdated"]
      );

    if (
      vehicle["location"]["latitude"].isNull() ||
      vehicle["location"]["longitude"].isNull()
    ) {
      Serial.printf(
        "Vogn %s mangler posisjon.\n",
        vehicleId.c_str()
      );
      continue;
    }

    const double candidateLat =
      vehicle["location"]["latitude"].as<double>();

    const double candidateLon =
      vehicle["location"]["longitude"].as<double>();

    const int existingIndex =
      findVehicleIndex(
        uniqueVehicleIds,
        uniqueCount,
        vehicleId
      );

    if (existingIndex < 0) {
      if (uniqueCount >= MAX_ACTIVE_VEHICLES) {
        Serial.println(
          "ADVARSEL: MAX_ACTIVE_VEHICLES nÃ¥dd."
        );
        continue;
      }

      uniqueVehicleIds[uniqueCount] = vehicleId;
      uniqueDestinations[uniqueCount] = destination;
      uniqueLastUpdated[uniqueCount] = lastUpdatedKey;
      uniqueLat[uniqueCount] = candidateLat;
      uniqueLon[uniqueCount] = candidateLon;
      uniqueCount++;
      continue;
    }

    duplicateCount++;

    const int freshness =
      compareFreshnessKeys(
        lastUpdatedKey,
        uniqueLastUpdated[existingIndex]
      );

    Serial.printf(
      "DUPLIKAT vehicleId %s | gammel: dest=%s updated=%s | kandidat: dest=%s updated=%s\n",
      vehicleId.c_str(),
      uniqueDestinations[existingIndex].c_str(),
      uniqueLastUpdated[existingIndex].c_str(),
      destination.c_str(),
      lastUpdatedKey.c_str()
    );

    if (freshness > 0) {
      Serial.println(
        "  -> kandidat er nyere, erstatter gammel post"
      );

      uniqueDestinations[existingIndex] = destination;
      uniqueLastUpdated[existingIndex] = lastUpdatedKey;
      uniqueLat[existingIndex] = candidateLat;
      uniqueLon[existingIndex] = candidateLon;

    } else if (freshness < 0) {
      Serial.println(
        "  -> eksisterende post er nyere, forkaster kandidat"
      );

    } else {
      // Same timestamp but conflicting data. Keep the first record and make
      // the conflict visible instead of guessing silently.
      const bool conflict =
        uniqueDestinations[existingIndex] != destination ||
        fabs(uniqueLat[existingIndex] - candidateLat) > 0.00001 ||
        fabs(uniqueLon[existingIndex] - candidateLon) > 0.00001;

      if (conflict) {
        Serial.println(
          "  -> DATAKONFLIKT: samme lastUpdated, ulike data. Beholder fÃ¸rste post."
        );
      } else {
        Serial.println(
          "  -> identisk duplikat, ignorerer"
        );
      }
    }
  }

  // Build one clean logical LED frame.
  clearStationFrame();

  int tramCount = 0;
  int staleCount = 0;

  for (size_t i = 0; i < uniqueCount; i++) {
    int64_t updatedEpochSeconds = 0;
    const bool validTimestamp = parseLastUpdatedEpoch(
      uniqueLastUpdated[i],
      updatedEpochSeconds
    );

    const bool tooOld =
      validTimestamp &&
      currentEpochSeconds - updatedEpochSeconds >
        (int64_t)MAX_VEHICLE_DATA_AGE_SECONDS;

    const bool tooFarInFuture =
      validTimestamp &&
      updatedEpochSeconds - currentEpochSeconds >
        (int64_t)MAX_FUTURE_CLOCK_SKEW_SECONDS;

    if (!validTimestamp || tooOld || tooFarInFuture) {
      staleCount++;

      if (validTimestamp) {
        const int64_t ageSeconds =
          currentEpochSeconds - updatedEpochSeconds;
        Serial.printf(
          "STALE vehicle %s ignored | updated %s | age %lld s\n",
          uniqueVehicleIds[i].c_str(),
          uniqueLastUpdated[i].c_str(),
          (long long)ageSeconds
        );
      } else {
        Serial.printf(
          "STALE vehicle %s ignored | invalid lastUpdated: %s\n",
          uniqueVehicleIds[i].c_str(),
          uniqueLastUpdated[i].c_str()
        );
      }

      continue;
    }

    double nearestDistanceMeters = 0.0;

    const int stationIndex =
      findNearestStation(
        uniqueLat[i],
        uniqueLon[i],
        nearestDistanceMeters
      );

    tramCount++;

    if (stationIndex < 0) {
      Serial.printf(
        "Trikk %-18s | dest %-18s | ingen stasjonsmatch | updated %s\n",
        uniqueVehicleIds[i].c_str(),
        uniqueDestinations[i].c_str(),
        uniqueLastUpdated[i].c_str()
      );
      continue;
    }

    const bool rawArrived =
      nearestDistanceMeters <=
        STATION_ARRIVAL_RADIUS_METERS;

    const int vehicleState =
      updateVehicleState(
        uniqueVehicleIds[i],
        uniqueLat[i],
        uniqueLon[i],
        millis()
      );

    const int vehicleDirection =
      directionFromDestination(
        uniqueDestinations[i]
      );

    double chosenDistanceMeters = nearestDistanceMeters;

    const int chosenStationIndex =
      stabilizeTerminalStation(
        uniqueVehicleIds[i],
        uniqueDestinations[i],
        uniqueLat[i],
        uniqueLon[i],
        stationIndex,
        rawArrived,
        chosenDistanceMeters
      );

    if (chosenStationIndex >= 0) {
      stationOccupied[chosenStationIndex] = true;

      if (vehicleState > stationState[chosenStationIndex]) {
        stationState[chosenStationIndex] = vehicleState;
      }

      setVirtualLed(
        virtualStationLedIndex(chosenStationIndex),
        vehicleDirection,
        vehicleState
      );

      const bool terminalLocked =
        chosenStationIndex != stationIndex || !rawArrived;

      Serial.printf(
        "Trikk %-18s | dest %-18s | %s %-16s | GPIO %u | VLED %d | dir %s | %.1f m | state %s | updated %s\n",
        uniqueVehicleIds[i].c_str(),
        uniqueDestinations[i].c_str(),
        terminalLocked ? "TERMINAL" : "ANKOMST",
        stations[chosenStationIndex].name,
        stations[chosenStationIndex].gpio,
        virtualStationLedIndex(chosenStationIndex),
        directionName(vehicleDirection),
        chosenDistanceMeters,
        vehicleStateName(vehicleState),
        uniqueLastUpdated[i].c_str()
      );
    } else {
      double segmentProgress = 0.0;
      double segmentDistanceMeters = 0.0;
      int virtualLedIndex = -1;
      int virtualLedCount = 0;

      const int segmentIndex =
        findNearestSegment(
          uniqueLat[i],
          uniqueLon[i],
          segmentProgress,
          segmentDistanceMeters,
          virtualLedIndex,
          virtualLedCount
        );

      if (segmentIndex >= 0) {
        const int globalVirtualLed =
          virtualSegmentLedIndex(
            segmentIndex,
            virtualLedIndex
          );

        setVirtualLed(
          globalVirtualLed,
          vehicleDirection,
          vehicleState
        );

        Serial.printf(
          "Trikk %-18s | dest %-18s | MELLOM %s -> %s | LED %d/%d | VLED %d | dir %s | %.0f%% | sporavvik %.1f m | confidence %s | state %s | updated %s\n",
          uniqueVehicleIds[i].c_str(),
          uniqueDestinations[i].c_str(),
          stations[segmentIndex].name,
          stations[segmentIndex + 1].name,
          virtualLedIndex + 1,
          virtualLedCount,
          globalVirtualLed,
          directionName(vehicleDirection),
          segmentProgress * 100.0,
          segmentDistanceMeters,
          segmentPositionConfidenceName(segmentDistanceMeters),
          vehicleStateName(vehicleState),
          uniqueLastUpdated[i].c_str()
        );
      } else {
        Serial.printf(
          "Trikk %-18s | dest %-18s | MELLOM STASJONER | ingen segmentmatch | state %s | updated %s\n",
          uniqueVehicleIds[i].c_str(),
          uniqueDestinations[i].c_str(),
          vehicleStateName(vehicleState),
          uniqueLastUpdated[i].c_str()
        );
      }
    }
  }

  Serial.printf(
    "RÃ¥ linje-9 poster: %d | duplikater: %d | unike vogner: %u\n",
    rawLine9Count,
    duplicateCount,
    (unsigned)uniqueCount
  );

  Serial.printf(
    "Aktive GrÃ¥kallbane-vogner etter dedup/freshness: %d | stale ignorert: %d\n",
    tramCount,
    staleCount
  );

  printActiveVirtualFrame();
  renderVirtualLedFrameRgb();
  printActiveRgbFrame();

  applyStationFrame();

  return true;
}

// -----------------------------------------------------------------------------
// SETUP / LOOP
// -----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println();
  Serial.println("TransitCore ESP32 v0.39.2");
  Serial.println("LIVE POSITION + VLED MAPPING + DIRECTION ENGINE");
  Serial.println();

  printVirtualLedMap();

  for (size_t i = 0; i < STATION_COUNT; i++) {
    pinMode(stations[i].gpio, OUTPUT);
    writeLed(stations[i].gpio, false);
  }

  startupWave(30);
  allOn(250);

  connectWifi();

  fetchAndRenderEntur();
}

void loop() {
  static unsigned long lastUpdateAt = 0;

  const unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  if (
    lastUpdateAt == 0 ||
    now - lastUpdateAt >= UPDATE_INTERVAL_MS
  ) {
    lastUpdateAt = now;
    fetchAndRenderEntur();
  }

  // Refresh physical LEDs continuously so WAITING/PARKED blinking remains
  // smooth even though Entur is only fetched every 10 seconds.
  applyStationFrame();

  delay(25);
}


#pragma once

// Copy one of the board-specific headers in this folder to board_config.h.
// These values are checked against every received frame before LEDs change.
const uint8_t LED_DATA_PIN = 2;
const uint16_t LED_COUNT = 47;
const char* EXPECTED_BOARD_PROFILE = "grakallbanen-board";
const char* FEED_URL =
  "https://transitcore-led-feed.lgb84.workers.dev/"
  "v1/boards/grakallbanen-board/frame";


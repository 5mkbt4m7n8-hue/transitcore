# TransitCore Board Client v0.1.0

`firmware/esp32/TransitCore_BoardClient_v0_1_0.ino` er en separat ESP32-klient for LED-feed v1. Den endrer ikke Gråkallbane-firmwaren.

## Standardtilstand

- NeoPixel-hardware er deaktivert.
- Oppstartstest er deaktivert.
- Tavleprofilen er `trondheim-bus-board` med 147 fysiske LED-er.
- Feeden hentes hvert 10. sekund fra Cloudflare Worker-endepunktet.
- `APPROACHING` pulserer, mens `AT_STOP` lyser stabilt.
- Lokal maksimal brightness er 32.

## Sikker frame-håndtering

En frame godtas bare når schema, tavle-ID, LED-antall, sekvens, TTL, alle LED-ID-er, RGB-verdier, brightness, states og duplikater er gyldige. Hele candidate-framen kopieres atomisk til aktiv frame etter fullført validering.

Ved korte Wi-Fi-, HTTP- eller JSON-feil beholdes siste gyldige frame. Dersom ingen gyldig frame mottas før TTL utløper, slukkes hele tavlen. Eldre sekvenser avvises; samme sekvens godtas som ny freshness-bekreftelse.

## Før maskinvaretest

1. Kopier `secrets.example.h` til `secrets.h` og fyll inn Wi-Fi lokalt.
2. Installer ESP32 boardpakken, ArduinoJson og Adafruit NeoPixel i Arduino IDE.
3. Kompiler først med `LED_HARDWARE_ENABLED = false` og kontroller Serial Monitor.
4. Kontroller separat 5 V-strømforsyning, felles jord, kondensator, datamotstand og eventuelt nivåskifter.
5. Sett `LED_HARDWARE_ENABLED = true` først når strøm- og signalkoblingen er kontrollert.

`WiFiClientSecure::setInsecure()` brukes i v0.1.0 for første integrasjonstest. Sertifikatvalidering bør strammes inn før permanent installasjon.


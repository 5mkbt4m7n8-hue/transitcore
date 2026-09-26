# PixelFrame v1 — kompatibel modell

Fase B legger til `core/models/pixel-frame.mjs`. Den brukes bare eksplisitt
av tester/kallere, ikke i dagens feed. JSON-utdata, API og firmware er uendret.
Se også `led-feed-v1.md` for historisk kontrakt og `SIGNAL_POLICY.md` for policy.

```json
{
  "schemaVersion": 1,
  "boardProfile": "grakallbanen-prototype-board",
  "generatedAt": "2026-09-26T12:00:00Z",
  "sequence": 1,
  "ttlSeconds": 30,
  "ledCount": 16,
  "leds": [{"id": 0, "rgb": [0,255,80], "brightness": 32, "state": "AT_STOP"}]
}
```

`validatePixelFrame(frame, {expectedBoardProfile, expectedLedCount, now})`
returnerer `{valid, errors, warnings}` uten å endre input. `now` er valgfritt
epoch-millis; uten det kontrolleres ikke utløp. Ingen klokke eller nettverkskall
skjules i validatoren. Feil har path og message.

Regler:

- schemaVersion 1; eksisterende board-ID-format og eventuelt forventet ID.
- ledCount positivt heltall, sammenlignet med expectedLedCount når oppgitt.
- sequence uint32. Monotoni er fortsatt mottakerens ansvar (trenger tidligere frame).
- generatedAt parsebar timestamp med tidssone; ttlSeconds heltall 10..300,
  i samsvar med Universal BoardClient 1.2.13.
- Når now oppgis, avvises frame eldre enn TTL. Fremtidig klokkeavvik håndteres
  fortsatt av eksisterende klient; dette er ikke en komplett emulator av klienten.
- leds er en array, også tom. ID-er er unike heltall 0..ledCount-1.
- RGB er tre heltall 0..255; brightness er heltall 0..255.
- state støtter OFF, APPROACHING, AT_STOP, PASSED, PARKED; ikke ny MOVING-enum.
- Valgfritt lifecycle PASSED/PARKED bevares (f.eks. AT_STOP + lifecycle PASSED).
- vehicle/metadata er valgfrie objekter; occupants er array med state og RGB.
- Andre eksisterende felter som profilidentitet, signalPolicy, motionPolicy og
  positioning godtas og endres ikke. Validatoren hevder ikke å validere alle
  disse utvidelsenes interne regler.

Utelatte LED-er er av i grunnframen; lokal bakgrunnsbelysning er en render-modus,
ikke en ny feed-kontrakt. Hele frame erstattes atomisk i klienten. Nettverksfeil,
last-valid-frame, render-watchdog og serverens stale-hold er fortsatt eksisterende
runtime-ansvar. Validering av struktur er ikke bevis på fersk provider-posisjon.

Ingen migrering kreves i fase B: ingenting importerer validatoren i produksjon,
ingen schemaVersion-bump, og ingen endring av frame-serialization.

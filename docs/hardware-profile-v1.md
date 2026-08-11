# Hardware Profile v1

Tavleredigereren i `web/editor/` lager en separat kobling mellom en logisk tavleprofil og den fysiske LED-kjeden.

Den endrer ikke ruter, live-data, retninger, stasjons-ID-er eller logiske LED-numre. Dermed kan samme tavleprofil brukes med flere fysiske tavler.

## Format

- `boardProfile`: ID-en til kildeprofilen i `config/boards/`.
- `leds.count`: antall aktiverte fysiske LED-punkter.
- `assignments`: ett aktivt fysisk punkt per logisk stasjon eller plattform.
- `sourceNodeId`: stabil kobling tilbake til den logiske noden.
- `logicalLed`: kildeprofilens nummer, bare for kontroll.
- `physicalLed`: faktisk indeks i LED-kjeden.
- `quayId` og `direction`: identifiserer plattform og retning når tavleprofilen støtter dette.

Fysiske LED-numre må være heltall fra 0 uten kollisjoner. Redigereren validerer dette før nedlasting.

## Videre bruk

Den eksporterte JSON-filen er klargjort som kontrakt for en senere firmware-generator. ESP32-firmwaren er ikke koblet til Hardware Profile v1 ennå.


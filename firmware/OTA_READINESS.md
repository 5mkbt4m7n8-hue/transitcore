# TransitCore OTA-beredskap

OTA-klienten finnes i Universal Board Client og kontrollerer et autentisert
manifest. Worker svarer HTTP 204 fram til en kontrollert utgivelseskanal er på
plass, så dagens prototype beholder identisk LED-oppførsel.

## Aktivering

En OTA-klar førstegangsinstallasjon flashes over USB med:

```cpp
#define TRANSITCORE_OTA_ENABLED 1
#define TRANSITCORE_OTA_MANIFEST_URL "https://transitcore-led-feed.lgb84.workers.dev/v1/firmware/manifest"
```

Klienten venter to minutter etter oppstart og kontrollerer deretter hver sjette
time. Manifestkallet inneholder enhetstoken, enhets-ID, tavleprofil og installert
firmwareversjon. Ingen LED-frame eller Wi-Fi-konfigurasjon endres når det ikke
finnes en nyere versjon.

## Manifestformat

En vellykket respons bruker HTTP 200 og følgende JSON:

```json
{
  "version": "1.2.7",
  "boardProfile": "grakallbanen-prototype-board",
  "url": "https://firmware.example.invalid/device-id/1.2.7.bin"
}
```

Bruk HTTP 204 eller 304 når enheten allerede er oppdatert. Binærendepunktet må
bruke HTTPS og bør levere `x-MD5` slik ESP32 HTTPUpdate kan kontrollere
overføringsintegriteten.

## Før kommersiell aktivering

- Bruk en OTA-partisjonstabell som har to applikasjonspartisjoner.
- Bygg riktig binærfil for tavleprofil og maskinvarevariant.
- Token ligger foreløpig kompilert i den enhetsspesifikke binærfilen. Flytt
  enhetsidentitet og token til kryptert NVS før én felles binærfil distribueres.
- Aktiver signerte firmwarebilder eller ESP32 Secure Boot. HTTPS og MD5 alene
  er transport- og integritetsbeskyttelse, ikke full signaturverifisering.
- Legg inn bekreftelse av vellykket oppstart og automatisk rollback.
- Rull først ut til én testenhet, deretter en liten testgruppe, før alle enheter.

OTA skal ikke aktiveres for solgte enheter før punktene over er verifisert.

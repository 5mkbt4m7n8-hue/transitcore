# Reiseguide: fysisk quick-test av 1.3.0 på vanlig ESP32

Målet er Q01–Q17 på 15–20 minutter **etter** at bygg og flashing er klargjort.
1.2.13 er fortsatt standard nedlastingspakke. Denne guiden beskriver en lokal,
provisjonert testkopi av 1.3.0; den publiserer ingenting.

## 1. Velg riktig maskinvare og testidentitet

Den konkrete oppskriften nedenfor gjelder vanlig **DOIT ESP32 DEVKIT V1** med
klassisk ESP32 og 4 MB flash. Velg i Arduino IDE:

- Boards Manager: **esp32 by Espressif Systems 3.3.11**.
- Board: **DOIT ESP32 DEVKIT V1**.
- CLI target: `esp32:esp32:esp32doit-devkit-v1`.
- Standard partisjon for denne targeten; app-grensen i 3.3.11 er 1 310 720 byte.
  Ikke velg Huge APP/no OTA for å få et for stort bygg til å passe.
- Riktig USB/COM-port, Serial Monitor **115200 baud**.
- Biblioteker brukt i tidligere lokale bygg: ArduinoJson **7.4.3** og
  Adafruit NeoPixel **1.15.5**. Noter faktiske versjoner.

Sjekk merkingen på kortet først. At det står ESP32 er ikke nok til å bekrefte
korttype/flash. Har du en annen vanlig ESP32-modul, velg dens faktiske target og
noter avviket; denne oppskriften bekrefter ikke et ukjent kort. Ukjent modul,
flash eller pinout gjør oppsettet BLOCKED til dette er avklart. Ikke velg S3.

| Profil | Fysisk egnet når |
|---|---|
| grakallbanen-prototype-board + grakallbanen-prototype-board-hardware | Du faktisk har 16 kartpunkter, GPIO14 som data og GRB/800 kHz-stripe; fysisk LED0 er Ila og LED15 Lian i denne profilen |
| En annen allerede provisjonert profil | Publisert profil, registrert device, fysisk GPIO/LED-antall/retning/pikseltype og strømoppsett er kontrollert mot det du har koblet |
| trondheim-bus-board CI-fixture | **DO NOT FLASH** — syntetisk GPIO14 erstatter manglende hardware dataPin kun i kompileringstesten |

Prototypeprofilen har 16 logiske LED-er, GPIO14 og brightnessLimit 32 i
`config/hardware/grakallbanen-prototype-board-hardware.json`. Den er ikke automatisk
riktig bare fordi den kompilerer. Ved lengre fysisk stripe må hele lengden oppgis
i TRANSITCORE_PHYSICAL_LED_COUNT (minst 16). Ikke koble stor stripe gjennom
kortets strømvei uten et allerede verifisert strømoppsett. Del GND; bruk korrekt
dataretning og bare det strøm/USB-oppsettet som er kjent trygt for ditt kort.

Bruk en allerede registrert **egen testenhet** med samme boardProfile og
hardwareProfile og dens enhetsnøkkel. Ikke del identitet med en samtidig aktiv
prototype. Hvis en nøkkel/registrering mangler: provisioning må avklares før
LIVE/health-test; ikke legg administratornøkkelen i firmware.

For denne testen må det ikke tilbys automatisk OTA til testenheten. Bekreft
`otaEnabled=false` i dens eksisterende config, og ingen aktiv update/trial.
Den lokale makroen OTA_ENABLED=0 nedenfor er kun standardverdien: en LIVE eller
cached config kan overstyre den. Hvis dette ikke kan bekreftes, stopp og avklar
testidentiteten først. Ikke endre produksjonsserveren for å gjennomføre testen.

## 2. Lag en ekte lokal test-build

Compile-fixture er filene fra `scripts/prepare-esp13-compile.mjs` i
`.build/esp13-sketches/`. De bruker CI_ONLY-nøkler; noen bruker syntetisk GPIO.
**Ingen av disse fixturene skal flashes**, heller ikke Gråkallbanen-fixturen.
Et vellykket CI-bygg bekrefter kompilering, ikke provisioning eller fysisk pinout.

Bruk følgende fra samme repo-commit:

1. `firmware/esp32/TransitCore_Universal_BoardClient_v1_3_0.ino`
2. `firmware/esp32/TransitCore_Platform_v1.h`
3. Din lokale `board_config.h`.
4. Din lokale `secrets.h`.

Kjør `git rev-parse HEAD` og noter hele SHA-en i resultatfilens commitSha.
Bekreft at firmwarefilene ikke har ucommittede endringer. SHA-en er kilden til
testbygget, ikke et gjettet commitnummer fra en tidligere samtale.

Lag en ny mappe **utenfor repoet**, f.eks.
`C:\TransitCore-local-tests\TransitCoreTravel130\`. Kopier .ino og .h dit.
Gi .ino navnet `TransitCoreTravel130.ino` slik at navn og mappe stemmer.
I denne lokale kopien endrer du kun eksisterende byggbryter:

```cpp
const bool LED_HARDWARE_ENABLED = true;
```

Repo-kilden har false som standard. Dokumenter dette lokale byggvalget i
Q01-kommentaren. Behold firmwarelogikken ellers uendret. Uten fysisk stripe
kan du observere nett/Serial, men ikke merke LED-visning som fysisk verifisert.

For nøyaktig prototypeoppsett med 16 LED-er er board_config.h:

```cpp
#pragma once
const uint8_t LED_DATA_PIN = 14;
const uint16_t LED_COUNT = 16;
const char* EXPECTED_BOARD_PROFILE = "grakallbanen-prototype-board";
const char* FEED_URL = "https://transitcore-led-feed.lgb84.workers.dev/api/v1/frame/grakallbanen-prototype-board";
#define TRANSITCORE_API_ORIGIN "https://transitcore-led-feed.lgb84.workers.dev"
#define TRANSITCORE_HARDWARE_PROFILE "grakallbanen-prototype-board-hardware"
#define TRANSITCORE_HARDWARE_BRIGHTNESS_LIMIT 32
#define TRANSITCORE_PHYSICAL_LED_COUNT 16
#define TRANSITCORE_LED_FRAME_ISOLATION_TEST 0
#define TRANSITCORE_OTA_ENABLED 0
```

Juster bare fysisk lengde til den faktisk tilkoblede stripen. Hvis du trenger
andre profiler/pinner må hele hardwarekontrakten bekreftes først; ikke endre
bare profilnavnet for å tvinge feeden til å passe. Ikke bruk null som GPIO.

Lag secrets.h lokalt. Dette er kun plassholdere, ingen ekte secrets:

```cpp
#pragma once
#error Replace all placeholders below, then remove this error line before building.
const char* WIFI_SSID = "REPLACE_WITH_TEST_WIFI";
const char* WIFI_PASSWORD = "REPLACE_WITH_TEST_WIFI_PASSWORD";
#define TRANSITCORE_DEVICE_ID "replace-with-registered-test-device"
#define TRANSITCORE_DEVICE_TOKEN "REPLACE_WITH_DEVICE_TOKEN"
```

Fjern #error-linjen først når verdiene er riktige. Lagrede Wi-Fi-verdier i NVS
kan ha forrang over disse. Bruk kjent tidligere provisionering eller eksisterende
oppsettsflyt; ikke slett all flash/NVS for å få testen til å starte.
Ingen secrets skal kopieres tilbake til repoet eller Serial-rapporten.

## 3. Kompiler og flash

Arduino IDE: åpne TransitCoreTravel130.ino, velg target/port ovenfor og trykk
**Verify** først. Sjekk at den kompilerer som 1.3.0 og at flashbruken er under
partisjonens grense. Lagre sluttlinjene med flash/statisk RAM som byggebevis.
Velg deretter **Upload**. Lukk Serial Monitor hvis den låser porten. Dersom
opplasting krever BOOT: bruk kortets vanlige bootloader-prosedyre; ikke hold
BOOT lenge under normal drift (fem sekunder nullstiller lagret Wi-Fi).

Alternativ CLI, fra repo-roten, med faktisk COM-port i stedet for COM7:

```powershell
arduino-cli core install esp32:esp32@3.3.11
arduino-cli lib install ArduinoJson@7.4.3 "Adafruit NeoPixel@1.15.5"
arduino-cli board list
arduino-cli compile --fqbn esp32:esp32:esp32doit-devkit-v1 --build-path C:\TransitCore-local-tests\build130 C:\TransitCore-local-tests\TransitCoreTravel130
arduino-cli upload --fqbn esp32:esp32:esp32doit-devkit-v1 --port COM7 --input-dir C:\TransitCore-local-tests\build130 C:\TransitCore-local-tests\TransitCoreTravel130
arduino-cli monitor --port COM7 --config baudrate=115200
```

Gå videre kun hvis kompilering og upload faktisk lykkes. Ikke bruk erase-all.
Ta vare på den fungerende 1.2.13-pakken og lokale profiler/nøkler for USB-tilbakeføring.
Ingen OTA- eller rollback-test utføres på reisen.

## 4. Tre snapshots, ikke kontinuerlig logging

Åpning av Serial kan resette enkelte kort. Åpne monitoren før planlagt cold boot
og la den stå til testen er ferdig; kopier bare korte utdrag. Noter alle planlagte
resetter, også automatisk reset etter upload.

| Snapshot | Tidspunkt | Kopier |
|---|---|---|
| A | Etter cold boot | [BOOT] firmware, bootId, bootCount, reset; banner; Board/profil, fysisk/logisk antall og datapin; LED-test ferdig |
| B | Etter config/frame/health | Wi-Fi OK og [WIFI] connected rssi; [CONFIG] http=200, source=LIVE, result=SUCCESS; to LED-frame OK med sequence/TTL; HELSE med uptime/poll-tellere/heap/min; STATUS HTTP 200 |
| C | Etter disconnect/reconnect og én separat planlagt reboot | Frakoblet/tilkoblet, HELSE brudd/tilbake, ferske frames og Fleet før reboot; deretter [BOOT] med ny bootId og +1 bootCount, resetReason og config-kilde etter planlagt reboot |

Hent fersk Fleet-verdi før og etter reconnect: bootId/bootCount skal være
uendret og uptime skal øke. **Først etter denne sammenligningen** gjør du planlagt
reboot for Q10–Q12 (og Q15 hvis kontrollert endpoint-blokkering finnes).
Da kan en reset under Wi-Fi-testen ikke skjules av den planlagte resetten.
Manglende historisk snapshot gir BLOCKED for sammenligningen, ikke en antakelse.

Tidsplan: 0–5 min A/B; 5–8 min kort nettbrudd + reconnect uten reboot;
8–10 min planlagt reboot/C; 10–20 min helse/Fleet og resultatføring.
Health-intervallet kan være opptil 15 min; hvis fersk observasjon ikke rekker
tidsbudsjettet markeres relevant rad BLOCKED og tas ved neste kontroll.

## 5. Wi-Fi reconnect: Q13/Q14/Q16

1. Bruk eget hotspot som ESP-en allerede er koblet til. Noter bootId, bootCount,
   uptime og Wi-Fi-brudd før start.
2. Slå hotspot av i ca. 45 sekunder. La ESP-strøm og USB være urørt.
3. Se Wi-Fi frakoblet. TTL-utløp kan slukke tavlen; det er forventet.
4. Slå hotspot på med samme navn/passord. Vent på Wi-Fi OK og akseptert frame.
   Retry kan bruke opptil ca. ett minutt pluss nett-/HTTP-tid.
5. Sammenlign **ferske** Fleet/HELSE-verdier. Samme bootId/bootCount, økende
   uptime og gjenopptatte frames bekrefter reconnect uten reboot. Reboot-banner
   eller endret bootId før planlagt reset er et avvik som må undersøkes.

## 6. Cached config: Q15 er betinget

Kravet her er **LIVE → planlagt reboot mens config-endepunktet er utilgjengelig
→ CACHED**. Generell offline reboot fra I-A er ikke tilstrekkelig bevis for
denne isolerte endpoint-testen.

Bare hvis du allerede har et kontrollert testoppsett som kan blokkere akkurat
test-enhetens config-request uten å endre firmware, TLS eller produksjonsserver:

1. Dokumenter source=LIVE/result=SUCCESS og fravær av NVS_FAILED.
2. Aktiver den lokale/teststyrte blokkeringen for
   /api/v1/device/config/{deviceId}. Dokumenter metoden; behold øvrig nett/feed.
3. Gjør én planlagt reboot og fang source=CACHED samt mislykket config-fetch.
   CACHED må beholdes med riktig profil; verifiser at frame kan hentes.
4. Fjern blokkeringen og observer senere LIVE (feil-retry normalt fem minutter).
   Ikke endre serverens svar, enhetsnøkkel, board-ID eller sertifikatkontroll.

En vanlig hotspot/DNS-blokkering kan ikke isolere én HTTPS-path på samme host.
Hvis slik selektiv kontroll ikke er praktisk tilgjengelig: sett **Q15=BLOCKED**,
comment="Config-endepunkt kan ikke isoleres på reisen". Utfør vanlig planlagt
reboot for Q10–Q12 med nett på. Ikke endre produksjonsserveren eller innføre en
proxy/TLS-workaround for å få Q15 til å passere.

## 7. Fleet: nøyaktig verifikasjon

Åpne [Fleet](https://5mkbt4m7n8-hue.github.io/transitcore/web/fleet/), koble til med
din admin-adgang på betrodd maskin, søk etter **testenhetens deviceId**, velg
enheten og trykk **Oppdater detaljer**. Noter Sist sett, ikke bare sidens
oppdateringstid. Dashboardet er lesende. Del aldri administratornøkkelen.

| Felt | Tekst i Fleet | Forventning / test |
|---|---|---|
| firmwareVersion | Firmware | 1.3.0, Q02/Q17 |
| status | Status + Årsaker | ONLINE ved frisk drift; undersøk DEGRADED/ERROR. OFFLINE under brudd kan være forventet |
| lastSeen | Sist sett | Fersk rapport etter handlingen, Q08/Q17 |
| wifiRssi (RSSI) | RSSI | Rapportert dBm, Q09 |
| bootCount | Oppstarter | +1 etter planlagt reboot, uendret under reconnect, Q10 |
| bootId | Boot-ID | Samme innen boot, ny etter planlagt reset, Q11 |
| resetReason | Reset-årsak | Samsvarer med planlagt handling, Q12 |
| configSource | Konfigurasjonskilde | LIVE etter henting; CACHED bare fra boot-cache, Q05/Q15 |
| configFetchResult | Konfigurasjonshenting | SUCCESS normalt; logg reell feil ved isolert Q15 |
| lastFrameSequence | Frame-sekvens | Samsvarer med en akseptert frame fra samme boot, Q07 |
| lastFrameAgeSeconds | Frame-alder ved rapport | Alder da health ble sendt, ikke alder akkurat nå |
| successfulPolls | Vellykkede hentinger | Øker når frames hentes; per boot |
| failedPolls | Mislykkede hentinger | Noter før/etter og forklar eventuelle feil; ikke tell hver historikkrad på nytt |
| wifiOutages | Wi-Fi-brudd | Endring ved planlagt frakobling, Q13/Q14 |
| otaStage | OTA-steg | DISABLED/NOT_CHECKED kan være forventet uten OTA-test; ingen SUCCESS kreves |

Alle disse feltene finnes i nåværende Fleet-modell, men kan mangle i mottatte
data. Visning **Ikke rapportert**, null eller for gammel lastSeen gir BLOCKED
for testen som trenger feltet. Ikke gjett eller skriv 0. Tydelig feil verdi i
en fersk rapport er derimot et mulig FAIL. STATUS HTTP 200 alene beviser ikke
Q17. Forvent ikke frame-sekvensen i en gammel health-rapport å matche siste
Serial-linje før en ny health-rapport har kommet.

## 8. Resultatfil og Markdown

Kopier `hardware-tests/examples/esp32-quick-test.json` til en lokal mappe utenfor
repoet. Den har hardwareFamily=esp32 og Q01–Q17 som NOT_RUN. `commitSha: null`
er en bevisst plassholder, ingen fiktiv kandidat. Fyll full SHA fra steg 2,
faktisk modul/flash/profiler, dato med tidssone og verktøyversjoner.
Ukjent metadata beholdes null og holder gaten BLOCKED.

Sett PASS/FAIL/BLOCKED etter faktisk observasjon. Legg målingen i actual,
forklaring i comment og korte redigerte utdrag/referanser i serialExcerpt/evidence.
NOT_RUN brukes for tester som ikke er forsøkt.

```powershell
Copy-Item hardware-tests/examples/esp32-quick-test.json C:\TransitCore-local-tests\quick-results.json
# Rediger quick-results.json manuelt etter testen.
node scripts/hardware-test-report.mjs C:\TransitCore-local-tests\quick-results.json --output C:\TransitCore-local-tests\quick-report.md
```

Utfilen må være ny. Kommando uten --output viser rapporten i terminalen.
Exit 0 betyr at rapporten ble laget, ikke at releasen er godkjent.

Etter gjennomlesing og fjerning av secrets kan JSON + Markdown legges i en
egen senere rapport-PR under hardware-tests/reports/<dato>-<testnavn>/, med
relevante redigerte snapshots. Ikke legg secrets.h, hele test-builden, tokens
eller uredigerte nettverkslogger inn i repoet. Dette steget kjøres manuelt senere.

## 9. Hva kan gjennomføres på reisen?

Med kjent modul/stripe, registrert testenhet, hotspot, USB og Fleet-adgang kan
Q01–Q14 og Q16–Q17 gjennomføres uten ekstra feilinjeksjonsoppsett. Q15 er BLOCKED
uten selektiv config-endpoint-kontroll. Manglende Fleet-adgang blokkerer Q17
og telemetry som ikke kan dokumenteres; manglende stripe blokkerer fysisk
LED-observasjon. Ikke markér en nettverksobservasjon som en fysisk LED-test.

Selv alle 17 quick-tester PASS betyr **ikke release ready**. Rapporten lister
fortsatt S3 fulltest, OTA, rollback, NVS/power-loss, endpoint failure matrix,
heap-vurdering og 72h soak (samt kandidatens review-gater) som manglende.

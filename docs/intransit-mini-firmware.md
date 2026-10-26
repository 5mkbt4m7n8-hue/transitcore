# InTransit Mini – ESP32 skjermmotor (første firmwaregrunnlag)

Dette er et **eget firmwareprosjekt** i `firmware/mini/`. Den tidligere
Gråkallbanen-firmwaren og LED-tavlene påvirkes ikke.

## Hva som er bygget

- `include/mini_core.hpp`: ren C++17-motor med
  `Display::clear`, `rect`, `text`, `present`, avgangsmodell,
  tidsberegning og tilpasning til fysiske skjermdimensjoner.
- `include/mini_hardware.hpp`: tre skjermadaptere til
  **HUB75/DMA**, **SSD1306 OLED**, **TFT_eSPI**.
- `src/main.cpp`: kontrollert oppstart, avgangsvisning,
  eksplisitt DEMO/LIVE-valg, Wi-Fi/HTTPS, parsing av Mini sitt
  avgangsformat og oppdatering hvert 30. sekund.
- `platformio.ini`: ESP32-S3/Arduino-miljøer for tre skjermtyper.
- Vertstest av ni skjermoppløsninger og test som sammenligner
  layoutparametere med `web/mini/model.js`.

Dette er et **kompilerbart firmwaregrunnlag**, ikke en ferdig
installasjon på din fysiske matrise. OLED-miljøet bygges automatisk
i GitHub Actions. HUB75 og TFT trenger fremdeles virkelig
skjermmodell, tilkoblinger og maskinvarespesifikke innstillinger.
Både farger, font og tekstbegrensninger må tilpasses fysisk panel
ved integrasjon. C++ og web bruker samme *layoutregler*, men
ulike fontmotorer – dette er ikke pikselidentisk typografi.

## 1. Test på PC uten elektronikk

I repo-roten:

```sh
g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
 -I firmware/mini/include firmware/mini/test/test_mini_core.cpp \
 -o /tmp/intransit-mini-test
/tmp/intransit-mini-test
node scripts/test-mini-firmware-parity.mjs /tmp/intransit-mini-test
```

Dette tester alle åtte standardprofiler og en egendefinert 96×48,
avgangstider, feilmeldinger og DEMO/LIVE-separasjon.
Ingen ESP32, Entur eller Wi-Fi er involvert.

## 2. OLED først: PlatformIO

På en ESP32-S3 med kompatibel 128×64 SSD1306 I²C OLED:

```sh
cd firmware/mini
pio run -e mini_oled
```

Denne byggingen er med i CI; den **flasher ingenting**.
Når faktisk GPIO, I²C-adresse (standard 0x3C) og
strømtilkobling er bekreftet kan du bruke:

```sh
pio run -e mini_oled -t upload
pio device monitor -b 115200
```

Vi har ikke kontrollert OLED-koblingen på ditt kort.
Slå av spenningen før du kobler, og forsyn skjermen
i henhold til skjermprodusentens spesifikasjon.

## 3. Din 64×64 RGB LED-matrise

Hvis panelet er et vanlig **HUB75/HUB75E-panel**:
`mini_hub75` bruker
`ESP32 HUB75 LED MATRIX PANEL DMA Display` og
`HUB75_I2S_CFG`. Bekreft først:

- Eksakt ESP32-kort (helst ESP32-S3 med tilstrekkelig RAM).
- Matrisestripe/-kontroller, 1/32 scan, scanmønster og kontakttype.
- HUB75 signaler R1/G1/B1, R2/G2/B2, A/B/C/D/**E**,
  LAT, OE og CLK, med pinneplassering kontrollert mot adapteren.
- Panelstrøm **eksternt fra en dimensjonert strømforsyning**
  etter panelets datablad, ikke direkte fra ESP32 sin
  3,3 V/5 V-pin. Felles jord mellom panel og kontroller.
- Spenningsnivå, eventuell nivåforskyvning, PSRAM og DMA-minne.

I `platformio.ini` er `mini_hub75` en **sikker mal**.
Du må legge inn alle 14 bekreftede `MINI_PIN_*`-GPIO-er
som build-flags før kompilering. Uten dette stopper kompilatoren
med en tydelig feilmelding – den bruker aldri tilfeldige GPIO-er.
Driveren er ennå **ikke fysisk verifisert på 64×64-panelet**.

Hvis matrisen ikke bruker HUB75/HUB75E, skal du ikke
bruke denne driveren. Da må vi velge korrekt grensesnitt
etter den faktiske panelmodellen.

## 4. TFT / LCD

`mini_tft` bruker TFT_eSPI. Her er ingen SPI-pinner
eller panelkontroller forhåndsvalgt. TFT_eSPI trenger
riktig `User_Setup`/PlatformIO build-flags
(driver-ID, TFT_WIDTH/HEIGHT, MOSI, SCLK, CS, DC, RST,
frekvens og ev. baklys).
Når dette er bekreftet settes `MINI_TFT_CONFIGURED=1`
og riktig rotasjon. Uten dette **stopper kompileringen**.

## 5. DEMO og faktiske avganger

**Standard oppstart er OFFLINE DEMO**, uten Wi-Fi eller GPS.
Avgangene på skjermen er simulert, og merkes som
`SIMULERT` der skjermen har plass.

For Live:

1. Kontroller at
   `GET /api/v1/mini/departures?stop=NSR%3AStopPlace%3A41613`
   gir riktig respons fra **aktiv Cloudflare Worker**.
   En GitHub-merge er ikke nok til å garantere deploy.
2. Kopier `include/mini_secrets.example.h` til
   `include/mini_secrets.h`, et lokalt ignorert dokument.
3. Fyll inn Wi-Fi-data og en **gyldig, kontrollert rot-CA i PEM**
   som validerer Worker-vertsnavnets sertifikatkjede.
   Programmet bruker `setCACert`; ingen
   `setInsecure()`-omvei.
4. Aktiver `MINI_USE_LIVE=1` i privat konfigurasjon
   først når både Worker og TLS-oppsettet fungerer.

Live leser bare den offentlige avgangsfeedens JSON med
`schemaVersion=1`, riktig StopPlace-ID, kilde
`Entur Journey Planner v3`, tider, destinasjoner
og sanntids-/kanselleringsflagg. Formatet er det samme
som websimulatoren. Oppdatert avgangstid er **ikke GPS-posisjon**.

Ved feil vises `DATA FEIL` i stedet for DEMO-avganger.
Avgangslisten oppdateres hvert 30. sekund, skjermen
oppdateres hvert 5. sekund. På seriellporten kan du
sende `d` for DEMO, `l` for Live eller `r` for
umiddelbar ny kildeforespørsel. Ingen automatisk overgang
til DEMO på kildesvikt.

## Sikkerhet og begrensninger

- Prosjektet skriver ikke til lagret TransitCore-konfigurasjon,
  eksisterende ESP32-firmware eller originalkart.
- Ingen Wi-Fi-nøkler/CA-data ligger i GitHub.
- Dette er en første port med C++-renderer; OLED bygger i CI,
  ikke et bevis på fysisk skjermtest.
- HUB75/TFT-miljøene er hardware-maler, og må kompletteres.
- Webversjonens JSON-konfigurasjon er et produktformat.
  Automatisk direkte import av JSON på ESP32 er **ikke** implementert ennå;
  firmware bruker kompileringstidens skjerm- og stoppinnstillinger.

Neste praktiske steg er å identifisere nøyaktig **64×64-panel,
ESP32-kort og adapter**, slik at vi kan lage korrekt pinneprofil,
kompilere HUB75 og teste første oppstart uten å gjette.

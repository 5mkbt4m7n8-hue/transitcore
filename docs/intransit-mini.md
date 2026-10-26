# InTransit Mini – universell avgangstavle for LED, OLED og TFT

## Mini 4.0 – automatisk informasjonstavle

Under **Automatisk informasjonstavle** kan du velge en spilleliste
med minst to allerede lagrede Mini 3.0-oppsett. Bestem selv hvilke
som skal vises, og om det skal byttes hvert **5, 10, 15, 30
eller 60 sekund**. «Start visning» starter den første skjermen,
«Pause/Fortsett» stopper og gjenopptar tiden, og «Forrige»/«Neste»
lar deg overstyre rekkefølgen. En fremdriftslinje viser tid til neste
skjerm. **Vis skjerm i fullskjerm** fungerer der nettleseren
tillater fullskjerm-API (begrensninger kan gjelde på iPhone).

Rotasjonsvalgene (avkryssede profiler og intervall) lagres i
`intransit-mini:v4:rotation` **bare lokalt i nettleseren**,
adskilt fra `intransit-mini:v3:presets`. Nylig lagrede profiler
må legges til i den valgte listen. Hvis et oppsett slettes,
blir det automatisk fjernet fra spillelisten.
Selve avspillingstilstanden lagres **ikke**; ved omlasting må
du trykke «Start visning» på nytt.

**Viktig:** Dette er en vanlig nettside, ikke en bakgrunnsprosess.
Når nettleserfanen skjules, teller vekslingen ikke videre,
og den hopper ikke over skjermer når du kommer tilbake.
Manuell redigering av skjermoppsettet stopper rotasjonen,
slik at innstillingene ikke blir overskrevet av neste profil.
Hver profil aktiverer sin datakilde på nytt:
DEMO er helt offline, LIVE forsøker å hente friske avganger via
Worker og viser feil hvis kilden er utilgjengelig. Den kan aldri
bruke forrige skjerms avganger som data for den neste.

Rotasjonen er kun implementert i websimulatoren.
ESP32-firmwaren, eksisterende LED-tavler og Cloudflare Worker
ble ikke endret i Mini 4.0.

## Mini 3.0 – lagrede skjermer og fire design

Under **Mine skjermoppsett** kan du navngi opptil 12 konfigurasjoner,
for eksempel *Hjem*, *Jobb* og *Trondheim S*. Velg et lagret oppsett
for å gjenopprette skjermformat, LED/OLED/TFT-type, farger, lysstyrke,
holdeplass, valgt linje/retning og design. Bruk «Lagre som nytt»,
«Oppdater valgt» eller «Slett» etter behov.

**Viktig om lagring:** Profilene lagres **lokalt i denne
nettleseren** på samme enhet under den dedikerte nøkkelen
`intransit-mini:v3:presets`; de synkroniseres ikke automatisk
mellom mobil og PC. Eksporter et valgt oppsett som JSON for å
importere på en annen enhet. Import får alltid en ny lokal ID,
slik at den ikke overskriver eksisterende profiler.
Ingen GPS-data, kjøretøy-ID-er, tokens eller rå Entur-avganger
lagres i oppsettene. Maks 12. Andre TransitCore-utkast røres ikke.

Under **Visningsdesign** kan du velge:

- **Klassisk avgangstavle:** eksisterende Mini-utforming.
- **Kompakt liste:** flere små rader der pikselstørrelsen tillater det.
- **Stor neste avgang:** ett tydelig linjenummer og nedtelling.
- **Klokke og neste avgang:** stor lokal klokke samt neste buss.

Designene tegnes inn i den ekte pikselbufferen, ikke som
nettleser-HTML over skjermen. De er derfor også synlige i PNG-eksport
i for eksempel 32×16, 64×64 og 240×135.

Profil-JSON er foreløpig beregnet på **websimulatoren**; ESP32
kan ikke ennå importere eller automatisk bytte mellom disse
designene. Mini-firmwaren og de eksisterende LED-kartene endres
ikke av Mini 3.0. DEMO forblir helt frakoblet Worker og Entur;
velges Live i en lagret profil, forsøker den å hente ferske
avgangsdata i stedet for å bruke sist lagrede tidspunkt.

## Mini 2.0 – søk, linjer og destinasjon

Du kan nå søke etter holdeplasser med navn som «Prinsens gate»
og «Trondheim S» i websimulatoren, i stedet for å kjenne
`NSR:StopPlace`-nummer. **DEMO** søker kun blant de to
eksempelholdeplassene lokalt, uten nettverkskall. I **Entur**
bruker søkeboksen den isolerte Worker-ruten
`GET /api/v1/mini/stop-search?q=Trondheim`, som henter
offisielle **Entur Geocoder v3**-data via `/v3/autocomplete`
med `layers=stopPlace` og `sources=nsr`.
Geocoder v1/v2 ble avviklet i juni 2026.
Vi viser bare gyldige NSR StopPlace-ID-er, aldri tilfeldige adresser,
POI-er eller Quay-resultater. Et feilende søk påvirker ikke
avganger som allerede er lastet.

**Filtrer avganger** bygger tilgjengelige linjenummer og retninger
fra den valgte holdeplassens faktisk innhentede avganger.
Du kan huke av flere linjer, velge én konkret destinasjon,
eller bruke «Alle linjer»/«Ingen linjer»/«Nullstill».
Ved nytt stopp tilbakestilles filtrene.
Ingen avganger endres eller flyttes: filtrene velger bare hvilke
observasjoner som tegnes på den valgte skjermoppløsningen,
fra 32×16 LED til større TFT.

Eksportert skjermprofil (JSON) inneholder nå valgte
linjenummer og destinasjon. ESP32-firmwaren tar ennå
ikke automatisk inn denne profilen; fysisk konfigurasjon
tas senere. Ingen lokale redigeringsutkast eller
eksisterende LED-tavler berøres.

Entur-søket krever riktig aktiv Cloudflare Worker-versjon.
DEMO, forhåndsvalgte holdeplasser og manuell NSR-ID
fungerer uavhengig av søke-endepunktet.


Nettside: `/web/mini/` (på GitHub Pages: `https://5mkbt4m7n8-hue.github.io/transitcore/web/mini/`).

## Arkitektur: én visningsmotor, ulike paneltyper

`web/mini/model.js` inneholder rute-/avgangsformat, skjermprofiler og regler
for hvor mange avganger som får plass, avhengig av *fysiske pixler*.
`web/mini/renderer.js` tegner eksakt én Canvas-bitmap på `width × height`
og `web/mini/app.js` håndterer skjermvalg, betjening og datakilder.

Displayet har **ikke et fast pikselformat**. Følgende forhåndsvalg finnes:

| Profil | Størrelse | Teknologi / hovedbruk |
|---|---|---|
| RGB LED | 32 × 16 | Kompakt én-linjes visning |
| RGB LED | 64 × 32 | Smal bussavgangstavle |
| RGB LED | 64 × 64 | Brukerens fysiske LED-grid |
| RGB LED | 128 × 64 | Bred matrise |
| RGB LED | 128 × 128 | Stor matrise |
| OLED | 128 × 64 | Liten monokrom skjerm |
| TFT | 240 × 135 | Kompakt fargeskjerm |
| TFT | 320 × 240 | Større LCD |

**Egendefinert** bredde 16–512, høyde 16–320, maks 131 072
piksler. Du kan velge LED, OLED og TFT uavhengig av størrelse.
Visningsmotoren prioriterer rutenummer og minutter på veldig
små display; større skjermer får navn, flere avganger og klokke.

- LED-visningen tegner *enkeltstående dioder* i forhåndsvisningen.
- På høy oppløsning er forhåndsvisningen en pikselert framebuffer,
  ikke 70 000 DOM-elementer.
- `Eksporter PNG` gir framebufferens **ekte valgte oppløsning**,
  uten prikkeffekten i visningssimulatoren.
- `Eksporter skjermprofil (JSON)` gir oppløsning, skjermtype,
  farger, lysstyrke og valgt holdeplass som utgangspunkt for ESP32.
  Profilen er **ikke et ferdig maskinvare-driveroppsett**.

## Avgangsdata

Som standard kjører Mini **DEMO**, med 10 tydelig fiktive eksempelavganger
fra et valgt stopp. Dette fungerer uten Worker, nettverk eller maskinvare.

**Entur – faktiske avganger** bruker isolert, lesebasert API:

`GET /api/v1/mini/departures?stop=NSR%3AStopPlace%3A41613`

Worker spør offisiell **Entur Journey Planner v3** via POST med
`ET-Client-Name: transitcore-mini-departures` og StopPlace-ID som
GraphQL-variabel. Estimerte / planlagte tider, destinasjon, linje,
sanntidsflagg og kansellering håndteres som forskjellige felter.
Sanntidsflagget betyr oppdatert avgangsestimat, **ikke kjøretøyets GPS**.

Forhåndsvalgte stopp:
- Prinsens gate, Trondheim: `NSR:StopPlace:41613`.
- Trondheim S: `NSR:StopPlace:41742`.

Andre stopp kan velges ved å oppgi `NSR:StopPlace:<nummer>`.
Løsningsmodulen er transportuavhengig og kan senere vise buss,
trikk eller tog, avhengig av returdata.

Ved HTTP 404, 503, CORS eller feil svar vises feilmelding;
**DEMO-tider vises aldri som ekte avganger**.
Live-oppdatering foregår hvert 30. sekund når fanen er synlig.
Brukerens egen Cloudflare-produksjon må eksponere den nye ruten
før nettversjonen kan vise ekte avganger. Merget GitHub-kode betyr
ikke nødvendigvis aktiv Worker-deploy.

## ESP32 – eget firmwaregrunnlag

Første port av Mini til ESP32-S3 er nå lagt i `firmware/mini/`
med et felles C++-grensesnitt for LED/OLED/TFT, utskiftbare drivere,
DEMO-start og sertifikatvalidert Live-opt-in.

**[Komplett bygg-, pinne- og sikkerhetsguide](intransit-mini-firmware.md)**

Dette er firmwaregrunnlaget; fysisk HUB75- og TFT-kobling og testing
gjenstår til eksakt skjerm og kontroller er kjent.

Maskinvare som kan støttes:

- HUB75 RGB-panel (f.eks. 64 × 64), vanligvis med ESP32-S3,
  PSRAM og riktig HUB75/DMA-driver.
- Små I²C-/SPI-baserte monokrome OLED-displayer.
- TFT-LCD over SPI med maskinvaretilpasset driver.

Ikke driv en RGB LED-matrise direkte fra ESP32-strømpinnen.
Strømkapasitet, forsyning, kabling og felles jord må dimensjoneres
for panel og maksimal lysstyrke før fysisk bygging.
Fargedybde, bufferbehov og bildefrekvens bestemmes av valgt panel.
64 × 64 RGB888 = 12 288 byte rå framebuffer, 128 × 128 = 49 152 byte,
uten drivernes ekstra minne.

## Tester

`node scripts/test-intransit-mini.mjs`
`node scripts/browser-intransit-mini.mjs` (krever Playwright/Chromium)

Testene omfatter 8 forhåndsprofiler, egendefinerte oppløsninger,
grenseverdier, responsiv radhøyde, DEMO-kontrakt, live GraphQL-form,
Worker-endepunkt, kildefeil, eksport i ekte dimensjoner, og
mobilvisning med 390px bredde.

I CI finnes dessuten en **ikke-blokkerende** ett-skudds Entur-probe
som forsøker reell Journey Planner-respons. Manglende avgang,
nettverksproblem eller API-skjemaendring påvirker ikke nettbasert
DEMO eller lokalt bestemte design-tester. Bruk probe-resultatet
før produksjonsutrulling av Worker.

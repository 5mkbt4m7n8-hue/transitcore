# InTransit Mini – universell avgangstavle for LED, OLED og TFT

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

## Plan for fysisk prototype

Denne leveransen er **websimulator + kildekobling**, ikke
flashet ESP32-firmware. Neste steg kan være en liten
`MiniDisplay`-abstraksjon med `setPixel`, `fillRect`, `drawText`,
`flush`, og drivere for:

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

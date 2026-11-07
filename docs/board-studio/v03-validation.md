# v0.3 – modell- og Chromium-resultater

Lokalt sluttresultat: **PASS**. Node v24.19.0, system-Chromium 154.0.8037.57 på Debian 13. GitHub Actions er utvidet til tre modell- og tre Chromium-suiter; CI-resultat rapporteres separat fra lokale resultater i draft-PR #324.

## Gjennomførte trinn

1. **A – Symbolbibliotek**, commit `4bea91b`: modell og ekte Chromium bestod før B startet. 18 innebygde kort/tre kategorier, plassering, egendefinerte maler, standardvalg, import/eksport og masseendring med faste hull.
2. **B – Stripegeometri**, commit `39f0057`: modell og ekte Chromium bestod før C startet. Rett profil/segment, nøyaktig pitch/offset, vinkel, koordinattabell, indeksidentiteter og historikk.
3. **C – Binding og mekanikk**: direkte belysning, lysleder, godkjente flyttinger, konflikter, deling, migrering, eksempelprosjekt og full regresjon bestod lokalt.

## Brukerens testkrav

| Nr. | Prøve | Resultat/evidens |
| --- | --- | --- |
| 1 | Opprette og plassere symbolmaler | PASS modell + Chromium, faktisk kategori-/kortvalg og museklikk |
| 2 | Kopiere dobbeltstasjon med samme utseende | PASS tidligere authoring-suite og utvidet v0.3-modell; ingen LED-/kilde-ID-er følger kopien |
| 3 | Flere stopp fra samme mal | PASS authoring-Chromium (fem stopp) og v0.3 standardmal/gjenbruk |
| 4 | Masseendre ring uten hullflytting | PASS Chromium (to stopp) og modell (alle tolv direktebundne prototypestopp); hull og LED-layout identiske |
| 5 | Rett segment med 10 mm pitch | PASS modell + faktisk DOM-posisjon i Chromium |
| 6 | Eksakte LED-sentre | PASS: anker (20,30), første offset 5, fire sentre (25,30), (35,30), (45,30), (55,30) mm |
| 7 | 45° rotasjon | PASS: X=20+(5+i×10)/√2 og Y=30+(5+i×10)/√2, toleranse 1e-10 mm i modell; DOM kontrolleres også |
| 8 | Binding til konkret LED | PASS modell + Chromium, valgt LED-id/indeks og direkte konsentriske hull/ringer |
| 9 | Flytte ubundet segment | PASS Chromium: X 20→25→20 mm uten bekreftelsesdialog; ingen bundne frontpunkter |
| 10 | Flytte bundet segment | PASS Chromium: modellen er identisk før godkjenning; Avbryt bevarer hele prosjektet; Bekreft flytter hull og LED sammen; Angre/Gjør om kontrolleres |
| 11 | Endre målt pitch med stabil identitet | PASS modell (10,27 mm) og Chromium (10,2 mm), samme LED-id, ny posisjon regnet fra ankeret, eksplisitt fysisk godkjenning |
| 12 | Ugyldige bindinger/indekser | PASS: ukjent LED og utilsiktet deling avvises; identitetskollisjon i samme kjede avvises; separate kjeder kan bruke samme indeks |
| 13 | Lagre/gjenåpne | PASS faktisk JSON-nedlasting/opplasting og dyp sammenligning; virkelig v0.2-eksempelfil migreres med samme stasjons-ID-er/hullsentre/nettverksdata |
| 14 | Angre/Gjør om | PASS stil, segmentrotasjon og godkjent fysisk flytting |
| 15 | Eksisterende v0.2-grafikk | PASS begge tidligere Chromium-suiter og modellregresjoner, inklusive sju SVG-geometrivarianter før/etter gjenåpning |

## Ekstra kontroller

- Bibliotekmal oppdateres fra valgt stasjon uten å endre gamle stasjoner. Malfil importeres med ny mal-ID. Individuell hulldiameter kopieres sammen med relative hull-/ringposisjoner.
- Intervallet 1/2/3/4 og egendefinert LED-valg testes i Chromium. Pekeren i LED-listen flyttes; eksisterende binding endres ikke før brukeren kobler den.
- Bevisst deling skaper en eksplisitt, felles delingsgruppe. Utilsiktet deling gir feilmelding og uendret prosjekt. Delte, like direktehull gir ikke et falskt overlappfunn.
- Lysleder velges ved faktisk LED-klikk. Modelltesten flytter LED-segmentet og beholder det separate frontpunktet. Front-/LED-forskyvning lagres eksplisitt.
- Mekaniske prøver dekker LED/stripe/hull utenfor tavlen, overlapp og mindre enn 1 mm hullkantavstand, inkompatibelt LED-hus/stripebredde, direkte senteravvik og binding til slettet segment.
- Trondheim-eksempelet: 300×400 mm, tre rette segmenter, 72 beregnede LED-sentre, tolv stopp og atten direktebindinger. Mekanisk grunnkontroll har null funn. Dette er ikke en sertifisering av fysisk produksjon eller en verifisert ruteplan.

## Kommandoer som består

```sh
node scripts/test-board-studio.mjs
node scripts/test-authoring-board-studio.mjs
node scripts/test-v03-board-studio.mjs
node scripts/test-platform-models.mjs
node scripts/test-board-page.mjs
node scripts/test-grakallbanen-editor.mjs
node scripts/test-direction-mapping.mjs
```

De eksisterende plattformtestene omfatter 102 kontroller og 13 tavlefiler. Ingen slike konfigurasjoner er endret.

```sh
PLAYWRIGHT_MODULE=/sti/til/playwright CHROMIUM_PATH=/usr/bin/chromium node scripts/browser-board-studio.mjs
PLAYWRIGHT_MODULE=/sti/til/playwright CHROMIUM_PATH=/usr/bin/chromium node scripts/browser-authoring-board-studio.mjs
PLAYWRIGHT_MODULE=/sti/til/playwright CHROMIUM_PATH=/usr/bin/chromium BOARD_V03_SCREENSHOT=/sti/test.png node scripts/browser-v03-board-studio.mjs
```

Skjermbilder: [prototype](v03-trondheim.png), [bibliotek](v03-trondheim-library.png), [binding](v03-trondheim-binding.png), [bekreftelse](v03-trondheim-confirmation.png). Alle er hentet fra ekte Chromium, ikke mockups. Den eksterne raw.githack-testverten er ikke verifisert fra miljøet; testene bruker lokal HTTP med samme kildefiler.

## Avgrensning

Fysiske striper er rette; elektriske skjøter er metadata. Kontroller-/kjedeidentiteter er layoutsammenheng, ikke faktisk kontrollerkonfigurasjon. Den grafiske rutemotoren har fortsatt to ytterporter selv om et overgangssymbol kan ha flere individuelt bundne LED-punkter. Generell strøm-/optikk-/materialvalidering, sanntid og PDF-boremal/produksjonseksport er ikke lagt til.

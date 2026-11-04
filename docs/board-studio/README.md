# InTransit Board Studio v0.1

Separat, lokal vektoreditor: `web/board-studio/index.html`. Ingen server, konto, sanntidskobling eller hardwarepublisering. Map Studio og PR #323 endres ikke.

## Fase A – testet grunnlag

- SVG-arbeidsflate med kanoniske millimeterkoordinater, fysisk tavlemål og linjaler.
- Formater 300 × 400, 400 × 400, 500 × 700 mm, egne mål og liggende format.
- Rutenett 1/2/5/10/20 mm, separat snapping, hjelpelinjer, stasjonsjustering, måleverktøy, zoom og Space-pan.
- Stasjonsplassering og navn kan dras hver for seg. Numeriske felt, Ctrl-klikk og områdemarkering, Angre/Gjør om.
- Ni separate lag med visning, låsing og uavhengige eksportvalg. Tomme LED-/produksjonslag er reserverte for senere faser, ikke ferdige funksjoner.
- Uavhengig grafisk ring og fysisk hulldiameter; SVG med ekte mm-størrelse og separate grupper; tekst beholdes som tekst.
- JSON med validering, tapsfri tallpresisjon, lokal automatisk lagring og filgjenåpning.

## Norsk hurtigveiledning

1. Åpne editoren, velg Gråkallbanen eller Ny tavle. Format endrer bare konturen, ikke objektmålene.
2. **S**: klikk for ny stasjon. **L**: klikk stasjoner etter hverandre for forbindelser. **V**: velg og dra. **H** eller Space: panorer. **M**: dra for måling.
3. Ctrl-klikk gir flervalg uten sammenslåing. Dra over tom flate for områdemarkering. X/Y-felt flytter hele utvalget; øvrige egenskaper gjelder første stasjon.
4. Endre ringer og hull separat. Dra navnet eller bruk navnfeltene for plassering/rotasjon/font.
5. Bruk avkryssingen til venstre for å vise lag, låseknappen for å låse, og høyre avkryssing for SVG. Lagets navn velger stasjonsobjektene i støttede lag.
6. Last ned JSON som sikker kopi. Lokal lagring er per nettleser og adresse. En ny tavle kan angres.
7. Velg eksportlag og last ned SVG. Kontroller `width`/`height` i mm og skriv ut ved 100 %, uten «tilpass til side».

## Prosjektformat v1

`format: intransit-board`, `version: 1`. Prosjektet deler nettverksdata (`network`), skjematisk layout (`schematic`), fysisk grafikk (`layout`/`board`), LED-data (`ledLayout`) og produksjon (`production`). Alle fysiske koordinater og størrelser er mm. Etikettvinkler er grader. Grafiske fontstørrelser er også mm.

Nettverkskilder har egne referanser og endres ikke ved flytting. Demoens `source` er `null`: ingen Entur-/Quay-identiteter er funnet på. Dette er en visuell skisse, ikke geografisk dokumentasjon.

Import går gjennom `parseProject`; ukjente versjoner avvises uten å overskrive aktivt prosjekt. Fremtidige versjoner skal få eksplisitte migreringsfunksjoner før aksept. Ingen eldre Board Studio-format eksisterer ennå. SVG og alle senere produksjonsformater skal bruke samme kanoniske sentre.

## Tester

`node scripts/test-board-studio.mjs`

`PLAYWRIGHT_MODULE=/absolutt/sti/til/playwright CHROMIUM_PATH=/usr/bin/chromium node scripts/browser-board-studio.mjs`

Chromium bruker en lokal HTTP-server og virkelige klikk, nedlastinger og filopplasting. `BOARD_SCREENSHOT` skriver skjermbilde. `BOARD_TEST_URL` kan teste en eksakt commit-testlenke. Begge suitene bestod før fase B ble påbegynt; skjermbilde: `phase-a.png`.

## Avgrensning etter fase A

Ikke implementert: LED-pitch/stripesegmenter, LED-bindinger, produksjonskontroll, PDF, flersideutskrift, CSV, tekstkonturer, DXF, fysisk tavletilpasning med LED-låser, Map Studio-import og lysmodus. Ingen produksjonsklarhet er verifisert. Navnelag i eksisterende Map Studio må følges opp i en separat endring siden PR #323 skal beholdes urørt.

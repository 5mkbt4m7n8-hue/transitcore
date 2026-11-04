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

## Fase B – stasjoner og grafikk

- Ett til åtte punkter per stasjon, uavhengig av traséens ett/to grafiske spor.
- Automatisk kapselorientering langs lokal normal, manuell vinkel, punktavstand, asymmetrisk forskyvning og kapselmarg/-strek.
- Enkel/dobbel grafisk ring med farge og uavhengige hull. Endring av ringdiameter flytter ikke hullsentrene.
- Bézier-faner fra enkeltspor til dobbelt-/flerpunktsstasjon og tilbake, med justerbar overgangslengde og kontrollpunktrekkevidde via «kurveform».
- Klikk en linje for traséegenskaper. Endre sporantall/avstand eller skill ut en delstrekning med egne egenskaper. Dette endrer bare grafiske traséobjekter.
- Numerisk, redigerbart knekkpunkt per delstrekning. Radius 0 gir skarp knekk; større radius lager SVG-sirkelbuer, begrenset av tilgjengelig plass. To spor bruker geometrisk forskjøvede linjer og indre/ytre radius. Hull flyttes ikke av knekkpunkt/radius.
- Varsel ved sammenfallende eller korte forbindelser. Dette er en grafisk kontroll, ikke en full produksjonskontroll.

Gråkallbanen viser kapsler ved Bergsli gate, Bygrensen, Breidablikk, Nordre Hoem, Munkvoll, Ugla og Lian. Navneplasseringen er inspirert av referansen; filen inneholder ingen referansebilder. `phase-b.png` viser Chromium-resultatet.

### Grenser i fase B

- Symbolets punktavstand er **ikke** LED-stripepitch og gir ingen elektrisk LED-binding. Separate direkte/lyslederkoordinater og LED-indekser kommer i fase C.
- Automatisk lokal orientering kan endre de avledede hullsentrene når nabostasjoner flyttes; lås vinkel for en fast orientering. Ring-/hulldiameterendringer endrer aldri sentrene.
- Ingen direkte drahåndtak på Bézier-kontrollpunktene. Kurveform/overgangslengde er de numeriske kontrollene. Ett knekkpunkt per delstrekning; flere kan lages ved flere trasédeler.
- Parallelle spor er geometrisk parallelle på rette midtpartier og sirkelbuer. Overgangene ved stasjoner er tilpassede Bézier-kurver og har varierende avstand.
- Trange reverseringer, gren-/kryssoptimalisering og generell kollisjonsfri ruting er ikke løst. Kort geometri må inspiseres visuelt. Ingen automatisk geometrisk 45°-lås ennå; bruk numeriske koordinater/rutenett.
- Laglås er konservativ: flytting hindres hvis avhengige navne-, trasé-, ring-, kapsel- eller hullag er låst. Navnelås hindrer også indirekte flytting via stasjon.
- Lagvalget velger stasjoner samlet for ringer/navn/hull/kapsler; traséer velges ved klikk. De reserverte LED-/produksjonslagene har ingen objekter å velge ennå.

Fase C–E er ikke påbegynt. PDF/CSV, 100 mm-kalibreringslinje og en utskriftsklar boremal med registreringsmerker er derfor ikke levert i denne fasen.

## Leverte eksempelfiler og validering

- `examples/grakallbanen-300x400.json`: redigerbart demonstrasjonsprosjekt.
- `examples/grakallbanen-300x400.svg`: millimeterbasert vektorgrafikk.
- `examples/front-openings-300x400.svg`: separat hull-/konturlag; **ikke** fullverdig produksjonsboremal. Ingen stripebinding, monteringshull eller registreringsmerker er validert.

Eksemplene kan regenereres med `node scripts/generate-board-studio-examples.mjs`.

Fase A ble testet i modell og Chromium før commit `fc024c2` og før fase B startet. [Eksakt fase A-testlenke](https://raw.githack.com/5mkbt4m7n8-hue/transitcore/fc024c262b69436ad453bd81d72873b440af711e/web/board-studio/index.html). Den eksterne testverten er ikke verifisert fra utviklingsmiljøet.

Ved ferdigstilling av fase B bestod:

- `scripts/test-board-studio.mjs`: millimetre, presisjonsbevaring, feltvalidering, separate hull/ringer, lag, JSON/SVG, historikk, kapselavstand, Bézier-tangenter, buer og omberegning etter redigering.
- `scripts/browser-board-studio.mjs`: ekte Chromium på 1500 × 1050 og 390 × 844; lag/lås, numeriske felt, tegning/kobling/flytting, Ctrl-flervalg og områdemarkering, måling, Space-pan/zoom, prosjektlagring/gjenåpning, feilaktig fil, SVG-nedlasting, kapselorientering, sporvalg, knekkpunkt og Angre/Gjør om.
- Eksisterende `test-board-page.mjs`, `test-platform-models.mjs` (102 kontroller/13 tavlefiler), `test-grakallbanen-editor.mjs` og `test-direction-mapping.mjs`.

Chromium er testet lokalt via HTTP med samme kildefiler som i commit; ekstern raw.githack-visning er ikke nettleserverifisert. Egen GitHub Actions-jobb følger med for modell- og Chromium-kjøring ved senere endringer. CI-status rapporteres separat fra lokale resultater.

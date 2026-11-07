# Board Studio v0.5 – monteringshull og mekaniske klaringer

Arbeidet fortsetter i draft-PR #324. Ingen merge eller produksjonsdeploy.

## Bruk

Åpne **Montering**, opprett et hull fra X/Y og diameter eller velg **Plasser med mus**. Klikk et eksisterende hull for å velge og dra det. Ctrl slipper snapping og Escape avbryter plasseringen. Flytting, diameterendring og sletting av eksisterende hull viser før/etter i den fysiske bekreftelsesdialogen. Avbryt beholder originalen; Angre/Gjør om bevarer ID-ene.

Fire hjørnehull forhåndsvises uten å endre prosjektet. Innrykket måles fra platekant til hullsenter. Konflikter vises og hindrer **Legg til fire hjørnehull**. Gyldige hull legges til i én angrehandling. Eksisterende hull erstattes ikke.

Kravet til platekant måles fra hullkant; kravet mellom hull måles mellom hullkantene. Begge gjelder også stasjonenes LED-hull. Standard 0 mm til platekant og 1 mm mellom hull bevarer tidligere validering. De er ikke materialanbefalinger. Innstillinger lagres eksplisitt i prosjektet og flytter aldri eksisterende hull.

Laget **Monteringshull** kan skjules, låses og utelates fra vanlig editor-SVG. Fysisk produksjonseksport tar alltid med alle hull. Kontrollisten og eksporten bruker samme validering. Klikk et monteringsfunn for å fokusere hullet uten å endre prosjektet.

[Skjermbilde](v05-mounting.png) · [Norsk hovedveiledning](README.md) · [Prosjekt med fire hjørnehull](examples/trondheim-buss-v05-mounting.json) · [A4-PDF forside](examples/trondheim-buss-v05-mounting-front.pdf) · [Hull-SVG bakside](examples/trondheim-buss-v05-mounting-back.svg) · [CSV bakside](examples/trondheim-buss-v05-mounting-back.csv).

## Modell og kompatibilitet

`mounting.mjs` definerer redigerbare monteringshull, forhåndsvisning, før/etter-endringer og felles hullklaringer. Hull har permanent unik ID, navn, X/Y i mm og diameter; ingen LED- eller Entur-identitet. De endrer ikke stasjons-, rute- eller stripegeometri.

Prosjektformatet er fortsatt v3. Eldre prosjekter får det nye monteringslaget ved åpning. `production.mountingHoles` beholdes, og valgfri `production.mechanicalSettings` har egen `version: 1`. Ugyldige mål, dupliserte monterings-ID-er og ukjente innstillingsversjoner avvises. Det eksisterende lagrings-/angresystemet og bekreftelsesdialogen brukes.

## Automatisert validering

Lokalt: Node 24.19.0 og ekte Chromium 154.0.8037.57.

| Kontroll | Resultat |
| --- | --- |
| Ni modellsuiter, inkludert alle tidligere geometri-, porter-, bindings-, stripe- og produksjonstester | Bestått |
| Ni Chromium-suiter, inkludert nye monteringsinteraksjoner | Bestått |
| 300 × 400 mm, fire hjørnehull, 15 mm senterinnrykk, Ø 3,2 mm | Eksakte sentre (15,15), (285,15), (15,385), (285,385); hullkantavstand 13,4 mm |
| Kopiuavhengighet, ID-er, låst lag, JSON, eldre lagstruktur, Angre/Gjør om | Bestått |
| Hullkant til platekant, monterings-/LED-hullkonflikter, ugyldig mønster | Bestått; ingen automatisk flytting |
| Numerisk flytting avbrytes; diameter vises og bekreftes; sletting bekreftes og angres | Bestått i Chromium |
| Direkte museflytting med Ctrl | Eksakt mm-forskyvning innen 0,05 mm innmatingstoleranse; fysisk bekreftelse før lagring |
| Plassering med museklikk og Escape, hjørneforhåndsvisning uten mutasjon, fire hull som én angrehandling | Bestått i Chromium |
| Kontrollistefokus uten dokumentendring, klaringsfeil blokkerer bore-PDF, gjenåpning | Bestått i Chromium |
| Faktisk PDF/SVG/CSV-nedlasting med 18 LED-hull og separat kjøring med 22 hull | Bestått |
| Uavhengig pypdf 6.10.0, XML- og CSV-leser | 30 faktiske PDF-sider kontrollert: mm-skala, MediaBox, sirkelsentre/diametere, hullnummer, flisforskyvning, dekning, bakside, X/Y-kontrollmål og identiteter |
| CSV monteringsrader | Permanent hull-ID, navn, diameter, original- og baksidekoordinater; ingen oppdiktet LED-/stasjonsbinding |
| Tidligere uavhengig SVG-geometrikontroll | Største sporavstandsavvik fortsatt 0,003020 mm |
| Plattformregresjon | 102 kontroller / 13 tavlefiler, tavleside, Gråkallbanen-editor og retningsmapping består |

CI kjører de ni modell-/Chromium-suitene, begge produksjonsdatasettene og uavhengig kontroll av de faktisk nedlastede filene. CI-skjermbilder og produksjonsfiler lagres som artefakter; se PR for status fra eksakt commit.

## Gjenta

```sh
node scripts/test-mounting-board-studio.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/browser-mounting-board-studio.mjs
BOARD_PRODUCTION_MOUNTING=1 BOARD_PRODUCTION_OUTPUT=/tmp/board-mounting-production PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/browser-production-board-studio.mjs
python scripts/check-board-studio-pdf.py /tmp/board-mounting-production
```

PDF-leseren krever pypdf 6.10.0. Testene bruker ekte HTTP/Chromium lokalt; ekstern raw.githack-visning er ikke nettleserverifisert fra utviklingsmiljøet.

## Begrensninger

Monteringshull er sirkulære, med enkeltplassering og et mønster på fire hjørnehull. Ingen slisser, forsenking, skruehode-/muttervolumer, verktøykompensasjon eller styrkeberegning. Hull mot hull og platekant kontrolleres; kollisjon mot ledninger, skruer og faktisk LED-stripehus vurderes fysisk. Mål LED-pitch, stripeoffset, materiale og utskriftens kontrollstreker før boring. Eksempelet bruker nominelle mål og er ikke en verifisert bussrute.

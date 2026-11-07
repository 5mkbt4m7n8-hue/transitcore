# Board Studio v0.2 – kopiering og fullførte restpunkter

Lokalt sluttresultat: **PASS**. Testmiljø: Node v24.19.0, Chromium 154.0.8037.57 på Debian 13. GitHub Actions kjører samme suiter med Node 22 og Playwrights Chromium; resultatet kobles fra draft-PR #324 når kjøringen er ferdig.

## Modelltester

| Kommando | Resultat |
| --- | --- |
| `node scripts/test-board-studio.mjs` | PASS – tidligere millimeter-/geometri-/lag-/JSON-/historikkregresjon |
| `node scripts/test-authoring-board-studio.mjs` | PASS – utseendemaler, kopier, identitetsseparasjon, relative hull, uavhengig etikett, historikk, vedvarende parallellbindinger og C1-formhåndtak |
| `node scripts/test-board-page.mjs` | PASS |
| `node scripts/test-platform-models.mjs` | PASS – 102 kontroller, 13 eksisterende tavlefiler |
| `node scripts/test-grakallbanen-editor.mjs` | PASS |
| `node scripts/test-direction-mapping.mjs` | PASS |

Parallelltestene omfatter vannrett/diagonal plassering, knekkpunkt, videre flytting av referanse og 90° endring av referanseretning med bevart følgesegmentlengde. Ugyldige posisjoner og sirkulære referanser avvises. Kopiering er testet med flere eksisterende stasjonstyper, uavhengige ID-er, null kilde og uten kopierte LED-/Quay-felt. Originalobjektene sammenlignes før/etter.

## Reell Chromium

Begge kommandoene består med `PLAYWRIGHT_MODULE` og `CHROMIUM_PATH` satt til installert Playwright/system-Chromium:

- `node scripts/browser-board-studio.mjs`: hele tidligere A–H-regresjonen, inklusive faktiske drag, lag/låser, måling, lokal lagring, Angre/Gjør om, mobil og filnedlasting/gjenåpning.
- `node scripts/browser-authoring-board-studio.mjs`: Ctrl+C/V, museforhåndsvisning og klikk, Escape (også med tekstfeltfokus), høyreklikkmeny, knapp, native tekstkopiering, unike kopier, Angre/Gjør om, mal over gjenåpning, fem malstasjoner og standardreset. En/to/tre punkter plasseres; de faktiske SVG-ringene og hullene undersøkes. Vannrett/diagonal parallellsnapping testes både av og på, med varig avstand etter gjenåpning og referanseflytting. Knekkpunkt testes separat. Indre formpunkt og delt tangent flyttes i to dimensjoner uten hullflytting.

### Nedlastet SVG, før og etter JSON-gjenåpning

| Start-/sluttvinkel | Sporavstand | Radius | Geometri |
| --- | --- | --- | --- |
| 90° / 0° | 6 mm | 4 mm | Bézier-senterkurve |
| 90° / 0° | 10 mm | 8 mm | Bézier-senterkurve |
| 90° / 45° | 14 mm | 8 mm | Roterte porter |
| 60° / 15° | 10 mm | 8 mm | Diagonale porter |
| 90° / 0° | 10 mm | 12 mm | Sirkelavrundet 90°-hjørne |
| 90° / 0° | 14 mm | 20 mm | Sirkelavrundet 90°-hjørne |
| 90° / 0° | 10 mm | 4 mm | Fritt formpunkt og delt Bézier-tangent |

De sju kombinasjonene eksporteres både før og etter faktisk JSON-nedlasting/gjenåpning: **14 undersøkte SVG-filer**, samt ekstra kontroller av kopierte symboler og avstand mellom separate parallelle traséer.

Kontrollene leser filene i Chromium med DOMParser og native SVG-lengde-/punkt-API-er. En separat segmentalgoritme måler nærmeste avstand, kryssinger og løkker; resultatet baseres ikke bare på den interne geometrimotorens egne varsler. Begge spor prøves i begge måleretninger. Grupper, spor-/kantreferanser, hvert kanonisk punkt, millimeterdimensjoner, roterte ringtilkoblinger og kontinuitet gjennom delkurvene undersøkes. Fritt formpunkts delte tangent undersøkes også inne i eksportens midtparti. SVG-punktene er identiske etter gjenåpning.

Største målte avstandsavvik: **0,003020 mm**. Akseptansegrense for den adaptive SVG-tilnærmingen: **0,04 mm**. Ingen utilsiktede sporkryssinger eller løkker i prøvene.

### Skjermbilder

- [Kopier og fem nye malstasjoner](v02-authoring.png).
- [Beregnet parallellplassering og målavstand](v02-authoring-parallel-preview.png).
- [Parallellbinding etter videre redigering](v02-authoring-parallel.png).
- [Fritt formpunkt og delt tangent](v02-authoring-curves.png).

## Praktiske grenser

Parallellbindingen gjelder et rett logisk segment (hel kant eller inn-/utgående del ved knekkpunkt), med én innkommende relasjon per følgetrasé. Den er ikke en generell løser for vilkårlige kurve-til-kurve-avstander eller motstridende nettverkskrav. En eksisterende relasjon oppheves med «Frigi parallellavstand»; «Fest av» hindrer nye snapper.

Endetangenter følger fortsatt symbolorienteringen for riktig stasjonstilkobling. Det indre formpunktet og den delte tangenten gir fri X/Y-formredigering med C1-skjøt. Ugyldige geometrier varsles og kan ikke eksporteres som gyldig traségrafikk.

Resultatene gjelder programmatisk presisjon i disse testgeometriene. Ingen fysisk LED-stripeplassering eller produksjonsmetode er introdusert eller validert. Ingen endringer i Map Studio, GPS-/Entur-bindinger eller firmware, og ingen produksjonsdeploy.

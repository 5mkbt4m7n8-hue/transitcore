# Board Studio v0.3.2 – validering

Lokalt miljø: Node 24.19.0, Chromium 154.0.8037.57 og Playwright, 5. november 2026. Ekte nettlesertester kjøres over lokal HTTP. Samme modell- og Chromium-tester inngår i CI med Node 22 og Playwrights Chromium. Lokal status og GitHub CI-status er separate.

## Akseptansetester

| Test                       | Modell                                                                                                                                                       | Ekte Chromium                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| A – eksplisitte porter     | Fire navngitte porter per ring, samt to samlede porter på flerpunktsymboler; validerte stabile nøkler                                                        | Synlige ved L, ingen i vanlig tomt utvalg; fremheving ved hover og valg av start/slutt                            |
| B – hovedlinje og sidegren | Sidegren deler hovedlinjens eksplisitte utgang; gamle ruter, stasjoner og hull er uendret                                                                    | Faktiske portklikk; startpunktene leses fra gjengitte SVG-stier på overgangslaget og kontrolleres mot ringgrensen |
| C – symmetrisk par         | Én senterkurve, sentralsymmetriske kontrollpunkter og nøyaktig 10 mm avstand mellom parvise sporsamples, samt ni kombinasjoner av 45°/90°/135° og 6/10/14 mm | Opprett dobbeltspor fra samlede porter; kontroller valgt portpar og kurveform                                     |
| D – ingen feilside         | Starttangent følger valgt port, ingen automatisk sideskifting; ugyldig rett geometri blokkeres                                                               | Lagrede portvalg og faktiske SVG-endepunkter stemmer med brukerens valg                                           |
| E – enkel visning          | Grafisk stil lagres separat fra portidentitet                                                                                                                | Få grunnvalg, avanserte felt og håndtak skjult; åpne/lukke avansertmodus viser/skjuler dem                        |
| F – lagring                | JSON-rundtur beholder porter og eksakt kurvegeometri; SVG har ingen editorporter                                                                             | Faktisk JSON/SVG-nedlasting, gjenåpning og kontroll av portvalg; ingen editorporter/håndtak i SVG                 |
| G – sletting               | Bare valgt forbindelse slettes; stasjoner og andre ruter beholdes                                                                                            | Musevalg på kurven, slett, Angre/Gjør om; samme stasjoner etterpå                                                 |

Nye suiter:

```sh
node scripts/test-v032-board-studio.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/browser-v032-board-studio.mjs
```

`CHROMIUM_PATH` er valgfri når Playwright har installert Chromium. `BOARD_V032_SCREENSHOT` lager skjermbilde av editoren og før/etter-eksempelet. `node scripts/generate-port-example-board-studio.mjs` gjenskaper [eksempelprosjektet](examples/port-sidebranch-v032.json) og [før/etter-illustrasjonen](v032-before-after.svg). Førbildet gjengir en konstruert gren med tidligere automatisk tilkobling; det er ikke brukerens originale skjermbilde.

## Regresjoner

Bestått lokalt: fem Board Studio-modellsuiter og fem Chromium-suiter (grunneditor, authoring, v0.3, v0.3.1 og v0.3.2). Eldre nettlesertester bruker nå eksplisitte porter ved ny linjetegning og åpner avansertseksjonen før testing av tekniske felter. Eksisterende numeriske geometriassertions er beholdt.

Den uavhengige SVG-geometritesten for sju kombinasjoner av orientering, avstand og radius, før/etter gjenåpning, har fortsatt største målte avstandsavvik 0,003020 mm. v0.3-testene beholder dekning av maler, fysiske LED-profiler, bindinger, fysisk godkjenning og lagring. v0.3.1-testene beholder dekning av delsletting, presis LED-festing og arvet sporstil.

Også bestått: `test-platform-models.mjs` (102 kontroller, 13 tavlefiler), `test-board-page.mjs`, `test-grakallbanen-editor.mjs` og `test-direction-mapping.mjs`.

## Modellen og geometrien

`ports.mjs` eksponerer `point:<indeks>:<side>` og `pair:<side>`. Porter beregnes fra stasjonens lokale retning og faktiske ringsentre, mens identitetene lagres i `route.anchors[edge].start/end`. `curveStyle` er `rounded` eller `straight`. Begge er additive felt i prosjektformat v3. Gamle ruter uten portvalg beholder eksisterende beregning. Deling/sletting remapper portene sammen med kontrollpunktene.

Nye portforbindelser bruker den eksisterende felles kurve-/offsetmotoren. Start/slutt ligger på ringgrensen; tangentene kommer fra de valgte portene. Like endeforhold får like tangentlengder som standard. De parallelle sporene deler senterkurve og valideres mot løkker, kryssinger og radius. Automatisk justering kan endre rekkevidde innen tillatt grense, men velger aldri andre porter. Et nytt ugyldig portpar avvises før prosjektet endres. Autoorienterte stasjoners synlige lokale ramme fryses før tilkobling, slik at en ny gren ikke roterer allerede valgte porter eller grafiske ringer.

## Avgrensning

Velg Dobbeltspor for ett konsistent kurvepar. To uavhengig opprettede enkeltspor slås ikke automatisk sammen til en annen rute. Samlede porter gjelder ytterpunktene i flerpunktsymbolet; enkeltpunktene har egne porter. Ring-/hullstørrelse, fysisk LED-pitch og bindingsidentiteter endres ikke ved portvalg. Avansertmodus kan fortsatt lage ugyldig geometri; den varsles og SVG-eksport blokkeres som tidligere. Ingen boremal, produksjonsdeploy eller merge i denne leveransen.

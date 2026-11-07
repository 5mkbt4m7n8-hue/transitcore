# Stasjonsnavn og intelligente segmenter i v0.8

## Brukerveiledning

**Marker alle stasjonsnavn** velger bare tekstene. Du kan også klikke et navn og legge til/fjerne andre med Ctrl eller Shift. Grønne rammer viser valget. Lagknappen **Stasjonsnavn** velger også bare navn. Stasjonsidentiteter, ringer, hull og LED-bindinger endres ikke av tekstredigering.

Navnepanelet endrer font, størrelse i mm, farge, vekt, bokstavavstand, tekstvinkel og forskyvning for alle valgte navn i én angrehandling. Tomme felt med **Blandet** betyr ulike verdier. Bare feltet du redigerer endres. Font skrives som et familienavn, for eksempel Arial; vekt 700 gir fet tekst. En font må finnes på maskinen for å gjengis som valgt.

3 × 3-kontrollen velger oppe venstre/over/oppe høyre/venstre/midten/høyre/nede venstre/under/nede høyre. Pek på en knapp for levende forhåndsvisning, og klikk for å lagre. Den beregner plasseringen fra den synlige geometrien, inklusive individuelle ringmål og rotert/forskjøvet kapsel. Referansen kan være hele stasjonen eller et felles tilgjengelig punkt A–H. Hvis punkt B ikke finnes i en ny symboltype, brukes hele stasjonen.

**Avstand fra stasjon** måles fra geometrigrensen til nærmeste tekstgrense. Venstre bruker tekstens høyre kant og høyre bruker venstre kant, med vertikal sentrering. Diagonaler bruker en avstandsvektor med lengde lik det oppgitte målet: gap/√2 i hver akse mellom de omsluttende boksene. Dette gir en konsekvent diagonalavstand og hindrer overlapp. Midten sentrerer teksten i referansen.

Tekstvinkel er separat fra plassering, med åtte forhåndsvalg og egendefinert vinkel. Rotasjonen beholder det valgte plasseringsankeret; tekstens interne forskyvning beregnes på nytt for å holde teksten på riktig side. Avstand og diagonalvalg roterer ikke teksten automatisk. Manuell X/Y kommer i tillegg. Et nytt plasseringsvalg nullstiller manuell forskyvning for å gi den valgte relative plasseringen til alle navn.

Dra et valgt navn for å flytte de valgte tekstene samlet. Stasjoner og fysisk geometri står fast. Forskyvning vises i mm; rutenett/hjelpelinjer kan slås av, og Ctrl under dragging gir fri bevegelse. **Tilbakestill forskyvning** går tilbake til automatisk plassering. **Bruk som standard for nye stasjoner** lagrer ett valgt navns stil for senere plasseringer, også bibliotek og repetert LED-plassering. Eksisterende navn påvirkes ikke. Vanlig stasjonskopiering beholder kildens tekststil.

## LED-segmenter

Nye segmenter har **Automatisk lengde**:

`første LED-offset + (antall − 1) × faktisk pitch + sluttmargin`

10 mm pitch og 5 mm i begge ender gir 100/200/300 mm ved 10/20/30 LED-er. Startoffset og pitch kommer fra profilen; sluttmargin kan justeres per segment. Profilens sluttmargin er standard for nye segmenter. Profilendringer beregner alle automatiske segmentlengder på nytt. **Manuell lengde (avansert)** bevarer en eksplisitt overstyring. Eldre prosjekters eksisterende lengder migreres til manuell modus, slik at gamle segmenter ikke endres ved åpning.

Ved redigering viser tegneflaten kandidatens LED-posisjoner før lagring. Panelet viser lengde, antall, pitch og første/siste koordinat. **Oppdater segment** eller **Oppdater profil** lagrer; historikken endres ikke av forhåndsvisning. Eksisterende fysisk bekreftelsesdialog brukes ved LED-/hullflytting. Reduksjon som fjerner en bundet LED avvises med navn og LED-referanse; flytt eller løsne bindingene først.

**Nytt segment** arver valgt segment, ellers det sist opprettede: profil, antall, vinkel, retning, monteringsside, lengdemodus og sluttmargin. Ingen bindinger, delingsgrupper, kutt eller skjøter kopieres. ID og S-nummer blir nye. Samme kjede foreslås med neste sammenhengende indeksområde etter eksisterende områder. Manglende indekskapasitet gir beskjed. **Nytt segment i ny kjede** er et eksplisitt alternativ; kjede/startnummer kan også redigeres manuelt, med vanlig kollisjonsvalidering.

Kandidaten foreslås ved forrige fysiske ende, med samme retning. Den følger pekeren før klikk og bruker eksisterende stripesnapping; Ctrl slipper snapping. **Fortsett fra forrige segment** viser endeforslaget, mens **Plasser med mus** starter fri plassering med panelverdiene. Rediger vinkel, posisjon, antall eller manuell lengde før plassering. Escape avbryter. Ingen elektrisk sammenkobling opprettes automatisk av geometrisk videreføring.

## Modell, lagring og begrensninger

Prosjektformat 4 beholdes. Gamle navn uten `label.position` bruker sine opprinnelige X/Y, rotasjon og tekstanker. Nye valg legger til `position`, `reference`, `gap` og `color`. `labelDefault` er et separat visuelt snapshot. Maler og kopier bevarer alle tekstfeltene. Segmenter lagrer `lengthMode` og `endMargin`; profilene har standard sluttmargin. LED-ID-er er fortsatt segment-ID og permanent lokal posisjon. Beholdte LED-er får samme ID ved antalls-/pitchendring. Reversert indeksrekkefølge beregnes som tidligere fra segmentets antall.

`label-layout.mjs` beregner referansegeometri, tekstgrenser, plasseringsanker og rotasjon. Nettleseren måler med SVG-tekstmodellen og `geometricPrecision`, slik at zoomavrunding ikke skyver teksten til feil kant. Eksport fra editoren bruker samme beregning. Node-modelltester og kommandolinjegenerering uten DOM bruker en omtrentlig tekstbredde; nøyaktig fontplassering vurderes i Chromium/editorens SVG-eksport. Mottakerprogrammer kan bruke en annen font hvis den valgte ikke er installert.

Automatisk plassering håndterer én stasjon om gangen og løser ikke navnekollisjoner mellom ulike stasjoner. Diagonalgap bruker omsluttende bokser; det er ikke en konturfølgende avstand til hver enkelt bokstav. Fysiske segmenter er fortsatt rette. Ingen endring i LED-firmware eller kontrolleroppsett inngår.

## Tester

- `test-names-segments-board-studio.mjs`: 30 navn i én masseendring; 1/2/3 punkter, korte/lange navn, ni plasseringer × åtte vinkler og A/B/hel referanse; fast anker ved rotasjon; maler, JSON og historikk; automatiske/asymmetriske/manuelle lengder, arvede segmenter, 45° videreføring, unike kjedeindekser og stabile LED-ID-er; avvist reduksjon med binding.
- `browser-names-segments-board-studio.mjs`: faktiske SVG-grenser, seks side-/diagonalvalg med 1/2/3 punkter; masseendring og Blandet; Ctrl/Shift-flervalg, direkte navnedrag med presis mm-forskyvning; standardstil og faktisk JSON-nedlasting/gjenåpning; levende segmentforhåndsvisning, automatisk/asymmetrisk/manuell lengde, arvet indeksområde og fysisk bekreftelse.
- Samlet regresjon: 12 modell- og 12 Chromium-suiter, med tidligere stasjons-/spor-/snap-/produksjonsfunksjoner. Uavhengig pypdf/XML/CSV-kontroll av 30 PDF-sider fra både 18- og 22-hullsprosjektene. Plattformmodellene har 102 kontroller av 13 tavlefiler, i tillegg til tavleside, Gråkallbanen-editor og retningsmapping.

Arbeidet beholdes i draft-PR #324 uten merge eller produksjonsdeploy.

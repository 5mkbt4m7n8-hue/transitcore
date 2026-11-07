# Board Studio v0.3.1 – validering

Kjørt lokalt 5. november 2026 med Node 24.19.0 og ekte Chromium 154 via Playwright. Samme tester er lagt til Board Studio-workflowen (Node 22 og Playwright Chromium). CI-status rapporteres separat fra lokale resultater i leveransen.

## Nye tester

| Prøve                 | Modell                                                                                                                             | Chromium                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: A–B–C–D, slett B–C | Reelle komponenter A–B / C–D, uendrede stasjonsdata og LED-bindinger, identiske gjenværende sporkurver, én Angre/Gjør om-operasjon | Faktisk musevalg, markering, knapp, Delete, Angre/Gjør om, JSON-nedlasting og faktisk SVG-nedlasting lest med DOMParser                                   |
| B: overlappende ruter | Andre ruten beholdes; kontroller remappes; parallelle segmentreferanser remappes eller frigjøres ved sletting                      | Eksplisitt rutevelger mellom overlappende ruter, bare valgt rute endres                                                                                   |
| C: presis LED-festing | Eksakte koordinater ved 0°, 45°, 90° og zoom 0,5/1/4; fangstgrense i skjermpiksler                                                 | Dra og bind ved 0°/45°, les treff-ID, godkjenn fysiske endringer, kontroller full koordinatpresisjon og uendret kameratransform; treff ved tre zoomnivåer |
| D: dobbeltstasjon     | A/B har uavhengige bindinger, LED-konflikt avvises, separate hull og ringer                                                        | Bind A og B, bind om A via LED som ligger over symbolet; bevar B og avvis utilsiktet deling                                                               |
| E: separate valg      | Rutenett/hjelpelinjer av/på og LED-festing av; kun sentrering uten binding                                                         | Slå av rutenett/hjelpelinjer mens LED-festing virker; kun sentrering, alle festevalg av, ny Stop-plassering med direkte binding                           |
| F: lagring            | JSON-rundtur bevarer komponenter, koordinater, bindinger og stilstandard                                                           | Lagre/åpne slettet trasé og LED-bindinger; SVG viser ingen gjenopprettet forbindelse                                                                      |
| Sist valgte sporstil  | Nye forbindelser arver stil fra prosjektet; gamle ruter beholdes                                                                   | Nye dobbeltspor arver avstand, bytte tilbake til enkeltspor gjelder neste forbindelse                                                                     |

Kommandoer:

```sh
node scripts/test-v031-board-studio.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/browser-v031-board-studio.mjs
```

`CHROMIUM_PATH` er valgfri når Playwright har installert sin Chromium. `BOARD_V031_SCREENSHOT` gir et skjermbilde, og brukes av CI.

## Regresjoner

Bestått lokalt: alle fire Board Studio-modellsuiter og alle fire Chromium-suiter (`test-/browser-board-studio`, `test-/browser-authoring-board-studio`, `test-/browser-v03-board-studio`, `test-/browser-v031-board-studio`). Kurve-/parallelleksporttesten dekker sju kombinasjoner av orientering, sporavstand og radius, før og etter gjenåpning. Største avstandsfeil i gjengitt SVG: 0,003020 mm (eksportavrunding).

Også bestått: `test-platform-models.mjs` (102 assertions, 13 tavlefiler), `test-board-page.mjs`, `test-grakallbanen-editor.mjs`, `test-direction-mapping.mjs`.

## Datamodell og avgrensning

`connections.mjs` deler stasjonssekvensen i virkelige komponenter, bevarer rute-/sporidentitet og remapper kontrollpunkter og parallelle referanser. `parentRouteId` knytter komponentene til opprinnelig grafisk rute. Mellomrom er fravær av forbindelse, ikke et skjult SVG-element. Valgfrie `layout.tangentHints` bevarer geometriretningen ved deling, og frigis ved senere relevant stasjonsflytting. `routeDefaults` lagrer kun grafisk stil for nye forbindelser.

`station-snap.mjs` finner nærmeste LED før rutenett/hjelpelinjer og bruker eksisterende binding-/valideringsmodell. LED-identiteten er segment + permanent lokal LED-ID, ikke avrundede koordinater eller teksten i indeksfeltet. Eksisterende fysiske endringer bruker uendret bekreftelsesflyt.

Et ubundet flerpunktsymbol flyttes samlet til første LED. Etter første binding kan punktene plasseres individuelt; øvrige bundne punkter blir stående. Flytting av hele bundne oppsett gjøres gjennom stripesegmentet med fysisk bekreftelse. LED-festing gjelder stasjonspunkter, ikke navneetiketter eller kurvehåndtak. Ingen boremal/PDF, strømstyring eller produksjonsdeploy i denne endringen.

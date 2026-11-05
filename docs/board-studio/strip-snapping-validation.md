# LED-striper: snapping og finjustering

Lokalt testmiljø: Node 24.19.0, ekte Chromium 154.0.8037.57 med Playwright, 5. november 2026. Samme nye suiter er lagt til Board Studio CI. CI-status rapporteres separat.

## Nye kontroller

`node scripts/test-strip-snap-board-studio.mjs` består:

- Dobbeltstasjon med 0°, 45° og 90°: faktisk LED-senter mot begge fysiske hull, inkludert profilens første-LED-offset og pitch.
- Samme fangstgrense i skjermpiksler ved tre zoomnivåer; funksjonen av returnerer rå koordinater.
- Parallelle striper med fysisk bredde: kant mot kant, nærmeste LED-posisjon justert langs stripen; fysiske endeskjøter. Ulike kontroller-/kjedeidentiteter beholdes.
- Rotert symbol med eldre hullposisjoner: et konkret forslag til hulltilpasning, uten å endre originalprosjektet eller hull-ID-ene.
- Eksisterende bindinger bruker fysisk endringsdeteksjon; historikk og JSON bevarer resultatet.
- Tre rutenettnivåer; finrutenettet er halvparten av det synlige vanlige rutenettet og vises med lavere kontrast.

`browser-strip-snap-board-studio.mjs` består i ekte Chromium:

- Dra en 90° stripe til en 90° dobbeltstasjon; indikator viser stasjonstreff og begge LED-sentrene blir eksakte.
- Trykk/slipp Ctrl mens musen fortsatt holdes nede: snapping slippes og gjenopptas uten å endre de permanente bryterne.
- Plasser en ny, uavhengig stripe ved siden av den første med musen. Kontroller 5 mm senteravstand for 5 mm brede striper, samme LED-rad og forskjellige kjeder.
- Hold Ctrl fra starten av et stripedrag med rutenett og hjelpelinjer aktivert. Bevar de rå millimeterkoordinatene.
- Synlige tre rutenett og gjentatt halvering: 5 → 2,5 → 1,25 mm.
- Angre/Gjør om og faktisk JSON-nedlasting.
- Roter bare symbolet mens hullene fortsatt ligger i gammel retning: fysisk dialog før endring, Avbryt beholder alt, Bekreft flytter bare de foreslåtte hullene sammen med stripens plassering, Angre gjenoppretter hele handlingen.

Eksempelkommando:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/browser-strip-snap-board-studio.mjs
```

De eksisterende fem modell- og fem Chromium-suitene for grunneditor, authoring, v0.3, v0.3.1 og v0.3.2 er også kjørt som regresjon. Uavhengig SVG-geometritest beholder største sporavstandsavvik 0,003020 mm.

## Modell og begrensninger

`strip-snap.mjs` beregner bare translasjon fra fysiske millimeterkoordinater; ingen skjult rotasjon, binding eller sammenslåing av kjeder. Fangstgrensen er 12 skjermpiksler. Fullt stasjonspunktpar prioriteres før enkeltpunkter og stripekanter. Kandidater som legger LED-sentre oppå en annen stripes LED-sentre forkastes. Stripens eksakte ender og bredde brukes til endeskjøt og sidestilling. Parallelle striper må ha samme eller motsatt akseretning; ingen automatisk vinkelretting utføres.

Ved avvik mellom grafikk og hull kan bare en ubundet stasjon med ulåst hullag få forslag om å tilpasse de eksisterende hullene til ringene. Forslaget viser faktiske før/etter-koordinater og krever bekreftelse. Ingen ny LED-binding opprettes. Bundne stasjoner beholder sin fysiske modell og eksisterende bekreftelsesflyt.

Ctrl slipper selve snappingen, ikke faste parallellbindinger eller fysiske LED-bindinger. Justering mellom striper er en plassering, ikke en varig avstandsconstraint. Ulik pitch betyr at alle LED-rader ikke nødvendigvis vil passe langs hele stripen. Prosjektformatet er uendret.

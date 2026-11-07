# Board Studio v0.6 – stasjonsplassering og stasjoner over to LED-striper

Fortsetter i draft-PR #324. Ingen merge eller produksjonsdeploy.

## Kort brukerveiledning

### Se symbolet før klikket

Trykk **S** eller velg **Legg til stasjon**. I **LED-layout** finnes også **Plasser stasjon (S)**; denne inngangen aktiverer krav om en ledig fysisk LED. Den kompakte plasseringslinjen lar deg velge symbol, rotasjon, plasseringsmodus og LED-fangst. Biblioteket og egne prosjektmaler kan brukes mens verktøyet er aktivt.

Det faktiske vektorsymbolet følger pekeren med gjennomsiktighet. **R** roterer 90°, **Shift+R** roterer −90°. Under **Anker** velger du symbolsenter, punkt A eller punkt B. LED-fangst bruker valgt punktanker; med senteranker brukes det aktive punktet i de eksisterende LED-kontrollene. Navnets stil og orientering beholdes separat.

Velg **Fri**, **Fest uten binding**, **Fest og bind** eller **Krev ledig LED**. Utenfor fangstavstanden viser de første modusene fri plassering; krav om LED viser en ugyldig plassering og blokkerer klikket. Opptatte LED-er bindes ikke automatisk. **Fest uten binding** er et eksplisitt geometriverktøy og kan sentrere på en brukt LED uten å lage en ny binding; kontrollisten vil fortsatt finne hullkonflikter.

Canvas viser stripe og faktisk LED-indeks ved målpunktet. Forhåndsvisningen blir stående på siste posisjon mens du bruker plasseringslinjen, og avsluttes med Esc eller Avslutt. Når to striper har nesten like nære kandidater, må du velge i **LED-kandidater**. Listen viser også andre nærliggende indekser. Et eksplisitt valg beholdes til du velger automatikk, fullfører plasseringen eller avbryter; en valgt LED som ikke lenger er tilgjengelig, vises som ugyldig.

Klikk for å plassere. S-verktøyet forblir aktivt for neste stopp. **Esc** eller **Avslutt** går tilbake til vanlig peker. Ctrl slipper snapping midlertidig; i en modus som krever LED må du slippe Ctrl før plasseringen kan bekreftes. Ctrl+C/V beholder den eksisterende arbeidsflyten for én kopi; kopien kan også roteres med R før plassering. Kopiering av tekst i tekstfelt påvirkes ikke.

### Felles stasjon og dobbelstasjon over to striper

1. Trykk S og velg ønsket symbolstil.
2. Velg **Felles stasjon – to LED-striper** eller **Dobbelstasjon – to LED-striper**. Disse modusene bruker to ringer og krever to separate, ledige LED-er.
3. Klikk LED-en på stripe A. Dette lagrer ingen stasjon ennå. Ring A står fast, mens ring B og felles markering følger pekeren.
4. Beveg pekeren mot stripe B. Begge tilkoblingspunkter, striper og LED-indekser vises før siste klikk. Avstand og vinkel beregnes fra faktiske LED-koordinater; stripene behøver ikke være helt parallelle og kan ha motsatt indeksering.
5. Klikk LED-en på stripe B. Én logisk stasjon med ett navn og to uavhengige LED-bindinger opprettes i én angrehandling. Verktøyet er klart for neste stasjon.

**Dobbeltstopp** i det eldre biblioteket er fortsatt et visuelt topunktsymbol. Den nye **Dobbelstasjon**-modusen gir det i tillegg en eksplisitt rolle over to striper. Egendefinerte varianter kan lagres som mal; permanente stasjons-/hull-ID-er og LED-bindinger kopieres ikke inn i malen. Bruker du en slik stasjon som standard, åpner S den tilsvarende tostripemodusen automatisk.

### Rediger etter plassering

Velg stasjonen og bruk **Velg deler → Bare punkt A / Bare punkt B / Begge / hele stasjonen**. Valgte punkter markeres. Shift+klikk på en grafisk ring velger også det enkelte punktet. Bindingspanelet kan bytte eller løsne hver LED-referanse separat.

- Ved samlet flytting av en tostripe-stasjon finner editoren tilsvarende ledige LED-er på de samme to stripene. Mangler det en gyldig kandidat på B, avvises flyttingen. Før/etter vises for begge hull før du bekrefter.
- Ved individuell A/B-flytting beholdes det andre punktet. Fysisk flytting må bekreftes. **Avbryt** lar originalen stå.
- **Roter 90° (R)** roterer et ubundet symbol og hullene omkring valgt anker, med fysisk bekreftelse dersom eksisterende hull flyttes. Navnets absolutte posisjon beholdes; tekstrotasjon redigeres separat.
- Direktebundne ringer og hull blir stående konsentrisk på LED-ene. Rotasjon gjelder yttermarkeringens ramme; fysiske LED-er og referanser flyttes ikke. Symmetriske kapsler kan se uendrede ut ved 90°/180°. Bytt LED-bindinger eksplisitt dersom selve punktmønsteret skal endres.
- **Yttermarkering** lar deg finjustere rammens vinkel og X/Y uten å flytte ringer, hull eller LED-er. Ringdiameter, kapselstørrelse og navn kan endres separat.

Stasjonen slettes som ett objekt. Angre/Gjør om og prosjekt-JSON bevarer begge bindingene og hull-ID-ene. Eksportert SVG bruker samme vektormarkering som editoren og inkluderer ingen forhåndsvisning eller kontrollhåndtak.

### Mobil og nettbrett

Velg stasjonsverktøyet og berør tegneflaten. Forhåndsvisningen ligger **64 skjermpiksler over fingeren**; flytt fingeren for å justere. Ingen stasjon opprettes ved berøringen alene. Bruk den store **Plasser stasjon**-knappen ved tegneflaten for å bekrefte. Ved tostripemodus bekrefter knappen først punkt A og deretter hele stasjonen etter valg av B. **Avslutt** avbryter. Tegneflaten har minst 400 px høyde på mobil, og siden kan rulles.

## Eksempel

[Åpne prosjekt-JSON](examples/two-strip-stations-v06.json) via **Åpne prosjekt**. Eksemplet har to rette 10 mm-striper med motsatt indeksering, én felles stasjon, én dobbelstasjon og ett enkeltstopp: tre logiske stasjoner og fem uavhengige LED-bindinger. Det bruker nominelle mål og er ikke en verifisert ruteplan.

[Eksempel-SVG](examples/two-strip-stations-v06.svg) · [Forhåndsvisning før andre klikk](v06-placement.png) · [Mobil](v06-placement-mobile.png) · [Nettbrett](v06-placement-tablet.png).

## Arkitektur og kompatibilitet

`placement.mjs` bygger en kandidat med komplett stasjon, hull og eventuelle bindinger i millimeter. Kandidaten tegnes direkte med `stationMarkup` og brukes ved bekreftelse. Det finnes ingen egen, omtrentlig tegneberegning for forhåndsvisningen. Visuelle kontroller og kandidater er midlertidig editorstatus og eksporteres ikke.

Den eksisterende stasjonsmodellen med flere punkter, separate hull/ringsentre og `ledLayout.bindings` gjenbrukes. `symbolKind` skiller tostripe-rollene. De visuelle feltene `markerAngle`, `markerDx` og `markerDy` får nullverdier i eldre prosjekter og inngår i malenes visuelle hviteliste. Prosjektformatet er fortsatt v3. Eksplisitte ringsentre tillater fysisk spenn over 100 mm, uten å heve den tidligere grensen for implisitt punktavstand. Logisk stasjon, grafikk, stripegeometri og LED-identiteter holdes adskilt.

S-verktøyets verktøylinje er stabil under LED-fangst, slik at kandidater og feiltekster ikke flytter tegneflaten under pekeren. Den gamle arbeidsflyten for én kopiert stasjon får ikke ekstra verktøylinje eller kameraforskyvning.

## Automatiserte tester

Lokalt: Node 24.19.0 og ekte Chromium 154.0.8037.57. CI-status for eksakt commit dokumenteres i PR-en.

| Test | Dekning |
| --- | --- |
| Ny modellsuite | Alle 18 symboler × fire rotasjoner × senter-/punktanker; identiske mm-koordinater og vektorlag før/etter opprettelse; separat punkt B-anker |
| Snapping | Fire modellzoomnivåer; kandidater fra faktiske LED-koordinater; tvetydighet, opptatt LED, lås, krav om LED og Ctrl/friplassering |
| Tostripe-modell | Felles/dobbel ved 0°/0°, 45°/45°, 0°/7°, 17°/22° og 90°/90°; separat LED-identitet og motsatt indeksering |
| Rotasjon | Ubundet symbol/hull omkring valgt anker, uendret absolutt navn; direktebundne sentre/referanser bevares; endringsrader før fysisk flytting |
| Ny Chromium-suite | S, faktisk musefølgende vektorforhåndsvisning uten skjermhopp, identisk DOM/SVG etter klikk, R/Shift+R, gjentatt plassering, bytte av type, Esc og tekstfelt |
| Fysisk UI | Snapping gjennom kamerazoom og panorering, to klikk og ett objekt, A/B/hele valg, samlet flytting med to hullbekreftelser, individuell endring, ringstørrelse uten hullflytting, sletting og Angre/Gjør om |
| Lagring/eksport | Faktiske JSON/SVG-nedlastinger, gjenåpning og begge LED-bindinger; ingen forhåndsvisning i SVG |
| Ekte berøring | Chromium `hasTouch` på 390 × 844 og 820 × 1180; enkeltstopp og tostripe-stasjon, fingerforskyvning, eksplisitt bekreftelse og avbrudd |
| Regresjon | Alle ti modell- og ti Chromium-suiter, inkludert geometri, kopiering, porter, stripe-/parallellsnapping, montering og produksjon |
| Produksjon | Uavhengig pypdf/XML/CSV-kontroll av 18- og 22-hulls datasettene, 30 faktiske PDF-sider |
| Plattform | 102 kontroller / 13 tavlefiler, tavleside, Gråkallbanen-editor og retningsmapping |

```sh
node scripts/test-placement-board-studio.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/browser-placement-board-studio.mjs
node scripts/generate-placement-board-studio.mjs
```

## Begrensninger

Tostripe-plassering bruker to LED-punkter på forskjellige stripesegmenter. Flere enn to striper kan fortsatt kobles gjennom det eksisterende bindingspanelet og flerpunktsymboler. Automatisk tilpasning i denne arbeidsflyten endrer ikke faktisk stripegeometri. Samlet flytting beholder de to opprinnelige stripene; velg et enkelt punkt for å bytte stripe.

Direktebelysning krever at ringer og hull blir på LED-sentrene. En fri grafisk rotasjon av hele punktmønsteret krever dermed andre LED-bindinger eller eksplisitt lyslederoppsett, ikke skjult forskyvning. Tostripe-modus gir ingen automatisk deling av opptatte LED-er.

Berøring er testet med ekte Chromium-hendelser og mobile visningsstørrelser, ikke på fysisk iPad eller telefon. Ingen sanntidsaktivering, LED-kontrollerstyring eller produksjonsdeploy er lagt til.

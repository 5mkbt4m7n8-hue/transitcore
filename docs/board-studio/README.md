# InTransit Board Studio v0.2

Millimeterbasert vektoreditor i `web/board-studio/index.html`. Arbeidet fortsetter på eksisterende utviklingsgren og draft-PR #324. Ingen merge, produksjonsdeploy, sanntidsendringer eller endringer i Map Studio/PR #323.

## Hva er rettet?

v0.1 tegnet hver overgang som en uavhengig Bézier-kurve. Ved roterte stasjoner kunne sporene krysse hverandre. v0.2 beregner begge spor som normalforskyvninger fra **samme sentertrasé**. Avstand, rekkefølge og endepunktreferanser er felles gjennom hele beregningen.

- Retningsbestemte spor-ID-er og stasjonsportenes fortegn lagres. Redigering bytter ikke portene for å skjule kryssinger. Ved første oppretting/migrering velges portorienteringen eksplisitt fra symbol og lokal traséretning; deretter er den varig.
- Rette forbindelser og Bézier-senterkurver; et knekkpunkt gir en sirkelavrunding mellom inn-/utretningen. Begge spor får indre/ytre radius fra samme sirkel. Avrundingen ligger innenfor hjørnet.
- Grafiske tilkoblinger følger lokal symbolnormal og trimmes ved ringens ytterkant. Kapselen maskerer interne forbindelser. To ringer kan fortsatt være knyttet til enkeltspor.
- Enkelt-/dobbelt-overganger bruker en jevn avstandsfunksjon langs senterkurven. Her varierer sporavstanden tilsiktet. På parallelle partier er avstanden konstant langs senterkurvens normal.
- Kontroll av krumning, sporkryssinger, selvkryssinger og overlappende endestasjonssymboler. For krapp radius forsøkes utvidelse **innen** «Tillatt automatisk utvidelse». Resultatet forhåndsvises og varsles; de valgte parameterne og portene beholdes.
- Ugyldig geometri forblir synlig som røde, stiplede linjer med varsel. SVG med traséer/kapsler blokkeres til geometrien er rettet. Separat hull-/kontureksport er fortsatt mulig.

Se [før/etter](geometry-comparison.html), [Chromium-sammenligning](v02-editor-comparison.png), [kurvehåndtak](v02-editor-curves.png) og [ugyldig geometri](v02-editor-invalid.png). Baseline-SVG ble laget med v0.1-motoren før endringene, fra samme koordinater/orienteringer som v0.2-prøven. Det er en konkret reproduksjon av skjermbildets problem, ikke en påstått kopi av brukerens prosjektfil.

## Norsk hurtigveiledning

1. Velg **Gråkallbanen**, **Geometriprøver** eller **Ny tavle**. Format og mm-mål endrer konturen uten å skalere objektene.
2. **S** legger til stasjon, **L** kobler stasjoner, **V** velger/flytter, **M** måler. Ctrl-klikk er bare flervalg; dra over tom flate for områdemarkering. Space eller **H** panorerer.
3. Klikk en trasé. Hvite håndtak styrer inn-/utgående tangentlengde; det gule styrer knekkpunktet. En trasé uten knekkpunkt har et gult forslag som oppretter et logisk knekkpunkt ved drag. Velg delstrekning i panelet eller klikk dens linje.
4. Dra håndtakene med sanntidsforhåndsvisning. Tangentretningen er bundet til stasjonsorienteringen. Felt viser håndtakslengder, minimumsradius, overgangslengde og tillatt utvidelse i mm. **Ctrl+Z**, **Ctrl+Y** eller **Ctrl+Shift+Z** angrer/gjør om. Ett fullført drag er én handling; Escape avbryter.
5. Sett grafisk sporantall separat fra stasjonens punktantall. «Skill ut delstrekning» gir eget grafisk sporvalg og bevarer de logiske sporidentitetene. Stasjonens asymmetri forskyver den felles grafiske portaksen.
6. Velg finrutenett, hovedrutenett (10/20 mm) og Svakt/Normalt/Tydelig kontrast. Inndelingen blir grovere ved lav zoom. **Rutenett** viser/skjuler; **Fest** styrer snapping uavhengig av visning.
7. Under drag vises relevante hjelpelinjer mot stasjons-/hullsentre, knekkpunkter, faste hjelpelinjer, 0°/90°/45° og parallelle retninger, samt avstand i mm. Med **Fest av** vises hjelpen uten å endre rå koordinater. Hjelpen for parallelle traséer gjelder retning fra dragstart, ikke automatisk flytting av en hel korridor.
8. Navn og symboler kan dras hver for seg. Presise X/Y-felt flytter utvalget, øvrige egenskaper gjelder første stasjon. Lag har selvstendig visning, lås og eksportvalg; navnelaget er separat.
9. Grafisk rotasjon/kurveredigering flytter **ikke** fysiske hullsentre. Ved avvik vises varsel i stasjonspanelet. «Tilpass hull til symbolet» er en eksplisitt, angrerbar fysisk flytting. Direkte stasjonsflytting flytter stasjonens egne hull; nabostasjonenes hull forblir faste.
10. Last ned JSON for sikker kopi og SVG for vektorgrafikk i mm. Automatisk lokal lagring er per nettleser/adresse. Rutenett, drahåndtak og midlertidige hjelpelinjer eksporteres aldri. Egendefinerte faste hjelpelinjer kan eksporteres bare når deres lag er valgt.

## Format og geometri

`format: intransit-board`, `version: 2`. `parseProject` migrerer v1 ved å fryse de daværende avledede hullsentrene og opprette varige spor-/portreferanser. Ukjente versjoner og ugyldige data avvises. Nettverk, skjematisk layout, fysisk grafikk, LED-data og produksjonsdata er fortsatt egne områder. Grafisk flytting endrer ikke nettverks-, GPS-, Entur- eller Quay-identiteter.

- `station.holes[]`: selvstendige, navngitte fysiske sentre i mm.
- `route.trackIds[]`: to varige logiske sider, også ved faner/enkeltspor.
- `route.portSigns`: varig orientering mellom logiske sider og symbolenes punkter.
- `route.bends[edge]`: logisk knekkpunkt i mm.
- `route.controls[edge]`: start-/slutthåndtakets lengde i mm.
- `route.autoGrow`: tillatt ekstra håndtakslengde/avrundingsradius, 0–48 mm. Null tillater ingen utvidelsesforsøk.

En generell Bézier-offset er ikke selv en Bézier. Derfor lagres den logiske sentergeometrien i JSON og eksporteres som **adaptive vektorlinjesegmenter**, beregnet fra samme normaler som skjermvisningen. Midtpunktsavvik kontrolleres mot 0,008 mm; vinkelskifte og segmentlengde styrer også oppdelingen. For krapp offset/overskredet oppdelingsgrense blir ugyldig. Avstander og krumning kontrolleres numerisk; dette er ikke et sertifisert CAD-bevis for alle tenkelige degenererte kurver.

En fysisk millimeter er én SVG-enhet, med `width`/`height` i mm. Ingen DPI-/CSS-pikselbasert skalering av produksjonskoordinater. Navn beholdes som vektortekst; font må være tilgjengelig ved produksjon. Import, skjermvisning og SVG bruker samme sentre og geometrimotor.

## Tester og utviklingstrinn

Trinnene ble testet i rekkefølge før neste ble startet:

1. `d293964`: felles senterkurve, sporidentitet, eksplisitte hull; modelltestene og eksisterende Chromium-regresjon bestod.
2. `78560ad`: direkte kurveredigering; ekte drahandlinger, forhåndsvisning, Ctrl+Z/Y, spor-/hullinvarians og filgjenåpning bestod.
3. `60ed8dd`: rutenett og hjelpelinjer; kontrast/zoom, fysisk hullsenter og snapping av/på bestod. Siste oppdatering legger til eksakt sirkelavrunding ved hjørnet og eksplisitt nettlesertest av ugyldig/automatisk justert geometri.

Kjør:

```sh
node scripts/test-board-studio.mjs
PLAYWRIGHT_MODULE=/absolutt/sti/til/playwright CHROMIUM_PATH=/usr/bin/chromium node scripts/browser-board-studio.mjs
```

Modelltestene dekker A–D (90°-sving, roterte stasjoner, enkelt→dobbelt og dobbelt→enkelt), tett sampling av krumning/normalavstand, selvkryssinger, ringkanttrim, begrenset automatikk, ugyldig eksport, fysiske hull, spor-/portidentiteter og migrering/JSON/SVG. Chromium dekker E–H og regresjonene fra fase A–B, inkludert faktiske drag, lag/låser, nedlastinger og filopplasting. A–D-prøvene åpnes også i nettleseren. SVG-tegnerekkefølge og rødt ugyldighetsvarsel testes i faktisk DOM. Skjermbildene viser de virkelige renderte kurvene; matematisk avstand/kryssingskontroll utføres i modelltestene.

`BOARD_SCREENSHOT=/sti/test.png` lagrer editor-, kurve-, ugyldighets- og sammenligningsbilder. GitHub Actions kjører modell/Chromium og laster opp bildene. `BOARD_TEST_URL` kan brukes mot en eksakt commitvisning; ekstern raw.githack-visning er ikke verifisert fra utviklingsmiljøet.

Regenerer eksempler med `scripts/generate-board-studio-examples.mjs` og sammenligningen med `scripts/generate-board-studio-comparison.mjs`. Før-baseline overskrives ikke. Eksempelprosjektene har ingen oppdiktede kildeidentiteter.

## Kjente begrensninger

- Ett logisk knekkpunkt per delstrekning. Tangenthåndtakene endrer lengde, ikke fri tangentretning; stasjonens orientering bestemmer denne. Numerisk kurveform/overgangslengde gjelder når egne håndtak ikke overstyrer dem.
- Hjørner bruker sirkelbuer; uten knekkpunkt er «Min. kurveradius» en kontroll av faktisk minste krumningsradius. Null fjerner minimumskravet, men en offset må fortsatt ha plass. Trange reverseringer kan kreve flytting av stasjoner/knekkpunkt eller lavere sporavstand og blir ikke omrutet vilkårlig.
- Kontrollene gjelder hver delstrekning og dens to logiske spor. Global optimalisering av nettverkskryss, kryss med andre uavhengige traseer og alle slags stasjonsoverlapp utenfor forbindelsens endepunkter er ikke implementert. Symboler med flere enn to punkter beholdes, men de to sporene bruker de ytterste portene.
- Smart snapping prioriterer relevante X/Y-sentre foran vinkelhjelp. Avstandsvisning er målehjelp, ikke en automatisk lik-avstandsfordeler. UI-valg for rutenett lagres ikke i prosjektfilen.
- Eksisterende v1-kurver kan endre form ved migrering fordi den gamle kryssende geometrien erstattes. Fysiske hull fryses før senere redigering. Kontroller grafikk/hull-avvik før fysisk bruk.
- Ingen ny fysisk LED-stripeplassering, pitch-/indekskobling, boremal, PDF/CSV/DXF, produksjonskontroll eller Map Studio-import. De reserverte LED-/produksjonslagene er fortsatt tomme. Ingen maskin-/materialtoleranser er validert.

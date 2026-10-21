# InTransit Trondheim – delvis verifisert kart

Feature branch fra main `173e5f9`. Ingen deployment eller endring av feed, Worker, ESP32, hemmeligheter eller LED-protokoll.

## A: Kartanalyse

Originalen er brukerens høyoppløselige `Trondheim Buss copy.jpg`, lagret uendret i `web/linear/assets/trondheim-original.jpg` (5906 × 8268). Layoutens referansefelt inneholder SHA-256. SVG har fast viewBox `0 0 913 1280`; bildekoordinater er skalert lineært til dette. Ingen posisjoner kommer fra GPS.

Analysen identifiserer 100 stoppmarkører på nettverket, 77 navngitte og 23 uten navn. **Brukeren har bekreftet at alle 23 navnløse punkter er faktiske holdeplasser og skal navngis senere** (2026-10-21). De skal forbli stoppmarkører på de opprinnelige koordinatene uten gjettede navn eller Entur-ID-er, og skal ikke konverteres til knekkpunkter. To løsrevne prøvedioder er holdt utenfor stoppnettet. Rutelinjenes geometriske knekkpunkter lagres separat fra stopp.

68 kartpunkter er koblet til eksisterende konfigurasjon via eksplisitte StopPlace-/Quay-/node-ID-er. Unike fulle navn er kontrollert mot katalogen; forkortede kartnavn som Trondheim sentralstasjon → Trondheim S og Gyldenløves → Gyldenløves gate har eksplisitte StopPlace-ID-er. Baseboard og katalog knyttes gjennom de samme Quay-ID-ene, uten nærhetssøk. Kartets opprinnelige navneform beholdes.

32 punkter mangler datakobling. Kartets eldre/avvikende navn som «Briansmith», «Clara Holst» og «Cecilie Thoresen» beholdes uten oppdiktede ID-er. Begge «Samfundet»-markørene er bekreftet riktige av brukeren, fordi det er fire stopp. Venstre punkt på hovedtraséen grupperer Quay 73101/73103, og punktet mot Høgskoleringen grupperer 73100/73102. Gruppene har én felles diode hver, separate Quay-ID-er og valgfri splitting etter retning. Fordelingen følger katalogens ruter og originalens forgrening; ingen koordinater er flyttet. Baseboard har linje 3 på hovedtraséens Quay-er i tillegg til sidegrenen, mens katalogen har linje 3 bare på sidegrenen. Dette avviket i eksisterende konfigurasjon er beholdt og dokumentert; det endres ikke automatisk. Det er ikke laget en fysisk LED-endring.

18 polylinjer er manuelt avtegnet fra originalen. Full rutetilhørighet for disse polylinjene er fortsatt uavklart. En konservativ fargeoverlay viser bare **enkeltstrekninger** hvor begge endepunktene entydig samsvarer med bekreftede kartstopp og deres eksakte Quay-ID-er er påfølgende i en eksisterende ruteprofil. Der flere ruter dokumenterer samme par tegnes parallelle fargelinjer. Alle andre kanter beholder nøytral farge, og de 23 ennå navnløse stoppene får ikke gjettet rutetilhørighet. Dette er dokumentert rekkefølge i ruteprofilen, **ikke** verifisert faktisk GPS, fullstendig trasé eller garantert samtidig sanntidsdekning. Ruteprofilene er allerede innlastet, så det gjøres ingen ekstra feed-kall. En `routeEvidence`-seksjon legges til rapporten i kartvisningen. Alle 18 polylinjer forblir `unresolved` til rutetilhørigheten er fullstendig kontrollert. SVG-geometrien må fortsatt gjennomgås mot originalen før kartet kan kalles komplett. Feil skal korrigeres i JSON, aldri gjennom GPS-projeksjon eller AI-generering.

## B–E: Integrasjon og redigering

Eksisterende Linear-side har nå «Lineær» / «Hele kartet». Modusbytte navigerer ikke, endrer ikke valgt linje eller kilde og starter ingen ny sanntidsklient. Kartet bruker samme validerte PixelFrame via eksisterende `paint()` og beholder Linear, diagnostikk, GPS Debug, produksjon/staging og allRoutes-semantikk. Det gjøres ett statisk layoutkall første gang kartet åpnes. Ingen ekstra live-API-kall.

OFF, APPROACHING, AT_STOP, PASSED og PARKED bruker eksisterende signalpolicy og servertilstander. Farge og linjenummer bytter sammen. Kartet viser holdeplassdetaljer, kjøretøy-ID, destinasjon, status, observasjonsalder, frame-alder og eksplisitt kilde hvis den finnes. Manglende kilde oppgis som ukjent; ETA kalles aldri GPS. Uavklarte bindinger, utløpte frames og kildebytte gir OFF. LED-testen i Linear simulerer ikke busser i kartet.

Aktivt bussantall vises bare hvis alle aktuelle observasjoner har kjøretøy-ID; identiske ID-er på flere stopp telles én gang. Tallet gjelder kartets tilgjengelige feeddekning.

En felles diode er standard. `diodeMode: "split"` kan velges per stopp; node-/Quay-/retnings-ID-er holdes separat. Endringen påvirker bare SVG, aldri hardware-konfigurasjon.

Kartet har nå en egen gjennomgangsmodus direkte i den eksisterende kartvisningen: «Vis originaltegningen» viser det faktiske vedlagte hvite kartet tydeligere som referanselag; «Vis dokumenterte rutefarger» slår kun fargeoverlaget av/på; og «Gjennomgå linje» lar brukeren velge én av de 18 tegnede polylinjene. Visningen zoomer da inn på den valgte polylinjen og viser antall enkeltkanter med dokumentert eksakt Quay-naboskap og hvilke stasjoner/linjer som støtter dem. Valideringsrapporten får `routeEvidence.byPath` med antall dokumenterte segmenter per linje, og `fullRouteVerified: false` for alle. De avtegnede rutene forblir uavklarte der data mangler. Dette er visuelle kontrollfunksjoner og utløser **ingen ekstra live-API-kall**. Originalfilen og kartkoordinatene endres ikke.

Kartet støtter zoom, dra, pinch, tilpass og punktfokus. Stopp, etiketter og linjeknekkpunkter flyttes med mus/berøring. Redigeringspanelet gir kartetikett, størrelse, én/to dioder, synlighet, stasjonskobling, linjefarge og tykkelse. Arbeidskopien har angre, forkast, eksplisitt lokal lagring/gjenoppretting og JSON-import/-eksport. Import valideres før aktiv layout erstattes. Eksportert layout kan committes til GitHub.

`web/linear/network/model.js` validerer bindinger mot eksakt node-ID, stationId og stopId, og oversetter logisk LED til fysisk LED via aktiv hardware-konfigurasjon. Ingen kobling skjer via navn eller koordinater ved runtime.

## Dekning og validering

`web/linear/network/mapping-report.json` er den versjonerte avviksrapporten. Nettleseren beregner en oppdatert rapport som kan eksporteres. Den viser manglende mapping, manglende navn, feed-noder uten kartpunkt, uklare retninger, flere linjer per stopp, duplikater, ugyldige bindinger og uavklarte polylinjer. `complete` forblir false frem til avvikene er gjennomgått.

«Vis alle bylinjer» beholder dagens betydning: alle tilgjengelige linjer på boardets plattformer. Eksisterende baseboard/shared-stops dekker ikke nødvendigvis hele nettverket. Kataloglinjer bruker sin eksisterende feed når de velges. Kartet lager ingen nye kall for å fylle manglende dekning. Full samtidig dekning for alle kartlinjer er ikke bekreftet.

## F: Tester

Kjør `node scripts/test-intransit-map.mjs` for eksakte ID-/LED-koblinger, linjefilter, kildeintegritet, livssyklus, utløp, validering og redigering. CI kjører denne sammen med eksisterende Linear-tester.

Chromium-testen kjøres automatisk på PR i GitHub Actions med en eksplisitt pinnet Playwright-versjon og nettleserinstallasjon. Den laster opp artefakten `intransit-map-review` med fire skjermbilder (mørk desktop, mørk mobil, hvitt referanselag, gjennomgang av `trace-04`), slik at kartets visuelle kvalitet kan godkjennes før merge. Skjermbildene viser **offline testframes** og er ikke bevis for sanntidsdekning eller geografisk korrekt rutetilhørighet. De gir ingen deploy. Lokalt kan den samme testen kjøres: `PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_PATH=/usr/bin/chromium node scripts/browser-intransit-map.mjs`. Sanntidskall bruker lokale testframes eller eksplisitte feilresponser. Testen verifiserer modusbytte uten ekstra framekall, uendret Linear-DOM, zoom, én/to dioder, angre, eksport, ETA-kildetekst, ekte frame-utløp i klienten, staging-feil og mobilbredde. Testdata vises aldri i live-produktet.

Før leveransen kan godkjennes som komplett må polylinjenes rutetilhørighet, de 32 gjenværende mappingene og konfigurasjonsavviket ved Samfundet og full nettverksdekning gjennomgås. PR-en er derfor et utkast, ikke en erklæring om at alle akseptansekriterier er oppfylt.

## Lesbarhet bekreftet med skjermbilder

En faktisk Chromium-gjennomgang av PR #226 viste at stoppnavnene er svært små
når hele den høye originaltegningen tilpasses vinduet. Derfor har kartet
nå «Større navn» som en **ren visningsinnstilling**. Standardnavn er litt
større, og brukeren kan slå på større navn under kontroll og zoom. I tillegg
har nøytrale rutelinjer og stoppmarkører fått bedre kontrast, og kartområdet
får mer høyde på desktop. Ingen koordinater, stasjons-ID-er, farger fra
ruteprofilene eller eksisterende live-motor er endret. Kontrollskjermbildene
i CI-artefakten inkluderer nå også visningen med større navn.

## Rutefarge-evidens: kontrollert alternativ Quay/StopPlace

Tidligere krevde fargeoverlaget at *eksakt samme Quay-ID* for begge
endestopp var påfølgende i en ruteprofil. Det ga falske negative når
ruteprofilen bruker den andre retningens Quay ved samme holdeplass.
`verifiedSegments(layout,profiles,boards)` støtter nå også nabo-StopPlace
når **begge Quay-ID-er er slått opp til entydige StopPlace-ID-er i den
allerede innlastede Trondheim-katalogen**, og begge kartpunktene er bekreftet.
Regelen gjelder bare StopPlace som forekommer på nøyaktig én markør på kartet.
Derfor er begge Samfundet-markørene **ekskludert** fra denne nye
StopPlace-fallbacken og beholder hver sine fire konkrete Quay-bindinger
fordelt i to grupper. Eksakt Quay-naboskap har prioritet.

Et nytt, offline CI-skript `scripts/audit-intransit-route-evidence.mjs`
leser alle tilgjengelige `atb-bus-*-live.json`-profiler og skriver
`route-evidence-audit.json` i `intransit-map-review`-artefakten.
Rapporten viser antall eksakte Quay-koblinger, nye StopPlace-koblinger,
fordeling per tegnede kartlinje og gjenstående uavklarte delstrekninger.
Dette er **rutetilknytnings-evidens**, ikke full live-dekning, og
mangler fortsatt full godkjenning av de 18 hele traseene.
Ingen data eller kartkoordinater er endret; heller ingen produksjons-API.

## Redigerbar manuell rutetilhørighet per delstrekning

Brukeren kan i «Rediger kart» velge en av de 18 polylinjene, velge en enkelt
kant/delstrekning og uttrykkelig godkjenne en busslinje der. En segmentgodkjenning
lagres som `path.reviewedSegments[index] = {verification: 'user-reviewed', routes: [...]}`
i eksportert JSON. Flere linjer kan godkjennes på samme segment. Dette
ligger i den eksisterende versjonerte kartlayouten og er **ikke live-/GPS-data**.
Manuelle rutefarger er stiplede for å være synlig forskjellige fra offisielt
bevist naboskap; de er ikke en påstand om at sanntidsdekningen er komplett.

Godkjenningen skjer bare etter en eksplisitt handling, ikke automatisk fra
profil eller geografi. Editorens angre/import/eksport behandler feltet på
samme måte som øvrig layout. Validering stopper ugyldige segmentnumre,
dupliserte eller uventede rute-ID-er. Ingen forhåndsgodkjenninger legges
til i original-layoutfilen; 104 fremdeles uavklarte delstrekninger forblir
åpne inntil brukeren har verifisert dem mot originalkartet.

## Avgrensning: bevisst ufullstendige bussruter (beslutning 2026-10-21)

Brukerens originale hvite kart er et **utvalg av strekninger** i Trondheim,
ikke nødvendigvis komplette bussruter fra første til siste holdeplass.
Dette er et ønsket produktomfang, ikke en datakvalitetsfeil. Fremtidige
utvidelser kan legge til flere tegnede segmenter, stopp og linjer.
Layouten har derfor eksplisitt `coverage: {scope: "selected-corridors",
endToEndRequired: false, expandable: true}`.

- Ikke forsøk å fylle inn manglende deler av faktiske bussruter ved GPS,
  antatt geometri, korteste vei eller rutens komplette stoppliste.
- Eksisterende kartpunkter, segment-ID-er og de to Samfundet-markørene
  skal beholdes ved senere utvidelser. Legg til nye stabile ID-er.
- Kontrollér kun at **det som er tegnet og påstås korrekt**, faktisk er
  koblet til riktige stopp og ruter. En synlig delstrekning med manglende
  mapping/rutefarge er fortsatt uavklart, selv om rutens videre forløp
  utenfor tegningen aldri blir lagt inn.
- `feedStopsMissing` representerer blant annet stopp *utenfor tegnet omfang*.
  Disse skal ikke telle som krav om at alle byens stopp må legges inn.
- `complete: false` i datavalideringsrapporten betyr fortsatt at
  kvalitetssikringen av **eksisterende tegnede punkter** er uferdig;
  det innebærer ikke krav om komplett ende-til-ende-dekning.
- Statuspanelet i «Hele kartet» opplyser om bevisst delvis dekning og
  viser fortsatt begrensninger i tilgjengelige live-data.

## Utvidelse av selve tegningen – kontrollert redigering

Kartet er ikke en låst bildefil. Det hvite originalbildet beholdes
uendret som referanse, mens stopp og traséer er separate SVG-punkter og
polylinjer som lagres i kartlayoutens JSON.

I «Hele kartet» → «Rediger kart» kan eieren nå:
- legge til nye holdeplasser i midten av det synlige kartutsnittet,
  flytte dem og redigere tekst/etikett etterpå;
- legge til nye linjer som to punkter og dra disse videre;
- forlenge en valgt linje, sette inn knekkpunkt på en delstrekning
  eller fjerne siste knekkpunkt;
- fjerne **egne nylig tilføyde** holdeplasser/linjer, mens de
  opprinnelige 100 holdeplassene og 18 linjene er beskyttet
  mot direkte sletting;
- angre endringer og importere/eksportere alle nye geometridata i
  samme JSON, som senere kan versjoneres i Git.

Nye holdeplasser får stabile `custom-stop-NNN`-ID-er, vises som
uavklart uten live-status, og får ikke oppdiktet navn eller Quay-ID.
Nye linjer får `custom-path-NNN`-ID-er og er nøytrale frem til
rutetilhørighet er bekreftet. Eksisterende Samfundet-grupper,
databindinger og fysisk LED-mapping endres ikke.

Når et godkjent segment deles eller får endret geometri, ugyldiggjøres
berørte manuelle rutegodkjenninger; godkjenninger på uberørte segmenter
bevares. Utvidelser er **mulige innenfor nåværende SVG-kartflate**
(`0 0 913 1280`). Hvis kartet senere skal tegnes videre utenfor
originalarkets grenser, må vi også utvide viewBox/kartflaten som et eget
versjonert steg. Ingen eksisterende punkter skal da forskyves, og
originalbildet skal forbli forankret i sine opprinnelige koordinater.

Arbeidskopien påvirker ikke produksjons-Worker, ESP32 eller andre tavler.

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

Kartet støtter zoom, dra, pinch, tilpass og punktfokus. Stopp, etiketter og linjeknekkpunkter flyttes med mus/berøring. Redigeringspanelet gir kartetikett, størrelse, én/to dioder, synlighet, stasjonskobling, linjefarge og tykkelse. Arbeidskopien har angre, forkast, eksplisitt lokal lagring/gjenoppretting og JSON-import/-eksport. Import valideres før aktiv layout erstattes. Eksportert layout kan committes til GitHub.

`web/linear/network/model.js` validerer bindinger mot eksakt node-ID, stationId og stopId, og oversetter logisk LED til fysisk LED via aktiv hardware-konfigurasjon. Ingen kobling skjer via navn eller koordinater ved runtime.

## Dekning og validering

`web/linear/network/mapping-report.json` er den versjonerte avviksrapporten. Nettleseren beregner en oppdatert rapport som kan eksporteres. Den viser manglende mapping, manglende navn, feed-noder uten kartpunkt, uklare retninger, flere linjer per stopp, duplikater, ugyldige bindinger og uavklarte polylinjer. `complete` forblir false frem til avvikene er gjennomgått.

«Vis alle bylinjer» beholder dagens betydning: alle tilgjengelige linjer på boardets plattformer. Eksisterende baseboard/shared-stops dekker ikke nødvendigvis hele nettverket. Kataloglinjer bruker sin eksisterende feed når de velges. Kartet lager ingen nye kall for å fylle manglende dekning. Full samtidig dekning for alle kartlinjer er ikke bekreftet.

## F: Tester

Kjør `node scripts/test-intransit-map.mjs` for eksakte ID-/LED-koblinger, linjefilter, kildeintegritet, livssyklus, utløp, validering og redigering. CI kjører denne sammen med eksisterende Linear-tester.

Valgfri Chromium-test: `PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_PATH=/usr/bin/chromium node scripts/browser-intransit-map.mjs`. Sanntidskall bruker lokale testframes eller eksplisitte feilresponser. Testen verifiserer modusbytte uten ekstra framekall, uendret Linear-DOM, zoom, én/to dioder, angre, eksport, ETA-kildetekst, ekte frame-utløp i klienten, staging-feil og mobilbredde. Testdata vises aldri i live-produktet.

Før leveransen kan godkjennes som komplett må polylinjenes rutetilhørighet, de 32 gjenværende mappingene og konfigurasjonsavviket ved Samfundet og full nettverksdekning gjennomgås. PR-en er derfor et utkast, ikke en erklæring om at alle akseptansekriterier er oppfylt.

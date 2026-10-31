# Linje 1: A → B → C-observasjoner i Trondheim Linear

**Prototype, nettvisning. Ingen fysiske tavler.** En utvidbar
diagnosemodell følger samme GPS-kjøretøy over flere gyldige
PixelFrame-oppdateringer på hele linje 1.

## Hvordan teste

Etter merge/PAGES-publisering:

https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/?route=atb-bus-1-live&view=network&line1=1

Panelet «Linje 1 · spor A → B → C» kan åpnes direkte. Den
opprinnelige karttegningen, 100 holdeplasser og 18 tegnede
linjer er urørt.

Hver identifiserbar buss i gjeldende feed får et midlertidig
lokalt alias («Buss 1», «Buss 2»). Sporing skjer kun mens
nettleseren er åpen. Brukerens GPS-lokasjon leses ikke.

### Hva er bevis og hva er ikke bevis?

- **GPS nær Quay:** `gps-nearest-stop` fra original
  PixelFrame, med eksakt led-indeks til én Quay. Et eksplisitt
  `withinStopRadius=false` avvises. Eldre feeds uten dette
  feltet kan fremdeles brukes som nærhetsbevis. Alternativt kan
  `gps-route-quay` med eksakt kartlagt Quay brukes.
  Dette er **ikke** fysisk bekreftet stopp.
- **Ingen sporingsbevis:** `estimated-station-call`, ukjent
  `positionType`, uverifisert SIRI eller en løs `quayId`
  alene kan ikke flytte bussen til neste holdeplass.
- **SIRI-bekreftet:** `entur-siri-provider-stop`,
  `providerReportedAtStop=true`, eksakt Quay og
  `AT_STOP`, etter feedens egen kildevalidering.
- **Planlagt retning:** `inbound` eller `outbound` fra
  verifisert SIRI ServiceJourney er sterkest. Ved bare
  GPS-observasjoner kan retning utledes når minst to
  observerte Quays forekommer i rett rekkefølge i den
  inncheckede linje 1-patternkatalogen. Den vises eksplisitt
  som **utledet fra GPS**, ikke kildebekreftet.
- **Neste planlagte Quay:** vises bare om alle
  gjenstående mønstervarianter peker til samme neste Quay.
  Dette er ikke en påstand om hvor bussen er nå.
- **Manglende mellomliggende stopp:** markeres `GAP`.
  Mellomstopp opprettes ikke automatisk som «besøkt».
- **Konflikt:** observerte Quays passer ikke kildefølgen,
  eller motsier tidligere bekreftet retning. Ingen
  automatisk reversering eller gjetning om riktig plattform.
- **Ikke lenger synlig:** bussen mangler i minst 45 sekunder
  fra **gyldige, ferske frames**. Dette betyr ikke at
  den fysisk har passert eller forlatt en holdeplass.
  Ugyldige frames og nettverksfeil regnes ikke som bevis.

Telling skjer på **én Quay per faktisk observert kjøretøy
per frame**; tvetydige dupliserte kjøretøy på forskjellige
Quays løfter ikke ruteprogresjonen.

Hendelser logges bare i den lokale nettleseren i inntil
24 timer, maksimalt 100 logglinjer; JSON-eksport
og tøm-knapp finnes i panelet. Det lagres ingen rå
GPS-koordinater, kjøretøy-ID-er eller tur-ID-er i loggen.
Aktive spor og ID-koblinger er bare i nettleserens
minne og forsvinner ved omlasting.

## Forklarbare sporingshendelser (test)

Under A→B→C-sporingen vises nå «Hvorfor ble sporingen
uavklart?» med utfoldbare bevisposter. Et **NOT_VISIBLE**
registreres først etter både **45 sekunder** og **minst to
forskjellige gyldige frames uten samme buss**. Gjentatte
svar med samme genereringstid, utdatert frame eller
nettverksfeil kan ikke alene utløse et brudd. Varselet
betyr **ikke** at bussen fysisk forlot holdeplassen.

Bevisposten viser siste observerte Quay, eventuelt
eksplisitt SIRI-stopp eller GPS-nærhet, siste tidspunkt,
neste planlagte Quay, faktisk tilgjengelig datafelt for
GPS-avvisningsdiagnostikk og om samme kjøretøy-ID (kun
sammenkoblet **i minnet**) hadde en eksplisitt
`unresolved`-melding i den aktuelle frame-en. Bare
kjente diagnostikkoder føres videre, aldri vilkårlig
kildetekst. Rå VehicleRef, tur-ID, koordinater og
kildemeldinger lagres **ikke** i nettleserhistorikken.

Ved uobservert mellomstopp (`GAP`) oppgis den
observerte overgangen og antall mulige mellomliggende
Quays fra kompatible rutemønstre; disse markeres
ikke automatisk som besøkt. Ved `CONFLICT` oppgis
kildemotstrid, retning eller duplisert Quay-observasjon.
En `REAPPEARED`-hendelse betyr bare at bussen kom
tilbake i mottatt frame – ikke bekreftet fysisk ankomst.
Alt vises også i eksisterende JSON-eksport.

Motoren er fortsatt nettleserbasert og observerer bare
frames mens Linear er åpen. De serverlagrede femminutters-
og ekstramålingene inneholder aggregerte Quay-tall og
kan ikke etterkonstruere hendelser for én bestemt buss.

## Flere linjer – kildeverifisert utvidelse

Fra 31. oktober 2026 bruker det samme A→B→C-panelet
rutemønstre fra **43 kildeverifiserte Trondheim-busslinjer**.
Linje 1 og 11 beholder opprinnelig dokumentasjon;
41 nye kommer fra fem kildefrosne Entur Transit Data-filer.
Linje **53, 54, 91 og 92** vises fortsatt på kartet,
men får ingen rutesekvensdiagnose fordi denne
kilderevisjonen manglet mønstre for begge retninger.

Etter kildekontrollen i
`docs/entur-trondheim-verified-patterns.md`
viser panelet en linjevelger. For lav belastning på mobil
følger det linje 1 og 11 som før og **høyst én ekstra
valgt linje** samtidig. Alle deler samme PixelFrame;
det kreves ingen ekstra API-spørringer. En midlertidig
kjøretøykobling avsluttes ved bytte, men tidligere
anonymiserte hendelser for linjen beholdes.

Bare nøyaktig kartlagte Quays kan brukes. Hvis
samme LED har flere mulige plattformer, er GPS-nærhet
ikke nok til å velge riktig Quay. Kildefestet
JourneyPattern-rekkefølge gir **ikke** automatisk
bekreftelse på faktiske holdeplassbesøk eller
ServiceJourney. Døgnkvalitetsrapporten gjelder
fortsatt kun linje 1; de øvrige linjene har
nettleserbaserte diagnostikklogger.

## Viktige begrensninger

Dette er en **observasjonsmodell**, ikke en server-side
turhistorikk som følger busser når siden er lukket.
Busser kan ha lange opphold, avkortede turer, påsatte
destinasjoner og uventede omkjøringer; koden viser
ukjent/konflikt fremfor å finne opp et helt stoppbesøk.
Én historikklinje representerer en endring i visningen,
ikke nødvendigvis én unik buss eller fysisk passering.

Regresjoner:
`node scripts/test-line1-route-progress.mjs` og
`node scripts/browser-intransit-map.mjs`.

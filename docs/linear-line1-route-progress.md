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
  PixelFrame, med eksakt led-indeks til én Quay. Dette er en
  nærhetsobservasjon, **ikke** fysisk bekreftet stopp.
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

## Flere linjer – kontrollert utvidelse

**Linje 1 og linje 11** er de eneste bylinjene med
incheckede Entur JourneyPattern-sekvenser for begge
retninger i `config/gps/atb-journey-patterns-1-11.json`.
Den samme A→B→C-motoren støtter nå begge linjene,
med helt atskilte midlertidige kjøretøyidentiteter,
separat hendelseslogg i nettleseren og egen JSON-eksport
per linje. Velg linje i «Linje 1 / 11 · spor A → B → C».

**Linje 11** aktiveres bare når katalogtavlen har
minst ett par påfølgende Quays fra kildemønsteret
koblet til eksakt LED. Flere dokumenterte Quays på
samme LED kan gi SIRI-kobling på eksakt Quay,
men *ikke* en gjetning om hvilken Quay en
GPS-nærhetsobservasjon tilhører.

En tilbakelagt GPS-rutefølge kan begrunne
**utledet retning**, men kalles ikke kildebekreftet
uten eksplisitt SIRI stoppbevis.
Linje 11 bruker i dag normalt GPS alene,
mens Tonstad-SIRI-testen bare er for linje 1.
Begge linjene leser samme mottatte PixelFrame:
ingen ekstra Entur-kall eller Worker-kronjobb.
Andre bylinjer vises som før på kartet, men
får ikke spekulativ retningslåsing eller
A→B→C-feildiagnose før kildeverifiserte rutemønstre
kan dokumenteres.

Kvalitetsrapporten med lagret døgn gjelder fortsatt
**bare linje 1**; linje 11-sporingen er foreløpig
nettleserbasert. Panelene endrer ikke originalkartet
eller fysiske tavler.

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

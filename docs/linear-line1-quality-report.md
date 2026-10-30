# Trondheim Linear – automatisk kvalitetsrapport for linje 1

Prototypen leser **de samme PixelFrame-oppdateringene** som Trondheim
Linear allerede viser. Ingen nye Entur-kall, produksjonsmotor,
kartgeometri eller fysisk tavle endres.

## Åpne

Etter at denne PR-en er publisert via GitHub Pages:

https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/?route=atb-bus-1-live&view=network&quality=1

Åpne panelet «Linje 1 · kvalitetsrapport».

## To datagrunnlag

**Detaljert LIVE:** Rapporten teller observasjoner per eksakt
`NSR:Quay` for linje 1 fra de gyldige PixelFrame-meldingene
som nettleseren mottar. Et treff kan være eksplisitt
`entur-siri-provider-stop` / `providerReportedAtStop`,
GPS-nærhet til eksakt Quay/LED,
eller uavklart GPS nær en Quay fra `gpsObservations`.
InTransit A→B→C-trackeren bidrar med konkrete
`GAP`, `CONFLICT` og `NOT_VISIBLE`-hendelser, knyttet til
siste observerte Quay. Disse er *sporingsavvik*, ikke en
konklusjon om fysisk kjøring. Frames og hendelser samles lokalt
i nettleseren, beholder opptil 400 frames og maksimalt ett døgn
av data; alle identiske frames og rutehendelser dedupliseres.
Produksjon og staging telles separat.

**Lagret døgn:** Fra «Datagrunnlag → Lagret døgn → Hent datoer»
velges en dato, deretter «Analyser valgt dato». Panelet leser
eksisterende `/v1/trondheim/history` med paginering, altså
ingen ny provider-polling. Dette er serverens planlagte
**fem-minuttersopptak**, ikke kontinuerlig logging.
Historikkens kompakte LED-records har ikke lenger alle
detaljfeltene som trengs for å bevise SIRI-stopp,
GPS-nærhet eller avvisningsgrunner. Alle treff fra dette
opptaket føres derfor som **LED-observasjoner** (ingen SIRI/GPS
garanteres), og manglende serverframes vises som tidsluker
og feil – aldri som bevis for at en bestemt buss ikke kjørte.

## Slik tolkes tabellen

- **SIRI:** antall positive, kildestøttede observasjoner på Quay,
  ikke antall forskjellige busser eller fysisk dokumenterte stopp.
- **GPS:** antall nærhetsobservasjoner, ikke stans.
- **LED:** antall LED-registreringer uten beholdt kildebevis.
- **Uavklart:** uavklarte GPS-observasjoner på eksakt Quay.
- **Forsvunnet:** bilen er ikke lenger i gyldige
  innkommende frames; dette kan være kommunikasjonsbrudd,
  GPS-avvik eller reell avreise.
- **Konflikt / hull:** ruteobservasjoner som ikke stemmer
  med kildekatalogen eller ikke dekker mellomliggende stopp.
- **Ingen observasjon:** ingen relevante treff i dette
  begrensede tidsutvalget. Dette er **ikke** det samme
  som at holdeplassen er feil.

Rader med avvik sorteres først, deretter etter antall
observasjoner. Rapporten kan eksporteres til JSON for å
sammenligne flere dager senere.

Den lagrede rapporten inneholder kun aggregerte tellerdata
og offentlige Quay-ID-er/navn, ingen rå VehicleRef,
ServiceJourney-ID eller GPS-koordinater.

## Begrensninger

Historiske treff viser et utvalg av sanntidsbilder – ikke
hele antallet planlagte eller gjennomførte stopp. En
prosentvis «treffsikkerhet» ville derfor vært misvisende
uten uavhengig fasit. Rapporten presenterer **ikke**
en oppfunnet prosentvis nøyaktighet eller «100 % korrekt».
Testførst: se på gjentatte avvik, ta vare på JSON, og
rett konkrete feil fortløpende.

Regresjoner: `node scripts/test-line1-quality-report.mjs`,
`node scripts/test-line1-route-progress.mjs` og
`node scripts/browser-intransit-map.mjs`.

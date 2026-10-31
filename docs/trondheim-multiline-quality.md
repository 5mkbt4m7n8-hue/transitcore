# Trondheim – automatisk datakvalitet for bylinjer

**Prototype, bare eksisterende 5-minutterskatalogopptak. Ingen nye Entur-spørringer eller fysisk tavle.**

## Hva er levert

- `worker/trondheim-multiline-quality.mjs` leser rå, gyldige
  `trondheim-city-lines-catalog`-frames mens eksisterende Worker-cron
  `*/5 * * * *` kjører. Hver registrert AtB-busslinje i tavlekatalogen
  får tellerdata dersom ruten er koblet til en konkret Quay/LED.
- Kildebevis skilles i `siri` (eksplisitt `AT_STOP` og kildebekreftet),
  `gps` (eksakt Quay eller entydig nærmeste Quay), `estimated`
  (planlagte rutekall – **aldri** GPS-bevis), `ledOnly` (uklassifisert),
  `unresolved` (uttrykkelig uavklart GPS knyttet til riktig linje/Quay)
  og `ambiguous` (samme kjøretøy ved ulike Quays i én frame).
- En delt LED med flere kandidater gir ikke et GPS-treff for en
  bestemt Quay, og `withinStopRadius=false` avvises.
- Data lagres som anonymiserte aggregater `lineQuality` per historikk-
  tidsluke og `multiLineQuality` i eksisterende døgnmetadata i
  **samme Durable Object** og samme lagringsretensjon.
  Rå `VehicleRef`, GPS-koordinater og `ServiceJourney` lagres **ikke**
  i de nye aggregatene. Det ordinære historikkformatets eksisterende
  innhold endres ellers ikke.
- Ved ny registrering av en allerede brukt femminuttersluke trekkes
  gammel aggregatverdi fra før den nye legges til. Kilde-/lagringsfeil
  skaper ingen falske nullobservasjoner.
- Eksisterende `GET /v1/trondheim/history` returnerer per dag
  `multiLineQuality.sourceSamples`, `diagnosticSamples` og
  `lines[linjekode]` med tellerdata og antall frames som faktisk ga
  GPS/SIRI-observasjoner. Ingen ny API-rute eller Worker-cron.
- Les visningen på
  https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/quality-lines.html
  eller via lenken i Trondheim Linear. Tabellen viser valgt dato og
  eventuelt forrige tilgjengelige dato; referansedager har forskjellige
  antall oppsamlede frames og skal ikke tolkes som en ferdig feilrate.

## Viktig tolkning

**43 linjer** har verifiserte JourneyPatterns for A→B→C-sporing fra PR #291.
Kvalitetsmålingene er en annen funksjon, som kan telle
kildeobservasjoner også for de øvrige bylinjene **53, 54, 91 og 92**
uten å påstå at rutesekvensen deres er kildeverifisert.

Dette er snapshots av kildegrunnlag, ikke alle faktiske holdeplassbesøk
eller et estimat på om bussen «manglet» ved et stopp. En linje med
`gps=0` i ett intervall har ikke dermed feil sporing; det kan mangle
trafikk eller kilder. `unresolved=0` gir bare mening når
`diagnosticSamples>0`. Eldre dager eller luker uten `lineQuality`
telles ikke med i nevneren, fremfor å bli markert som 0 treff.
Den ekstra GPS-prøven ved minutt 2, 7, 12 osv. gjelder fortsatt
**kun linje 1** og er holdt utenfor femminuttersammenligningen.

## Drift og tester

Ingen ny cron, Entur-forespørsel, Worker-miljøvariabel eller migrering.
Eksisterende `trondheim-history:v1:` beholdes, og de samme
retensjonsreglene (i dag, i går og evt. demo) gjelder.
Server-side aggregater begynner først å dukke opp etter at
Worker-utgaven faktisk er deployet, og etter nye gyldige opptak.

Tester:

```sh
node scripts/test-multiline-scheduled-quality.mjs
node scripts/test-line1-scheduled-quality.mjs
node scripts/test-trondheim-day-history.mjs
node scripts/test-line1-fast-history.mjs
```

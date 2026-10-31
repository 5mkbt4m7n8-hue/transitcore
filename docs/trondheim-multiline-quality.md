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

## Avviksradar

Kvalitetsoversikten har et panel for avviksprioritering basert på **det eksisterende** offentlige døgnsammendraget. Ingen ekstra Entur-kall eller cron-jobb.

- **Linjeavvik**: minst 6 frames med GPS-diagnostikk, og en eksplisitt `unresolved`-observasjon i minst 2 forskjellige gyldige frames. Mange treff i én enkelt frame oppfyller ikke kravet.
- **Quay-avvik**: kjente `nearestQuayId` i den spesifikke busslinjens katalog. `lineQuality.issues` lagrer opptil 200 unike linje–Quay-par per frame, samt `issuesComplete`. Hvis grensen overskrides, publiseres bare komplette linjetall; ingen feilaktig partiell Quay-statistikk.
- **Dekning**: døgnmetadata inneholder `issueCoverageSamples` og `quayIssues` med antall treff og distinkte frames. Uten minst 6 fullstendige Quay-diagnoseframes vises ikke Quay-avvik.
- **To dager**: samme type uavklarte GPS-observasjon må forekomme i minst 2 frames på både valgt dag og direkte foregående kalenderdag med tilstrekkelig diagnosegrunnlag. En eldre pinned demo teller aldri som forrige dag.
- **Strekninger**: hvis et Quay-avvik kan kobles til en kildeverifisert JourneyPattern, vises inntil to tilstøtende planlagte nabostrekninger per mønster. De er forslag til undersøkelse, ikke dokumentasjon på at en buss passerte der eller faktisk kjørte i planlagt retning.
- **Ingen gjetning**: lave GPS-tall, uteblitte meldinger, ETA-estimater, kun LED og eldre opptak uten kildediagnostikk kan aldri alene trigge et sporingsavvik. Det beregnes ingen feilprosent.

Ingen endringer i rutekart, eksisterende fysiske tavler (ingen bygget), LED-render, provider-forespørsler eller datalagringens retensjon.

Kjør `node scripts/test-trondheim-anomaly-radar.mjs` for regresjonene.

## Bevis for at Cloudflare-innsamlingen faktisk kjører

GitHub Action `Trondheim quality production proof (read-only)` kjører ved
endringer i kontrollen, manuelt og klokken 06:12, 14:12 og 22:12 UTC.
Den bruker **kun offentlige GET** mot den eksisterende Workerens
`/v1/trondheim/history` og siste relevante femminuttersluke.
Det sendes ingen Entur-kall og ingen Cloudflare-oppdateringer.

Workflowens **Step summary** viser én eksplisitt tilstand:

- `ACTIVE`: gyldige aggregerte data **og** et ferskt, kildeberiket opptak
  er lest tilbake fra den faktiske produksjons-Workeren.
- `OLD_WORKER_OR_NOT_YET_ENRICHED`: fersk historikk, men ikke nye aggregater.
- `NO_ENRICHED_FRAMES`: aggregat finnes, men ennå ingen kildeberikede frames.
- `RECENT_SLOT_UNENRICHED`: døgnaggregatet finnes, men siste lagrede opptak
  mangler feltet `lineQuality`; ikke påstå at nye målinger fremdeles kjører.
- `STALE`, `NO_SAMPLES`, `LATEST_SOURCE_ERROR`, `HISTORY_HTTP_ERROR`,
  `NETWORK_UNAVAILABLE` eller `LATEST_SAMPLE_UNVERIFIED` ved begrenset bevis.

Kontrollen skriver **ikke** ut kjøretøy-ID-er, GPS-koordinater, tokens
eller rå PixelFrames. Måledekning og antall linjer oppgis i rapporten.
Dette er en diagnose av programvarens innsamling og kildebevis – ikke
en attestasjon på fysisk passering eller GPS-nøyaktighet.

Åpen PR og historikk: 
https://github.com/5mkbt4m7n8-hue/transitcore/actions/workflows/trondheim-quality-proof.yml

Kjør lokalt: `node scripts/test-trondheim-quality-proof.mjs` og
`node scripts/probe-trondheim-quality-live.mjs` (sistnevnte krever nett).

### Kildedekning: korrigering av manglende `gpsObservations`

Produksjonssjekken 31.10.2026 bekreftet aktive lagrede kvalitetsdata,
men ingen frames hadde `gpsObservations`. Dette feltet ble ikke produsert
av standard GPS/LED-renderer – grønn CI alene var ikke nok.

For **historikkjobben alene** kan vi nå lese eksisterende
`positionType=gps-nearest-stop`, `platformEvidence=direction-conflict`,
`nearestQuayLed`, `routeListedHere` og `withinStopRadius` fra en allerede
gyldig frame. Kun når alle feltene stemmer, og linjen har én entydig
eksakt Quay på samme LED, registreres en **uavklart GPS-retningskonflikt**.
Ingen nærhetsobservasjon eller vanlig `gps-only` merkes automatisk feil.
Samme kjøretøy i samme frame dedupliseres.

Dette datagrunnlaget merkes eksplisitt
`diagnosticScope=rendered-direction-conflict-only` og telles i
`multiLineQuality.renderedScopeSamples`. **Det omfatter ikke** rå
GPS-avvisninger som aldri ble vist i PixelFrame, og må aldri markedsføres
som fullstendig diagnostikk av alle provider-posisjoner.

Kilde- og kjøretøyreferanser benyttes bare for midlertidig deduplisering.
Kun per-linje/Quay-tellere lagres i kvalitetsfeltene. Den eksisterende
lagrede kompakte frame-historikken og offentlig LED-svar er uendret.

Regresjon: `node scripts/test-trondheim-rendered-gps-conflicts.mjs`.

## Analyse av GPS-posisjoner som ikke når kartet

Den opprinnelige kvalitetsradaren registrerte bare det som kom inn i
PixelFrame. Derfor var ikke et manglende LED-treff en tilstrekkelig
feilforklaring. Den nye `provider-input-render-reconciliation-v1` analyserer
**det samme Entur-svaret** som Worker allerede bruker til å bygge
Trondheim-katalogen, uten flere nettverksforespørsler.

For katalogførte rutekoder dedupliseres siste kildeoppdatering per
kjøretøy i arbeidsminnet og klassifiseres konservativt:

- `rendered`: kjøretøyidentiteten er funnet i samme linjes PixelFrame.
- `missingPosition`: koordinater mangler eller er ugyldige.
- `invalidTimestamp`: kildeoppdateringen mangler en gyldig tidsangivelse.
- `stalePosition`: eldre enn katalogens konfigurerte ferskhetsgrense.
- `outsideCatalogRadius`: gyldig, fersk posisjon er utenfor katalogens
  tilnærmingsradius rundt alle kartpunkter. Dette betyr **ikke** at
  GPS-posisjonen er feil.
- `unrenderedNearCatalog`: gyldig, fersk posisjon er innenfor
  katalogradius, men den konkrete ID-en finnes ikke i tilhørende frame.
  Den nøyaktige årsaken er **ikke bekreftet**.
- `unverifiableIdentity`: manglende entydig kjøretøyidentitet; ingen
  påstand om at en gyldig busstur ble utelatt.

Kildeposter med offentlig linjekode som ikke finnes i den valgte
GPS-katalogen telles separat som `unlistedCode`, ikke som feil på
en av de 47 linjene. Reconciliationen gjelder GPS-kildegrunnlaget,
ikke ruteestimater for flybusser eller Oslo Metro.

Kun 47-linjers aggregerte tall pluss samlet kildeantall lagres som
`lineQuality.sourceDisposition` og døgnmetadata
`multiLineQuality.sourceReconciliation`. Det lagres **ingen** rå
`VehicleRef`, koordinater, tidspunkter per buss, destinasjoner eller
stopp-passeringer i disse nye feltene. Ved omkjøring av en tidsluke
trekkes den gamle oppsummeringen fra før en ny lagres.

Kvalitetsoversikten viser kildeårsaker og separate dagssummer, mens
GPS-radaren fortsatt bruker bare bekreftede uavklarte
retnings-/Quay-bevis. Et kildeutfall utenfor radius eller manglende
GPS-tid gir **ikke** automatisk en feilalarm for et stopp.

GitHub Actions-proben viser `gpsReconciliationFrames` og
`recentGpsReconciliation`. Først når sistnevnte er sant i et faktisk
Cloudflare-opptak er denne funksjonen dokumentert aktiv, uavhengig
av at koden er slått sammen og statiske sider er publisert.

Test: `node scripts/test-trondheim-gps-source-reconciliation.mjs`.

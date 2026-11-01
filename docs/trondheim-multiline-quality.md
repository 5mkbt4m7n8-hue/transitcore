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

## Prioritering av kildeposisjoner som ikke vises

Kilde-til-kart-avstemming er bekreftet aktiv i Cloudflare ved faktisk
femminuttersopptak 31.10.2026 kl. 15:20 norsk tid. Public read-only
production proof kl. 15:22 rapporterte 256 kilderader, 47 linjer,
én lagret source-reconciliation-frame og ingen historikkfeil.
Dette er bevis på at innsamlingen kjører, **ikke** bevis for GPS-avvik.

Den nye rapporten fører i tillegg `sourceReconciliation.reasonFrames`:
antall ulike gyldige femminuttersluker med minst én observasjon av
hver grunn, for hver katalogført busslinje. Syv posisjoner i én
frame er fortsatt bare én frame. Ved retry av samme tidsluke
trekkes både posisjonstall og frame-indikatorer fra før nye legges til.
Tidligere aggregerte posisjonstall uten frame-proveniens blir ikke
etterfylt med gjetninger.

Rapportens prioriterte kandidater krever minst seks avstemmingsmålinger
og minst to forskjellige frames med `unrenderedNearCatalog`.
Dette betyr bare at ferske kildemeldinger var nær katalogen, men
ikke ble gjengitt av den samme frame-kjøringen. Det kan være
datamodell, matching, dokumentert kildebegrensning eller visningslogikk;
det er **ikke** diagnostisert som feil GPS, uteblitt fysisk stopp
eller bestemt kjøreretning.

Rapporten viser linje 1 og 11 separat for manuell kontroll,
uten å gi dem kunstig prioritet. Andre linjer rangeres kun med
tilstrekkelig dokumentert gjentakelse. Merket «to dager» krever
forrige kalenderdag med minst seks kilde-til-kart-målinger og
to separate berørte frames i begge døgn.

Produksjonsproben viser en begrenset og anonym oppsummering for
linje 1 og 11, med råtall for nær-men-ikke-vist og separate frames.
Det eksporteres ikke identiteter, GPS-koordinater eller raw frames.

Regresjon: `node scripts/test-trondheim-source-repeated-triage.mjs`.

## Faktisk produksjonsprioritering – alle 47 busslinjer

Den planlagte GitHub Actions-kontrollen
`Trondheim quality production proof (read-only)` kjører nå også
`scripts/probe-trondheim-source-priorities-live.mjs`.
Den leser **kun døgnmetadata** fra offentlig
`GET /v1/trondheim/history`; ingen ekstra Entur-kall, kjøretøy-ID-er,
koordinater eller enkeltposisjoner lagres eller rapporteres.

Resultatlinjen `TRONDHEIM_SOURCE_PRIORITY` og jobbens
GitHub Actions-sammendrag viser (a) om samplingsdekning er god nok,
(b) anonymiserte summer for linje 1 og 11, og (c) inntil åtte
andre rutekoder med dokumentert gjentakelse av `unrenderedNearCatalog`.
Et funn krever minst **seks avstemmingsframes** og minst **to ulike
frames** for den samme linjen; antall kilderader alene er ikke nok.
Historikk uten `reasonFrames` har `separateFrames=null` og kan ikke
brukes til å rekonstruere en tidligere gjentakelse.

`NO_VERIFIED_LIVE_HISTORY`, `INSUFFICIENT_COVERAGE`,
`NO_REPEAT_CONFIRMED` og `REPEATED_CANDIDATES` er ulike tilstander.
En gyldig posisjon utenfor kartets visningsradius eller gammel
GPS-kildetid er **ikke** et verifisert sporingsavvik eller bevis
på at bussen ikke passerte en holdeplass. Det opprettes ingen
automatiske endringer i sporingsmotoren.

Offline regression:
`node scripts/test-trondheim-source-priority-live.mjs`.

## Skyggetest av streng rute-/Quay-matching fra PR #279

PR #279 endrer produksjonsmatching, har et eldre utgangspunkt og er
fortsatt åpen. Denne testen **slår ikke sammen PR #279** og endrer
ikke gjeldende LED-visning, Quay-plassering eller GPS-radius.

`worker/trondheim-strict-shadow.mjs` er en separat, eksplisitt avgrenset
kopi av **GPS-delens regler**, kjørt på samme kildebatch som den
eksisterende femminutters-Worker allerede henter. Koden bruker
katalogens eksakte linje-/destinasjonsregler, én nærmeste Quay,
konkurrerende Quay (inkludert kildesnapshot fra PR #279),
Quay-ID og StopPlace, minst 60 m margin til andre Quays,
maksimalt 30 s GPS-alder og en forutsetning om opptil 25 m usikkerhet.
Dagens LED-frame blir aldri endret av skyggetesten.

Reglene beregnes med to maksimalradier, **60 m** og **85 m**,
men samme Quay-konkurransemargin. 85 m gir ikke tillatelse
til å gjette et annet stopp eller feil retning. Målegrunnlaget er
PR #279s **GPS-rute-/Quay-kjerne**, ikke PR-ens SIRI-projeksjon,
kjøretøyhistorikk, ruteprogresjon eller en fysisk sensortest.
En match er derfor en **regelmatch**, aldri bevis på faktisk
holdeplasspassering eller korrekt veikant.

Den anonyme `sourceDisposition.strictShadow` lagres per tidsluke,
og `sourceReconciliation.strictShadow` oppsummeres per døgn.
Alle resultatene er tellinger per linje, f.eks. `matched`,
`competingQuay`, `routeOrDirectionUnresolved`,
`liveRejectedByStrict60`, `liveDifferentLedStrict60`,
`liveSideUnresolved`, `strict85Match` og `radiusOnlyGain85`.
Ingen kjøretøy-ID, destinasjon, koordinater eller kildetid
lagres i de nye feltene. Gjentatt kjøring av samme tidsluke
oppdaterer tellingene uten å telle dobbelt.

Et nåværende karttreff som ville blitt avvist av en streng regel
er en **kandidat til manuell inspeksjon**, ikke et bevist feilplassert
kjøretøy. Et 85 m-treff som 60 m avviser, bekrefter heller ikke
at 85 m er riktigere. Sammenligningen vises per linje i
`web/linear/quality-lines.html` og i anonymisert
produksjonsstatus for linje 1/11.

Testsuite: `node scripts/test-trondheim-strict-gps-shadow.mjs`.

## Nøyaktige avvisningsårsaker for GPS som faktisk vises

Den første 60/85-meters skyggetesten viste store forskjeller mellom
dagens kart og den strengere GPS-kandidaten. Disse totalsummene er
**ikke** årsakssummer per vist buss: de omfatter også GPS-kilder
som aldri var vist. Fra og med denne endringen teller derfor
`strictShadow.lines[code].liveRejectReasons60` **kun** busser som
var synlige i eksisterende GPS-LED-frame, men ble avvist av
den strengere 60-metersregelen. Årsaker er gjensidig utelukkende:
ugyldig/stale GPS-tid, stor avstand, manglende/ukjent destinasjon
eller retning, to for tette Quays, usikkerhet og andre grunner.
Dette er sikkerhetsreglenes første avvisningsårsak, ikke bevis
for feil veikant eller for at en buss ikke passerte.

`sourceReconciliation.strictShadow.liveReasonSamples` viser nøyaktig
hvor mange femminuttersframes som har *denne nye detaljdekningen*.
Historikk uten disse detaljene forblir ukjent; den får ikke
falske nuller. Ved oppdatering av samme tidsluke blir historikken
korrigert før ny telling. Ingen kjøretøy-ID, posisjon eller
GPS-tidspunkt blir lagret i disse feltene.

`scripts/probe-trondheim-strict-root-causes-live.mjs` er en
**read-only** kontroll i GitHub Actions som leser offentlig
døgnmetadata og rapporterer dekning og aggregerte årsaker
for linje 1 og 11. Den undersøker dessuten statisk Quay-geometri
for planlagte stopp kalt «Lerkendal» og «Tonstadkrysset»
i eksisterende ruteprofil og katalog: antall nærliggende Quays,
korteste katalogavstand, retning i konfigurasjonen og om en Quay
ikke finnes i LED-katalogen. Ingen av disse statiske dataene
er en sanntidsobservasjon av en faktisk buss eller en ekstern
bekreftelse av riktig trafikkside.

Diagnostikk: `node scripts/probe-trondheim-strict-root-causes-live.mjs`.
Regresjon: `node scripts/test-trondheim-strict-root-causes.mjs`.

## GPS V2 – kildeorden og retningslås, nettleserbasert skyggetest

`web/linear/network/gps-v2-shadow.js` er en *separat* eksperimentell
matcher for linje **1 og 11**. Den leser bare den allerede mottatte
PixelFrame og Enturs sjekkede JourneyPattern-snapshot,
`config/gps/atb-journey-patterns-1-11.json`. Den bruker utelukkende
`led.vehicle` når denne inneholder faktiske GPS-koordinater og identitet.
Andre samtidige `occupants` har ikke egne koordinater i den samme
katalogframen og blir **ikke** feilaktig gitt primærbussens GPS.

Første entydige geometriske Quay-kandidat registreres som en **observasjon,
ikke en bekreftet plattform**. Først etter en annen særskilt frame med en
annen entydig Quay og samme kortlivede bussidentitet kan samme dokumenterte
JourneyPattern og én retning støtte en retningslås. Hull i kilde-sekvensen
på maksimalt seks Quays kan være uobserverte; mellomliggende Quays
bekreftes ikke passert. Ved motsatt kildeorden, uventet destinasjon eller
manglende entydig Quay godkjennes ingen ny plattform.

Et korrekt merket, ferskt og kildeverifisert SIRI-at-stop i framen kan
støtte retning for samme buss; den krever eksplisitt `providerReportedAtStop`,
`plannedSourceDirection`, og Quay i valgt kilderetning. Et planlagt
JourneyPattern er **ikke** en GPS-bekreftelse på riktig veikant, en fysisk
passering eller en bestemt DatedServiceJourney.

Når retning allerede har separat kilde-/sekvensstøtte, filtrerer V2
kandidater til kompatible JourneyPatterns før geometrien vurderes. Derfor
kan en Quay med motsatt retning bare 10–35 m unna ignoreres som
konkurrent i *skyggerapporten*; dette får aldri tenne/flytte en LED.
Er flere Quays fremdeles mulige, forblir status uavklart. Kandidatens
radius er foreløpig 85 m, ikke en anbefalt ny produksjonsgrense.

Skyggetesten er **kun aktiv når Linear-nettsiden er åpen** og får nye,
ferske frames. Den lagrer ikke GPS-historikk eller kjøretøy-ID-er,
leverer bare summer for siste frame og nullstiller spor ved bytte mellom
produksjon/staging eller når en buss ikke er sett på tre minutter.
Den eksisterende uavhengige femminutters 60/85-målingen fortsetter som før.
Dette er ikke dokumentasjon på faktisk bedre fysisk plassering:
Neste go/no-go krever relevante live-posisjoner og source-bekreftet kontroll
ved Lerkendal og Tonstadkrysset.

Test: `node scripts/test-gps-v2-route-shadow.mjs`.

## GPS V2.1 – behold flere kandidater til ny observasjon

V2.0 forkastet enhver GPS-observasjon der flere Quays lå innenfor
søkeradiusen, og kunne derfor ikke bruke et senere korrekt A→B→C-bevis
til å skille to Quays ved Lerkendal eller Tonstadkrysset.

V2.1 kjører fremdeles **kun i nettleseren** og bruker samme allerede
mottatte PixelFrame som V2; **ingen LED, aktiv GPS-ruteføring, Workers
eller Entur-forespørsler påvirkes**. For linje 1 og 11 beholder modellen
et begrenset sett av mulige (JourneyPattern, Quay-indeks, tidligere
Quay-kandidat)-hypoteser, knyttet midlertidig til samme bilidentitet.
Et nytt, ferskt, selvstendig frame kan fjerne kandidater som ikke er
forenlige med et dokumentert *fremovergående* JourneyPattern. Høyest
seks mellomliggende Quays kan være uobserverte; de blir aldri regnet
som passert. Gjentatt GPS ved samme Quay regnes ikke som A→B.

Et rutemønster kan støtte én retning når **alle gjenværende** muligheter
har minst to forskjellige observerte Quays i riktig rekkefølge og
samme kilde-retning. Først når én aktuell Quay gjenstår *og* slik
retningsstøtte finnes, teller modellen et entydig forslag. Dersom to
ulike tidligere Quays gir samme neste Quay, må ytterligere observasjoner
til for å avklare den tidligere historien. En eksplisitt, validert
`entur-siri-provider-stop`-observasjon kan låse retningen direkte
for den rapporterte Quay-en; GPS alene gjør aldri et punkt til et
bekreftet fysisk stopp.

Hypoteser begrenses til 512, samtidige Quays til 24, GPS-alder til
30 sekunder og sporhull til tre minutter. Ved konflikt, for mange
muligheter eller manglende gyldig bevis forblir resultatet
**uavklart**, og ingen kilde- eller LED-kandidat velges ved gjetning.
Dersom samme primærbuss-ID forekommer flere ganger i ett frame,
avvises dette frame-bidraget for den bussen. Andre samtidige
`occupants` får aldri primærbussens koordinater.

I Linear vises `ambiguousCandidatesRetained`, `ambiguityNarrowed` og
`ambiguityResolvedAfterFollowup` per siste gyldige frame ved siden
av V2s øvrige tellere. Tallene er **ikke** GPS-feilrate og betyr ikke
at fysisk riktig veikant er bekreftet. Ingen ID, GPS-koordinat,
Quay-hypotesesekvens eller tidspunkt publiseres i målingene.
En åpnet nettside kreves fortsatt for testen; dette er ikke
uovervåket produksjonslogging. Videre validering krever observerte
passeringer og kildebekreftelse.

Test: `node scripts/test-gps-v21-multiple-quays.mjs`.

## GPS V2.1 – automatisk, anonym testlogging i nettleseren (24 timer)

Linear leser **samme gyldige PixelFrame** i tre parallelle spor:
- Dagens **faktisk viste** primærbuss-GPS (en *referanse for visning*,
  ikke ground truth for holdeplass).
- Opprinnelige **V2.0** (frosset kildekode fra PR #302 i
  \`web/linear/network/gps-v20-baseline.js\`; ikke oppdatert til V2.1).
- **V2.1** med samtidige Quay-hypoteser og ruterekkefølge.

\`web/linear/network/gps-v2-comparison-log.js\` mottar bare disse
anonyme tellerne og den **ferske** PixelFrame som allerede ble hentet
av Linear. Den lager anonyme minutt-bøtter for linje 1 og 11 per kilde
(produksjon/staging). Korrigert tidsstempel, TTL, kildebytte og dupliserte
frames vurderes; gjentatt tegning av samme frame gir ikke ekstra
observasjoner. Begrensning er siste 24 timer og maks 6 000 bøtter i
\`localStorage\` (ikke cloud/Worker); ingen rå GPS-koordinater,
VehicleRef, Quay-ID, destinasjon, individuell historikk eller rutefølge
blir serialisert. Lokale logger kan eksporteres anonymt til CSV/JSON
eller tømmes helt fra kontrollpanelet. Etter omlasting kan man lese
de anonyme summene, men det midlertidige V2.0/V2.1-ruteminnet er
ikke gjenopprettet.

**Viktig:** Den automatiske loggingen skjer bare mens nettsiden er
åpen/aktiv og får nye frames. Dette er *ikke* uovervåket innsamling
når telefonen er låst, nettleseren sover eller fanen er lukket.
Loggen lagrer per minutt og linje (ikke per buss), så et oppdrag som
måler enkelte faktiske A→B→C-passeringer over tid må følges opp
med kontroll mot eksplisitte kilder eller manuell observasjon. Ingen
av de tre algoritmene kan brukes som fasit for fysisk korrekt Quay.
V2.0- og V2.1-støttet rekkefølge kan telles og sammenlignes, men **en
større andel støttede kandidater betyr ikke bevist bedre fysisk GPS**.
På delte LED-er har bare \`led.vehicle\` egne GPS-koordinater; andre
GPS-\`occupants\` telles separat og blir ikke feilaktig knyttet
til hovedbussens posisjon. SIRI-prognoser behandles ikke som GPS.

Regresjon: \`node scripts/test-gps-v21-comparison-log.mjs\`.

## GPS V2.2 – automatiske, anonyme døgnmålinger i Cloudflare

V2.2 bruker **bare de eksisterende cron-samlingene**:
- \`*/5 * * * *\`: full Trondheim-katalog for linje 1 og 11
- \`2-59/5 * * * *\`: allerede eksisterende ekstra GPS-prøve på linje 1
- Ingen nye planlagte jobber, ingen ekstra Entur-forspørsler, ingen endring
  av LED- eller GPS-matching i produksjonen

\`worker/trondheim-gps-v22.mjs\` sammenligner den faktisk mottatte
PixelFrame med samme opprinnelige V2.0- og V2.1-algoritme som Linear
bruker i nettleseren. Dette er en skyggeanalyse med kun anonyme
tellinger for hvert eksisterende samlingsintervall og hvert datakilde-
felt. Det finnes en egen \`DeviceStatus\` Durable Object-instans,
\`__trondheim-gps-v22__\`, men **ingen migrering eller nye bindinger**.
Kun et strengt validerte tellerobjekt og en eksplisitt
\`SOURCE_UNAVAILABLE\` ved målefeil blir skrevet til Durable Object-lagring.

Det aktive kjøretøynavnet, kildereferansen og GPS-posisjonen i
PixelFrame sendes internt til Durable Object for algoritmeberegningen,
men blir **aldri lagret** i V2.2-tabellene eller returnert i API-et.
Rutemønsterhypotesene og kortvarig kjøretøykobling er i DO-instansens
volatile minne. Ved kaldstart, instansbytte eller lange intervaller
starter algoritmene på nytt. Dette må IKKE omtales som vedvarende
sporing av individuelle bussreiser. V2.0/V2.1 krever i utgangspunktet
kort sammenhengende observasjonsrekke; fem minutter mellom prøver,
særlig for linje 11, er derfor normalt for glissent til å hevde
bekreftet A→B→C-passering eller retning.

API-et \`GET /v1/trondheim/gps-v22\` er kun lesebasert og
gir inneværende Oslo-dag som standard, eller dagen før med
\`?day=YYYY-MM-DD\`. V2.2-siderapporten ligger på
\`web/linear/gps-v22-quality.html\`, med lenker fra Linear og
den eksisterende kvalitetsoversikten. Den viser datadekning,
V2.0/2.1-vurderte GPS-kandidater, støttede/uavklarte tilfeller,
og \`SOURCE_UNAVAILABLE\` som egen feilstatus.

Lerkendal linje 1 (\`NSR:Quay:102720\`), Lerkendal linje 11
(\`NSR:Quay:73421\`) og Tonstadkrysset linje 1
(\`NSR:Quay:102733\`) får **separate geografiske tellere**
for GPS-observasjoner i 85 m-radius og antall observasjoner med
flere Quays nærmere enn radiusen. Dette er **bare nærhet**, ikke
bevis på at bussen stoppet på akkurat denne siden av veien,
eller at V2.1 valgte riktig Quay.

Den eksisterende faste DO-lagringen håndterer opptak per
femminuttersluke med idempotent oppdatering, også når Worker får
samme planlagte oppdrag på nytt. Retensjon er inneværende og
foregående Oslo-kalenderdag; ingen demoarkivering av V2.2.
Gamle Worker-utgaver som mangler dette API-et gir eksplisitt
manglende data og skal ikke omtales som aktiv innsamling.
Først etter en **faktisk ny, gyldig Cloudflare-innspilling** og
bekreftet GET kan V2.2 kalles aktiv i produksjon.

Regresjon: \`node scripts/test-trondheim-gps-v22.mjs\`.

## GPS V2.3 – linje 1 + 11 på samme ekstra AtB-prøve

Den eksisterende `2-59/5`-cron-en henter fra AtBs kjøretøy-endepunkt
**én gang** og bygger fortsatt uendret, separat kvalitetsoversikt for
linje 1. I tillegg bygges et **skyggeframe for både linje 1 og 11** fra
det samme mottatte AtB-svaret. Dette lagres som ny, separat
`dual-fast`-bane i GPS-kvalitetsdataene; historiske `line1-fast`-data
beholdes og linje 11 får aldri bakoverfylte observasjoner. Ingen nye
Entur-forespørsler, cron-utløsere, Workers-migreringer eller endringer
i produksjons-LED/GPS-renderingen.

Skyggetestens midlertidige rutehistorikk knyttes nå til en stabil
signatur over hele kildestoppkatalogen, ikke til `profileFingerprint`
på et midlertidig LED-frame. Ellers kunne et katalogframe og et
ekstra prøveframe med ulikt linjeutvalg nullstille ruteminnet mellom
hverandre. Den **uendrede** V2.0/V2.1-kandidatalgoritmen bruker
fremdeles tre minutters sporferskhet, slik at vi kan måle avbrudd
uten å endre forutsetningene i skygge-eksperimentet.

V2.3 tilfører seks anonymiserte diagnosetellere per linje og per
nytt frame:

- `firstSeen`: en GPS-primærbuss ble ikke tidligere observert i
  siste 30 minutter i denne DO-instansens midlertidige minne
- `sameVehicleWithin3m`: samme primæridentitet observert på nytt
  innenfor den eksisterende treminuttersgrensen
- `sameVehicleAfter3m`: ny observasjon av en tidligere identitet
  etter treminuttersgrensen
- `outsideQuayRadius`, `oneNearbyQuay`, `multipleNearbyQuays`:
  henholdsvis null, én eller flere katalog-Quays for denne linjen
  innenfor 85 meters radius fra **primærbussens** gyldige GPS

Sekundære `occupants` får aldri primærbussens GPS. Midlertidig
identitet og GPS-historikk beholdes bare i volatile Durable
Object-minne. Kun strengt validerte tellerfelter lagres, og tidligere
V2.2-opptak uten V2.3-diagnose telles ikke som null-hendelser:
`diagnostics.frames` gir den faktiske nevneren.

Dette er en test av datadekning og mulig kildekompatibel rutesekvens,
**ikke** et bevis på at en konkret buss faktisk var på riktig
holdeplass eller fortsetter samme tur. Den tidligere avtalen om
kun linje 1- og 11-pilot, samt uendret aktiv LED, gjelder fortsatt.
Før produksjonsendringer må vi se faktiske positive
`ambiguityNarrowed`/`ambiguityResolvedAfterFollowup`-målinger
og verifisere dem mot kilde/virkelighet.

Test `node scripts/test-trondheim-gps-v23.mjs`.

## GPS V2.4 – oppstart, ruteminne og manglende gjenobservasjoner

V2.3 viste ingen påfølgende GPS-primær-ID-gjenobservasjoner i den første
produksjonsperioden. **Dette er ikke i seg selv bevis for at AtB bytter
vehicleId eller at Cloudflare restarter:** primærbussen kan ha gått
ut av visningsradius, blitt en sekundær occupant eller være absent i
en bestemt frame.

V2.4 legger **kun anonyme diagnostikktellere** til den eksisterende
`/v1/trondheim/gps-v22`-rapporten og `gps-v22-quality.html`:

* `memory.frames` er nevner for NYE V2.4-prøver, aldri retroaktivt
  estimert fra V2.2 eller V2.3.
* `coldStart`: første observerte gyldige frame i Durable Object-instansens
  volatile ruteminne (kan være deploy, vanlig instansstart eller tap av
  minne; sier ikke hvorfor).
* `catalogReset`: katalogsignaturen endret seg, slik at eksperimentet
  startes på nytt for å unngå å kombinere forskjellige Quay-geometrier.
* `continued`: samme volatile ruteminne ble brukt i neste måleframe.
  `priorWithin3m`, `priorAfter3m` og `priorUnknown` måler
  tidsavstand til forrige faktisk behandlede frame.
* `lines[n].frameMatch.frames` er nevner for V2.4 linjemålinger.
  `priorFrameKnown` er antall frames med et registrert forrige
  GPS-primærsett for linjen. `priorPrimary`/`currentPrimary`
  teller unike kvalifiserte primær-ID-er i disse frames;
  `repeatedPrimary` teller ID som finnes i begge påfølgende frames;
  `newSincePrior` og `absentSincePrior` teller forskjeller,
  mens `uncomparablePrimary` er primærobservasjoner når forrige
  frame mangler fra volatile minne.

Uttrykket «nytt siden forrige frame» innebærer aldri at bilen er ny
eller at Entur har endret kjøretøy-ID. Avledede datasummer er dessuten
ikke en fasit for fysisk riktig Quay eller faktisk holdeplassbesøk.

Dette bruker den samme katalog/dual-fast-innsamlingen som V2.3, uten
nye HTTP-forespørsler eller nye cron-jobber. Ingen identiteter,
koordinater, kandidatsekvenser eller unike ID-hasher lagres.
Streng validasjon krever interne konsistente primærsett-tellere,
avviser falske kombinasjoner og kopierer kun godkjente numeriske
felter til Durable Object. V2.3-opptak uten V2.4-felter leses videre
med egen diagnostikkdekning og blir ikke fylt med falske nuller.
Aktiv LED-/kartvisning er uberørt.

Regresjon: `node scripts/test-trondheim-gps-v24.mjs`. Produksjon
må verifiseres med faktisk nytt `memory.frames` etter utrulling.

## GPS V2.5 – kortvarig ruteminne over Cloudflare-kaldstarter

Produksjonsdata 1. november viste **68 av 68** V2.4-prøver med nytt
volatilt ruteminne. Hver prøvesammenligning var derfor uavklart.
V2.5 bygger en **egen skyggetest** i
`worker/trondheim-gps-v25.mjs`. V2.0, V2.1, V2.4-rapporten og
den synlige LED-/GPS-visningen endres ikke.

For en gyldig primærbuss lager Durable Object en **HMAC-SHA-256-basert
pseudonymisert ID** med tilfeldig nøkkel som finnes bare i den
spesifikke, private DO-instansen. Nøkkelen og et lite rutemønstersnapshot
lagres kortvarig i DO-lagring under
`trondheim-gps-v25:v1:expiring-shadow`. Snapshotet inneholder
*kun* HMAC-pseudonymer, kildemønster-/holdeplass**indekser**,
retningshypoteser og siste midlertidige observasjonstid. Ingen rå
GPS-koordinater, Entur-kjøretøy-ID-er, destinasjoner, Quay-strenger
eller kopier av PixelFrame lagres i V2.5-snapshotet.

Snapshot gjenbrukes bare for samme holdeplasskatalog og opptil
**180 sekunder** mellom prøver, med maks **128 samtidige hypotesespor**
og maks **512 mønsterhypoteser per spor**. V2.1-motoren får et
anonymisert testframe og gjenopprettes fra dette snapshotet etter
Durable Object-kaldstart. Det er fortsatt den originale
V2.1-kandidatberegningen som kjører; vi endrer ikke dens 180 sekunders
sporferskhet.

Cloudflare DO-alarm rydder opp privat snapshot når det utløper
(maks tre minutter pluss fem sekunders alarmmargin).
**Alle lesinger avviser utløpt snapshot selv om alarmen er forsinket**.
En nøkkel blir også rotert etter maks 30 minutter med kontinuerlige
målinger. Dersom DO-alarm ikke finnes eller ikke kan settes, slettes
snapshotet og V2.5 feiler isolert; V2.4 og den vanlige produksjonen
fortsetter. Cloudflares lagringsplattform kan ha gjenopprettingskopier;
disse korte pseudonymene er derfor ikke lik full anonymitet.

Offentlig døgnrapport får bare **allowlistede heltall**:
`v25.frames`, `v25.states` (fersk/gjenopprettet/utløpt/katalogendret/
nøkkelrotasjon), antall gjenopprettede korttids-hypoteser, og per linje
antall gjenkjente primærbusser og V2.1s konkurrerende/støttede
kandidater. Tidligere døgnmålinger får ikke kunstige nuller.

Dette er fremdeles **ikke bevis på faktisk passering, fysisk
holdeplass eller riktig retning**; i neste steg må positive,
kildekompatible hypoteser kontrolleres mot virkelig trafikk.
Ingen ekstra Entur-kall, cron-oppgaver, ny DO-binding eller migrering.

Regresjon: `node scripts/test-trondheim-gps-v25.mjs`.


## GPS V2.6 – diagnostikk av gjenopprettede kandidatspor

V2.5 (PR #309) bekreftet korttids-gjenoppretting av HMAC-pseudonymiserte
mønsterspor etter DO-kaldstart. **Det er ikke i seg selv A→B→C-bevis.**
V2.6 utvider bare denne skyggetestens validerte heltall (ingen nye
Entur-kall, cron, persistente posisjoner, LED-endringer eller
produksjonsmatching).

Per linje og **bare nye V2.6-frames** rapporteres:

- `followupFrames`: frames med V2.6-dekning, slik at eldre V2.5-slots
  ikke tolkes som null fremgang.
- `restoredWithCandidates`: gjenkjent primær-GPS med faktisk
  gjenopprettede, gyldige mønsterkandidater (ikke bare samme HMAC-token).
- `restoredAmbiguous`: disse hadde minst to mulige Quays før ny prøve.
- `restoredChanged`: kandidatsettet av Quays ble endret i ny prøve.
- `restoredNarrowed`: tidligere tvetydig kandidatsett fikk færre
  mulige Quays etter neste observasjon.
- `restoredDirection`: endret kandidatsett endte med én mulig Quay,
  kildekompatibel retning og minst ett fremoversteg i alle gjenværende
  mønsterhypoteser.
- `restoredABC`: som over, men minst to mønstersteg i alle gjenværende
  hypoteser, og dette var ikke allerede oppnådd i forrige snapshot.

**Alle tellere er observasjoner**, ikke unike busser, og mønstersteg er
ikke observert fysisk stopppassering. Flere JourneyPatterns kan dele
samme Quay. Katalogens Quay-strenger brukes kortvarig for å telle
distinkte kandidater, men lagres aldri i den offentlige døgnrapporten.
Kun validerte heltall føres tilbake. Eksisterende HMAC-nøkkel og
snapshot-retensjon på 180 s med kort alarmmargin gjelder fortsatt,
og pseudonymene er ikke fullstendig anonyme.

Mål før neste beslutning: se at `followupFrames > 0` fra faktisk
Cloudflare-prod, deretter sammenligne `restoredWithCandidates`,
`restoredAmbiguous`, `restoredNarrowed` og `restoredABC` for
linje 1 og 11. Ingen terskler her skal automatisk aktivere GPS V2.
En reell passering må verifiseres separat mot korrekt Quay og
kjøreretning før LED-sporing endres.

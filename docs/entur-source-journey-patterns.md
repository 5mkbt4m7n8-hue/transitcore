# Entur rutemønstre og datert turkobling – linje 1 og 11

## Kilde og tidspunkt

Read-only audit 2026-10-30 00:55 UTC mot Entur Transit Data beta
(`https://api.entur.io/transit-data/v1beta/mcp`).
Direkte `line`-oppslag med `journeyPatterns { id name directionType quays { nodes { id } } }`.
API-et kan endres, og resultatet er et **tidsstempel-snapshot**, ikke
garantert gjeldende trafikkplan for enhver fremtidig dato.

Referanse:
`config/gps/atb-journey-patterns-1-11.json`.

| Linje | JourneyPatterns | Ulike ordnede Quay-sekvenser | Retninger | Lengder (Quays) |
| --- | ---: | ---: | --- | --- |
| 1 | 8 | 4 | outbound og inbound | 19, 32 |
| 11 | 7 | 3 | outbound og inbound | 21, 37, 39 |

Variantene med identisk stoppsekvens beholdes separat fordi ulike
JourneyPattern-ID-er kan svare til ulike avganger/driftsmønstre.
Ingen av de 15 mønstrene hadde flere Quay-sider enn det som ble hentet
(max 200). Quay-sekvensene representerer **retningens faktiske plattformer**;
motsatt retning blir aldri konstruert ved å reversere ID-listen.

Konkrete bekreftelser:
- Linje 11: Bukkvollan Stavset `NSR:Quay:75464` i outbound, Blakli
  `NSR:Quay:75463` i inbound.
- Norrkøpingveien `NSR:Quay:74393` hører til et outbound-mønster,
  Nyborg `NSR:Quay:74213` er et eget inbound-Quay.
- Søndre Risvolltun `NSR:Quay:73565` inngår i outbound, og er ikke
  automatisk en plattform i motsatt retnings mønster.
- Linje 1: separate 19-/32-stopps varianter. En forkortet tur må
  ikke spores som en full tur til endestasjonen.

Enturs `outbound` / `inbound` er kildeattributter; ikke utled
GTFS direction_id `0` / `1` eller brukerens LED-kolonne fra navnet
uten en kontrollert mapping.

## Implementert kandidat (IKKE produksjonsaktivert)

`core/engines/entur-trip-pattern-link.mjs` validerer den bevarte
linjekatalogen, slår opp en nøyaktig JourneyPattern-ID og returnerer den
retningsbestemte sekvensen. Hvis flere mønstre deler identisk sekvens,
kan det felles bevegelsesmønsteret støttes, men det betyr aldri at vi
vet **hvilken datert avgang** bussen kjører.

`core/providers/entur/siri-vm-journey-parser.mjs` leser kun eksakt
`VehicleRef`, `LineRef`, `DatedVehicleJourneyRef` og RecordedAtTime
fra SIRI-VM for pilotlinjene, og avviser ukjente/ambivalente data.
`joinSiriVehicleToDatedTrip` krever:
1. Eksakt VehicleRef mot identisk GPS-kjøretøy og riktig AtB LineRef.
2. Ferske, synkroniserte SIRI- og GPS-tidsstempler.
3. Eksakt identisk `DatedServiceJourney`-ID i Transit Data; vi
   endrer ikke prefikser eller gjetter at ulik ID-type betyr samme tur.
4. Sammenfallende operasjonsdato, linje, ServiceJourney-ID og
   JourneyPattern-ID, uten kansellert/erstattet tur.
5. Finnes i vårt verifiserte mønstersnapshot.

Det som returneres, er **rute-/turbevis**, ikke at bussen fysisk
står ved eller har passert et bestemt Quay. GPS-retning og SIRI
`VehicleAtStop` har separate evidensregler.

## Resultatet av direkte datert tur-oppslag

Den nattlige SIRI-prøven (første 1 500 aktiviteter, 2026-10-30)
inneholdt **ingen datert turreferanse for akkurat linje 1 eller 11**.
Transit Data `datedServiceJourneys(lines, operatingDays: 2026-10-30)`
returnerte da ingen turer for pilotlinjene; et separat listeoppslag
av `serviceJourneys(lines)` overskred 18 sekunders timeout.
Dette kan skyldes nattutvalg, dekning, importdato eller API-søkeflyt.
Vi har **ikke** bekreftet en konkret SIRI→DatedServiceJourney-kobling
for en faktisk AtB-buss på pilotlinjene. Det er derfor feil å markere
denne integrasjonen som ferdig bekreftet.

Syntetiske positive og negative kasus og de 15 faktiske Quay-mønstrene
er testet grønt i GitHub Actions (route-progress-tests), men det
beviser ikke at fremtidig live referanseformat vil være identisk.

## Trafikktidsprøve: eksakt ServiceJourney (30.10.2026 09:50 UTC)

Den avgrensede SIRI VM-prøven med `datasetId=ATB` returnerte 401
kjøretøyaktiviteter, hvorav parseren fant 24 pilotobservasjoner med gyldig
turreferanse (17 ulike ServiceJourney-referanser på linje 1, 7 på linje 11).
Denne gangen var referansene eksplisitt av typen `ATB:ServiceJourney:...`
inne i SIRI-feltet `DatedVehicleJourneyRef` – **ikke** daterte
ServiceJourney-ID-er. Ingen ID-prefikser ble omskrevet.

Tre ferske referanser per linje ble slått opp enkeltvis med Enturs
`serviceJourney(id)`. Resultatet var **3/3 direkte ID-treff og 3/3
kjente JourneyPattern-ID-er på hver linje**, med kildebestemt retning og
ordinær Quay-sekvens fra vår tidsstemplede Entur-katalog. Resultatene
er gjengitt i GitHub Actions, kjøring `41036305907`. Testen har
ingen rå VehicleRef- eller GPS-utskrifter.

De separate funksjonene `resolveExactServiceJourneyPattern` og
`joinSiriVehicleToServiceJourney` er **shadow-only**. Sistnevnte
krever identisk VehicleRef, AtB-linje og ferske, synkroniserte
tidsstempler mellom SIRI og GPS. De er testet med positive og negative
syntetiske kasus og er også kjørt i et lesebasert liveuttrekk.
De returnerer `route-pattern-supported`, aldri `linked` eller `AT_STOP`.
`datedTripIdentityConfirmed=false`, `operatingDayVerified=false`,
`providerStopConfirmed=false` og `eligibleForLed=false` forblir
eksplisitte også ved eksakt rutemønster-match.

## Ny kontroll 30.10.2026 kl. 09:55 UTC: dato og faktisk GPS-identitet

GitHub Actions-kjøring `41036936070` brukte ett avgrenset
AtB SIRI VM-uttrekk (408 kjøretøyaktiviteter), én AtB Vehicle
Positions-forespørsel (118 GPS-kjøretøy) og opptil tre individuelle
ServiceJourney-oppslag per linje. Den hentet kun kalenderdata for
**ett** ferskt ServiceJourney-eksempel per linje via Transit Data
GraphQL `activeDates` (et dokumentert, men deprecated/eksperimentelt
felt). Ingen rå kjøretøy-ID-er eller GPS-koordinater ble skrevet til logg.

| Kontroll | Linje 1 | Linje 11 |
| --- | ---: | ---: |
| Eksakt ServiceJourney/linje/JourneyPattern | 3/3 | 3/3 |
| Eksakt SIRI VehicleRef mot fersk GPS-ID og synkrone tidspunkter | 3/3 | 2/3 |
| Calendar `activeDates` inneholdt lokal SIRI-observasjonsdato | 1/1 | 1/1 |
| Stopp fysisk bekreftet | 0 | 0 |

Én av tre linje-11-observasjoner manglet eksakt GPS-ID i
uttrekket; årsaken er foreløpig ikke fastslått. AtB ServiceJourney-ID-ene
ble brukt **uten å omskrive ID-type eller prefiks**. Dokumentert
rutemønster og kontrollert kalenderdato er verdifulle bevis,
men én aktiv kalenderdato beviser ikke at *akkurat den daterte turen*
ble kjørt, at kjøretøyet passerte angitt Quay, eller at en LED skal lyse.

**Fortsatt NO-GO.** Neste kontroller er tidsserier over flere
faktiske turer, kildebekreftede stoppmeldinger mot eksakt Quay,
date-aware skille ved midnatt, årsaksanalyse for manglende
kjøretøymatcher, og staging/edge-hardware-målinger før en eventuell
sikkerhetsvurdering av LED-bruk. Ikke merge eller deploy automatisk.

## Linje 1: offentlig Quay-/destinasjonsdiagnostikk 30.10.2026

Read-only 8-poll-replay i [Actions #41039875231](https://github.com/5mkbt4m7n8-hue/transitcore/actions/runs/41039875231)
sjekket alle åtte kilde-JourneyPatterns med 62 unike Quay-ID-er.
Alle 62 Quays fantes i den lokale katalogen; to var retningsmessig
tvetydige og **forblir sperret for automatisk stoppbekreftelse**:
`NSR:Quay:102733` (Tonstadkrysset) og `NSR:Quay:102721`
(Østre Lund). Det er ikke dokumentert at disse kan entydig velges ved
kjøretøyets oppgitte destinasjon.

Fire SIRI-stoppobservasjoner ble avvist med
`destination-direction-mismatch`:

| Quay | Offentlig navn | GPS-headsign | Observasjoner | SIRI JourneyPattern-retning |
| --- | --- | --- | ---: | --- |
| `NSR:Quay:103009` | Buran | Østre Lund | 2 | outbound |
| `NSR:Quay:73975` | Solsiden | Østre Lund | 2 | outbound |

Begge stoppene er eksakt i kilde-JourneyPattern (32 Quays) og har
*entydig* katalog-retning `0`. Katalogregelen hadde bare
`Kattem` og `Tillerterminalen` som matchende stopp-headsigns.
Ruteprofilen hadde allerede `Østre Lund` som tillatt destinasjon i
sørlig kjøreretning. Forskjellen peker på en manglende *eksakt alias*,
ikke grunnlag for nærmeste-nabo- eller motsatt-plattform-fallback.
Disse fire er sample-hendelser, ikke dokumentasjon på fire forskjellige
fysiske busser.

**Isolert kandidat i PR #279:** eksakt
`destinationDirectionAliases: {"Østre Lund":"0"}` i
`config/routes/atb-bus-1-live.json`. Regresjonen på faktisk
katalog kontrollerer at Buran/Solsiden kan passere SIRI-evidensporten
med tilhørende identitet, tidsstempler og posisjon, mens motsatt
katalogretning og begge tvetydige Quays fortsatt avvises. Dette er
ikke en generell likhet mellom Enturs `outbound` og GTFS `0`.
Endringen kan påvirke LED-kandidatvalg **dersom den senere merges**,
og må derfor ikke rulles ut før særskilt staging/edge-godkjenning.

**NO-GO:** Ikke merge/utrulling. Ingen fysisk stoppbekreftelse,
fullt gjennomspilt tur eller sikker bekreftelse av de to delte Quays.

## Alias-kandidat kontrollert med levende data 30.10.2026

[Ny 8-poll livekjøring](https://github.com/5mkbt4m7n8-hue/transitcore/actions/runs/41040804503)
brukte den oppdaterte linje-1-ruteprofilen med
`destinationDirectionAliases: {"Østre Lund":"0"}` fra PR-grenen.
Tre ulike pilotbusser per linje hadde 24 av 24 ferske, eksakte
SIRI↔GPS-identitets-/tidsmatcher hver. Stoppbevis er fortsatt fra
leverandørens SIRI MonitoredCall, ikke fysisk sensorbekreftelse.

| Kontroll | Linje 1 | Linje 11 |
| --- | ---: | ---: |
| Godkjente SIRI-stoppmeldinger | 7/8 | 9/9 |
| Avvist destinasjons-/retningskonflikt | 0 | 0 |
| Avvist tvetydig Quay | 1 | 0 |

Linje 1-avvisningen gjaldt `NSR:Quay:102733` Tonstadkrysset:
katalogens `directionIds=["0","1"]` for samme Quay, og GPS-headsign
`Østre Lund`. Dette er *ikke* grunnlag for å automatisk velge side:
vi vet at SIRI-rapporten er på kildens `outbound`-mønster, men
`outbound` er ikke automatisk lik katalogretning `0`.

Kandidat-aliasen løste ingen retningstvetydighet ved Tonstadkrysset,
men ga **ingen destinasjonsavvisninger i den begrensede nye prøven**.
Det er en positiv kontroll, ikke et fullstendig anslag på alle avganger,
eller bevis på at de samme fire avviste meldingene fra forrige prøve
kom igjen. Eksplisitte regler for eksakt Quay, identitet, nærhet,
tidsstempel og konkurrerende Quays forblir uendret.

**NO-GO for merge/deploy.** Må først sammenligne planlagte
ServiceJourneys med fysiske stopp gjennom hele turer, og særskilt
undersøke sikker bruk av kildebestemt retning ved delte plattformer.

## Neste release gate

1. Kjør én manuelt kontrollert SIRI- og Transit Data-match i
   trafikktid, med kildeidentifikatorer og korrekt operasjonsdato.
   Respekter HTTP 429 og `Retry-After`; ikke retry i tight loop.
2. Finn minst én faktisk identisk DatedServiceJourney-ID på linje 1 og
   én på linje 11, og kontroller riktige Quays mot den aktuelle turen.
3. Ved manglende identisk ID må vi kartlegge eksplisitt, dokumentert
   kilde-mapping – **ikke** endre prefiks ved gjetting.
4. Kjør replay for flere hele turer, logg feilplasserte stopp og
   tapte stopp separat og verifiser Cloudflare/DO CPU, FB73 og
   fysiske tavler.
5. Først deretter kan resultater brukes til å velge LED.
   **NO-GO** for automatisk merge/produksjonsutrulling.

### Reproduserbart (uten prod-tilgang)

```sh
node scripts/test-entur-trip-pattern-link.mjs
node scripts/test-siri-dated-trip-join.mjs
node scripts/probe-entur-line-patterns.mjs
node scripts/probe-entur-dated-journey-join.mjs
```

Nettprober er skrivebeskyttede og ratebegrensningsfølsomme. Kjør manuelt,
ikke automatisk ved hver PR-commit.

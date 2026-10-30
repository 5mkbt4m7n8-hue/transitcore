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

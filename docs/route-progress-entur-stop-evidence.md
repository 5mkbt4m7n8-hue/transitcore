# Trondheim Buss – GPS-fremdrift og Entur-stoppbevis (PR #279, kandidat)

## Formål og sikkerhetsregel

Ordinære LED-er skal ikke lyse på feil stopp eller feil retningsplattform.
Denne utviklingskandidaten skiller tre bevisnivåer:

1. **GPS-nærhet** til riktig Quay, rute og destinasjon: bare APPROACHING.
2. **GPS-fremdrift** gjennom en ordnet A→B→C-sekvens:
   mulig høyere retningstillit, men `aldri` stoppbekreftelse.
3. **Entur SIRI VM MonitoredCall.VehicleAtStop=true** sammen med nøyaktig
   VehicleRef, LineRef og NSR Quay, ferskt tidsstempel, korrekt GTFS-retning
   og fysisk nærliggende GPS: *leverandørrapportert* AT_STOP. Dette er ikke
   uavhengig sensorverifisering av døråpning eller faktisk stopp.

En ETA, OnwardCall, headsign alene, StopPlace uten Quay og gammel VM-melding
er aldri et bekreftet stopp. Ingen cross-StopPlace-snapping.

## Faktisk Entur-kildesjekk 29.10.2026

Offisielt API: `/realtime/v1/rest/vm` (SIRI Lite Vehicle Monitoring).
Første 1 500 aktiviteter ga 74 AtB-kjøretøy, 10 med
`VehicleAtStop=true`, 74 med StopPointRef, 60 med eksakt
samsvar mellom SIRI VehicleRef og AtBs GraphQL Vehicle-ID-er.

En separat direkte prøve ga 10 rapporterte AtB-stopp, hvorav 8 kunne
kobles på eksakt ID til en fersk GPS-observasjon og 8 hadde katalogført
Quay. Bare **2 av 10** passerte *alle* ekstra kontroller; fire var
destinasjonskonflikter og to hadde flertydig Quay-retning. Ingen avvisning
betyr automatisk at kildens stopp er feil; vår GTFS-katalog og
destinasjonstolkning kan være for begrenset.

SIRI-VM støtter stoppmeldinger, men dette førsteuttrekket er **ikke** en
garanti for full dekning. SIRI har ulike VehicleRef-formater og API-et
returnerer bare første 1500 aktiviteter i prøven. GraphQL-skjema-introspeksjon
ga ingen brukbare ekstra stoppfelt.

Kilde: https://developer.entur.no/open-data/realtime
Kildeeksempel: https://github.com/entur/profile-examples/blob/master/siri/vehicle-monitoring/siri-vm-at-stop.xml

## Implementert uten produksjonsaktivering

- `core/engines/route-progress.mjs`: deterministisk, ruteindeksert
  checkpoint-historikk med tre konsekutive fysiske GPS-nærheter,
  plausible hastigheter, duplikatbeskyttelse, 2 min pause-reset,
  ruterevisjons-reset og umiddelbar revurdering ved motstridende retning.
  De registrerte checkpoints er **ikke** bevis på faktisk stopp.
  En retningshypotese er ingen Quay-plassering.
- `worker/led-feed-worker.mjs`: valgfri sentral Durable Object shadow
  (`routeProgressShadowV1`), kun ved eksplisitt
  `ROUTE_PROGRESS_SHADOW=1` på en isolert kandidat-Worker.
  Den beskyttede `deploy/staging/entry.mjs` bruker en annen frame-kjede
  og aktiverer **ikke** denne testen ved staging-kandidat-SHA alene.
  Metadata er diagnostikk; **ingen** endring av normal LED-projeksjon,
  rutevalg, fysisk 147-mapping, FB73 eller historikk.
  Hvis shadow feiler, påvirkes ingen LED.
- `core/providers/entur/siri-vm-stop-parser.mjs`: konservativ ekstraksjon
  av eksplisitte SIRI VM MonitoredCall-stopp; OnwardCalls/PreviousCalls
  er utelukket. Krever tidsstempel med tidssone og entydig Quay. Ingen
  generell XML-parser; nye/ukjente former avvises.
- `core/engines/entur-stop-evidence.mjs`: streng validering av
  VehicleRef, LineRef, eksakt NSR:Quay, routeDirection, synkron tid,
  GPS-konflikt og konkurrerende kilde-Quays.
- `core/engines/entur-stop-projection.mjs`: valgfri `stopReports`-projeksjon
  inn i vanlig PixelFrame-kjede. Den kan slå én **provider-reported**
  AT_STOP-LED ved godkjent kildemelding og fjerner samtidig eventuelt
  svakere GPS-treff for den samme bussen. Ingen stopReports leveres
  per i dag fra produksjons-Worker; funksjonen er **ikke aktivert**.
  Kun dokumenterte Quays kan bli aktive. Fire Quays i karantene forblir
  avvist.

## Livetest for bevegelsessporing

15 påfølgende AtB-uttrekk over ca. to minutter, uten lagring av ID-er eller
GPS-koordinater: 55 av 1 162 sample-observasjoner fikk retningshypotese
(4,7 % inkludert kald oppstart). Etter 15. uttrekk hadde 16 av 78 aktive
kjøretøy (20,5 %) slik hypotese. For linje 1 ble 1 av 75 sample-observasjoner
merket tracked, for linje 11 9 av 75. Merk at gjentatte kjøretøy telles i
hver sample; disse tallene er **ikke** stopplasseringens treffprosent.

Dette viser at tre checkpoint-observasjoner alene ikke er nok for
full dekning. Vi må først verifisere mer fullstendige rutegeometrier,
eksempelvis nøyaktige retningsbestemte StopPlace/Quay-sekvenser og gjerne
trip/serviceJourneyId fra Entur, og måle over lenger tid. Vi kan ikke
erstatte den ordinære tavlen med denne sporingsteknikken ennå.

## Stopp før produksjon – obligatoriske gates

- Ingen automatisk merge av PR #279. Draft / NO-GO.
- Godkjent separat staging-kandidat med verifisert SHA; staging kan ha
  eldre kode og må ikke sammenlignes uten versjonskontroll.
- Test en lengre faktisk rutesekvens per linje og fysisk verifiserte
  stopp, særlig 1/11, Bukkvollan 134/135, Norrköpingveien 769/Nyborg
  770, Søndre Risvolltun 1105, Ranheim og terminalskifte.
- Fastslå SIRI VM-etterslep, manglende data og korrekt VehicleRef-kobling
  før selv en valgfri VM-ingest tilbys. Ikke forespør hele landet per
  LED-visning; bruk eventuelt en isolert, ratebegrenset og cachet adapter.
- Kontroller Worker og DO CPU/minne, alle 1282 Quays + 82 konkurrenter,
  nettleser, 147 fysiske tavler, historikk, FB73 og 1102.
- Først etter dette kan sporingsbevis bidra til LED-tilordning.
  Entur-kildens eksplisitte stoppbekreftelse må avvises ved tvetydighet.

## Reproduserbare kontroller

```sh
node scripts/test-route-progress.mjs
node scripts/test-entur-stop-evidence.mjs
node scripts/test-siri-vm-stop-parser.mjs
node scripts/test-entur-provider-projection.mjs
node scripts/probe-entur-stop-evidence.mjs
node scripts/probe-entur-stop-match.mjs
node scripts/probe-route-progress-shadow.mjs
```

De tre siste nettprøvene er read-only, uten kjøretøy-ID/GPS-utskrift.
GitHub Actions bruker eksplisitt pinnede actions og ingen deploy secrets.

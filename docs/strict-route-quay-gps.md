# Trondheim: konservativ GPS til ordinær LED

## Årsak og avgrensning

Gjennomgått #274–#278, med base `850a1b22512f3b449720538a6a2410d906e40253`.
#274 lot nærmeste katalog-Quay aktivere LED uten rute/destinasjon. #276 la
til retningsmetadata, men beholdt aktive `gps-only`/`direction-conflict`-signaler
og kunne flytte en observasjon til motsatt Quay innenfor samme StopPlace.
#275 sitt visningsfilter og #277 sin transport/TTL-håndtering beholdes.
#278 sin spatial hash, WeakMap-levetid, Set-validering, bundlete profiler og
single-flight konfigurasjons-/provider-cache beholdes.

Ny standard gjelder `trondheim-city-lines-catalog`, `trondheim-bus-board`
og `trondheim-shared-stops-board`. Ingen endring av katalogens 1282 LED-ID-er,
147 fysiske konfigurasjoner/assignments, Linear-/SVG-geometri eller historikk.
Trikk, FB73 ETA og den eksplisitte `motion-v1` testtavlen beholder egne motorer.

## Regel og to separate projeksjoner

`leds` inneholder bare observasjoner som passerer alle kontrollene:

- Gyldig identitet og numerisk GPS; tidsstempel med tidssone, ikke i fremtiden,
  maksimalt 30 sekunder gammelt (eller tavlens kortere grense).
- Én kjent linjeprofil; eksakt registrert terminal/headsign, med normalisering
  av store/små bokstaver og `via`, eller eksplisitt destinasjonsalias.
  Quay må ha akkurat én GTFS-retning for linjen. Ingen delstrenggjetting eller
  antakelse om at shape-orientering er GTFS-retning.
- Faktisk nærmeste Quay i hele katalogen må tilhøre linjen og destinasjonen,
  ha registrert StopPlace/Quay-identitet og finnes på tavlen. Ingen søking etter
  et fjernere rutestopp, motsatt plattform eller annen StopPlace.
- Maksimalt 60 m målt avstand (eller kortere konfigurert ankomstradius), og
  **over 60 m større avstand til enhver konkurrerende katalog-Quay**. Dette
  tilsvarer minst 25 m antatt GPS-usikkerhet på hver side pluss 10 m margin.
  Rapportert usikkerhet over 25 m eller ugyldig usikkerhet avvises.

Entur-spørringen leverer i dag linjenummer, headsign, posisjon og tidspunkt;
den leverer **ikke** GPS-nøyaktighet, trip, heading eller bekreftet plattform.
25 m er en konservativ policyantakelse, ingen målt feilgrense eller garanti.
Destinasjons- og rutekatalogen kan også bli utdatert. GPS kan aldri garantere
100 % riktig fysisk holdeplass. Derfor gir selv godkjent matching bare
`APPROACHING`, `positionType: gps-route-quay`, `platformConfirmed: false`.
GPS alene gir aldri `AT_STOP`, `PARKED` eller bekreftet avgang.

`gpsObservations` er en separat råposisjonsprojeksjon med faktisk GPS og originalt
tidsstempel, linje og destinasjon. Uavklarte observasjoner har `status: unresolved`
og en årsak; eventuell nærmeste Quay er diagnostikk, ingen LED-plassering.
Feltet har ingen aktiv LED eller stopptilstand og brukes aldri som LED-occupant.
Duplikater bruker nyeste observasjon; motstridende like tidsstempler eller en
ugyldig nyere observasjon kan ikke gjenopplive et eldre gyldig treff.

Fysisk 147-tavle laster/cache-deler hele katalogen for konkurrentkontrollen.
Mangler denne, feiler normal Worker-konfigurasjonslasting; en direkte motor-
kaller uten komplett katalog får bare unresolved. Den fysiske LED-en velges
fortsatt via uendrede Quay-ID-er og hardware-assignments.

Ved uavklart matching slukkes observasjonens ordinære LED. Ingen etterglød,
parkering eller hold av tidligere LED kan beholde en tvilsom plassering.
Andre gyldige busser på samme linje eller LED beholdes. Linear viser antall,
årsaker og faktiske koordinater i diagnostikk; dette teller ikke som på stopp.
Valgt linje og «vis alle bylinjer» filtrerer hver sin visning som før. Gammel
usikkerhetsgrafikk finnes fortsatt for eldre frames; feilen løses i motoren.
Geografisk kart har fortsatt den separate rå `/api/v1/vehicles/atb-live-all`-kilden.
Historikkens kompakte opptaksformat/147-avspilling er uendret; nye rådiagnoser
lagres ikke automatisk i historikken. FB73 sine ETA-leds flettes som før og
blir aldri GPS-observasjoner.

## Konkrete Quay-funn

Direkte Entur-kontroll 29.10.2026, Journey Planner v3 `stopPlace(id){quays}`,
bekreftet navn, foreldre-ID og koordinater for de navngitte stoppene:

| LED | Quay / StopPlace | Registrert linjeretning og konsekvens |
|---|---|---|
| 769 | 74393 / 61416, Norrkøpingveien | Linje 11 Stavset; bare én Quay. Blakli blir unresolved. |
| 770 | 74213 / 43264, Nyborg | Linje 11 Risvollan/Blakli; annen StopPlace, aldri motsatt 769. |
| 134 / 135 | 75463 / 75464, StopPlace 43948 | Bukkvollan Blakli / Stavset. GPS ved motsatt side avvises, flyttes ikke 141 m. |
| 1105 | 73565 / 42906 | Søndre Risvolltun har bare én Quay, registrert Stavset. Eksemplet 8837/11/Blakli avvises. |
| 855 | 74983 / 43682 | Ranheim avgang mot Kattem (GTFS 0); Ranheim er stoppnavn, ingen retningsevidens. Østre Lund finnes i profilens sør-legend, men ikke denne Quay-regelen. Uavklart inntil trip/Quay-bevis finnes; ingen ny aliasgjetting. |
| 967 | 102732 / 42315 | Skovgård, linje 1 Kattem (0). Ranheim-headsign avvises. |
| 899 | 71687 / 41890 | Rønningsbakken, linje 1 Kattem/Tillerterminalen (0). Ranheim avvises. |
| 997 | 73976 / 43133 | Solsiden, linje 1 Ranheim/Strindheim (1). Kattem avvises; de to Quays ligger for tett til konservativ margin. |

Retningene kommer fra repoets GTFS-baserte `routeDirections`, ikke fra
StopPlace-navnet. Entur Quay-katalogen bekrefter identitet/geografi, ikke
den historiske bussens kjøring. Uten den opprinnelige GPS-serien/trip-ID-en
kan vi ikke bevise hvorfor hvert historisk «?» oppstod. Regelen som tillot
det som aktiv LED er derimot lokalisert og fjernet.

Full kontroll av **1282 Quays / 689 StopPlaces** fant riktige foreldre-ID-er
for alle, men flyttede koordinater på LED 337/338 (Grøset søndre) og 1090/1091
(Svebergkrysset). Disse fire holdes i karantene; aktuell Entur-posisjon brukes
som konkurrent. Original kartgeometri endres ikke. Rapport:
[`strict-quay-audit-2026-10-29.json`](strict-quay-audit-2026-10-29.json).
Gjenta med `node scripts/audit-strict-quays.mjs` (kun offentlige stoppdata).
Ukjente avvik feiler kontrollen; de fire eksplisitte karantenene rapporteres.

## Verifisering og utrullingsvilkår

- 3963 registrerte destinasjonstilfeller og alle 1282 Quays kontrollert;
  1449 entydige eksaktposisjoner godtas, 400 deterministiske støytilfeller,
  motsatt side, ukjent linje/destinasjon, terminal-headsign, en/to plattformer,
  tidsstempler, duplikatkonflikt, flere samtidige busser og fire karantener.
- 67 entydige fysiske Quay-plasseringer kontrolleres mot 147-assignments;
  388 canonical/raw API-sammenligninger, 57 frosne legacy-fixture-sammenligninger.
  Legacy-fixtures har eksplisitt legacy-ID; ny fysisk produksjonspolicy testes
  separat og påstås ikke byte-identisk med gammel GPS-`AT_STOP`-atferd.
- Worker: 32 samtidige kalde og varme forespørsler med 250 observasjoner,
  åtte samtidige med 1000, TTL-fornyelse, feilet innlasting og gjenoppretting,
  samt full 147-LED Worker-forespørsel med komplett konkurrentkatalog.
- Uavhengig fullscan-kontroll av spatial hash og alle konkurrentavstander;
  API/provider/lifecycle, FB73/plattformdekning, historikk, Linear-filtre,
  kart/redigering, transport/TTL og to ekte headless nettlesersuiter passerte lokalt.
- Lokal Node 24 p95 tolking: 250 observasjoner **0,662 ms**, 1000 **2,299 ms**;
  historisk fullscan før #278: **11,847 ms** ved 250. Datasett/semantikk er nå
  strengere, så dette er ytelsesmålinger, ikke gammel plasseringsparitet.
  Kandidatbesøk: 0,915 % av fullscan. Tallene er ikke Cloudflare billed CPU.
- Wrangler **4.43.0** reelt Worker `--dry-run`: **730,77 KiB / 129,41 KiB gzip**,
  ingen deploy. Bootstrap-diff og øvrig CI må være grønne på eksakt PR-head.

**NO-GO for automatisk merge/deploy.** Eksplisitt brukerbeslutning kreves etter
grønn CI og gjennomgang. Edge CPU/minne, fysisk tavle og staging/canary er ikke
verifisert her. Før en godkjent produksjonsutrulling: kontroller særlig 134/135,
769, 1105 og linje 1 sine uavklarte terminal-/plattformtilfeller; aksepter lavere
dekningsgrad som tilsiktet pris for konservativ plassering. Reverter kode-PR-en
ved feil; ikke senk terskler eller legg inn alias uten dokumentert Quay-bevis.

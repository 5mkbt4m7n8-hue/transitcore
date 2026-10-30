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

## Source-of-truth: line 1 termini, not line marketing names (2026-10-30)

The complete source JourneyPattern inventory shows **Ranheim ↔ Østre Lund**
as the ordinary full route. Terminal Quays are
`NSR:Quay:102721` (Østre Lund) and `NSR:Quay:74982`
(Ranheim, inbound platform). The source-defined 19-Quay short turns
are **Strindheim → Tillerterminalen** (`NSR:Quay:75607`)
and **Tillerterminalen → Strindheim** (`NSR:Quay:73033`).
The full sequences have 32 Quays in both directions. The pattern
catalogue currently contains eight actual JourneyPattern variants.

`core/engines/entur-trip-terminus.mjs` is a pure, **shadow-only**
function. It requires a source-verified, exact ServiceJourney→JourneyPattern
link and rechecks the *entire ordered Quay sequence* against the trusted
source snapshot. It selects **the last Quay of that one trip** and
resolves the stop name only from an exactly matching Quay in the board
catalogue. A missing or contradictory source ID returns `unresolved`,
not a guessed destination. GPS headsign is an **advisory comparison**,
never the source of a terminus or Quay/LED evidence. All 8 variants,
including 19-Quay short turns, are covered by regression tests.

The route profile's main name is corrected to
`Ranheim - Østre Lund`. Its GPS-only direction labels are
`sørover` and `nordover`, *not* end-station claims:
a GPS checkpoint history alone cannot tell whether a bus ends early.
Existing Kattem/Tillerterminalen destination/headsign matching is
preserved for compatibility with source-reported variants; those
strings are not treated as full-route endpoints. The previously verified
exact `Østre Lund → 0` alias remains, and Quays with multiple
catalogue directions remain fail-closed.

A read-only live pilot
[GitHub Actions #41049399648](https://github.com/5mkbt4m7n8-hue/transitcore/actions/runs/41049399648)
joined 3/3 AtB line-1 ServiceJourneys to their route patterns, terminal
Quays and GPS/SIRI identities: one planned terminus **Østre Lund**, two
**Ranheim**, with three exact-name matches against the GPS headsign.
This is a **small timestamped sample**, not proof of terminal arrival,
full-trip progress, or operating-day correctness. The script printed
aggregated destination names only, no vehicle IDs/coordinates.

**NO-GO for LED / merge / deploy.** Shadow-only source terminal metadata
must not be used to bypass the explicit current-Quay, time, vehicle or
shared-Quay direction guards.

## Delte Quays: Tonstadkrysset og Østre Lund, 30.10.2026

Entur-snapshotet (8 kildemønstre på linje 1) viser at de **samme**
`NSR:Quay`-ID-ene benyttes i begge registrerte kjøreretninger:

| Quay | Offentlig navn | outbound-mønstre | inbound-mønstre | Rolle i ordinære turer |
| --- | --- | ---: | ---: | --- |
| `NSR:Quay:102733` | Tonstadkrysset | 4 | 4 | Mellomstopp på begge retninger |
| `NSR:Quay:102721` | Østre Lund | 3 | 3 | Endestopp outbound / startstopp inbound |

Kilderetningen fra en **eksakt, verifisert** ServiceJourney kan
beskrive turens planlagte kjøreretning og stoppets posisjon i sekvensen.
Det innebærer ikke at kilden har identifisert *en separat fysisk
plattform/LED* ved delte Quays. Det er også feil å anta at
Enturs `outbound` er lik `GTFS direction_id=0` på enhver Quay.
Korte turer til Tillerterminalen kan ikke behandles som turer som
går helt til Østre Lund.

Ny ren skyggefunksjon:
`core/engines/entur-shared-quay-context.mjs`. Den krever allerede
kontrollert SIRI↔GPS-vehicleidentitet og nøyaktig Entur
ServiceJourney→JourneyPattern-oppslag. Den kontrollerer hele
kildesekvensen, returnerer planlagt retning og `origin` /
`intermediate` / `terminus`, men setter alltid
`physicalSideConfirmed=false`, `providerStopConfirmed=false`,
`operatingDayVerified=false` og `eligibleForLed=false`.
Regresjonstestene kontrollerer 8/8 Tonstadkrysset-mønstre og 6/6
Østre Lund-mønstre, inkludert negativt testfall for
kortvariant som ikke slutter på Østre Lund.

Lesebasert [GitHub Actions-kjøring #41056026465](https://github.com/5mkbt4m7n8-hue/transitcore/actions/runs/41056026465)
tok fem prøver med 26 s mellomrom, `datasetId=ATB`, og forsøkte
eksakt kobling mot AtBs GPS-data. Resultat:

- Tonstadkrysset: 0 unike eksplisitte SIRI current-stop-rapporter
  i vinduet; ikke grunnlag for en livekobling.
- Østre Lund: 1 unik SIRI current-stop-rapport, men ingen
  matchende *kvalifisert* GPS-kjøretøy i samme uttrekk. Dermed
  0 eksakte SIRI↔GPS-matcher og 0 kilde-JourneyPattern-verifiseringer
  for akkurat denne livehendelsen. Årsaken til manglende GPS-match
  er ikke fastslått.
- Ingen fysisk Quay-side er verifisert, og ingen LED ble endret.

**NO-GO.** Grønn workflow betyr at en sikker og avgrenset
diagnostikk er gjennomført, ikke at den delte plattformen er løst.
Følg opp med flere kilde- og GPS-observasjoner ved disse Quays og
avklar om samme Quay-ID representerer ett delt fysisk stopp eller
hvilke separate, kildebekreftede plattformer som faktisk finnes.
Ikke åpne `ambiguous-quay-direction`-porten i mellomtiden.

## Tonstadkrysset: én Quay og én LED for begge retninger (PR #279)

Brukerens karttolkning, Enturs kilde-JourneyPatterns og publisert
holdeplassinformasjon støtter at linje 1 benytter samme plattform/Quay
ved Tonstadkrysset i begge kjøreretninger:
`NSR:Quay:102733`. Begge retninger har Quay-en som *mellomstopp*.
Det skal derfor ikke opprettes et oppdiktet nord-/sør-Quay eller
en ekstra LED for den andre retningen.

Den tidligere generelle `ambiguous-quay-direction`-sperren er
**ikke fjernet**. Kandidaten har kun dette presise unntaket:
`atb-bus-1-live` + `NSR:Quay:102733`, og bare når

1. SIRI `MonitoredCall.VehicleAtStop=true` gjelder samme Quay
   og det eksakte kjøretøyet, linjen og tidspunktet;
2. en eksplisitt innsendt `sharedQuayJourneys`-Map har den
   **eksakte SIRI ServiceJourney-referansen og Entur-responsen**.
   `joinSiriVehicleToServiceJourney` skal passere med korrekt
   kilde-JourneyPattern, GPS-kjøretøy og ferske tidsstempler;
3. kildens Quay-sekvens faktisk inkluderer Tonstadkrysset
   nøyaktig én gang som mellomstopp, med korrekt kildeterminal
   for ordinær tur eller kortvariant;
4. destinasjonsskiltet ikke motsier denne retningen. Kattem kan
   være et skiltalias, men erstatter ikke faktisk siste Quay;
5. GPS er maksimalt 100 m fra rapportert Quay, alle andre
   kildesjekker passerer, og kartet inneholder **nøyaktig én**
   Quay-node/LED-posisjon for denne ID-en.

Med to uavhengige, godkjente kjøretøyobservasjoner ved samme
Quay blir begge registrert som okkupanter på **den samme LED-en**.
Én LED har fortsatt én vist tilstand; dette betyr ikke to lys
eller et nytt felt på tavlen. Ingen tur-ID, GPS-nærhet,
`OnwardCall`, ETA eller destinasjonsskilt alene kan aktivere stoppet.

Implementasjon: `core/engines/entur-stop-evidence.mjs` og
`core/engines/entur-stop-projection.mjs`, opt-in i
`core/engines/strict-station-gps.mjs`.
`scripts/test-entur-shared-quay-projection.mjs` tester full tur
i begge retninger, kortvarianter, to kjøretøy på samme LED,
manglende kildebevis, feil headsign, feil ServiceJourney,
konflikter, gammel SIRI, GPS-avvik, dupliserte Quay-noder
og at Østre Lund **fremdeles** er blokkert.

**Viktig utrullingsgrense:** produksjons-Worker leverer verken
`stopReports` eller `sharedQuayJourneys` som verifiserte
sammenkoblede innganger. Ingen automatisk nettverksadapter er
skrudd på, og den nye stien kjører dermed **ikke i produksjon**.
Den isolerte sanntidsprøven kan måle kildedekning, men aktiverer
aldri LED. Det må foreligge ytterligere staging-/fysiske
kontroller og en gjennomtenkt, ratebegrenset inngang før merge.
Østre Lund (`NSR:Quay:102721`) og andre flertydige Quays
er ikke omfattet.

## Hendelsesdiagnostikk for neste Tonstadkrysset-passering

Etter liveobservasjonen rundt **14:11 norsk tid 2026-10-30** er det
lagt inn ny personvernbegrenset, skrivebeskyttet diagnostikk i
`scripts/probe-entur-shared-quay-shadow.mjs`. Den gamle prøven ga
anonymiserte totalsummer og kunne derfor ikke knytte hver
SIRI/GPS-treff til den offentlige Quay-en. En historisk måling kan
**ikke** rekonstrueres ut fra denne endringen.

Neste kjøring logger én `SHARED_QUAY_EVENT` per **unik, eksplisitt
`VehicleAtStop=true`-rapport** på linje 1 for Tonstadkrysset
(`NSR:Quay:102733`) eller Østre Lund (`NSR:Quay:102721`).
Kun tillatte felter er synlige: hendelsesnummer, pollnummer,
Quay-ID/navn, SIRI-tidspunkt i UTC, om eksakt
ServiceJourney-referanse finnes, om GPS VehicleRef ble funnet,
ServiceJourney-oppslagsstatus, kilderetning `inbound/outbound`,
Quay-rolle og tilstedeværelse i mønsteret, samsvar mellom SIRI/GPS
identitet og tidspunkt, normalisert destinasjon, resultatet av
den vanlige stopp-gaten, og **konkret avvisningsgrunn**. Retning
kan beskrives fra eksakt ServiceJourney selv om GPS-observasjonen
mangler, men blir da *kun planlagt rutekontekst*.

I hver `SHARED_QUAY_POLL` rapporteres også **aggregerte**
antall ferske GPS-posisjoner for linje 1 innen 100 meter fra de
to Quay-ene og antall med destinasjon Ranheim. GPS-nærhet
**beviser ikke faktisk stopp**, heller ikke ved Tonstadkrysset.
Hvis ingen eksplisitt SIRI-stoppmelding sendes, blir det heller
ingen `SHARED_QUAY_EVENT`; forskjellen mellom «ingen SIRI-stopp»
og «ingen GPS i området» kan likevel vises i pollsummen.

Ingen rå VehicleRef, ServiceJourney-/tur-ID, koordinater, rå SIRI-XML
eller andre vilkårlige kildefelter logges. Felt og verdier filtreres
av `scripts/shared-quay-diagnostic-format.mjs`, og
`scripts/test-shared-quay-diagnostic-format.mjs` tester eksplisitt
mot lekkasje av identifikatorer og koordinater. Read-only-kjøringen
tar 8 prøver med 20 sekunders mellomrom; det spesifikke klokkeslettet
14:11 er **fjernet** fra den gjenbrukbare testens metadata.

Dette er kun observasjon og gir ikke tillatelse til fysisk
LED-aktivering. PR #279 forblir **draft/NO-GO**, ingen produksjonsutrulling.

## Offline tavlesimulering med ekte frame-renderer (30.10.2026)

En **isolert skyggetest** beregner nå et mulig LED-resultat med den
samme `interpretStrictStationGps` + `renderStationFrame` som
tavlefeeden bruker, men kun inne i GitHub Actions-prosessen. Dette er
**ikke en utplassert Cloudflare staging-Worker** og heller ikke en
fysisk LED-test.

Implementert i `scripts/shared-quay-frame-shadow.mjs`.
Input er hele, innleste `trondheim-city-lines-catalog`,
ekte linje-1-profil og eksplisitte SIRI current-stop rapporter fra
`NSR:Quay:102733`. Streng `ServiceJourney`-kobling og fersk GPS
må være tilgjengelig for samme hendelse. Tilsvarende 8-polllers
skrivebeskyttet test `scripts/probe-entur-shared-quay-shadow.mjs`
loggfører `SHARED_QUAY_FRAME_SHADOW` ved hver poll.

**Personvern:** Den interne frame-strukturen inneholder rå ID-er
og koordinater og skal aldri returneres eller logges.
Oppsummeringen viser bare offentlig Quay/LED-nummer, antall
kildestøttede `AT_STOP`-okkupanter og om dette *ville blitt*
vist i det lokale testbildet. Ingen mottakere, Worker bindings,
Edge-ruter eller ESP-enheter er involvert. `eligibleForProduction`
og `physicalStopIndependentlyVerified` er alltid `false`.

Regresjonstesten `scripts/test-shared-quay-frame-shadow.mjs` bruker
hele kildekatalogen, både retninger, kortturer, to busser på samme
LED, manglende referanse, gammel kilde, feil Quay, feil headsign,
GPS-avvik og dublett i tavlekatalogen. Testen krever at tvetydige
data **ikke** simulerer bekreftet `AT_STOP` for Tonstadkrysset.

Før faktisk staging/deploy må Entur-inntak, cache, rategrenser,
målefeil og riktig fysisk LED-kartlegging gjennomgås særskilt.
**NO-GO** for merge og produksjon.

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

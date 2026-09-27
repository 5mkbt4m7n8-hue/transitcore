# TransitCore Platform v1 — fase A

Dato: 2026-09-26. Analysert `main` på `050a6e5` (inkludert PR 191–192,
men ikke PR 190).
Status: analyse og plan, ikke implementert plattform eller godkjent utrulling.
Denne fasen endrer bare dette dokumentet. Samme repo og kodebase beholdes;
arbeidsgrenen er et isolert Git-worktree, ikke et nytt produkt/repo.

## 1. Konklusjon og avgrensning

TransitCore har allerede felles firmware, frame-kontrakt, profilbasert mapping,
enhetsregistrering, diagnostikk og OTA. Vi skal trekke ut disse delene gradvis,
ikke erstatte dem. Først normaliseres kontrakter og provider-data bak kompatible
adaptere; deretter flyttes testet logikk i små endringer.

Fase A er kildekodeanalyse og lokale regresjonstester. Den verifiserer ikke
fysisk LED-utgang, aktuell provider-dekning eller OTA/rollback på maskinvare.
Ingen Worker-deploy, device-migrering eller firmwareoppdatering i denne fasen.

## 2. Det som finnes — og beholdes

| Område | Implementasjon i repoet | Platform v1-beslutning |
|---|---|---|
| Worker/pipeline | `worker/led-feed-worker.mjs` | Behold entrypoint og eksporterte funksjoner som kompatible fasader |
| GPS-data | `liveVehicles`, `vehicleProviderGroups`, `liveVehiclesForProfiles` | Behold Entur-oppslag, codespace-gruppering, cache og in-flight deduplisering |
| Ankomstestimater | `liveStationArrivals`, `frameFromStationArrivals` | Main velger sterkeste kandidat per LED; PR 190 har ventende felles utvalg per tur og occupants. Integrer/test denne rettingen separat før uttrekk; ikke kall estimater GPS |
| Posisjon/retning | `buildFrame`, `buildLinearRouteFrame`, `nearestRoutePosition`, `matchesDirection`, `vehicleAllowedByBoard` | Trekk ut uten algoritmeendring |
| Tilstand/stabilitet | `applyMotionLifecycle`, `normalizeLedEntries`, `holdTransientEmptyFrame`, `SIGNAL_POLICY` | Behold avgangsminne, terminalvern, jittervern og prioritet |
| Tidsgrenser | `worker/feed-timing.mjs`, `boardFrameResponse` | Behold tidsbudsjett, feilrespons og isolering av monitorfeil |
| Konfigurasjon | `config/boards/`, `config/routes/`, `config/hardware/` | Behold offentlige filstier, ID-er, node-/quay-ID-er og LED-numre |
| Profilidentitet | `attachProfileIdentity`, revisjon/fingerprint | Behold eksisterende beregning og wire-felter under refaktorering |
| Enheter | `DeviceStatus`, `handleDevices`, `lookupDeviceRegistration` | Behold Durable Object-binding, klassenavn, lagringsnøkler og token-hasher |
| Status/logg | `/status`, `/v1/status`, `web/diagnostics/`, `web/device-log/`, `worker/device-diagnostics.mjs` | Gjenbruk fremfor nytt parallelt diagnosesystem |
| Pakke/klient | `web/publish/esp-package.js`, Universal BoardClient | Behold én kildebasert klient og eksisterende pakkeformat |
| OTA | `handleOtaManifest`, `selectOtaRelease`, `scripts/prepare-ota-manifest.mjs` | Behold enhetsspesifikt manifest og alle kompatibilitetskontroller |
| Andre providers | `worker/mta-line7.mjs` | Senere adapter; ingen utilsiktet endring av denne API-en |

Eksisterende pipeline er i hovedsak:

`boardFrameResponse → configuration → liveFrameForConfiguration →
GPS buildFrame/buildLinearRouteFrame ELLER estimated-arrival frame →
stabilizeMotionFrame (Durable Object) → signal policy → JSON response`.

Fysisk mapping/rendering er delvis blandet med posisjonsberegningen; dagens
tilstandsbehandling skjer også etter at en foreløpig frame er bygget. Ikke
endre denne rekkefølgen samtidig med moduluttrekk. Etabler først ekvivalens,
og flytt mot ønsket provider → position → state → mapper → renderer senere.

Konfigurasjon lastes fra repoets `main` med cache. Hardwarefil kan falle tilbake
til `defaultHardware`. Dette og config-cache/fingerprint må testes ved endring;
en katalog er ikke automatisk en ferdig publisert fysisk tavle.

## 3. Kontrakter og konkrete hull

### TransitVehicle / provider

GPS-byggerne leser i dag Entur-felter direkte (`vehicleId`, `lastUpdated`,
`destinationName`, `line.publicCode`, `location`). Det finnes ikke en felles
normalisert TransitVehicle-kontrakt. Heading, speed og full lineId leveres
ikke av dagens GPS-query og må være nullable, ikke konstruerte verdier.

Fase B definerer intern modell med brukerens foreslåtte felter: id, provider,
mode, lineId, publicCode, destination, latitude, longitude, heading, speed,
timestamp, state og raw. Dokumenter enheter (grader, m/s, UTC-tid), identitet
med provider-namespace og forskjellen mellom kildetilstand og beregnet tilstand.
`raw` er valgfritt internt feilsøkingsmateriale, aldri automatisk del av API/logg.

Flybussen og T-bane bruker også estimerte holdeplasskall: en ServiceJourney-ID
er ikke nødvendigvis en fysisk vogn-ID. Utvid intern kontrakt med eksplisitt
positionSource/dataQuality og valgfrie stopCalls, eller en separat typed
observation knyttet til TransitVehicle. Ingen falske koordinater/tidsstempler.
Provider `loadVehicles(context)` oversetter data uten LED/board-rendering;
context får linje-/holdeplassfilter fra orkestratoren.

Entur-adapter skal støtte både vehicle-observasjoner og estimated calls.
Flybussen er primært profil + Entur estimated-calls-strategi, ikke en kopiert
provider. Static-adapter brukes til deterministiske fixtures. `flybussen/`
opprettes bare hvis det faktisk kommer en egen datakilde.

### BoardConfig

Eksisterende profiler har både schemaVersion 1 og 2, layout, routes, nodes,
leds, render, retnings-/plattformdata og separate hardware assignments.
Ikke erstatt dette med eksemplets flate 147-LED-konfigurasjon: Gråkallbanen
har både 47-punkts tavle og 16-punkts prototype, med mulig annen fysisk stripe.

Lag en normalisert intern BoardConfig som samler eksisterende board, routes og
hardware; behold originalfilene som source of truth. Beskriv productType,
provider/filter, mapping, logisk/aktivt/fysisk LED-antall, farger, brightness,
pollInterval, TTL og capabilities/feature flags. Adapteren må ha eksplisitte
defaults som gjenskaper dagens oppførsel. Ikke innfør `boards/` med kopier av
alle profiler; eventuell produktkatalog bør referere eksisterende profil-ID-er.

Hardkodede `BOARD_IDS` (bl.a. bakgrunnskontroll) og `GRAKALL_BOARD_IDS`
(terminal/avgang/hold) finnes fortsatt. Flytt deres policy til konfigurasjon
én regel om gangen, med gamle ID-er som overgangsdefault og replay-tester.
Unngå at identitetsuavhengig konfigurasjon utilsiktet endrer terminalatferd.

### PixelFrame

Behold schemaVersion 1, boardProfile, generatedAt, sequence, ttlSeconds,
ledCount og leds. Behold profileRevision/profileFingerprint, signalPolicy,
motionPolicy, vehicle, occupants, lifecycle og positioning der brukt.
PASSED/PARKED kan overføres som lifecycle sammen med kompatibel state;
klienten bruker lifecycle. Ikke bytt dette blindt til `MOVING` eller nye enums.
Utelatte LED-er er av, med eksisterende lokale visningsmodi som bevisste unntak.

`docs/led-feed-v1.md`, `docs/board-profile-v1.md` og
`docs/hardware-profile-v1.md` er delvis historiske: de beskriver færre tilstander,
eldre schemas og hardwareintegrasjon som ikke ferdig. Nye kontraktdokumenter
skal beskrive faktisk kode og lenke tilbake, ikke gjøre eldre tekst normativ
uten kontroll. Skill kildedataenes alder, frame-alder og tillatt stale/hold.

## 4. API-overgang (plan, ikke nye routes ennå)

| Ny route | Eksisterende grunnlag | Overgang |
|---|---|---|
| GET `/api/v1/frame/{boardId}` | GET `/v1/boards/{boardId}/frame` | Samme handler/resultat; gammel route beholdes |
| POST `/api/v1/device/status` | POST `/v1/devices/{deviceId}/status` | Autentisert deviceId i payload, bind til registry og token; samme validering |
| GET `/api/v1/device/config/{deviceId}` | Mangler | Autentisert, revocation-kontroll, versjonert additiv kontrakt |
| GET `/api/v1/ota/{deviceId}` | GET `/v1/firmware/manifest` | Adapter bevarer auth og alle eksisterende target-headers; ingen svakere fallback |
| GET `/api/v1/platform/health` | GET `/health`, board-monitor | Vis worker/config/provider/frame/storage hver for seg, med checkedAt og unknown/degraded |

Behold også status/history, logg/session, admin/publish/devices og internasjonale
routes. Dokumenter gamle routes som legacy aliases, ikke fjern dem etter en
vilkårlig dato. Nye health-kall skal bruke siste monitorresultat, ikke utløse
dyr full provider-henting per nettleser. Skill liveness fra data-readiness.

Device config inneholder boardProfile, frame URL, pollIntervalMs, OTA enabled,
brightness cap, hardwareProfile og feature flags; aldri token/password.
Klienten må beholde lokal bootstrap og siste gyldige config når endpoint feiler.
Avvis endring av GPIO/LED-allokering som installert firmware ikke støtter.

## 5. Enheter, firmware, health og OTA

Registry ligger i `DeviceStatus`-objektet `__device-registry__`; helse/logg og
motion bruker andre objekt-ID-er. Nyregistrering lager token én gang og lagrer
SHA-256-hash, med rotate/revoke. Legacy secrets finnes som overgang.
Registry har deviceId, boardProfile, label, enabled og tidsstempler; firmware
og lastSeen kommer fra helserapport. hardwareProfile er ikke en etablert
registry-kontrakt. Lag først en sammensatt fleet-view, så additiv lagringsendring.

Siste relevante Universal-kilde/pakke er
`firmware/esp32/TransitCore_Universal_BoardClient_v1_2_13.ino`, valgt av
`web/publish/esp-package.js` og compile-scriptet. Dette er repoets baseline,
ikke en ny erklæring om fysisk stabilitet. Historiske .ino-filer beholdes.
Ny firmwaremappe opprettes ikke bare for navnerydding.

Klienten har Wi-Fi/provisioning, lokal konfigurasjon, framevalidering, separat
LED-task/watchdog og bus recovery, atomisk framebytte, TTL, last-valid-frame,
visningsmodi, status/feilkø, trådløs logg og OTA. Product-ID/GPIO/LED-antall og
identitet bygges fortsatt inn i pakken. Felles kildekode er derfor ikke ennå
én felles binær med dynamisk device config. Lokal render-/freshness-logikk
skal inventeres/testes før serveransvar økes; ikke fjern sikkerhetsvern.

Health er normalt hvert 5. minutt med begrensede ekstra feilrapporter. Felt
inkluderer firmware, uptimeSeconds, feedSuccesses/feedFailures, wifiOutages/
wifiRecoveries, resetReason, freeHeap/minimumFreeHeap, frameAgeSeconds,
frameValid, profilidentitet og feilkø. RSSI finnes i Serial men er ikke i den
validerte health-kontrakten. Last frame sequence, varig boot count og strukturert
last OTA result mangler også. Legg disse til valgfritt; behold gamle feltnavn.
Firmware-allowlisten i `cleanStatusPayload` må oppdateres kontrollert før ny
firmware; ny versjon må ikke utløse HTTP 400 og rapporteringssløyfe.

OTA kontrollerer deviceId, boardProfile, chip, GPIO, begge LED-antall, versjon,
image size/partisjon og MD5; prøveoppstart og rollback beholdes. Bruk fortsatt
enhetsmanifest så lenge binæren inneholder enhetens secrets. Board/hardware-
manifest er ikke trygt før identitet/config skilles fra firmware og migreres.
HTTPS/MD5 er ikke signerte bilder. Ingen private binærfiler i public repo.
Fysisk test av OTA, strømbrudd, feil image, rollback og config-fallback kreves.

`web/fleet/` skal gjenbruke status/registry, vise offline etter eksplisitt
terskel relativt til rapportintervallet, og skille aldri-sett fra offline.
Manglende RSSI/OTA-data vises som ukjent, ikke 0/OK. Skjulte faner stopper
polling; administrative data/handlinger krever auth. Utvid ikke dagens offentlige
statusflate med secrets, rå provider-data eller sensitive fleet-detaljer.

## 6. Faser og akseptansekriterier

| Fase | Endring/filer | Test/akseptanse | Risiko og neste steg |
|---|---|---|---|
| A | Dette dokumentet | Les dagens main; baseline tester | Ingen runtimeendring; neste B |
| B | `core/models/` TransitVehicle/BoardConfig/PixelFrame-kontrakter og adapter/validator | Board v1/v2, feil ID, mapping, LED-antall, koordinater, defaults | Ikke endre eksisterende JSON; neste C |
| C | `core/providers/entur/`, `static/`, README | Normalisering, manglende felt, provider-ID, tom feed vs feil, timeout/cache | Ikke mist estimater/retning; neste D |
| D | `core/engines/` og `core/frame/` | Golden/replay GPS + estimated calls, frame/stale/invalid count, ingen doble kjøretøy, kollisjon | Flytt funksjoner, behold Worker re-exports og kallerekkefølge; neste E |
| E | `worker/api/`, API-aliases, health | Ny/gammel route gir semantisk samme frame, auth/revocation/400/404/503 | Ikke endre gamle URL-er; neste F |
| F | `worker/devices/`, config/health, additiv firmwareendring | Legacy status, nye valgfrie felter, config offline/feil, rapport-rate-limit, ESP32/S3 compile | Ny klient rulles kontrollert; neste G |
| G | `web/fleet/` | Online/offline/unknown, escaping/auth, skjulte faner, feil i API | Ingen egen pollingmotor; neste H |
| H | Gråkallbanen + Flybuss profiler gjennom samme orkestrator | Deterministisk end-to-end og separat live/fysisk akseptanse | Estimater er ikke GPS; neste I |
| I | `PLATFORM_ARCHITECTURE.md`, `FRAME_SCHEMA_V1.md`, `DEVICE_PROTOCOL_V1.md`, gamle doc-lenker | Kontrakter mot tester/firmware og migreringssjekkliste | Fjern ikke kompatibilitetsfasader uten dokumentert overgang |

Engine-uttrekk i D: position/direction først; state/freshness/terminal deretter
med Durable Object-state urørt. LED mapper og frame-validator blir tydelige
grenser rundt eksisterende mapping og rendering. `build-frame` orkestrerer.
Disruption engine mangler kilde/semantikk i dagens felles pipeline: dokumenter
capability som unsupported fremfor å legge inn en tom «fungerende» motor.
Bruk repoets ESM/.mjs-praksis der det unngår utilsiktet modulformatendring.

Etter hver fase: skriv endringsliste, konkrete filer, tester/resultat, risiko,
åpne begrensninger og neste steg. Ikke kombiner provider-, state- og
firmwaremigrering i én udifferensiert PR.

## 7. Proof of concept uten produktkopier

Gråkallbanen bruker eksisterende GPS-provider og 16-/47-punkts config;
Flybussen bruker `config/routes/flybuss-trondheim-fb73-live.json`, Entur
estimated calls og egen board/hardware-konfigurasjon (må etableres/valideres
som publiserbar POC, ikke forveksles med ruten i Trondheim-katalogen).
Begge går gjennom samme provider-grensesnitt, orkestrator, mapper/frame-
validator og API/klientkontrakt. Capabilities beskriver GPS vs estimat.

Flybussens direkte web-fetch flyttes etter hvert bak felles pipeline, ikke en
ny parallell implementasjon. Ikke påstå PASSED/PARKED bekreftet fra GPS når
observasjoner bare er forventede ankomsttider. Estimert avgang må merkes og
ha egne tester; PARKED krever egnet observasjon. InTransit Line blir en
produkt-/layoutkonfigurasjon, ikke en ny firmwaregren.

POC godkjennes når begge configs gir gyldig schemaVersion 1 gjennom samme
nye endpoint, gamle endpoint fortsatt virker, samme klientkilde rendrer begge,
og tap/retur av data, feil config og samtidige kjøretøy er testet. Fysisk
konfigurasjon og datakvalitet dokumenteres separat fra software-testresultat.

## 8. Breaking-risiko og tilbakevei

- Ingen board-ID-/LED-omnummerering, schemaVersion-bump eller state-enum-bytte.
- Behold config-stier (web/editor/publish laster dem), hashberegning og DO keys.
- Behold gamle eksporter for test-/webkallere mens implementasjon trekkes ut.
- Ikke endre klokke/enheter, poll/TTL/hold eller cache-key samtidig med uttrekk.
- Terminal/jitter/avgangsminne og ny shared-stop-mapping fra PR 191–192 må med
  i fixtures. Fysisk prototype må ikke brukes som første utestede utrulling.
- Device-registry utvides additivt; gamle health-payloads aksepteres. Feil
  deviceId/token/board-binding avvises også på nye aliases.
- Tilbakevei per serverfase er forrige kompatible Worker/Pages-utgivelse;
  firmware forblir uendret til F og har egen USB/OTA rollback-plan.
- Varslet breaking change krever separat migreringsnotat før implementering.
- Env/Cloudflare secrets og lokale secrets.h beholdes utenfor Git. Raw data og
  nedlastbare device-binærfiler må aldri eksponere Wi-Fi/token i public repo.

## 9. Testbaseline og neste handling

Kjør alle `scripts/test-*.mjs` og `worker/*.test.mjs` på denne main-baselinen.
Registrer resultat i fasesammendraget. Eksisterende tests dekker bl.a. frame,
retning, shared stops, Gråkall-jitter, avgangsminne, tom feed,
pakker, editor, device enrollment/status, diagnostikk, OTA-target og tidsbudsjett.
Dette erstatter ikke nye kontrakt-/provider-/stale-frame-tester fra B–F.
Firmware compile i CI dekker ESP32 og S3 med core 3.3.11; ingen ny compile
trengs for denne dokumentendringen. Fysisk stabilitet kan ikke utledes av dette.

Baseline kjørt 2026-09-26: 22 script-tester og 4 Worker-tester, 26 bestått,
0 feil. PR 190s ankomstutvalg/test og `web/shared/arrival-selection.mjs` er
ikke i denne main-baselinen og må ikke regnes som allerede integrert.

Neste handling er kun fase B: formaliser interne modeller og BoardConfig-
adapter/validator med kompatibilitetsfixtures. Ingen stor filflytting først.

## Fase B — gjennomført 2026-09-26

- Lagt til opt-in modeller/validatorer i `core/models/`: TransitVehicle,
  BoardConfig med ikke-muterende normalisering, og PixelFrame v1.
- Dokumentert kontraktene i `BOARD_CONFIG_V1.md` og `FRAME_SCHEMA_V1.md`.
- Lagt til `scripts/test-platform-models.mjs` og egen CI-workflow.
- Testet alle 11 board-filer, tilhørende route-profiler og seks hardware-filer.
  Ti board-filer validerer strengt. Oslo example-only (35 LED-er/fire noder,
  manglende routes på nodene) avvises strengt og får fem eksplisitte advarsler
  bare ved valg av example-kompatibilitet. Ingen data ble omskrevet.
- 27 testskript bestått, 0 feil. Modelltesten har 92 assertions etter siste
  valideringstillegg. Ingen firmware-/Worker-/web-runtimeendringer; 1.2.13 og
  alle eksisterende routes, payloads, pakker og profilfiler er uendret.
- PR 190 er ikke importert eller nødvendig for modellene.
- Før fase C: avklar observasjonskvalitet/stopCalls, behold provider-cache og
  feilsemantikk, og bruk ekvivalenstester ved første runtimeintegrasjon. Intern
  default TTL 30 er ikke en erstatning for eksisterende runtime hold-policy.

## Fase C — gjennomført 2026-09-26

- Basert på main a5811d1 (PR 193). Ingen avhengighet til PR 190.
- Entur GPS-query/cache flyttet til `core/providers/entur/entur-provider.mjs`.
  Normalizer, provider-kontrakt og lossless raw-adapter lagt til ved siden av.
- Worker bruker én provider-instans per isolate og samme endpoint/codespace-key,
  8 sekunders cache, in-flight deling og bounded JSON-transport. Ingen nye kall,
  polling-løkker eller retries. ProviderError bevarer melding/timeoutkode.
- TransitVehicle-observasjoner har null for ukjent informasjon og eksplisitt
  vehicle-position-type. Eksisterende motorer bruker fortsatt raw via adapter;
  data uten gyldig identitet beholdes som ugyldige observasjoner, ikke gjettes
  eller filtreres stille. Dette må avklares før rådata fjernes i fase D.
- Estimated calls og deres eksisterende timing forblir separat og uendret.
  Ingen Flybussen-provider, API-, registry-, OTA- eller firmwareendring.
- Nye dokumenter: PROVIDER_LAYER_V1.md og PROVIDER_DATA_SEMANTICS.md.
- 28 testskript bestått. 18 deterministiske før/etter-frame-sammenligninger
  for Gråkallbanen 47/16 og Trondheim buss er serialisert identiske, også med
  duplikater, stale/manglende data og tom liste. Cache/feil testes separat.
- Risiko før D: malformed-observation-policy, GPS/ETA-semantikk og global
  identitet må avklares. Testresultat er ikke en fysisk/live-sertifisering.

# Intern BoardConfig v1 — fase B

Implementasjon: `core/models/board-config.mjs`. Dette er en opt-in intern
kontrakt, **ikke** et nytt publiseringsformat eller en runtime-migrering.
Worker, web, pakke-generator og firmware 1.2.13 importerer ikke modulene ennå.

## Bruk

```js
import {normalizeBoardConfig, validateBoardConfig} from '../core/models/board-config.mjs';
const config = normalizeBoardConfig(boardJson, {hardware: hardwareJson, routeProfiles});
const {valid, errors, warnings} = validateBoardConfig(config);
// errors/warnings: [{path, message}]. Ingen feilaktige data repareres automatisk.
```

`normalizeBoardConfig` krever et objekt og lager en dyp kopi; input endres ikke.
Den normaliserer ikke Entur-data, laster ikke filer og utfører ikke nettverkskall.
Valider etter normalisering. Validatoren returnerer feil, ikke muterte data.

## Canonical intern kontrakt

Eksisterende board-felter beholdes, inkludert schemaVersion 1/2, layout,
positioning, directionMode, directionalPlatforms, routes, nodes, render og status.
Interne tillegg:

| Felt | Regel/default |
|---|---|
| modelVersion | 1, separat fra original schemaVersion |
| id/name | Eksisterende tavleidentitet og navn |
| productType | Eksplisitt verdi eller eksisterende layout; ingen omdøping til nye layout-enums |
| provider | String-reference, eksisterende provider-descriptor eller array; null når uavklart |
| hardwareProfile | Eksplisitt referanse, ellers hardware.id, ellers null |
| ledCount | Eksplisitt verdi eller leds.count; konflikt avvises |
| ttlSeconds | Eksplisitt verdi eller 30 sekunder (base-frame) |
| refreshIntervalSeconds | Eksplisitt verdi eller 10 sekunder (dagens ESP-polling) |
| brightnessDefault | Eksplisitt verdi, ellers leds.brightnessLimit, ellers 32 |
| featureFlags | Eksisterende objekt eller {} |
| routeProfiles | Valgfrie, oppløste route JSON-objekter fra argumentet; ellers [] |
| hardware | Medsendt hardware, bevart hardware eller identity-mapping fra nodes |

Rute-/linjefilter beholdes i `routes` og profilfeltene; stop/station/virtual
mapping i `nodes`; retninger/farger i nodes.routeDirections, routeProfiles.directions
og render.lineColors. Disse kopieres ikke til nye konkurrerende felter.
Provider-descriptor er dagens `{codespaceId, vehicleEndpoint}`. En provider
utledes ikke fra board-ID. Null betyr ukjent, ikke automatisk Entur.

Normalisering kan brukes om igjen uten endring. Hardware-fallback speiler dagens
identity-mapping: logicalLed = physicalLed = node.led, brightnessLimit fra board
eller 32. GPIO gjettes ikke. Eksplisitt hardware beholdes, inkludert GPIO 14 og
reversert mapping for Gråkallbanen-prototypen.

## Validering og grenser

- Board-identitet følger eksisterende Worker-regex `[a-z0-9-]{3,120}`.
- LED-antall må være positivt heltall. Noder og assignments må være komplette.
- Logiske og fysiske LED-ID-er er unike heltall innenfor frame-antallet.
- Flere ruter deler én node/LED; dette legitimerer ikke dupliserte LED-rader.
- Hardware schemaVersion er 1; boardProfile og leds.count må samsvare med board.
- Faktisk tilkoblet stripelengde er fortsatt pakke-generatorens `physicalLedCount`.
  Den kan være større og skal ikke brukes som frame/board-antall.
- TTL og polling må være positive endelige tall. Dette er intern validering;
  PixelFrame og firmware har snevrere wire-grenser. TTL-default endrer ikke
  serverens 300-sekunders Gråkall-hold eller annen eksisterende policy.
- Brightness er heltall 0..255. Farger som kontrolleres er `#RRGGBB`.
- Provider-referanse eller HTTPS-descriptor uten URL-credentials kreves når angitt.
- Ruter må være unike referanser. Node-ruter må finnes i board.routes.
- Medsendte routeProfiles valideres for kjent ID, provider og retning/farge.
  [] betyr uoppløste profiler; det er ikke et bevis på at eksterne filer finnes.
- Retnings-ID-er er strenger; eksisterende retning-/quay-metadata bevares.

Validatoren kontrollerer ikke sanntidsdekning, fysisk GPIO-egnethet, geografisk
korrekthet eller alle produktenes render-policyer. Den er ikke en erstatning
for eksisterende `validateConfiguration`/publiseringskontroll i fase B.

## Eksisterende inkonsistens — eksplisitt, ikke skjult

`oslo-metro-board.example.json` har status `example-only`, 35 LED-er, fire
noder og ingen routes på de fire nodene. Den deler ID med den komplette
Oslo-profilen og må ikke kobles til dens hardware ved test av eksempelfilen.
Streng validering avviser den. Kun med `{allowIncompleteExample:true}` blir
disse fem manglene advarsler. Den er fortsatt **ikke publiserbar**. Ingen
mapping, route eller LED legges til for å få testen grønn.

Alle ti øvrige board-filer validerer strengt, inklusive v2-katalogen med
1282 punkter. Gyldig katalog betyr ikke at dette er en opprettet fysisk enhet.
Seks eksisterende hardware-filer testes sammen med sine tilhørende boards;
øvrige bruker dokumentert fallback. Originalfiler er ikke endret.

## TransitVehicle

`core/models/transit-vehicle.mjs` dokumenterer og validerer den interne
kontrakten. Minimum er `{id:'journey-1', provider:'entur'}`. Identitet er paret
(provider,id), ikke garantert fysisk kjøretøy. Alle øvrige kontraktfelt kan
være null eller utelatt: mode, lineId, publicCode, destination, latitude,
longitude, heading, speed, timestamp, state, raw.

Koordinater er parvise grader, heading [0,360), speed m/s >=0, timestamp ISO
med tidssone. state er kildens string, ikke påtvunget LED-state. Raw er kun
internt; modellen serialiserer eller logger det aldri automatisk. Provider-
normalisering og kvalitet/stopCalls-kontrakten avgjøres først i fase C.
